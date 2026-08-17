import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PACKAGE_NAME = "@kulebbb/dsh-git-tree";
export const UPDATE_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;

/**
 * Compare two version strings by numeric dot-segments (semver-ish, tolerant
 * of junk). A prerelease suffix (-beta.1) sorts below the release of the
 * same numeric core; two prereleases compare by raw string. Note that
 * multi-digit numeric fields are compared as strings (e.g. beta.10 sorts
 * below beta.9), deviating from semver semantics. Returns -1|0|1.
 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).split("-", 2);
    return { nums: core.split(".").map((s) => Number.parseInt(s, 10) || 0), pre: pre ?? null };
  };
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) {
    const x = A.nums[i] ?? 0;
    const y = B.nums[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (A.pre === null) return 1;
  if (B.pre === null) return -1;
  return A.pre < B.pre ? -1 : 1;
}

/**
 * Whether a dependency spec denotes a local/source install that must never
 * be auto-updated (pnpm add would replace the local link with a registry
 * copy and break the developer's checkout).
 */
export function isDevSpec(spec) {
  return /^(?:link|file):/i.test(String(spec ?? ""));
}

/**
 * Locate the DSH profile directory hosting this plugin.
 * Resolution chain: explicit config dir → own install path → $DSH_HOME/profiles/web.
 * @param {string} ownFile - absolute path of this module (fileURLToPath(import.meta.url)).
 * @param {string} configDir - user-configured update.profileDir ("" = unset).
 * @param {object} env - environment mapping (process.env in production).
 * @returns {{dir: string, source: string}|{dir: null, reason: string}}
 */
export function findProfileDir(ownFile, configDir = "", env = {}) {
  if (configDir && configDir.trim()) {
    if (existsSync(join(configDir, "package.json"))) return { dir: configDir, source: "config" };
  }
  // Walk up from the module file looking for <X>/node_modules/@kulebbb/dsh-git-tree.
  let p = dirname(ownFile);
  while (p && p !== dirname(p)) {
    if (existsSync(join(p, "node_modules", PACKAGE_NAME))) return { dir: p, source: "install-path" };
    p = dirname(p);
  }
  const home = env.DSH_HOME && env.DSH_HOME.trim() ? env.DSH_HOME : join(env.HOME ?? "", ".dsh");
  const fallback = join(home, "profiles", "web");
  if (existsSync(join(fallback, "package.json"))) return { dir: fallback, source: "dsh-home" };
  return {
    dir: null,
    reason: `no <X>/node_modules/${PACKAGE_NAME} ancestor of ${ownFile} and no profile at ${fallback}`
  };
}

/**
 * Read this plugin's dependency spec from the profile's package.json
 * (dependencies first, devDependencies second). Returns null when the
 * profile is unreadable or does not depend on the plugin.
 */
export function readDependencySpec(profileDir, pkgName = PACKAGE_NAME) {
  try {
    const pkg = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    return pkg.dependencies?.[pkgName] ?? pkg.devDependencies?.[pkgName] ?? null;
  } catch {
    return null;
  }
}

/**
 * Derive the client-facing update status from the raw facts.
 * `updateAvailable` requires a newer version AND a non-dev install AND a
 * locatable profile dir (only then can the one-click update actually run).
 */
export function deriveStatus({ current, latest, dev, profileDir, checkError = null }) {
  const newer = latest != null && current != null && compareVersions(latest, current) > 0;
  return {
    current,
    latest,
    dev,
    profileDir,
    checkError,
    updateAvailable: Boolean(newer && dev === false && profileDir)
  };
}

/**
 * Query the npm registry for the latest published version. Never throws:
 * every failure resolves to `{ latest: null, checkError }` so the caller can
 * degrade silently. `signal` (optional) is combined with a timeout.
 */
export async function checkRegistryLatest({ fetchImpl = globalThis.fetch, timeoutMs = 5000, signal } = {}) {
  try {
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(UPDATE_REGISTRY_URL, { signal: combined });
    if (!res.ok) return { latest: null, checkError: `registry HTTP ${res.status}` };
    const body = await res.json();
    return { latest: typeof body?.version === "string" ? body.version : null, checkError: null };
  } catch (error) {
    return { latest: null, checkError: String(error?.message ?? error) };
  }
}

const PNPM_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 64 * 1024;

/**
 * Run `pnpm add @kulebbb/dsh-git-tree@latest` in the profile directory with
 * CI=1 (non-interactive). Captures stdout+stderr (truncated), kills the
 * child on timeout, and always resolves — never rejects — with
 * `{ ok: boolean, code?, message?, output }`.
 * @param {string} profileDir - directory pnpm runs in.
 * @param {object} [opts] - `spawnImpl` (test seam), `env`, `timeoutMs`.
 */
export async function runPnpmUpdate(profileDir, { spawnImpl = spawn, env = process.env, timeoutMs = PNPM_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl("pnpm", ["add", `${PACKAGE_NAME}@latest`], {
      cwd: profileDir,
      env: { ...env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({ ok: false, code: "update-timeout", message: `pnpm timed out after ${timeoutMs}ms`, output });
    }, timeoutMs);
    const onData = (chunk) => { output = (output + chunk.toString()).slice(0, MAX_OUTPUT); };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => settle({ ok: false, code: "spawn-error", message: err.message, output }));
    child.on("close", (code) => {
      settle(code === 0
        ? { ok: true, output }
        : { ok: false, code: "pnpm-error", message: `pnpm exited with code ${code}`, output });
    });
  });
}
