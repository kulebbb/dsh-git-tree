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
const { layoutGraph } = exports_;

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
