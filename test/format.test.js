import { test } from "node:test";
import assert from "node:assert/strict";

// Pin the local timezone so formatting assertions are deterministic.
// Node on macOS/Linux honors TZ set at runtime (verified: Shanghai 06:55Z -> 14:55).
process.env.TZ = "Asia/Shanghai";

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
const { formatLocalTime, truncateText, statsParts, shortHashOf } = exports_;

test("formatLocalTime: formats ISO with explicit offset in local time", () => {
  // +08:00 input shown in Asia/Shanghai is unchanged
  assert.equal(formatLocalTime("2026-08-14T06:55:13+08:00"), "2026-08-14 06:55");
});

test("formatLocalTime: converts UTC to local time", () => {
  assert.equal(formatLocalTime("2026-08-14T06:55:13Z"), "2026-08-14 14:55");
});

test("formatLocalTime: zero-pads month, day, hour, minute", () => {
  assert.equal(formatLocalTime("2026-01-05T09:07:00Z"), "2026-01-05 17:07");
});

test("formatLocalTime: invalid input falls back to the raw string", () => {
  assert.equal(formatLocalTime("not-a-date"), "not-a-date");
  assert.equal(formatLocalTime(""), "");
});

// Monospace-ish fake measurer: 1px per char, 2px for the ellipsis.
const mono = (s) => [...s].reduce((w, ch) => w + (ch === "…" ? 2 : 1), 0);

test("truncateText: leaves text unchanged when it fits", () => {
  assert.equal(truncateText("short", 20, mono), "short");
});

test("truncateText: cuts to the budget and appends an ellipsis", () => {
  // "abcdefghij" = 10px; 8px total budget leaves 6 chars + 2px ellipsis.
  assert.equal(truncateText("abcdefghij", 8, mono), "abcdef…");
});

test("truncateText: returns only the ellipsis when nothing fits", () => {
  assert.equal(truncateText("abcdefghij", 1, mono), "…");
  assert.equal(truncateText("abcdefghij", 0, mono), "…");
});

test("truncateText: empty strings stay empty", () => {
  assert.equal(truncateText("", 10, mono), "");
});

test("statsParts: builds git-style localized diff stat parts", () => {
  const t = (key, vars) => {
    const en = {
      "panel.statsFiles": "{n} files changed",
      "panel.statsFilesOne": "1 file changed",
      "panel.statsIns": "{n} insertions(+)",
      "panel.statsInsOne": "1 insertion(+)",
      "panel.statsDel": "{n} deletions(-)",
      "panel.statsDelOne": "1 deletion(-)"
    };
    const s = en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
  };
  assert.deepEqual(statsParts(t, { files: 1, insertions: 24, deletions: 16 }), [
    { text: "1 file changed", kind: "plain" },
    { text: "24 insertions(+)", kind: "ins" },
    { text: "16 deletions(-)", kind: "del" }
  ]);
  // Zero-valued parts are omitted, mirroring git --shortstat.
  assert.deepEqual(statsParts(t, { files: 1, insertions: 1, deletions: 0 }), [
    { text: "1 file changed", kind: "plain" },
    { text: "1 insertion(+)", kind: "ins" }
  ]);
  assert.deepEqual(statsParts(t, { files: 3, insertions: 0, deletions: 0 }), [
    { text: "3 files changed", kind: "plain" }
  ]);
  // Merge commits with no diff have no stats → empty.
  assert.deepEqual(statsParts(t, null), []);
});

test("shortHashOf: trims to 7 chars and guards falsy input", () => {
  assert.equal(shortHashOf("0123456789abcdef"), "0123456");
  assert.equal(shortHashOf(""), "?");
  assert.equal(shortHashOf(null), "?");
});
