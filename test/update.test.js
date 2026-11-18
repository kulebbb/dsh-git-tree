import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REGISTRIES,
  UpdateChecker,
  classifyInstallSource,
  compareVersions,
  fetchLatest,
  installSpecOf,
  isPinnedGitSpec,
  isStableVersion,
  latestUrl,
  parseVersion,
  readInstallSpec,
  resolveProfileDir
} from "../lib/update.js";

const PACKAGE = "@kulebbb/dsh-git-tree";

function fakeFetch(version, extra = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({ version, dsh: { bundle: { patch: "./cordis.patch.yml" } }, ...extra })
    };
  };
  impl.calls = calls;
  return impl;
}

function registryChecker(options = {}) {
  return new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: fakeFetch("0.7.2"),
    now: () => 1_000_000,
    ...options
  });
}

test("parseVersion: stable, v-prefixed, prerelease, build metadata, junk", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, rank: 4, serial: 0 });
  assert.equal(parseVersion("v1.2.3").major, 1);
  assert.equal(parseVersion("1.2.3-rc.4").rank, 3);
  assert.equal(parseVersion("1.2.3-rc.4").serial, 4);
  assert.equal(parseVersion("1.2.3+build.5").patch, 3);
  assert.equal(parseVersion("one.two.three"), null);
  assert.equal(parseVersion("1.2"), null);
});

test("compareVersions: numeric ordering and prerelease ranks", () => {
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
  assert.equal(compareVersions("1.0.0-beta.10", "1.0.0-beta.9"), 1);
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("junk", "1.0.0"), null);
});

test("isStableVersion: only a plain release is stable", () => {
  assert.equal(isStableVersion("0.7.2"), true);
  assert.equal(isStableVersion("0.7.2-rc.1"), false);
  assert.equal(isStableVersion("nope"), false);
});

test("classifyInstallSource: registry specs", () => {
  for (const spec of ["0.7.2", "^0.7.2", "~0.7.0", "latest", ">=0.7.0 <1", "next", "1.2.3-beta.1"]) {
    assert.equal(classifyInstallSource(spec), "registry", spec);
  }
});

test("classifyInstallSource: Git specs, pinned or not", () => {
  for (const spec of [
    "github:kulebbb/dsh-git-tree",
    "github:kulebbb/dsh-git-tree#0123456789abcdef0123456789abcdef01234567",
    "git+https://github.com/kulebbb/dsh-git-tree.git#main",
    "git@github.com:kulebbb/dsh-git-tree.git",
    "gitlab:owner/repo",
    "bitbucket:owner/repo",
    "gist:owner/abc123",
    "gist:owner/abc123#0123456789abcdef0123456789abcdef01234567",
    "ssh://git@example.com/repo",
    "https://git.example.com/team/plugin#0123456789abcdef0123456789abcdef01234567"
  ]) {
    assert.equal(classifyInstallSource(spec), "git", spec);
  }
});

test("classifyInstallSource: local directory specs", () => {
  for (const spec of [
    "link:/Volumes/x/dsh-git-tree",
    "file:../dsh-git-tree",
    "workspace:*",
    "portal:/tmp/x",
    "../dsh-git-tree",
    "./dsh-git-tree",
    "/tmp/dsh-git-tree",
    "~/code/dsh-git-tree",
    "C:\\code\\dsh-git-tree",
    "\\\\server\\share"
  ]) {
    assert.equal(classifyInstallSource(spec), "local", spec);
  }
});

test("classifyInstallSource: unknown / other specs", () => {
  for (const spec of [
    undefined, "", "npm:other-package@1.0.0", "patch:@kulebbb/dsh-git-tree@0.7.2#./fix.patch",
    "https://example.com/pkg.tgz", "https://github.com/kulebbb/dsh-git-tree/archive/refs/tags/v0.7.3.tar.gz",
    "file:./pkg.tgz"
  ]) {
    assert.equal(classifyInstallSource(spec), "unknown", spec);
  }
});

