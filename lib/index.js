import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import { collectGraph } from "./git.js";

/** Cordis services this plugin needs. */
export const inject = ["webServer"];

/** Exact route path for the graph endpoint. */
export const GRAPH_ROUTE = "/git-tree/graph";

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
 * Mount the git-tree graph route on the web server.
 * @param ctx - host context carrying webServer (injected).
 */
export function apply(ctx) {
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
          // Never let a failed error-response write become an unhandled rejection.
          ctx.logger.warn("[dsh-git-tree] failed to write error response:", responseError);
        }
      }
    }
  }), "dsh-git-tree: graph route");
}
