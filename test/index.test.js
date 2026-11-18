import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, GRAPH_ROUTE, UPDATE_STATUS_ROUTE } from "../lib/index.js";

const SESSION = "sess-1";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function fakeRes() {
  const calls = [];
  return {
    calls,
    writeHead: (status, headers) => calls.push(["head", status, headers]),
    end: (body) => calls.push(["end", body])
  };
}

function endBody(res) {
  const end = res.calls.find(([kind]) => kind === "end");
  return end ? end[1] : null;
}

function responseOf(res) {
  const body = endBody(res);
  return body ? JSON.parse(body) : null;
}

/** Mount the plugin with stubbed registry/profile facts and return the route handlers. */
function makeContext({ fetchImpl, admit, workspaces, sessions, profileDir, profileContext, readSpec, now } = {}) {
  const handlers = {};
  const ctx = {
    webServer: {
      register: ({ path, handler }) => { handlers[path] = handler; return () => {}; }
    },
    logger: { warn: () => {}, debug: () => {} },
    effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanup(); },
    connection: {
      admit: admit ?? (() => ({ peer: { id: "peer" } }))
    },
    workspaceRegistry: {
      list: () => workspaces ?? []
    },
    get(name) {
      if (name === "sessions") return sessions;
      if (name === "profileContext") return profileContext ?? (profileDir === undefined ? undefined : { dir: profileDir });
      return undefined;
    }
  };
  apply(ctx, {}, {
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    ...(readSpec === undefined ? {} : { readSpec }),
    ...(now === undefined ? {} : { now })
  });
  return { handlers };
}

function graphUrl({ cwd, session = SESSION } = {}) {
  const params = new URLSearchParams();
  if (session != null) params.set("session", session);
  if (cwd !== undefined) params.set("cwd", cwd);
  const query = params.toString();
  return query ? `${GRAPH_ROUTE}?${query}` : GRAPH_ROUTE;
}

function workspaceContext(root, extra = {}) {
  return makeContext({
    fetchImpl: okFetch,
    workspaces: [{ path: root, sessionIds: [SESSION] }],
    ...extra
  });
}

const okFetch = async () => ({ ok: true, json: async () => ({ version: "9.9.9", dsh: { bundle: { patch: "./cordis.patch.yml" } } }) });

/** One status request; the host checks lazily and answers after the check. */
async function statusOf(handlers, search = "") {
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: `${UPDATE_STATUS_ROUTE}${search}`, method: "GET" }, res);
  return responseOf(res);
}

test("apply: registers the graph and status routes only", () => {
  const { handlers } = makeContext({ fetchImpl: okFetch });
  assert.equal(typeof handlers[GRAPH_ROUTE], "function");
  assert.equal(typeof handlers[UPDATE_STATUS_ROUTE], "function");
  // The desktop app owns installs; this plugin must not expose an install route.
  assert.equal(handlers["/git-tree/update"], undefined);
});

test("GET status: runs the registry check on demand", async () => {
  const { handlers } = makeContext({ fetchImpl: okFetch, readSpec: async () => "^0.7.0" });
  const body = await statusOf(handlers);
  assert.equal(body.ok, true);
  assert.equal(body.latest, "9.9.9");
  assert.equal(body.checkError, null);
  assert.equal(body.current, manifest.version);
  assert.equal(body.newer, true);
  assert.equal(body.installSource, "registry");
  assert.equal(body.canUpdate, true);
  assert.equal(typeof body.checkedAt, "number");
});

test("GET status: a failed registry check keeps latest null and reports the error", async () => {
  const failingFetch = async () => { throw new Error("ECONNREFUSED"); };
  const { handlers } = makeContext({ fetchImpl: failingFetch, readSpec: async () => "^0.7.0" });
  const body = await statusOf(handlers);
  assert.equal(body.ok, true);
  assert.equal(body.latest, null);
  assert.equal(body.newer, false);
  assert.equal(body.canUpdate, false);
  assert.equal(body.checkError, "registry unreachable");
});

