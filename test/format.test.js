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
const { formatLocalTime } = exports_;

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
