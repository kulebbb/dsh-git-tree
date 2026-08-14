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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
