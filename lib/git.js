import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseLog, parseRefs, parseShortstat, parseAheadBehind } from "./parse.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;
// Field order: hash, parents, subject, author, ISO date, decorations, body.
// %b = body without the subject line; it may contain newlines, so each record
// is terminated with the RS separator (parsed in parse.js) instead of "\n".
const LOG_FIELDS = "%H%x1f%P%x1f%s%x1f%an%x1f%aI%x1f%D%x1f%b";

/**
 * Run one git command in `cwd`. Resolves with stdout; rejects with an Error
 * carrying `kind`: "git-unavailable" | "git-timeout" | "git-error" |
 * "not-a-git-repo".
 */
async function runGit(cwd, args) {
  let result;
  try {
    result = await execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    const stderr = String(error.stderr ?? error.message ?? "");
    if (error.code === "ENOENT") {
      const err = new Error("git executable not found on PATH");
      err.kind = "git-unavailable";
      throw err;
    }
    if (error.killed === true || error.signal === "SIGTERM" || stderr.includes("timed out")) {
      const err = new Error(`git command timed out after ${GIT_TIMEOUT_MS}ms`);
      err.kind = "git-timeout";
      throw err;
    }
    if (stderr.includes("not a git repository")) {
      const err = new Error("not a git repository");
      err.kind = "not-a-git-repo";
      throw err;
    }
    const err = new Error(`git ${args[0]} failed: ${stderr}`);
    err.kind = "git-error";
    throw err;
  }
  return result.stdout;
}

/**
 * Resolve the remote-tracking head for the current branch: the configured
 * upstream (@{upstream}) first, falling back to origin/<branch> when it
 * exists, otherwise null (not pushed / no remote).
 * @param {string} cwd - repository root.
 * @param {string|null} currentBranch - current branch name (null when detached).
 * @param {{branches: Record<string,string>}} refs - parseRefs() output.
 * @returns {Promise<{ref: string, hash: string, ahead: number, behind: number}|null>}
 */
async function resolveRemoteHead(cwd, currentBranch, refs) {
  let ref = null;
  try {
    const upstream = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"])).trim();
    if (upstream) ref = upstream;
  } catch {
    /* no upstream configured */
  }
  if (!ref && currentBranch && refs.branches[`origin/${currentBranch}`]) {
    ref = `origin/${currentBranch}`;
  }
  if (!ref) return null;
  let hash;
  try {
    hash = (await runGit(cwd, ["rev-parse", ref])).trim();
  } catch {
    return null; // remote-tracking ref vanished between calls
  }
  if (!/^[0-9a-f]{40}$/.test(hash)) return null;
  let ahead = 0;
  let behind = 0;
  try {
    const lr = await runGit(cwd, ["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
    ({ ahead, behind } = parseAheadBehind(lr));
  } catch {
    /* unmergeable range: keep 0/0 */
  }
  return { ref, hash, ahead, behind };
}

/**
 * Collect the graph payload for the repository at `cwd`.
 * @param {string} cwd - absolute directory path.
 * @param {number} [limit=DEFAULT_LIMIT] - commit count cap (1..MAX_LIMIT).
 * @returns {Promise<object>} the `{ok: true, repo, commits, refs}` payload.
 */
export async function collectGraph(cwd, limit = DEFAULT_LIMIT) {
  const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  // Ask for n+1 so `truncated` is exact even when the repo has exactly n commits.
  const [logOut, refsOut, statusOut, branchOut, rootOut, headOut] = await Promise.all([
    runGit(cwd, ["log", "--all", "--date-order", `--max-count=${n + 1}`, `--pretty=format:${LOG_FIELDS}%x1e`]),
    runGit(cwd, ["for-each-ref", "--format=%(refname)%1f%(objectname)"]),
    // status/branch/root/head degrade gracefully: the log gatekeeper above
    // already proved this is a repo, so a failure here only loses a nicety.
    runGit(cwd, ["status", "--porcelain=v1", "-z"]).catch(() => ""),
    runGit(cwd, ["branch", "--show-current"]).catch(() => ""),
    runGit(cwd, ["rev-parse", "--show-toplevel"]).catch(() => ""),
    runGit(cwd, ["rev-parse", "HEAD"]).catch(() => "")
  ]);
  // Same window as the main log so every shown commit has stats. Run in
  // parallel with the refs walk below; both are cheap and independent.
  const statOut = await runGit(cwd, [
    "log", "--all", "--date-order", `--max-count=${n + 1}`, "--pretty=format:%H", "--shortstat"
  ]);
  const parsed = parseLog(logOut);
  const truncated = parsed.length > n;
  const commits = (truncated ? parsed.slice(0, n) : parsed)
    .map((c) => ({ ...c, stats: parseShortstat(statOut).get(c.hash) ?? null }));
  const refs = parseRefs(refsOut);
  const currentBranch = branchOut.trim() || null;
  const headHash = headOut.trim();
  const localHead = headHash ? { hash: headHash, branch: currentBranch } : null;
  const remoteHead = await resolveRemoteHead(cwd, currentBranch, refs);
  return {
    ok: true,
    repo: {
      root: rootOut.trim(),
      currentBranch: currentBranch ?? "",
      dirty: statusOut.length === 0 ? 0 : statusOut.split("\0").filter(Boolean).length,
      truncated,
      localHead,
      remoteHead
    },
    commits,
    refs
  };
}

export { DEFAULT_LIMIT };
