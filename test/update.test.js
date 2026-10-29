import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, deriveStatus, checkRegistryLatest } from "../lib/update.js";

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
const { showUpdateBanner, dictionaries } = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});

test("dictionaries: zh and en define the same keys", () => {
  const zh = Object.keys(dictionaries.zh).sort();
  const en = Object.keys(dictionaries.en).sort();
  assert.deepEqual(zh, en);
});

test("showUpdateBanner: hidden without status or when dismissed", () => {
  assert.equal(showUpdateBanner({ update: null, dismissed: false }), false);
  assert.equal(showUpdateBanner({ update: { latest: "0.7.0", newer: true }, dismissed: true }), false);
  assert.equal(showUpdateBanner({ update: { latest: null, newer: false }, dismissed: false }), false);
});

test("showUpdateBanner: only a newer registry version shows the banner", () => {
  assert.equal(showUpdateBanner({ update: { current: "0.6.0", latest: "0.7.0", newer: true }, dismissed: false }), true);
  assert.equal(showUpdateBanner({ update: { current: "0.7.0", latest: "0.7.0", newer: false }, dismissed: false }), false);
  // A registry that lags the installed version must never nag.
  assert.equal(showUpdateBanner({ update: { current: "0.7.0", latest: "0.4.0", newer: false }, dismissed: false }), false);
});

test("compareVersions: numeric ordering", () => {
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("compareVersions: prerelease sorts below its release", () => {
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
  assert.equal(compareVersions("1.0.0-beta.10", "1.0.0-beta.9"), -1);
});

test("compareVersions: empty and junk inputs degrade to 0", () => {
  assert.equal(compareVersions("", "0.0.1"), -1);
  assert.equal(compareVersions("abc", "0.0.0"), 0);
});

test("deriveStatus: newer only when the registry version is higher", () => {
  assert.equal(deriveStatus({ current: "0.6.0", latest: "0.7.0" }).newer, true);
  assert.equal(deriveStatus({ current: "0.7.0", latest: "0.7.0" }).newer, false);
  assert.equal(deriveStatus({ current: "0.7.0", latest: "0.4.0" }).newer, false);
});

test("deriveStatus: a failed check keeps latest null and surfaces the error", () => {
  const status = deriveStatus({ current: "0.7.0", latest: null, checkError: "registry HTTP 500" });
  assert.equal(status.latest, null);
  assert.equal(status.newer, false);
  assert.equal(status.checkError, "registry HTTP 500");
});

test("checkRegistryLatest: parses latest from registry payload", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: "0.4.0" }) });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, "0.4.0");
  assert.equal(result.checkError, null);
});

test("checkRegistryLatest: non-ok response is a silent failure", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /404/);
});

test("checkRegistryLatest: thrown fetch error is a silent failure", async () => {
  const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /ECONNREFUSED/);
});

test("checkRegistryLatest: json parse failure is a silent failure", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token"); } });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /Unexpected token/);
});

test("checkRegistryLatest: non-string version yields null latest without error", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: 123 }) });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.equal(result.checkError, null);
});
