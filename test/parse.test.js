import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLog, parseDecorations, parseRefs, parseShortstat, parseAheadBehind } from "../lib/parse.js";

const H = (c) => c.repeat(40);

test("parseLog splits fields, parents, decorations, and body", () => {
  const out = [
    // record 1: merge with a multi-paragraph body; RS-terminated, git appends "\n" after RS
    `${H("a")}\x1f${H("b")} ${H("c")}\x1ffeat: merge\x1fAlice\x1f2026-08-01T10:00:00+08:00\x1fHEAD -> main, tag: v1.1\x1fbody one\n\nbody two\n\x1e\n`,
    // record 2: no body
    `${H("b")}\x1f\x1ffeat: init\x1fBob\x1f2026-08-01T09:00:00+08:00\x1f\x1f\x1e\n`
  ].join("");
  const commits = parseLog(out);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].parents, [H("b"), H("c")]);
  assert.deepEqual(commits[0].refs, ["HEAD -> main", "tag: v1.1"]);
  assert.equal(commits[0].subject, "feat: merge");
  assert.equal(commits[0].body, "body one\n\nbody two");
  assert.equal(commits[0].shortHash, H("a").slice(0, 7));
  assert.equal(commits[0].date, "2026-08-01T10:00:00+08:00");
  assert.equal(commits[1].parents.length, 0);
  assert.equal(commits[1].shortHash, H("b").slice(0, 7));
  assert.equal(commits[1].refs.length, 0);
  assert.equal(commits[1].body, "");
});

test("parseLog keeps a body containing the FS separator intact", () => {
  const body = `line one${"\x1f"}line two`;
  const out = `${H("a")}\x1f\x1fsub\x1fA\x1f2026-08-01T10:00:00+08:00\x1f\x1f${body}\x1e\n`;
  const commits = parseLog(out);
  assert.equal(commits[0].body, body);
});

test("parseLog skips malformed rows defensively", () => {
  const commits = parseLog("garbage-line\x1e\n");
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

test("parseShortstat maps hashes to file/insertion/deletion counts", () => {
  const out = [
    H("a"),
    " 2 files changed, 24 insertions(+), 16 deletions(-)",
    "",
    H("b"), // clean merge: no stat line, must stay absent
    "",
    H("c"),
    " 1 file changed, 1 insertion(+)",
    "",
    H("d"),
    " 1 file changed, 1 deletion(-)",
    ""
  ].join("\n");
  const stats = parseShortstat(out);
  assert.deepEqual(stats.get(H("a")), { files: 2, insertions: 24, deletions: 16 });
  assert.equal(stats.has(H("b")), false);
  assert.deepEqual(stats.get(H("c")), { files: 1, insertions: 1, deletions: 0 });
  assert.deepEqual(stats.get(H("d")), { files: 1, insertions: 0, deletions: 1 });
});

test("parseShortstat handles empty input", () => {
  assert.equal(parseShortstat("").size, 0);
});

test("parseAheadBehind parses tab-separated counts and degrades on garbage", () => {
  assert.deepEqual(parseAheadBehind("2\t1"), { ahead: 2, behind: 1 });
  assert.deepEqual(parseAheadBehind("0\t0\n"), { ahead: 0, behind: 0 });
  assert.deepEqual(parseAheadBehind(""), { ahead: 0, behind: 0 });
  assert.deepEqual(parseAheadBehind("garbage"), { ahead: 0, behind: 0 });
});
