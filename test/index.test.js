import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, GRAPH_ROUTE, UPDATE_STATUS_ROUTE, UPDATE_ROUTE } from "../lib/index.js";
import { compareVersions } from "../lib/update.js";

function fakeRes() {
  const calls = [];
  return {
    calls,
    writeHead: (status, headers) => calls.push(["head", status, headers]),
    end: (body) => calls.push(["end", body])
  };
}

function responseOf(res) {
  const end = res.calls.find(([kind]) => kind === "end");
  return end ? JSON.parse(end[1]) : null;
}

function makeContext({ config = {}, fetchImpl, spawnImpl, env = {} } = {}) {
  const handlers = {};
  const ctx = {
    webServer: {
      register: ({ path, handler }) => { handlers[path] = handler; return () => {}; }
    },
    logger: { warn: () => {}, debug: () => {} },
    effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanup(); }
  };
  apply(ctx, config, { fetchImpl, spawnImpl, env });
  return { ctx, handlers };
}

function tempProfile({ spec = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gt-index-"));
  const deps = spec ? { dependencies: { "@kulebbb/dsh-git-tree": spec } } : {};
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "temp-profile", ...deps }));
  return root;
}

const okFetch = async () => ({ ok: true, json: async () => ({ version: "9.9.9" }) });
const okSpawn = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => child.emit("close", 0));
  return child;
};

test("apply: registers all three routes", () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  assert.equal(typeof handlers[GRAPH_ROUTE], "function");
  assert.equal(typeof handlers[UPDATE_STATUS_ROUTE], "function");
  assert.equal(typeof handlers[UPDATE_ROUTE], "function");
});

test("GET status: returns derived payload after startup check settles", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "GET" }, res);
  const body = responseOf(res);
  assert.equal(body.ok, true);
  assert.equal(body.latest, "9.9.9");
  assert.equal(body.dev, false);
  assert.equal(body.profileDir, profile);
  assert.equal(body.updateAvailable, compareVersions("9.9.9", body.current) > 0);
  rmSync(profile, { recursive: true, force: true });
});

test("POST update: refuses dev installs with 409 dev-install", async () => {
  const profile = tempProfile({ spec: "link:/tmp/checkout" });
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const res = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 409);
  assert.equal(responseOf(res).error.code, "dev-install");
  rmSync(profile, { recursive: true, force: true });
});

test("POST update: 409 profile-not-found when no profile locatable", async () => {
  const emptyHome = mkdtempSync(join(tmpdir(), "gt-index-"));
  const { handlers } = makeContext({ fetchImpl: okFetch, env: { DSH_HOME: emptyHome } });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const res = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 409);
  assert.equal(responseOf(res).error.code, "profile-not-found");
  rmSync(emptyHome, { recursive: true, force: true });
});

test("POST update: succeeds and refreshes current version", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch, spawnImpl: okSpawn });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const res = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 200);
  assert.equal(responseOf(res).ok, true);
  // Subsequent status now reports current == latest (no longer available).
  const res2 = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "GET" }, res2);
  assert.equal(responseOf(res2).updateAvailable, false);
  rmSync(profile, { recursive: true, force: true });
});

test("POST update: 409 already-running while another update is in flight", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  let child;
  const hangingSpawn = () => {
    child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    return child; // never settles until the test emits close
  };
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch, spawnImpl: hangingSpawn });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const first = handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, fakeRes());
  await new Promise((r) => setTimeout(r, 20)); // let updating=true take effect
  const res2 = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, res2);
  assert.equal(res2.calls[0][1], 409);
  assert.equal(responseOf(res2).error.code, "already-running");
  child.emit("close", 0);
  await first;
  rmSync(profile, { recursive: true, force: true });
});

test("POST update: 405 for non-POST methods", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch });
  await new Promise((r) => setTimeout(r, 50)); // wait for the startup registry check to settle
  const res = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "GET" }, res);
  assert.equal(res.calls[0][1], 405);
  rmSync(profile, { recursive: true, force: true });
});

test("GET status: 405 for non-GET methods", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch });
  await new Promise((r) => setTimeout(r, 50));
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 405);
  assert.equal(responseOf(res).error.code, "method-not-allowed");
  rmSync(profile, { recursive: true, force: true });
});

test("POST update: 500 with pnpm-error shape on pnpm failure", async () => {
  const profile = tempProfile({ spec: "^0.3.1" });
  const failingSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stderr.emit("data", "ERR_PNPM_FETCH_404");
      child.emit("close", 1);
    });
    return child;
  };
  const { handlers } = makeContext({ config: { update: { profileDir: profile } }, fetchImpl: okFetch, spawnImpl: failingSpawn });
  await new Promise((r) => setTimeout(r, 50));
  const res = fakeRes();
  await handlers[UPDATE_ROUTE]({ url: UPDATE_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 500);
  const body = responseOf(res);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "pnpm-error");
  assert.match(body.output, /ERR_PNPM_FETCH_404/);
  rmSync(profile, { recursive: true, force: true });
});
