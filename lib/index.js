import { isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { collectGraph } from "./git.js";
import { checkRegistryLatest, deriveStatus } from "./update.js";

/** Cordis services this plugin needs. */
export const inject = ["webServer"];

/** Exact route path for the graph endpoint. */
export const GRAPH_ROUTE = "/git-tree/graph";
/** Exact route path for the update-status endpoint. */
export const UPDATE_STATUS_ROUTE = "/git-tree/update/status";

// The plugin has no config schema: the repo is deliberately zero-dependency
// (`node --test` runs without any install). The `_config` parameter below exists
// only because it is Cordis's call signature; nothing reads it.

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

/** Write a JSON response, never letting a failed write escape as an unhandled rejection. */
function trySend(ctx, res, status, body) {
  try {
    sendJson(res, status, body);
  } catch (error) {
    ctx.logger.warn("[dsh-git-tree] failed to write response:", error);
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Mount the routes and run the startup registry check.
 *
 * The plugin ships for the DSH desktop app only. The app owns its profile
 * (installs, updates and removals all happen on its Plugins page), so this
 * module never writes to a profile and exposes no install route: it only
 * reports whether a newer version exists.
 * @param ctx - host context carrying webServer (injected).
 * @param _config - raw plugin config from cordis.patch.yml (unused).
 * @param deps - internal test seam: `fetchImpl`. Production callers never pass it.
 */
export function apply(ctx, _config, deps = {}) {
  // In-memory update state, refreshed once at startup. The registry check is
  // best-effort: a failed check leaves `latest` null and the banner hidden.
  const state = {
    current: "0.0.0",
    latest: null,
    checkError: null
  };

  ctx.effect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
        if (typeof pkg?.version === "string") state.current = pkg.version;
        const { latest, checkError } = await checkRegistryLatest({ signal: controller.signal, fetchImpl: deps.fetchImpl });
        state.latest = latest;
        state.checkError = checkError;
        if (checkError) ctx.logger.debug?.("[dsh-git-tree] update check:", checkError);
      } catch (error) {
        ctx.logger.debug?.("[dsh-git-tree] update check failed:", error);
      }
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
        trySend(ctx, res, 405, { ok: false, error: { code: "method-not-allowed", message: "use GET" } });
        return;
      }
      trySend(ctx, res, 200, {
        ok: true,
        ...deriveStatus({ current: state.current, latest: state.latest, checkError: state.checkError })
      });
    }
  }), "dsh-git-tree: update status route");
}