test("isPinnedGitSpec: only a full 40-character commit counts", () => {
  assert.equal(isPinnedGitSpec("github:owner/repo#0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isPinnedGitSpec("git+https://github.com/o/r.git#0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isPinnedGitSpec("github:owner/repo"), false);
  assert.equal(isPinnedGitSpec("github:owner/repo#main"), false);
  assert.equal(isPinnedGitSpec("github:owner/repo#v0.7.2"), false);
  assert.equal(isPinnedGitSpec(undefined), false);
});

test("resolveProfileDir: explicit dir wins, then DSH_PROFILE, then nothing", () => {
  assert.equal(resolveProfileDir({ DSH_PROFILE_DIR: "/p/dir", DSH_PROFILE: "desktop" }, "/home/u"), "/p/dir");
  assert.equal(resolveProfileDir({ DSH_PROFILE: "desktop" }, "/home/u"), "/home/u/.dsh/profiles/desktop");
  assert.equal(resolveProfileDir({}, "/home/u"), undefined);
});

test("installSpecOf: checks all three dependency fields", () => {
  const name = PACKAGE;
  assert.equal(installSpecOf({ dependencies: { [name]: "^1.0.0" } }, name), "^1.0.0");
  assert.equal(installSpecOf({ devDependencies: { [name]: "link:/tmp/x" } }, name), "link:/tmp/x");
  assert.equal(installSpecOf({ optionalDependencies: { [name]: "2.0.0" } }, name), "2.0.0");
  assert.equal(installSpecOf({ dependencies: {} }, name), undefined);
  assert.equal(installSpecOf(null, name), undefined);
});

test("latestUrl: scoped package keeps @ and encodes the slash", () => {
  assert.equal(latestUrl("https://registry.npmjs.org/"), "https://registry.npmjs.org/@kulebbb%2Fdsh-git-tree/latest");
  assert.equal(latestUrl("https://registry.npmmirror.com", PACKAGE), "https://registry.npmmirror.com/@kulebbb%2Fdsh-git-tree/latest");
});

test("fetchLatest: manifest facts, including dsh.bundle and deprecated", async () => {
  const ok = await fetchLatest("https://registry.npmjs.org", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.7.2", dsh: { bundle: {} } }) })
  });
  assert.deepEqual(ok, { version: "0.7.2", hasBundle: true, deprecated: false });

  const noBundle = await fetchLatest("https://registry.npmjs.org", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.7.2" }) })
  });
  assert.equal(noBundle.hasBundle, false);

  const deprecated = await fetchLatest("https://registry.npmjs.org", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.7.2", dsh: { bundle: {} }, deprecated: "use 0.8" }) })
  });
  assert.equal(deprecated.deprecated, true);
});

test("fetchLatest: every failure degrades to null", async () => {
  assert.equal(await fetchLatest("https://x", { fetchImpl: async () => ({ ok: false, status: 404 }) }), null);
  assert.equal(await fetchLatest("https://x", { fetchImpl: async () => ({ ok: true, json: async () => ({ version: 123 }) }) }), null);
  assert.equal(await fetchLatest("https://x", { fetchImpl: async () => { throw new Error("offline"); } }), null);
  assert.equal(await fetchLatest("https://x", { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad"); } }) }), null);
});

test("readInstallSpec: reads the profile manifest and tolerates missing/bad files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-update-"));
  try {
    assert.equal(await readInstallSpec(dir, PACKAGE), undefined);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { [PACKAGE]: "github:kulebbb/dsh-git-tree" } }));
    assert.equal(await readInstallSpec(dir, PACKAGE), "github:kulebbb/dsh-git-tree");
    writeFileSync(join(dir, "package.json"), "{not json");
    assert.equal(await readInstallSpec(dir, PACKAGE), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("UpdateChecker: registry install with a newer bundle version can update", async () => {
  const status = await registryChecker().check();
  assert.equal(status.current, "0.7.0");
  assert.equal(status.latest, "0.7.2");
  assert.equal(status.newer, true);
  assert.equal(status.installSource, "registry");
  assert.equal(status.canUpdate, true);
  assert.equal(status.checkError, null);
  assert.equal(typeof status.checkedAt, "number");
});

test("UpdateChecker: Git and local installs still report newer but cannot update", async () => {
  for (const [spec, source] of [["github:kulebbb/dsh-git-tree", "git"], ["link:/Volumes/x", "local"]]) {
    const status = await registryChecker({ readSpec: async () => spec }).check();
    assert.equal(status.newer, true, spec);
    assert.equal(status.installSource, source, spec);
    assert.equal(status.canUpdate, false, spec);
    assert.equal(status.stale, false, spec);
  }
});

test("UpdateChecker: pinned Git installs are flagged so the copy can differ", async () => {
  const pinned = await registryChecker({ readSpec: async () => "github:kulebbb/dsh-git-tree#0123456789abcdef0123456789abcdef01234567" }).check();
  assert.equal(pinned.installSource, "git");
  assert.equal(pinned.gitPinned, true);
  const unpinned = await registryChecker({ readSpec: async () => "github:kulebbb/dsh-git-tree" }).check();
  assert.equal(unpinned.gitPinned, false);
});

test("UpdateChecker: an equal or lower latest is not newer and cannot update", async () => {
  for (const latest of ["0.7.0", "0.6.9"]) {
    const status = await registryChecker({ fetchImpl: fakeFetch(latest) }).check();
    assert.equal(status.newer, false, latest);
    assert.equal(status.canUpdate, false, latest);
  }
});

test("UpdateChecker: prerelease, deprecated, or bundle-less latest is not installable", async () => {
  for (const [latest, extra] of [
    ["0.7.2-rc.1", {}],
    ["0.7.2", { deprecated: "old" }],
    ["0.7.2", { deprecated: true }]
  ]) {
    const status = await registryChecker({ fetchImpl: fakeFetch(latest, extra) }).check();
    assert.equal(status.newer, true, latest);
    assert.equal(status.canUpdate, false, latest);
    assert.equal(status.checkError, "latest is not installable", latest);
  }
  const noBundle = await registryChecker({
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.7.2" }) })
  }).check();
  assert.equal(noBundle.canUpdate, false);
  assert.equal(noBundle.checkError, "latest is not installable");
});

test("UpdateChecker: falls back to the mirror when the first registry fails", async () => {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("registry.npmjs.org")) throw new Error("offline");
    return { ok: true, json: async () => ({ version: "0.7.2", dsh: { bundle: {} } }) };
  };
  const status = await registryChecker({ fetchImpl: impl, registries: REGISTRIES }).check();
  assert.equal(status.latest, "0.7.2");
  assert.equal(calls.length, 2);
  assert.match(calls[1], /npmmirror/);
});

