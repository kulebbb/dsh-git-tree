import { test } from "node:test";
import assert from "node:assert/strict";

// Stub the browser module system so the bundle can materialize in Node.
// The factory only touches react (lazily) and exports pure functions.
globalThis.window = {
  __ModuleLoader__: { load: (handoff) => { globalThis.__DSH_GT_LOADED = handoff; } }
};
const fakeReact = {
  createElement: () => null,
  useState: () => [],
  useEffect: () => {},
  useRef: () => ({}),
  useMemo: () => null,
  useCallback: (fn) => fn
};
await import(new URL("../lib/client.js", import.meta.url));
const loaded = globalThis.__DSH_GT_LOADED;
assert.ok(loaded, "bundle must call __ModuleLoader__.load");
const exports_ = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});
const { layoutGraph, buildEdgePaths, computeLabelXs, branchColors, pickFreeLane, hashSuffixOf, rowTextOf } = exports_;

test("layoutGraph: linear history stays on one lane", () => {
  const commits = [
    { hash: "c3", parents: ["c2"], subject: "3", author: "", date: "", refs: [] },
    { hash: "c2", parents: ["c1"], subject: "2", author: "", date: "", refs: [] },
    { hash: "c1", parents: [], subject: "1", author: "", date: "", refs: [] }
  ];
  const { rows, edges } = layoutGraph(commits);
  assert.deepEqual(rows.map((r) => r.col), [0, 0, 0]);
  assert.equal(edges.length, 2);
});

