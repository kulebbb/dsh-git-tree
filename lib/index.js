import { isAbsolute, relative, resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { collectGraph } from "./git.js";
import { UpdateChecker, readInstallSpec, resolveProfileDir } from "./update.js";

/**
 * Cordis services this plugin needs.
 * `connection` and `workspaceRegistry` are required so the routes are not
 * mounted until host admission and the workspace registry exist.
 */
export const inject = ["webServer", "connection", "workspaceRegistry"];

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
 * Admit the request the same way the host `/api` route does.
 * `ctx.connection.admit()` returns `{ peer }` or `{ rejection: 401 | 403 }`.
 * `requestRejection` still exists, but on current DSH it only unwraps `admit`.
 * @returns true when handling may continue.
 */
function admitRequest(ctx, req, res) {
  let admission;
  try {
    if (typeof ctx.connection?.admit !== "function") {
      admission = { rejection: 401 };
    } else {
      admission = ctx.connection.admit(req);
    }
  } catch (error) {
    ctx.logger.warn("[dsh-git-tree] connection.admit failed:", error);
    admission = { rejection: 401 };
  }
  if (admission && typeof admission === "object" && !("rejection" in admission) && "peer" in admission) {
    return true;
  }
  const status = admission && typeof admission === "object" && admission.rejection === 403 ? 403 : 401;
  try {
    res.writeHead(status);
    res.end(status === 401 ? "unauthorized" : "forbidden");
  } catch (error) {
    ctx.logger.warn("[dsh-git-tree] failed to write response:", error);
  }
  return false;
}

/**
 * Workspace root for this session, taken from the host.
 * Prefer `workspaceRegistry.list()` (`path` of the record whose `sessionIds`
 * include the session). Desktop builds have been seen with an empty
 * plugin-visible `sessions` registry, so the registry is the primary source.
 * When the session is not a workspace member, fall back to
 * `ctx.sessions.get(id).header.cwd`.
 */
function workspaceRootFromHost(ctx, sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") return undefined;
  try {
    const registry = ctx.workspaceRegistry;
    const listed = typeof registry?.list === "function" ? registry.list() : [];
    if (Array.isArray(listed)) {
      for (const workspace of listed) {
        if (typeof workspace?.path !== "string" || workspace.path === "") continue;
        const ids = workspace.sessionIds;
        if (!Array.isArray(ids)) continue;
        if (ids.some((id) => String(id) === sessionId)) return workspace.path;
      }
    }
  } catch (error) {
    ctx.logger.warn("[dsh-git-tree] workspace lookup failed:", error);
  }
  try {
    const sessions = typeof ctx.get === "function" ? ctx.get("sessions") : undefined;
    const cwd = sessions?.get?.(sessionId)?.header?.cwd;
    if (typeof cwd === "string" && cwd !== "") return cwd;
  } catch (error) {
    ctx.logger.warn("[dsh-git-tree] session cwd lookup failed:", error);
  }
  return undefined;
}

/** True when `target` is `root` or a descendant. `path.relative` rejects prefix cousins such as `/a/b` and `/a/bc`. */
function isInsideWorkspace(root, target) {
  const rel = relative(root, target);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return !rel.split(sep).includes("..");
}

/**
 * Resolve the directory git may run in.
 * Omitted `cwd` uses the host workspace root. A provided path may be absolute
 * or relative to that root; both sides are `realpath`'d, so `..` and symlinks
 * cannot escape. Missing paths and paths outside the root return undefined.
 */
async function cwdInsideWorkspace(ctx, sessionId, requested) {
  const rootSpelling = workspaceRootFromHost(ctx, sessionId);
  if (!rootSpelling) return undefined;
  let root;
  try {
    root = await realpath(rootSpelling);
  } catch {
    return undefined;
  }
  if (!(await isDirectory(root))) return undefined;
  const raw = requested == null || requested === "" ? root : requested;
  const candidate = isAbsolute(raw) ? raw : resolve(root, raw);
  let cwd;
  try {
    cwd = await realpath(candidate);
  } catch {
    return undefined;
  }
  if (!(await isDirectory(cwd)) || !isInsideWorkspace(root, cwd)) return undefined;
  return cwd;
}

/**
 * Mount the routes and create the lazy version checker.
 *
 * The plugin ships for the DSH desktop app only. The app owns its profile
 * (installs, updates and removals all happen on its Plugins page), so this
 * module never writes to a profile and exposes no install route: it only
 * reports whether a newer version exists and whether this install can use the
 * Plugins page's update button.
 * @param ctx - host context carrying webServer, connection, and workspaceRegistry.
 * @param _config - raw plugin config from cordis.patch.yml (unused).
 * @param deps - internal test seam: fetch/clock/readers/profile overrides.
 */
export function apply(ctx, _config, deps = {}) {
  // Resolve the profile at check time, not at apply time: a host may provide
  // `profileContext` after this plugin mounts. Fall back to the same
  // environment variables the reference implementation uses.
  const readSpec = deps.readSpec ?? (async () => {
    let dir = deps.profileDir;
    if (dir === undefined) {
      try {
        const profile = ctx.get?.("profileContext");
        if (typeof profile?.dir === "string" && profile.dir !== "") dir = profile.dir;
      } catch {
        dir = undefined;
      }
    }
    if (dir === undefined) dir = resolveProfileDir(process.env);
    return readInstallSpec(dir);
  });

  const checker = deps.checker ?? new UpdateChecker({
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.registries === undefined ? {} : { registries: deps.registries }),
    ...(deps.readVersion === undefined ? {} : { readVersion: deps.readVersion }),
    readSpec,
    ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    ...(deps.okTtlMs === undefined ? {} : { okTtlMs: deps.okTtlMs }),
    ...(deps.failTtlMs === undefined ? {} : { failTtlMs: deps.failTtlMs })
  });

  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: GRAPH_ROUTE,
    handler: async (req, res) => {
      if (!admitRequest(ctx, req, res)) return;
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const cwd = await cwdInsideWorkspace(ctx, url.searchParams.get("session"), url.searchParams.get("cwd"));
        if (!cwd) {
          sendJson(res, 400, { ok: false, error: { code: "invalid-cwd", message: "cwd must be an existing directory inside the current workspace" } });
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
      if (!admitRequest(ctx, req, res)) return;
      if (req.method !== "GET") {
        trySend(ctx, res, 405, { ok: false, error: { code: "method-not-allowed", message: "use GET" } });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const force = url.searchParams.get("refresh") === "1";
        const status = await checker.check({ force });
        trySend(ctx, res, 200, { ok: true, ...status });
      } catch (error) {
        ctx.logger.warn("[dsh-git-tree] update check failed:", error);
        trySend(ctx, res, 200, {
          ok: true,
          current: "",
          latest: null,
          newer: false,
          installSource: "unknown",
          canUpdate: false,
          checkedAt: null,
          stale: false,
          checkError: "check failed",
          checkErrorCode: "internal"
        });
      }
    }
  }), "dsh-git-tree: update status route");
}
