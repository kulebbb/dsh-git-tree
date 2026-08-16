// parse.js — pure parsers for git plumbing output. No node builtins, no deps.

const FS = "\x1f"; // unit separator between log fields
const HASH_RE = /^[0-9a-f]{40}$/;

/**
 * Parse `git log --pretty=format:%H%x1f%P%x1f%s%x1f%an%x1f%aI%x1f%D` output
 * (one commit per line) into commit objects.
 * @param {string} output
 * @returns {Array<{hash: string, shortHash: string, parents: string[], subject: string, author: string, date: string, refs: string[]}>}
 */
export function parseLog(output) {
  const commits = [];
  for (const line of output.split("\n")) {
    if (line.length === 0) continue;
    const [hash = "", parents = "", subject = "", author = "", date = "", decorations = ""] = line.split(FS);
    if (!HASH_RE.test(hash)) continue; // defensive: skip malformed rows
    commits.push({
      hash,
      shortHash: hash.slice(0, 7), // common abbreviation rule (git log --oneline style)
      parents: parents.length > 0 ? parents.split(" ") : [],
      subject,
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
