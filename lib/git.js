import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseLog, parseRefs } from "./parse.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;
const LOG_FIELDS = "%H%x1f%P%x1f%s%x1f%an%x1f%aI%x1f%D";
const EMPTY_REPO_HINT = "does not have any commits yet";

/**
 * Run one git command in `cwd`. Resolves with stdout; rejects with an Error
 * carrying `kind`: "git-unavailable" | "git-timeout" | "git-error" |
 * "not-a-git-repo".
 */
async function runGit(cwd, args) {
  let result;
  try {
    result = await execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
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
 * Collect the graph payload for the repository at `cwd`.
 * @param {string} cwd - absolute directory path.
 * @param {number} [limit=DEFAULT_LIMIT] - commit count cap (1..MAX_LIMIT).
 * @returns {Promise<object>} the `{ok: true, repo, commits, refs}` payload.
 */
export async function collectGraph(cwd, limit = DEFAULT_LIMIT) {
  const n = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  let logOut;
  try {
    logOut = await runGit(cwd, ["log", "--all", "--date-order", `--max-count=${n}`, `--pretty=format:${LOG_FIELDS}`]);
  } catch (error) {
    if (error.kind === "git-error" && String(error.message).includes(EMPTY_REPO_HINT)) {
      const [branchOut, rootOut] = await Promise.all([
        runGit(cwd, ["branch", "--show-current"]).catch(() => ""),
        runGit(cwd, ["rev-parse", "--show-toplevel"]).catch(() => "")
      ]);
      return {
        ok: true,
        repo: { root: rootOut.trim(), currentBranch: branchOut.trim(), dirty: 0, truncated: false },
        commits: [],
        refs: { branches: {}, tags: {} }
      };
    }
    throw error;
  }
  const [refsOut, statusOut, branchOut, rootOut] = await Promise.all([
    runGit(cwd, ["for-each-ref", "--format=%(refname)%1f%(objectname)"]),
    runGit(cwd, ["status", "--porcelain=v1", "-z"]).catch(() => ""),
    runGit(cwd, ["branch", "--show-current"]).catch(() => ""),
    runGit(cwd, ["rev-parse", "--show-toplevel"]).catch(() => "")
  ]);
  const commits = parseLog(logOut);
  return {
    ok: true,
    repo: {
      root: rootOut.trim(),
      currentBranch: branchOut.trim(),
      dirty: statusOut.length === 0 ? 0 : statusOut.split("\0").filter(Boolean).length,
      truncated: commits.length === n
    },
    commits,
    refs: parseRefs(refsOut)
  };
}

export { DEFAULT_LIMIT };
