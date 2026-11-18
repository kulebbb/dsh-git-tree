import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const PACKAGE_NAME = "@kulebbb/dsh-git-tree";

/** Registries asked in order: official first, then the mainland mirror. */
export const REGISTRIES = ["https://registry.npmjs.org", "https://registry.npmmirror.com"];

const OK_TTL_MS = 60 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 4000;

/** Prerelease rank: alpha < beta < rc < stable. */
const PRE_RANK = { alpha: 1, beta: 2, rc: 3 };
const STABLE_RANK = 4;

/**
 * Parse `1.2.3`, `v1.2.3` or `1.2.3-rc.1`. Returns null for anything else.
 * Deliberately narrower than full semver; it only has to cover this package.
 * @param {string} input
 */
export function parseVersion(input) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)(?:\.(\d+))?)?(?:\+[0-9a-z.-]+)?$/i.exec(String(input).trim());
  if (match === null) return null;
  const stage = match[4]?.toLowerCase();
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rank: stage === undefined ? STABLE_RANK : (PRE_RANK[stage] ?? 0),
    serial: match[5] === undefined ? 0 : Number(match[5])
  };
}

/**
 * Compare two versions. Returns -1|0|1, or null when either side cannot be
 * parsed (callers treat null as "no update").
 * @param {string} left
 * @param {string} right
 */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null || b === null) return null;
  for (const key of ["major", "minor", "patch", "rank", "serial"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}

/** True for a release without an alpha/beta/rc suffix. */
export function isStableVersion(input) {
  return parseVersion(input)?.rank === STABLE_RANK;
}

/**
 * Classify a profile dependency spec.
 *
 * Only `registry` can be updated in-app by the DSH Plugins page. `git` covers
 * Git installs (pinned or not), `local` covers directory installs, and
 * `unknown` covers everything else (URLs, tarballs, a missing spec).
 * @param {string | undefined} spec
 * @returns {"registry" | "git" | "local" | "unknown"}
 */
export function classifyInstallSource(spec) {
  if (typeof spec !== "string" || spec.trim() === "") return "unknown";
  const value = spec.trim();
  // A tarball URL or file is not a Git checkout and cannot be updated in-app.
  if (/\.(tgz|tar\.gz)(#.*)?$/i.test(value)) return "unknown";
  if (/^(link|file|workspace|portal):/i.test(value)) return "local";
  if (/^(git\+|git:|gist:|github:|gitlab:|bitbucket:|ssh:)/i.test(value)) return "git";
  if (/^[\w.-]+@[\w.-]+:/.test(value)) return "git";
  if (/^https?:\/\/(www\.)?(github|gitlab|bitbucket)\.com\//i.test(value)) return "git";
  if (/^https?:\/\/\S+\/[^/]+\/[^/]+#(?:[0-9a-f]{40})\b/i.test(value)) return "git";
  if (/^(npm|patch|catalog):/i.test(value)) return "unknown";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return "unknown";
  if (/^(\.{1,2}\/|\/|~\/)/.test(value)) return "local";
  if (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value)) return "local";
  return "registry";
}

/** True when a Git spec pins a full 40-character commit (DSH's Git update condition). */
export function isPinnedGitSpec(spec) {
  if (typeof spec !== "string") return false;
  return /#[0-9a-f]{40}(?:[#&].*)?$/i.test(spec.trim());
}

/**
 * Profile directory fallback for hosts that do not expose `profileContext`.
 * `DSH_PROFILE_DIR` wins; otherwise `DSH_PROFILE` names a directory under
 * `~/.dsh/profiles`. Mirrors the reference implementation's env fallback.
 */
export function resolveProfileDir(env = process.env, home = homedir()) {
  const explicit = typeof env?.DSH_PROFILE_DIR === "string" ? env.DSH_PROFILE_DIR.trim() : "";
  if (explicit !== "") return explicit;
  const profile = typeof env?.DSH_PROFILE === "string" ? env.DSH_PROFILE.trim() : "";
  if (profile !== "") return join(home, ".dsh", "profiles", profile);
  return undefined;
}

/** Read this package's dependency spec from a parsed profile manifest. */
export function installSpecOf(manifest, packageName = PACKAGE_NAME) {
  if (typeof manifest !== "object" || manifest === null) return undefined;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const deps = manifest[field];
    if (typeof deps !== "object" || deps === null) continue;
    const spec = deps[packageName];
    if (typeof spec === "string") return spec;
  }
  return undefined;
}

/**
 * The `/latest` URL for a package. Scoped names keep `@` and encode the slash.
 */
export function latestUrl(base, packageName = PACKAGE_NAME) {
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(packageName).replace(/^%40/, "@")}/latest`;
}

/**
 * Query one registry for the latest manifest facts. Never throws: a network
 * error, timeout, bad JSON or non-OK response all resolve to null.
 * @returns {Promise<{version: string, hasBundle: boolean, deprecated: boolean} | null>}
 */
export async function fetchLatest(base, { packageName = PACKAGE_NAME, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const doFetch = fetchImpl;
    const response = await doFetch(latestUrl(base, packageName), {
      headers: { accept: "application/json" },
      signal: combined
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const version = typeof body.version === "string" && body.version !== "" ? body.version : null;
    if (version === null) return null;
    const dsh = typeof body.dsh === "object" && body.dsh !== null ? body.dsh : null;
    return {
      version,
      hasBundle: dsh?.bundle !== undefined && dsh.bundle !== null,
      deprecated: typeof body.deprecated === "string" && body.deprecated !== "" ? true : body.deprecated === true
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the profile manifest once and return this package's spec. */
export async function readInstallSpec(profileDir, packageName = PACKAGE_NAME) {
  if (typeof profileDir !== "string" || profileDir === "") return undefined;
  try {
    const text = await readFile(join(profileDir, "package.json"), "utf8");
    return installSpecOf(JSON.parse(text), packageName);
  } catch {
    return undefined;
  }
}

/** The default reader used in production; overridable in tests. */
async function defaultReadVersion() {
  try {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg?.version === "string" && pkg.version !== "" ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * Version checker with a success/failure TTL and request deduplication.
 *
 * `check({ force: true })` skips the cache read but still writes the result,
 * so a manual check stays visible when the panel is reopened.
 */
export class UpdateChecker {
  constructor({
    packageName = PACKAGE_NAME,
    profileDir,
    registries = REGISTRIES,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    timeoutMs = TIMEOUT_MS,
    okTtlMs = OK_TTL_MS,
    failTtlMs = FAIL_TTL_MS,
    readVersion = defaultReadVersion,
    readSpec
  } = {}) {
    this.packageName = packageName;
    this.profileDir = profileDir;
    this.registries = registries;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.okTtlMs = okTtlMs;
    this.failTtlMs = failTtlMs;
    this.readVersion = readVersion;
    this.readSpec = readSpec ?? (() => readInstallSpec(profileDir, packageName));
    this.cache = null;
    this.lastGood = null;
    this.inflight = null;
  }

  async check({ force = false } = {}) {
    if (!force && this.cache !== null) {
      const ttl = this.cache.ok ? this.okTtlMs : this.failTtlMs;
      if (this.now() - this.cache.at < ttl) return this.cache.payload;
    }
    if (this.inflight !== null) return this.inflight;
    const run = this.run(force).finally(() => { this.inflight = null; });
    this.inflight = run;
    return run;
  }

  settle(ok, payload) {
    this.cache = { at: this.now(), ok, payload };
    if (ok) this.lastGood = payload;
    return payload;
  }

  async run(force = false) {
    const current = await this.readVersion();
    const spec = await this.readSpec();
    const installSource = classifyInstallSource(spec);
    const gitPinned = installSource === "git" && isPinnedGitSpec(spec);
    const checkedAt = this.now();

    if (current === null) {
      return this.settle(false, {
        current: "", latest: null, newer: false, installSource, gitPinned, canUpdate: false,
        checkedAt, stale: false, checkError: "cannot read the installed version", checkErrorCode: "local-version"
      });
    }

    let found = null;
    for (const base of this.registries) {
      found = await fetchLatest(base, { packageName: this.packageName, fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs });
      if (found !== null) break;
    }
    if (found === null) {
      // A manual or expired check that cannot reach any registry must not
      // erase the last good answer: keep it and mark this response stale so the
      // panel can keep showing the known update while flagging the failure.
      if (this.lastGood !== null) {
        this.cache = { at: checkedAt, ok: true, payload: this.lastGood };
        return {
          ...this.lastGood,
          checkedAt,
          stale: true,
          checkError: "registry unreachable",
          checkErrorCode: "registry"
        };
      }
      return this.settle(false, {
        current, latest: null, newer: false, installSource, gitPinned, canUpdate: false,
        checkedAt, stale: false, checkError: "registry unreachable", checkErrorCode: "registry"
      });
    }

    const order = compareVersions(found.version, current);
    const newer = order !== null && order > 0;
    const installable = found.hasBundle && isStableVersion(found.version) && !found.deprecated;
    const canUpdate = installSource === "registry" && newer && installable;
    return this.settle(true, {
      current,
      latest: found.version,
      newer,
      installSource,
      gitPinned,
      canUpdate,
      checkedAt,
      stale: false,
      checkError: installable ? null : "latest is not installable",
      checkErrorCode: installable ? null : "not-installable"
    });
  }
}
