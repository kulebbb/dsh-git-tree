// parse.js — pure parsers for git plumbing output. No node builtins, no deps.

const FS = "\x1f"; // unit separator between log fields
const RS = "\x1e"; // record separator between log entries
const HASH_RE = /^[0-9a-f]{40}$/;
// " 1 file changed, 24 insertions(+), 16 deletions(-)" (git --shortstat line,
// space-indented; merge commits with no diff produce no line at all).
const SHORTSTAT_RE = /^(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

/**
 * Parse `git log --pretty=format:%H%x1f%P%x1f%s%x1f%an%x1f%aI%x1f%D%x1f%b%x1e`
 * output (one commit per RS-separated record) into commit objects.
 * The body field may contain newlines, so records are split on RS, never "\n".
 * @param {string} output
 * @returns {Array<{hash: string, shortHash: string, parents: string[], subject: string, body: string, author: string, date: string, refs: string[]}>}
 */
export function parseLog(output) {
  const commits = [];
  for (const chunk of output.split(RS)) {
    if (chunk.length === 0) continue;
    const line = chunk.replace(/^\n+|\n+$/g, "");
    const [hash = "", parents = "", subject = "", author = "", date = "", decorations = "", ...rest] = line.split(FS);
    if (!HASH_RE.test(hash)) continue; // defensive: skip malformed rows
    commits.push({
      hash,
      shortHash: hash.slice(0, 7), // common abbreviation rule (git log --oneline style)
      parents: parents.length > 0 ? parents.split(" ") : [],
      subject,
      body: rest.join(FS), // %b may itself contain FS; rejoin defensively
      author,
      date,
      refs: parseDecorations(decorations)
    });
  }
  return commits;
}

/**
 * Parse `%D` decorations ("HEAD -> main, tag: v1.0, origin/main").
 * @param {string} decorations
 * @returns {string[]}
 */
export function parseDecorations(decorations) {
  if (decorations.length === 0) return [];
  return decorations.split(", ").filter(Boolean);
}

/**
 * Parse `git for-each-ref --format=%(refname)%1f%(objectname)` output into
 * {branches, tags}. refs/remotes/* count as branches (display name kept).
 * @param {string} output
 * @returns {{branches: Record<string, string>, tags: Record<string, string>}}
 */
export function parseRefs(output) {
  const branches = {};
  const tags = {};
  for (const line of output.split("\n")) {
    if (line.length === 0) continue;
    const idx = line.indexOf(FS);
    if (idx === -1) continue;
    const refname = line.slice(0, idx);
    const hash = line.slice(idx + 1);
    if (!HASH_RE.test(hash)) continue;
    if (refname.startsWith("refs/tags/")) {
      tags[refname.slice("refs/tags/".length)] = hash;
    } else if (refname.startsWith("refs/heads/")) {
      branches[refname.slice("refs/heads/".length)] = hash;
    } else if (refname.startsWith("refs/remotes/")) {
      branches[refname.slice("refs/remotes/".length)] = hash;
    }
    // refs/stash, refs/notes/... intentionally ignored
  }
  return { branches, tags };
}

/**
 * Parse `git log --pretty=format:%H --shortstat` output into a
 * hash → {files, insertions, deletions} map. Commits whose diff is empty
 * (e.g. clean merges) produce no stat line and are absent from the map.
 * @param {string} output
 * @returns {Map<string, {files: number, insertions: number, deletions: number}>}
 */
export function parseShortstat(output) {
  const stats = new Map();
  let current = null;
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (HASH_RE.test(trimmed)) {
      current = trimmed;
      continue;
    }
    if (current === null) continue;
    const m = SHORTSTAT_RE.exec(trimmed);
    if (m) {
      stats.set(current, {
        files: Number(m[1]) || 0,
        insertions: Number(m[2]) || 0,
        deletions: Number(m[3]) || 0
      });
      current = null;
    }
  }
  return stats;
}

/**
 * Parse `git rev-list --left-right --count HEAD...<ref>` output ("left\tright",
 * or a single number when the symmetric difference is one-sided) into
 * {ahead, behind}. Empty / garbage input degrades to 0/0.
 * @param {string} output
 * @returns {{ahead: number, behind: number}}
 */
export function parseAheadBehind(output) {
  const nums = output.trim().split(/\s+/).map(Number);
  const ahead = Number.isFinite(nums[0]) ? nums[0] : 0;
  const behind = Number.isFinite(nums[1]) ? nums[1] : 0;
  return { ahead, behind };
}
