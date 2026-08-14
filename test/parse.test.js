import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLog, parseDecorations, parseRefs } from "../lib/parse.js";

const H = (c) => c.repeat(40);

test("parseLog splits fields, parents, and decorations", () => {
  const out = [
    `${H("a")}\x1f${H("b")} ${H("c")}\x1ffeat: merge\x1fAlice\x1f2026-08-01T10:00:00+08:00\x1fHEAD -> main, tag: v1.1`,
    `${H("b")}\x1f\x1ffeat: init\x1fBob\x1f2026-08-01T09:00:00+08:00\x1f`
  ].join("\n");
  const commits = parseLog(out);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].parents, [H("b"), H("c")]);
  assert.deepEqual(commits[0].refs, ["HEAD -> main", "tag: v1.1"]);
  assert.equal(commits[0].subject, "feat: merge");
  assert.equal(commits[0].date, "2026-08-01T10:00:00+08:00");
  assert.equal(commits[1].parents.length, 0);
  assert.equal(commits[1].refs.length, 0);
});

test("parseLog skips malformed rows defensively", () => {
  const commits = parseLog("garbage-line\n");
  assert.equal(commits.length, 0);
});

test("parseDecorations handles empty and mixed refs", () => {
  assert.deepEqual(parseDecorations(""), []);
  assert.deepEqual(parseDecorations("HEAD -> main, tag: v1.0, origin/main"),
    ["HEAD -> main", "tag: v1.0", "origin/main"]);
});

test("parseRefs separates heads, tags, remotes; ignores others", () => {
  const out = [
    `refs/heads/main\x1f${H("1")}`,
    `refs/tags/v1.0\x1f${H("2")}`,
    `refs/remotes/origin/main\x1f${H("3")}`,
    `refs/stash\x1f${H("4")}`
  ].join("\n");
  const refs = parseRefs(out);
  assert.deepEqual(refs.branches, { main: H("1"), "origin/main": H("3") });
  assert.deepEqual(refs.tags, { "v1.0": H("2") });
});