test("apply: the registry is not queried until the status route runs", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ version: "9.9.9", dsh: { bundle: {} } }) };
  };
  const { handlers } = makeContext({ fetchImpl, readSpec: async () => "^0.7.0" });
  assert.equal(calls, 0, "mounting the plugin must not hit the network");
  await statusOf(handlers);
  assert.equal(calls, 1);
});

test("GET status: profileContext is resolved lazily, not at apply time", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@kulebbb/dsh-git-tree": "github:kulebbb/dsh-git-tree" } }));
    let profile;
    const handlers = {};
    const ctx = {
      webServer: { register: ({ path, handler }) => { handlers[path] = handler; return () => {}; } },
      logger: { warn: () => {}, debug: () => {} },
      effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanup(); },
      connection: { admit: () => ({ peer: {} }) },
      workspaceRegistry: { list: () => [] },
      get(name) { return name === "profileContext" ? profile : undefined; }
    };
    apply(ctx, {}, { fetchImpl: okFetch });
    profile = { dir };
    const body = await statusOf(handlers);
    assert.equal(body.installSource, "git");
    assert.equal(body.canUpdate, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GET status: a failed forced check keeps the last good result", async () => {
  let offline = false;
  const fetchImpl = async () => {
    if (offline) throw new Error("offline");
    return { ok: true, json: async () => ({ version: "9.9.9", dsh: { bundle: {} } }) };
  };
  const { handlers } = makeContext({ fetchImpl, readSpec: async () => "^0.7.0" });
  const first = await statusOf(handlers);
  assert.equal(first.latest, "9.9.9");
  offline = true;
  const forced = await statusOf(handlers, "?refresh=1");
  assert.equal(forced.latest, "9.9.9");
  assert.equal(forced.stale, true);
  assert.equal(forced.checkErrorCode, "registry");
  const reopened = await statusOf(handlers);
  assert.equal(reopened.latest, "9.9.9");
  assert.equal(reopened.stale, false);
});

test("GET status: profileContext decides the install source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@kulebbb/dsh-git-tree": "github:kulebbb/dsh-git-tree" } }));
    const { handlers } = makeContext({ fetchImpl: okFetch, profileContext: { dir } });
    const body = await statusOf(handlers);
    assert.equal(body.installSource, "git");
    assert.equal(body.newer, true);
    assert.equal(body.canUpdate, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GET status: refresh=1 bypasses the cache and writes the new result", async () => {
  let version = "9.9.9";
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ version, dsh: { bundle: {} } }) };
  };
  const { handlers } = makeContext({ fetchImpl, readSpec: async () => "^0.7.0" });
  assert.equal((await statusOf(handlers)).latest, "9.9.9");
  version = "9.9.10";
  assert.equal((await statusOf(handlers)).latest, "9.9.9");
  assert.equal(calls, 1);
  assert.equal((await statusOf(handlers, "?refresh=1")).latest, "9.9.10");
  assert.equal(calls, 2);
  assert.equal((await statusOf(handlers)).latest, "9.9.10", "the forced result is cached");
  assert.equal(calls, 2);
});

test("GET status: non-GET methods are rejected before any registry request", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ version: "9.9.9" }) }; };
  const { handlers } = makeContext({ fetchImpl, readSpec: async () => "^0.7.0" });
  const res = fakeRes();
  await handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "POST" }, res);
  assert.equal(res.calls[0][1], 405);
  assert.equal(calls, 0);
});

