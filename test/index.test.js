import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, GRAPH_ROUTE, UPDATE_STATUS_ROUTE } from "../lib/index.js";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

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

/** Mount the plugin with a stubbed registry fetch and return the route handlers. */
function makeContext({ fetchImpl } = {}) {
  const handlers = {};
  const ctx = {
    webServer: {
      register: ({ path, handler }) => { handlers[path] = handler; return () => {}; }
    },
    logger: { warn: () => {}, debug: () => {} },
    effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanup(); }
  };
  apply(ctx, {}, { fetchImpl });
  return { handlers };
}

const okFetch = async () => ({ ok: true, json: async () => ({ version: "9.9.9" }) });

async function statusOf(handlers) {
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "GET" }, res);
  return responseOf(res);
}

/** Poll the status route until the startup check has settled (success or failure). */
async function waitForSettled(handlers) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const body = await statusOf(handlers);
    if (typeof body?.current === "string" && body.current !== "0.0.0" && body.latest != null) return body;
    if (body?.checkError != null) return body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("update status never settled");
}

test("apply: registers the graph and status routes only", () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  assert.equal(typeof handlers[GRAPH_ROUTE], "function");
  assert.equal(typeof handlers[UPDATE_STATUS_ROUTE], "function");
  // The desktop app owns installs; this plugin must not expose an install route.
  assert.equal(handlers["/git-tree/update"], undefined);
});

test("GET status: returns derived payload after the startup check settles", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  const body = await waitForSettled(handlers);
  assert.equal(body.ok, true);
  assert.equal(body.latest, "9.9.9");
  assert.equal(body.checkError, null);
  assert.equal(body.current, manifest.version);
  assert.equal(body.newer, true);
});

test("GET status: a failed registry check keeps latest null and reports the error", async () => {
  const failingFetch = async () => { throw new Error("ECONNREFUSED"); };
  const { handlers } = makeContext({ fetchImpl: failingFetch });
  const body = await waitForSettled(handlers);
  assert.equal(body.ok, true);
  assert.equal(body.latest, null);
  assert.equal(body.newer, false);
  assert.match(body.checkError, /ECONNREFUSED/);
});

test("GET status: 405 for non-GET methods", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 405);
  assert.equal(responseOf(res).error.code, "method-not-allowed");
});

test("graph route: rejects a missing or relative cwd with 400 invalid-cwd", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  for (const url of [`${GRAPH_ROUTE}`, `${GRAPH_ROUTE}?cwd=relative/dir`]) {
    const res = fakeRes();
    await handlers[GRAPH_ROUTE]({ url }, res);
    assert.equal(res.calls[0][1], 400);
    assert.equal(responseOf(res).error.code, "invalid-cwd");
  }
});

test("graph route: rejects a non-existent absolute directory with 400 invalid-cwd", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  const missing = join(mkdtempSync(join(tmpdir(), "gt-index-")), "not-there");
  const res = fakeRes();
  await handlers[GRAPH_ROUTE]({ url: `${GRAPH_ROUTE}?cwd=${encodeURIComponent(missing)}` }, res);
  assert.equal(res.calls[0][1], 400);
  assert.equal(responseOf(res).error.code, "invalid-cwd");
  rmSync(missing, { recursive: true, force: true });
});

test("graph route: a plain directory maps to the 200 + not-a-git-repo soft error", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  const dir = mkdtempSync(join(tmpdir(), "gt-index-"));
  const res = fakeRes();
  await handlers[GRAPH_ROUTE]({ url: `${GRAPH_ROUTE}?cwd=${encodeURIComponent(dir)}` }, res);
  assert.equal(res.calls[0][1], 200);
  const body = responseOf(res);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "not-a-git-repo");
  rmSync(dir, { recursive: true, force: true });
});
