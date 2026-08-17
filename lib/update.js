export const PACKAGE_NAME = "@kulebbb/dsh-git-tree";
export const UPDATE_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;

/**
 * Compare two version strings by numeric dot-segments (semver-ish, tolerant
 * of junk). A prerelease suffix (-beta.1) sorts below the release of the
 * same numeric core; two prereleases compare by raw string. Returns -1|0|1.
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