test("routes: host admission rejection is returned before the handler runs", async () => {
  const root = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    for (const rejection of [401, 403]) {
      const { handlers } = workspaceContext(root, {
        admit: () => ({ rejection })
      });
      const expectedBody = rejection === 401 ? "unauthorized" : "forbidden";
      for (const route of [GRAPH_ROUTE, UPDATE_STATUS_ROUTE]) {
        const res = fakeRes();
        const url = route === GRAPH_ROUTE ? graphUrl({ cwd: root }) : route;
        await handlers[route]({ url, method: "GET" }, res);
        assert.equal(res.calls[0][1], rejection, route);
        assert.equal(endBody(res), expectedBody, route);
      }
    }
    const denied = makeContext({
      fetchImpl: okFetch,
      admit: () => { throw new Error("admit exploded"); },
      workspaces: [{ path: root, sessionIds: [SESSION] }]
    });
    const res = fakeRes();
    await denied.handlers[UPDATE_STATUS_ROUTE]({ url: UPDATE_STATUS_ROUTE, method: "POST" }, res);
    assert.equal(res.calls[0][1], 401);
    assert.equal(endBody(res), "unauthorized");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("graph route: rejects a cwd the host did not bind to this session", async () => {
  const root = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    const { handlers } = workspaceContext(root);
    const outside = mkdtempSync(join(tmpdir(), "gt-index-"));
    try {
      for (const url of [
        graphUrl({ session: null }),
        graphUrl({ cwd: outside }),
        graphUrl({ cwd: join(root, "missing") }),
        graphUrl({ cwd: "missing-rel" }),
        `${GRAPH_ROUTE}?cwd=${encodeURIComponent(root)}`
      ]) {
        const res = fakeRes();
        await handlers[GRAPH_ROUTE]({ url, method: "GET" }, res);
        assert.equal(res.calls[0][1], 400, url);
        assert.equal(responseOf(res).error.code, "invalid-cwd", url);
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("graph route: rejects cwd that escapes the workspace via .., a sibling prefix, or a symlink", async () => {
  const parent = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    const root = join(parent, "b");
    const sibling = join(parent, "bc");
    const outside = join(parent, "outside");
    const nested = join(root, "sub");
    mkdirSync(root);
    mkdirSync(sibling);
    mkdirSync(outside);
    mkdirSync(nested);
    symlinkSync(outside, join(root, "escape"));
    const { handlers } = workspaceContext(root);
    for (const cwd of [
      outside,
      sibling,
      "..",
      join(root, ".."),
      join(nested, "..", ".."),
      join(root, "escape"),
      "escape",
      "sub/../../outside"
    ]) {
      const res = fakeRes();
      await handlers[GRAPH_ROUTE]({ url: graphUrl({ cwd }), method: "GET" }, res);
      assert.equal(res.calls[0][1], 400, cwd);
      assert.equal(responseOf(res).error.code, "invalid-cwd", cwd);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("graph route: accepts the workspace root, a child directory, and an in-workspace symlink", async () => {
  const root = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    const child = join(root, "child");
    const linked = join(root, "linked");
    mkdirSync(child);
    mkdirSync(linked);
    symlinkSync(linked, join(root, "inside-link"));
    symlinkSync(root, join(root, "root-link"));
    const { handlers } = workspaceContext(root);
    for (const cwd of [undefined, root, child, "child", "child/..", "inside-link", "root-link", "."]) {
      const res = fakeRes();
      await handlers[GRAPH_ROUTE]({ url: graphUrl({ cwd }), method: "GET" }, res);
      assert.equal(res.calls[0][1], 200, String(cwd));
      const body = responseOf(res);
      assert.equal(body.ok, false, String(cwd));
      assert.equal(body.error.code, "not-a-git-repo", String(cwd));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("graph route: session header cwd is the root when the registry has no membership", async () => {
  const root = mkdtempSync(join(tmpdir(), "gt-index-"));
  const outside = mkdtempSync(join(tmpdir(), "gt-index-"));
  try {
    const { handlers } = makeContext({
      fetchImpl: okFetch,
      workspaces: [],
      sessions: {
        get(id) {
          if (id !== SESSION) return undefined;
          return { header: { cwd: root } };
        }
      }
    });
    const allowed = fakeRes();
    await handlers[GRAPH_ROUTE]({ url: graphUrl(), method: "GET" }, allowed);
    assert.equal(allowed.calls[0][1], 200);
    assert.equal(responseOf(allowed).error.code, "not-a-git-repo");
    const denied = fakeRes();
    await handlers[GRAPH_ROUTE]({ url: graphUrl({ cwd: outside }), method: "GET" }, denied);
    assert.equal(denied.calls[0][1], 400);
    assert.equal(responseOf(denied).error.code, "invalid-cwd");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
