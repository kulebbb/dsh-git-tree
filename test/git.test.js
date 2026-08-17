import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectGraph } from "../lib/git.js";

function run(cwd, args, env = {}) {
  return execFileSync("git", args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function makeRepo(dir) {
  run(dir, ["init", "-b", "main", "-q"]);
  run(dir, ["config", "user.email", "t@example.com"]);
  run(dir, ["config", "user.name", "T"]);
  // Fixed, increasing dates keep --date-order fully deterministic.
  let n = 1;
  const commit = (msg) => {
    const date = `2026-08-01T00:00:0${n}+08:00`;
    n += 1;
    execFileSync("bash", ["-c", `echo ${msg} > ${msg}.txt && git add ${msg}.txt && git commit -q -m "${msg}"`],
      { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  };
  commit("A");
  commit("B");
  commit("C");
  run(dir, ["checkout", "-q", "-b", "feature", "HEAD~1"]);
  commit("D");
  commit("E");
  run(dir, ["checkout", "-q", "main"]);
  run(dir, ["merge", "-q", "--no-ff", "-m", "M", "feature"],
    { GIT_AUTHOR_DATE: "2026-08-01T00:00:06+08:00", GIT_COMMITTER_DATE: "2026-08-01T00:00:06+08:00" });
  run(dir, ["tag", "v1.0", "HEAD~2"]);
  run(dir, ["checkout", "-q", "-b", "fix", "HEAD~1"]);
  commit("G");
}

test("collectGraph returns the full fixture graph", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    const payload = await collectGraph(dir, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.commits.length, 7);
    const merge = payload.commits.find((c) => c.subject === "M");
    assert.ok(merge, "merge commit M present");
    assert.equal(merge.parents.length, 2, "merge commit has two parents");
    assert.equal(payload.refs.tags["v1.0"], run(dir, ["rev-parse", "HEAD~2"]));
    assert.equal(payload.repo.currentBranch, "fix");
    assert.equal(payload.repo.root, run(dir, ["rev-parse", "--show-toplevel"]));
    // newest commit first (date-order, latest = G on fix)
    assert.equal(payload.commits[0].subject, "G");
    assert.equal(payload.repo.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph truncates with a small limit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    const payload = await collectGraph(dir, 3);
    assert.equal(payload.commits.length, 3);
    assert.equal(payload.repo.truncated, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph is not truncated when the repo has exactly n commits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    const payload = await collectGraph(dir, 7);
    assert.equal(payload.commits.length, 7);
    assert.equal(payload.repo.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph reports not-a-git-repo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-norepo-"));
  try {
    await assert.rejects(collectGraph(dir, 10), (e) => e.kind === "not-a-git-repo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph handles an empty repository", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-empty-"));
  try {
    run(dir, ["init", "-b", "main", "-q"]);
    const payload = await collectGraph(dir, 10);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.commits, []);
    assert.equal(payload.repo.currentBranch, "main");
    assert.equal(payload.repo.localHead, null, "empty repo has no HEAD hash yet");
    assert.equal(payload.repo.remoteHead, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph attaches commit bodies and per-commit diff stats", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    // A message with a body (multi-paragraph) as the new HEAD.
    execFileSync("bash", ["-c", `echo H > H.txt && git add H.txt && git commit -q -m "subject line" -m "first paragraph" -m "second paragraph"`],
      { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-01T00:00:08+08:00", GIT_COMMITTER_DATE: "2026-08-01T00:00:08+08:00" } });
    const payload = await collectGraph(dir, 200);
    const top = payload.commits[0];
    assert.equal(top.subject, "subject line");
    assert.equal(top.body, "first paragraph\n\nsecond paragraph");
    assert.deepEqual(top.stats, { files: 1, insertions: 1, deletions: 0 });
    // Clean merge commit M has no diff → stats null.
    const merge = payload.commits.find((c) => c.subject === "M");
    assert.equal(merge.stats, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph resolves upstream remote head with ahead/behind counts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  const origin = mkdtempSync(join(tmpdir(), "dsh-git-tree-origin-"));
  try {
    makeRepo(dir);
    run(dir, ["init", "--bare", "-q", origin]);
    run(dir, ["remote", "add", "origin", origin]);
    run(dir, ["push", "-q", "-u", "origin", "fix"]);
    let payload = await collectGraph(dir, 200);
    assert.equal(payload.repo.localHead.branch, "fix");
    assert.equal(payload.repo.localHead.hash, run(dir, ["rev-parse", "HEAD"]));
    assert.equal(payload.repo.remoteHead.ref, "origin/fix");
    assert.equal(payload.repo.remoteHead.hash, run(dir, ["rev-parse", "origin/fix"]));
    assert.deepEqual({ ahead: payload.repo.remoteHead.ahead, behind: payload.repo.remoteHead.behind }, { ahead: 0, behind: 0 });
    // A local-only commit makes HEAD one ahead of the remote.
    execFileSync("bash", ["-c", `echo H > H.txt && git add H.txt && git commit -q -m "local only"`],
      { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-01T00:00:08+08:00", GIT_COMMITTER_DATE: "2026-08-01T00:00:08+08:00" } });
    payload = await collectGraph(dir, 200);
    assert.equal(payload.repo.remoteHead.ahead, 1);
    assert.equal(payload.repo.remoteHead.behind, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(origin, { recursive: true, force: true });
  }
});

test("collectGraph falls back to origin/<branch> without an upstream", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  const origin = mkdtempSync(join(tmpdir(), "dsh-git-tree-origin-"));
  try {
    makeRepo(dir);
    run(dir, ["init", "--bare", "-q", origin]);
    run(dir, ["remote", "add", "origin", origin]);
    run(dir, ["push", "-q", "origin", "fix"]); // no -u: no upstream configured
    const payload = await collectGraph(dir, 200);
    assert.equal(payload.repo.remoteHead.ref, "origin/fix");
    assert.equal(payload.repo.remoteHead.hash, run(dir, ["rev-parse", "origin/fix"]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(origin, { recursive: true, force: true });
  }
});

test("collectGraph reports no remote head when the branch was never pushed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    const payload = await collectGraph(dir, 200);
    assert.equal(payload.repo.localHead.branch, "fix");
    assert.equal(payload.repo.remoteHead, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectGraph marks detached HEAD (branch null, hash present)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-git-tree-repo-"));
  try {
    makeRepo(dir);
    run(dir, ["checkout", "-q", "HEAD~1"]);
    const payload = await collectGraph(dir, 200);
    assert.equal(payload.repo.localHead.branch, null);
    assert.equal(payload.repo.localHead.hash, run(dir, ["rev-parse", "HEAD"]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