test("layoutGraph: merge fans the second parent onto a new lane", () => {
  const commits = [
    { hash: "M", parents: ["C", "E"], subject: "merge", author: "", date: "", refs: [] },
    { hash: "E", parents: ["D"], subject: "e", author: "", date: "", refs: [] },
    { hash: "D", parents: ["B"], subject: "d", author: "", date: "", refs: [] },
    { hash: "C", parents: ["B"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const { rows, edges } = layoutGraph(commits);
  assert.deepEqual(rows.map((r) => r.col), [0, 1, 1, 0, 1, 1]);
  const edgeSet = new Set(edges.map((e) => `${e.from}->${e.to}`));
  assert.deepEqual([...edgeSet].sort(), ["B->A", "C->B", "D->B", "E->D", "M->C", "M->E"]);
});

test("layoutGraph: three-branch fan-in merge", () => {
  const commits = [
    { hash: "D", parents: ["B", "C"], subject: "merge", author: "", date: "", refs: [] },
    { hash: "C", parents: ["A"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const { rows, edges } = layoutGraph(commits);
  assert.deepEqual(rows.map((r) => r.col), [0, 1, 0, 1]);
  assert.equal(edges.length, 4);
});

test("layoutGraph: empty and single commit", () => {
  const empty = layoutGraph([]);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.edges, []);
  const one = layoutGraph([{ hash: "a", parents: [], subject: "a", author: "", date: "", refs: [] }]);
  assert.deepEqual(one.rows.map((r) => r.col), [0]);
  assert.equal(one.edges.length, 0);
});

test("layoutGraph: duplicate parents are deduplicated", () => {
  const { edges } = layoutGraph([
    { hash: "m", parents: ["b", "b"], subject: "m", author: "", date: "", refs: [] },
    { hash: "b", parents: [], subject: "b", author: "", date: "", refs: [] }
  ]);
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], { from: "m", to: "b", color: "var(--dsw-alias-label-tertiary)" });
});

test("layoutGraph: branch tips propagate their color down ancestry", () => {
  const commits = [
    { hash: "M", parents: ["C", "E"], subject: "merge", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "E", parents: ["D"], subject: "e", author: "", date: "", refs: ["feat"] },
    { hash: "D", parents: ["B"], subject: "d", author: "", date: "", refs: [] },
    { hash: "C", parents: ["B"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const { rows, edges } = layoutGraph(commits);
  const rowColor = (h) => rows.find((r) => r.commit.hash === h).color;
  const edgeColor = (from, to) => edges.find((e) => e.from === from && e.to === to).color;
  const NEUTRAL = "var(--dsw-alias-label-tertiary)";
  assert.notEqual(rowColor("M"), NEUTRAL);
  assert.notEqual(rowColor("E"), NEUTRAL);
  assert.notEqual(rowColor("M"), rowColor("E"));
  // main line M -> C keeps one color; feat line E -> D keeps its own
  assert.equal(rowColor("M"), rowColor("C"));
  assert.equal(rowColor("E"), rowColor("D"));
  // merge curve M -> E carries feat's color (parent thread bending up)
  assert.equal(edgeColor("M", "E"), rowColor("E"));
  // merge-base curve C -> B carries main's color (child thread bending down)
  assert.equal(edgeColor("C", "B"), rowColor("C"));
  // straight feat continuation D -> B carries feat's color
  assert.equal(edgeColor("D", "B"), rowColor("D"));
  for (const e of edges) assert.equal(typeof e.color, "string");
});

test("branchColors: every reachable commit gets a color, tips distinct", () => {
  const commits = [
    { hash: "M", parents: ["C", "E"], subject: "merge", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "E", parents: ["D"], subject: "e", author: "", date: "", refs: ["feat"] },
    { hash: "D", parents: ["B"], subject: "d", author: "", date: "", refs: [] },
    { hash: "C", parents: ["B"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const colors = branchColors(commits);
  assert.notEqual(colors.get("M"), colors.get("E"));
  for (const c of commits) assert.ok(colors.has(c.hash), `missing color for ${c.hash}`);
});

test("buildEdgePaths: linear history merges into one vertical path", () => {
  const commits = [
    { hash: "c3", parents: ["c2"], subject: "3", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "c2", parents: ["c1"], subject: "2", author: "", date: "", refs: [] },
    { hash: "c1", parents: [], subject: "1", author: "", date: "", refs: [] }
  ];
  const paths = buildEdgePaths(layoutGraph(commits));
  assert.equal(paths.length, 1);
  assert.ok(paths[0].d.startsWith("M "));
  assert.ok(!paths[0].d.includes(" C "));
});

test("buildEdgePaths: cross-lane edges become orthogonal rounded corners", () => {
  const commits = [
    { hash: "M", parents: ["C", "E"], subject: "merge", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "E", parents: ["D"], subject: "e", author: "", date: "", refs: ["feat"] },
    { hash: "D", parents: ["B"], subject: "d", author: "", date: "", refs: [] },
    { hash: "C", parents: ["B"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const paths = buildEdgePaths(layoutGraph(commits));
  const orthogonal = paths.filter((p) => p.d.includes(" Q "));
  assert.equal(orthogonal.length, 2, "M->E and C->B cross lanes");
  for (const p of orthogonal) {
    assert.equal((p.d.match(/ Q /g) || []).length, 2, "two rounded corners per route");
  }
  assert.ok(!paths.some((p) => p.d.includes(" C ")), "no cubic beziers remain");
});

test("pickFreeLane: new branches extend only to the right", () => {
  assert.equal(pickFreeLane([null, null, null], 0), 1);
  assert.equal(pickFreeLane(["x", null, "x", null], 0), 1);
  assert.equal(pickFreeLane(["x", null, "x", null], 2), 3);
  assert.equal(pickFreeLane(["x", "x", null], 0), 2);
  assert.equal(pickFreeLane(["x", "x"], 0), -1);
  assert.equal(pickFreeLane([null, null], 1), -1);
});

test("computeLabelXs: linear history keeps labels anchored to their dot", () => {
  const commits = [
    { hash: "c3", parents: ["c2"], subject: "3", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "c2", parents: ["c1"], subject: "2", author: "", date: "", refs: [] },
    { hash: "c1", parents: [], subject: "1", author: "", date: "", refs: [] }
  ];
  const graph = layoutGraph(commits);
  const xs = computeLabelXs(graph, buildEdgePaths(graph));
  // All rows sit on lane 0; the single vertical run at x=18 lies left of the
  // dot-anchored start (18 + 12), so no row needs to move.
  assert.deepEqual(xs, [30, 30, 30]);
});

test("computeLabelXs: labels dodge crossing edge lines without left-aligning", () => {
  const commits = [
    { hash: "M", parents: ["C", "E"], subject: "merge", author: "", date: "", refs: ["HEAD -> main"] },
    { hash: "E", parents: ["D"], subject: "e", author: "", date: "", refs: ["feat"] },
    { hash: "D", parents: ["B"], subject: "d", author: "", date: "", refs: [] },
    { hash: "C", parents: ["B"], subject: "c", author: "", date: "", refs: [] },
    { hash: "B", parents: ["A"], subject: "b", author: "", date: "", refs: [] },
    { hash: "A", parents: [], subject: "a", author: "", date: "", refs: [] }
  ];
  const graph = layoutGraph(commits);
  const xs = computeLabelXs(graph, buildEdgePaths(graph));
  // Lane 1 (x=42) carries E->D->B through rows 1-4; lane-0 rows whose text
  // would cross that line (rows 0 and 3) shift right, others keep their
  // dot-anchored start (54 on lane 1, 30 on lane 0). Multiple distinct x
  // values prove this is a stepped layout, not a global left-align.
  assert.deepEqual(xs, [33, 54, 54, 52, 54, 54]);
  assert.ok(new Set(xs).size > 1, "labels must not all share one x (no left-align)");
  // Every label still starts at or to the right of its own dot anchor.
  const anchor = (r) => 18 + Math.min(r.col, 9) * 24 + 12;
  graph.rows.forEach((r, i) => assert.ok(xs[i] >= anchor(r), `row ${i} moved left of its dot`));
});

test("computeLabelXs: empty graph yields no xs", () => {
  assert.deepEqual(computeLabelXs(layoutGraph([]), []), []);
});

test("hashSuffixOf: GitHub-style trailing short hash", () => {
  const c = { hash: "a".repeat(40), shortHash: "aaaaaaa", parents: [], subject: "feat: merge", author: "", date: "", refs: ["HEAD -> main", "tag: v1.1"] };
  assert.equal(hashSuffixOf(c), " (aaaaaaa)");
  assert.equal(rowTextOf(c), "HEAD -> main v1.1 feat: merge (aaaaaaa)");
});

test("hashSuffixOf: falls back to the first 7 chars of the full hash", () => {
  const c = { hash: "0123456789abcdef".repeat(3).slice(0, 40) };
  assert.equal(hashSuffixOf(c), " (0123456)");
});

test("rowTextOf: empty refs and subject still carry the hash suffix", () => {
  const c = { hash: "a".repeat(40), shortHash: "aaaaaaa", parents: [], subject: "", author: "", date: "", refs: [] };
  assert.equal(rowTextOf(c), " (aaaaaaa)");
});