test("UpdateChecker: all registries failing caches a failure for the short TTL", async () => {
  let now = 1_000_000;
  let calls = 0;
  const checker = new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: async () => { calls += 1; throw new Error("offline"); },
    now: () => now,
    failTtlMs: 5_000
  });
  const first = await checker.check();
  assert.equal(first.latest, null);
  assert.equal(first.checkError, "registry unreachable");
  await checker.check();
  assert.equal(calls, 1, "failure result is cached");
  now += 5_001;
  await checker.check();
  assert.equal(calls, 2, "cache expires after the failure TTL");
});

test("UpdateChecker: success cache, force refresh, and inflight dedupe", async () => {
  let now = 1_000_000;
  let version = "0.7.2";
  let calls = 0;
  const checker = new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ version, dsh: { bundle: {} } }) }; },
    now: () => now,
    okTtlMs: 10_000
  });
  const first = await checker.check();
  assert.equal(first.latest, "0.7.2");
  version = "0.7.3";
  const cached = await checker.check();
  assert.equal(cached.latest, "0.7.2");
  assert.equal(calls, 1);
  const forced = await checker.check({ force: true });
  assert.equal(forced.latest, "0.7.3");
  assert.equal(calls, 2);
  const cachedAgain = await checker.check();
  assert.equal(cachedAgain.latest, "0.7.3", "force still writes the cache");
  assert.equal(calls, 2);
  now += 10_001;
  await checker.check();
  assert.equal(calls, 3);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let slowCalls = 0;
  const slow = new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: async () => { slowCalls += 1; await gate; return { ok: true, json: async () => ({ version: "0.7.2", dsh: { bundle: {} } }) }; }
  });
  const a = slow.check();
  const b = slow.check();
  release();
  const [one, two] = await Promise.all([a, b]);
  assert.equal(one.latest, "0.7.2");
  assert.equal(two.latest, "0.7.2");
  assert.equal(slowCalls, 1);
});

test("UpdateChecker: unreadable current version returns a failure payload", async () => {
  const status = await registryChecker({ readVersion: async () => null }).check();
  assert.equal(status.current, "");
  assert.equal(status.latest, null);
  assert.equal(status.canUpdate, false);
  assert.equal(status.checkErrorCode, "local-version");
  assert.match(status.checkError, /version/);
});

test("UpdateChecker: a forced failure keeps the last good result and marks it stale", async () => {
  let version = "0.7.4";
  let offline = false;
  const checker = new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: async () => {
      if (offline) throw new Error("offline");
      return { ok: true, json: async () => ({ version, dsh: { bundle: {} } }) };
    }
  });
  const first = await checker.check();
  assert.equal(first.latest, "0.7.4");
  assert.equal(first.stale, false);
  offline = true;
  const forced = await checker.check({ force: true });
  assert.equal(forced.latest, "0.7.4", "the known version is not lost");
  assert.equal(forced.canUpdate, true);
  assert.equal(forced.stale, true);
  assert.equal(forced.checkErrorCode, "registry");
  const reopened = await checker.check();
  assert.equal(reopened.latest, "0.7.4", "the good cache survives a failed refresh");
  assert.equal(reopened.stale, false);
});

test("UpdateChecker: a first-check failure has no stale result to keep", async () => {
  const checker = new UpdateChecker({
    readVersion: async () => "0.7.0",
    readSpec: async () => "^0.7.0",
    registries: ["https://registry.npmjs.org"],
    fetchImpl: async () => { throw new Error("offline"); }
  });
  const status = await checker.check({ force: true });
  assert.equal(status.latest, null);
  assert.equal(status.stale, false);
  assert.equal(status.checkErrorCode, "registry");
});
