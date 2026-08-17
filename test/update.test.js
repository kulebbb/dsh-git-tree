import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { compareVersions, isDevSpec, findProfileDir, readDependencySpec, deriveStatus, checkRegistryLatest, runPnpmUpdate } from "../lib/update.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Stub the browser module system so the bundle can materialize in Node
// (same pattern as test/format.test.js). The factory lazily touches react.
globalThis.window = {
  __ModuleLoader__: { load: (handoff) => { globalThis.__DSH_GT_LOADED = handoff; } }
};
const fakeReact = {
  createElement: () => null,
  useState: () => [],
  useEffect: () => {},
  useRef: () => ({}),
  useMemo: () => null,
  useCallback: (fn) => fn
};
await import(new URL("../lib/client.js", import.meta.url));
const loaded = globalThis.__DSH_GT_LOADED;
assert.ok(loaded, "bundle must call __ModuleLoader__.load");
const { bannerKind } = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});

test("bannerKind: hidden without status or when dismissed", () => {
  assert.equal(bannerKind({ update: null, phase: "idle", dismissed: false }), null);
  assert.equal(bannerKind({ update: { latest: "0.4.0" }, phase: "idle", dismissed: true }), null);
  assert.equal(bannerKind({ update: { latest: null }, phase: "idle", dismissed: false }), null);
});

test("bannerKind: derives banner from status when phase is idle", () => {
  const base = { phase: "idle", dismissed: false };
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: true, dev: false, profileDir: "/p" }, ...base }), "available");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: true, profileDir: "/p" }, ...base }), "dev");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: false, profileDir: null }, ...base }), "noProfile");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: false, profileDir: "/p" }, ...base }), null);
});

test("bannerKind: phase overrides status", () => {
  const update = { latest: "0.4.0", updateAvailable: true, dev: false, profileDir: "/p" };
  assert.equal(bannerKind({ update, phase: "updating", dismissed: false }), "updating");
  assert.equal(bannerKind({ update, phase: "updated", dismissed: false }), "updated");
  assert.equal(bannerKind({ update, phase: "error", dismissed: false }), "error");
});

test("compareVersions: numeric ordering", () => {
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("compareVersions: prerelease sorts below its release", () => {
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
  assert.equal(compareVersions("1.0.0-beta.10", "1.0.0-beta.9"), -1);
});

test("compareVersions: empty and junk inputs degrade to 0", () => {
  assert.equal(compareVersions("", "0.0.1"), -1);
  assert.equal(compareVersions("abc", "0.0.0"), 0);
});

test("isDevSpec: link:/file: specs are dev installs", () => {
  assert.equal(isDevSpec("link:/Users/x/checkout"), true);
  assert.equal(isDevSpec("file:../plugin"), true);
  assert.equal(isDevSpec("file:./plugin"), true);
});

test("isDevSpec: registry/github/plain specs are not dev installs", () => {
  assert.equal(isDevSpec("^0.3.1"), false);
  assert.equal(isDevSpec("0.3.1"), false);
  assert.equal(isDevSpec("github:kulebbb/dsh-git-tree"), false);
  assert.equal(isDevSpec(undefined), false);
  assert.equal(isDevSpec(null), false);
});

test("findProfileDir: config dir wins", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/any/where/lib/index.js", profile, {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "config");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: walks up the own install path", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  const pkg = join(profile, "node_modules", "@kulebbb", "dsh-git-tree", "lib");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const ownFile = join(pkg, "index.js");
  const result = findProfileDir(ownFile, "", {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "install-path");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: DSH_HOME fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, profile);
  assert.equal(result.source, "dsh-home");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: nothing found reports reason", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, null);
  assert.match(result.reason, /no <X>\/node_modules/);
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: config dir without package.json is ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const bogus = join(root, "not-a-profile");
  mkdirSync(bogus, { recursive: true });
  const result = findProfileDir("/unrelated/lib/index.js", bogus, { DSH_HOME: root });
  assert.equal(result.dir, null);
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: reads the package spec from profile package.json", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { "@kulebbb/dsh-git-tree": "link:/tmp/checkout" }
  }));
  assert.equal(readDependencySpec(root), "link:/tmp/checkout");
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: returns null when absent or unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), "{}");
  assert.equal(readDependencySpec(root), null);
  assert.equal(readDependencySpec(join(root, "missing")), null);
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: corrupted package.json returns null", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), "{ not valid json");
  assert.equal(readDependencySpec(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("deriveStatus: update available when newer, non-dev, profile found", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: false, profileDir: "/p" });
  assert.equal(s.updateAvailable, true);
  assert.equal(s.current, "0.3.1");
  assert.equal(s.latest, "0.4.0");
});

