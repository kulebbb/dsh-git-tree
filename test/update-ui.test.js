import { test } from "node:test";
import assert from "node:assert/strict";

// Stub the browser module system so the bundle can materialize in Node.
globalThis.window = {
  __ModuleLoader__: { load: (handoff) => { globalThis.__DSH_GT_LOADED = handoff; } }
};
const fakeReact = {
  createElement: () => null,
  useState: () => [],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: () => ({}),
  useMemo: () => null,
  useCallback: (fn) => fn
};
await import(new URL("../lib/client.js", import.meta.url));
const loaded = globalThis.__DSH_GT_LOADED;
assert.ok(loaded, "bundle must call __ModuleLoader__.load");
const { updateView, formatCheckedAt, dictionaries } = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});

const base = {
  current: "0.7.0",
  latest: "0.7.2",
  newer: true,
  installSource: "registry",
  canUpdate: true,
  checkedAt: 1_760_000_000_000,
  checkError: null
};

test("dictionaries: zh and en define the same keys, including the update set", () => {
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort());
  for (const key of ["update.check", "update.newVersion", "update.noteGit", "update.sourceRegistry", "update.notChecked"]) {
    assert.equal(typeof dictionaries.zh[key], "string", key);
    assert.equal(typeof dictionaries.en[key], "string", key);
  }
});

test("formatCheckedAt: local HH:mm, and empty for junk", () => {
  const stamp = new Date(2026, 10, 18, 9, 5, 0).getTime();
  assert.equal(formatCheckedAt(stamp), "09:05");
  assert.equal(formatCheckedAt(undefined), "");
  assert.equal(formatCheckedAt(Number.NaN), "");
  assert.equal(formatCheckedAt(Number.POSITIVE_INFINITY), "");
});

test("updateView: first load shows the checking state and no actions", () => {
  const view = updateView(null, { loading: true });
  assert.equal(view.tone, "neutral");
  assert.equal(view.stateKey, "update.checking");
  assert.equal(view.noteKey, "update.noteChecking");
  assert.deepEqual(view.actions, []);
  assert.equal(view.chip.kind, "unknown");
});

test("updateView: a transport failure explains itself", () => {
  const view = updateView(null, { loading: false, networkError: "HTTP 500" });
  assert.equal(view.tone, "error");
  assert.equal(view.stateKey, "update.checkFailed");
  assert.equal(view.noteKey, "update.noteNetworkError");
  assert.equal(view.noteParams.message, "HTTP 500");
  assert.equal(view.chip.kind, "unknown");
});

test("updateView: registry install with a newer version offers the update action", () => {
  const view = updateView(base);
  assert.equal(view.tone, "update");
  assert.equal(view.chip.kind, "newer");
  assert.equal(view.chip.latest, "0.7.2");
  assert.equal(view.titleKey, "update.chipTitleUpdate");
  assert.deepEqual(view.actions.map((a) => [a.id, a.primary]), [["update", true], ["npm", false]]);
  assert.equal(view.sourceKey, "update.sourceRegistry");
  assert.equal(view.checkedAt, base.checkedAt);
});

test("updateView: a Git install reports the version but routes to the Plugins page", () => {
  const view = updateView({ ...base, installSource: "git", canUpdate: false });
  assert.equal(view.tone, "warn");
  assert.equal(view.chip.kind, "version");
  assert.equal(view.stateKey, "update.installGit");
  assert.equal(view.noteKey, "update.noteGit");
  assert.deepEqual(view.actions.map((a) => [a.id, a.primary]), [["plugins", true], ["npm", false]]);
  assert.equal(view.sourceKey, "update.sourceGit");
});

test("updateView: a local directory install explains there is no source version", () => {
  const view = updateView({ ...base, installSource: "local", canUpdate: false });
  assert.equal(view.tone, "warn");
  assert.equal(view.stateKey, "update.installLocal");
  assert.deepEqual(view.actions.map((a) => a.id), ["plugins", "npm"]);
});

test("updateView: a registry latest that is not installable is not offered as an update", () => {
  const view = updateView({ ...base, canUpdate: false, checkError: "latest is not installable" });
  assert.equal(view.tone, "warn");
  assert.equal(view.stateKey, "update.notInstallable");
  assert.equal(view.noteKey, "update.noteNotInstallable");
  assert.deepEqual(view.actions.map((a) => a.id), ["plugins", "npm"]);
});

test("updateView: an unknown source with a newer version points at npm", () => {
  const view = updateView({ ...base, installSource: "unknown", canUpdate: false });
  assert.equal(view.tone, "warn");
  assert.equal(view.stateKey, "update.installUnknown");
  assert.deepEqual(view.actions.map((a) => a.id), ["npm"]);
  assert.equal(view.sourceKey, "update.sourceUnknown");
});

test("updateView: an empty current version never renders as vnull", () => {
  const view = updateView({ ...base, current: "", latest: null, newer: false, canUpdate: false, checkError: null });
  assert.equal(view.chip.kind, "unknown");
  assert.equal(view.chip.current, null);
});

test("updateView: up to date hides every action", () => {
  const view = updateView({ ...base, newer: false, canUpdate: false });
  assert.equal(view.tone, "ok");
  assert.equal(view.stateKey, "update.upToDate");
  assert.deepEqual(view.actions, []);
});

test("updateView: a failed registry check wins over an older latest", () => {
  const view = updateView({ ...base, latest: null, newer: false, canUpdate: false, checkError: "registry unreachable" });
  assert.equal(view.tone, "error");
  assert.equal(view.stateKey, "update.checkFailed");
  assert.equal(view.noteKey, "update.noteCheckError");
});

test("updateView: loading over an existing result keeps the result", () => {
  const view = updateView(base, { loading: true });
  assert.equal(view.stateKey, "update.newVersion");
  assert.equal(view.chip.kind, "newer");
});

test("updateView: a pinned Git install gets its own copy and points at Discover", () => {
  const view = updateView({ ...base, installSource: "git", gitPinned: true, canUpdate: false });
  assert.equal(view.stateKey, "update.installGitPinned");
  assert.equal(view.noteKey, "update.noteGitPinned");
  assert.deepEqual(view.actions.map((a) => a.id), ["plugins"]);
});

test("updateView: a stale result keeps the update action and flags the refresh", () => {
  const view = updateView({ ...base, stale: true, checkError: "registry unreachable", checkErrorCode: "registry" });
  assert.equal(view.tone, "update");
  assert.equal(view.stale, true);
  assert.deepEqual(view.actions.map((a) => [a.id, a.primary]), [["update", true], ["npm", false]]);
});

test("updateView: an unreadable local version does not blame the network", () => {
  const view = updateView({ current: "", latest: null, newer: false, installSource: "unknown", canUpdate: false, checkedAt: 1, checkError: "cannot read the installed version", checkErrorCode: "local-version" });
  assert.equal(view.stateKey, "update.checkFailed");
  assert.equal(view.noteKey, "update.noteVersionError");
});
