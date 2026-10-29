const PACKAGE_NAME = "@kulebbb/dsh-git-tree";
const UPDATE_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;

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
 * Derive the client-facing update status from the raw facts.
 *
 * The plugin targets the DSH desktop app only, and the app owns its profile:
 * this plugin never installs anything. `newer` lets the banner tell the user a
 * newer version exists and point them at the sidebar Plugins page, which is the
 * only place desktop installs and updates happen.
 * @param {object} facts - current/latest versions and the registry check error.
 */
export function deriveStatus({ current, latest, checkError = null }) {
  const newer = latest != null && current != null && compareVersions(latest, current) > 0;
  return { current, latest, newer, checkError };
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