test("deriveStatus: not available when already current", () => {
  const s = deriveStatus({ current: "0.4.0", latest: "0.4.0", dev: false, profileDir: "/p" });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: dev install never offers update", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: true, profileDir: "/p" });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: missing profile dir never offers update", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: false, profileDir: null });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: check failure keeps latest null and surfaces checkError", () => {
  const s = deriveStatus({ current: "0.3.1", latest: null, dev: false, profileDir: "/p", checkError: "ECONNREFUSED" });
  assert.equal(s.updateAvailable, false);
  assert.equal(s.checkError, "ECONNREFUSED");
});

test("deriveStatus: unknown current never claims an update", () => {
  assert.equal(deriveStatus({ current: undefined, latest: "0.4.0", dev: false, profileDir: "/p" }).updateAvailable, false);
  assert.equal(deriveStatus({ current: null, latest: "0.4.0", dev: false, profileDir: "/p" }).updateAvailable, false);
});

test("deriveStatus: unknown dev flag fails closed", () => {
  assert.equal(deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: undefined, profileDir: "/p" }).updateAvailable, false);
});

test("checkRegistryLatest: parses latest from registry payload", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: "0.4.0" }) });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, "0.4.0");
  assert.equal(result.checkError, null);
});

test("checkRegistryLatest: non-ok response is a silent failure", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /404/);
});

test("checkRegistryLatest: thrown fetch error is a silent failure", async () => {
  const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /ECONNREFUSED/);
});

test("checkRegistryLatest: json parse failure is a silent failure", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token"); } });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /Unexpected token/);
});

test("checkRegistryLatest: non-string version yields null latest without error", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: 123 }) });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.equal(result.checkError, null);
});

test("runPnpmUpdate: pnpm add with latest tag and CI env", async () => {
  let captured;
  const fakeSpawn = (cmd, args, opts) => {
    captured = { cmd, args, opts };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, true);
  assert.equal(captured.cmd, "pnpm");
  assert.deepEqual(captured.args, ["add", "@kulebbb/dsh-git-tree@latest"]);
  assert.equal(captured.opts.cwd, "/p");
  assert.equal(captured.opts.env.CI, "1");
  assert.equal(captured.opts.stdio[0], "ignore");
});

test("runPnpmUpdate: resolves error with output on non-zero exit", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stderr.emit("data", "ERR_PNPM_FETCH_404 Package not found");
      child.emit("close", 1);
    });
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, "pnpm-error");
  assert.match(result.message, /code 1/);
  assert.match(result.output, /ERR_PNPM_FETCH_404/);
});

test("runPnpmUpdate: spawn failure maps to spawn-error", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, "spawn-error");
});

test("runPnpmUpdate: timeout kills the child and maps to update-timeout", async () => {
  let killed = false;
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { killed = true; };
    setTimeout(() => child.emit("close", 0), 50); // close arrives AFTER the 20ms timeout
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {}, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "update-timeout");
  assert.equal(killed, true);
});

test("runPnpmUpdate: close before timeout settles success and clears the timer", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setTimeout(() => child.emit("close", 0), 5); // well before the 500ms timeout
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {}, timeoutMs: 500 });
  assert.equal(result.ok, true);
});
