import { test } from "node:test";
import assert from "node:assert/strict";

// Stub the browser module system so the bundle can materialize in Node
// (same pattern as test/format.test.js). The factory lazily touches react.
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
const { shortcutDefaults } = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});

test("shortcut defaults: desktop platforms only", () => {
  // The plugin targets the DSH desktop app. The shortcut registry rejects the
  // whole default set when any declared platform is illegal, so a stray web:*
  // entry would silently drop the shortcut — pin the key set here.
  assert.deepEqual(Object.keys(shortcutDefaults).sort(), [
    "desktop:linux",
    "desktop:macos",
    "desktop:windows"
  ]);
});

test("shortcut defaults: every binding is a complete KeyG chord", () => {
  for (const [platform, binding] of Object.entries(shortcutDefaults)) {
    assert.match(platform, /^desktop:(macos|windows|linux)$/);
    assert.equal(binding.code, "KeyG", platform);
    assert.ok(Array.isArray(binding.modifiers) && binding.modifiers.length > 0, platform);
    assert.ok(binding.modifiers.includes("shift"), platform);
  }
});
