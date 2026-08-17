import { isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collectGraph } from "./git.js";
import {
  checkRegistryLatest,
  deriveStatus,
  findProfileDir,
  isDevSpec,
  readDependencySpec,
  runPnpmUpdate
} from "./update.js";

/** Cordis services this plugin needs. */
export const inject = ["webServer"];

/** Exact route path for the graph endpoint. */
export const GRAPH_ROUTE = "/git-tree/graph";
/** Exact route path for the update-status endpoint. */
export const UPDATE_STATUS_ROUTE = "/git-tree/update/status";
/** Exact route path for the one-click-update endpoint. */
export const UPDATE_ROUTE = "/git-tree/update";

// No exported Config schema on purpose: the repo is deliberately
// zero-dependency (`node --test` runs without any install), and Cordis
// passes the raw config through unchanged when a plugin has no Config
// export. Optional `update.profileDir` is read via optional chaining.

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Mount all routes and start the async update check.
 * @param ctx - host context carrying webServer (injected).
 * @param config - raw plugin config from cordis.patch.yml (optional; read via optional chaining).
 * @param deps - internal test seam: `fetchImpl`, `spawnImpl`, `env`.
 *   Production callers never pass it.
 */
export function apply(ctx, config, deps = {}) {
  const ownFile = fileURLToPath(import.meta.url);
  const profileDir = config?.update?.profileDir ?? "";
  // In-memory update state, refreshed once at startup and mutated by POST
  // /git-tree/update. `updating` guards against concurrent updates.
  const state = {
    current: "0.0.0",
    latest: null,
    checkError: null,
    profile: null,
    dev: false,
    updating: false
  };

  ctx.effect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
        if (typeof pkg?.version === "string") state.current = pkg.version;
      } catch {
        /* keep the 0.0.0 default */
      }
      state.profile = findProfileDir(ownFile, profileDir, deps.env ?? process.env);
      if (state.profile.dir) {
        state.dev = isDevSpec(readDependencySpec(state.profile.dir));
      }
      const { latest, checkError } = await checkRegistryLatest({ signal: controller.signal, fetchImpl: deps.fetchImpl });
      state.latest = latest;
      state.checkError = checkError;
      if (checkError) ctx.logger.debug?.("[dsh-git-tree] update check:", checkError);
    })();
    return () => controller.abort();
  }, "dsh-git-tree: update check");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: GRAPH_ROUTE,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const cwd = url.searchParams.get("cwd") ?? "";
        if (!isAbsolute(cwd) || !(await isDirectory(cwd))) {
          sendJson(res, 400, { ok: false, error: { code: "invalid-cwd", message: "cwd must be an existing absolute directory path" } });
          return;
        }
        const raw = url.searchParams.get("n");
        const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
        const payload = await collectGraph(cwd, Number.isNaN(parsed) ? undefined : parsed);
        sendJson(res, 200, payload);
      } catch (error) {
        const kind = error?.kind;
        let status, body;
        if (kind === "not-a-git-repo") {
          status = 200;
          body = { ok: false, error: { code: kind, message: String(error.message) } };
        } else if (kind === "git-unavailable" || kind === "git-timeout" || kind === "git-error") {
          status = 500;
          body = { ok: false, error: { code: kind, message: String(error.message) } };
        } else {
          ctx.logger.warn("[dsh-git-tree] unexpected error:", error);
          status = 500;
          body = { ok: false, error: { code: "internal", message: String(error?.message ?? error) } };
        }
        try {
          sendJson(res, status, body);
        } catch (responseError) {
          ctx.logger.warn("[dsh-git-tree] failed to write error response:", responseError);
        }
      }
    }
  }), "dsh-git-tree: graph route");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: UPDATE_STATUS_ROUTE,
    handler: async (req, res) => {
      if (req.method !== "GET") {
        sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "use GET" } });
        return;
      }
      const payload = deriveStatus({
        current: state.current,
        latest: state.latest,
        dev: state.dev,
        profileDir: state.profile?.dir ?? null,
        checkError: state.checkError
      });
      sendJson(res, 200, { ok: true, ...payload });
    }
  }), "dsh-git-tree: update status route");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: UPDATE_ROUTE,
    handler: async (req, res) => {
      if (req.method !== "POST") {
        sendJson(res, 405, { ok: false, error: { code: "method-not-allowed", message: "use POST" } });
        return;
      }
      if (state.updating) {
        sendJson(res, 409, { ok: false, error: { code: "already-running", message: "an update is already in progress" } });
        return;
      }
      if (state.dev) {
        sendJson(res, 409, { ok: false, error: { code: "dev-install", message: "plugin installed via a link/file spec; refusing to auto-update" } });
        return;
      }
      const dir = state.profile?.dir;
      if (!dir) {
        sendJson(res, 409, { ok: false, error: { code: "profile-not-found", message: state.profile?.reason ?? "cannot locate the profile directory" } });
        return;
      }
      state.updating = true;
      try {
        const result = await runPnpmUpdate(dir, { spawnImpl: deps.spawnImpl });
        if (result.ok) state.current = state.latest ?? state.current;
        sendJson(res, result.ok ? 200 : 500, {
          ok: result.ok,
          ...(result.ok ? {} : { error: { code: result.code, message: result.message } }),
          output: result.output
        });
      } finally {
        state.updating = false;
      }
    }
  }), "dsh-git-tree: update route");
}
