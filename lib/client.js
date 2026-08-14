window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-git-tree",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    const { createElement: h, useState, useEffect, useRef, useMemo, useCallback } = react;

    //#region dictionaries
    const NS = "gitTree";
    const zh = {
      "button.label": "Git 树",
      "panel.title": "Git 提交图",
      "panel.close": "关闭",
      "panel.refresh": "刷新",
      "panel.workspace": "工作区",
      "panel.search": "过滤提交…",
      "panel.loading": "正在读取提交历史…",
      "panel.notRepo": "该目录不是 git 仓库",
      "panel.notRepoHint": "在此目录执行 git init 创建仓库，或切换到其他工作区。",
      "panel.gitUnavailable": "git 命令不可用（未安装或不在 PATH 中）。",
      "panel.gitTimeout": "git 命令超时，请重试。",
      "panel.gitError": "git 命令执行失败：{message}",
      "panel.invalidCwd": "目录无效或不存在。",
      "panel.internal": "发生未知错误：{message}",
      "panel.empty": "该仓库还没有任何提交。",
      "panel.truncated": "仅显示最近 {n} 条提交（超出窗口的部分已截断）",
      "panel.commits": "{count} 个提交",
      "panel.dirty": "工作区有 {count} 个文件变更",
      "panel.clean": "工作区干净",
      "panel.branch": "分支 {branch}",
      "panel.detached": "HEAD 游离状态",
      "panel.lanesTruncated": "分支较多，图右缘已截断显示",
      "panel.noMatches": "没有匹配的提交",
      "panel.copyHash": "已复制 {hash}"
    };
    const en = {
      "button.label": "Git Graph",
      "panel.title": "Git Commit Graph",
      "panel.close": "Close",
      "panel.refresh": "Refresh",
      "panel.workspace": "Workspace",
      "panel.search": "Filter commits…",
      "panel.loading": "Reading commit history…",
      "panel.notRepo": "This directory is not a git repository",
      "panel.notRepoHint": "Run git init in this directory, or switch to another workspace.",
      "panel.gitUnavailable": "The git command is unavailable (not installed or missing from PATH).",
      "panel.gitTimeout": "The git command timed out. Try again.",
      "panel.gitError": "git command failed: {message}",
      "panel.invalidCwd": "Invalid or missing directory.",
      "panel.internal": "Unexpected error: {message}",
      "panel.empty": "This repository has no commits yet.",
      "panel.truncated": "Showing the most recent {n} commits (older ones are truncated)",
      "panel.commits": "{count} commits",
      "panel.dirty": "{count} changed file(s) in the working tree",
      "panel.clean": "Working tree clean",
      "panel.branch": "Branch {branch}",
      "panel.detached": "Detached HEAD",
      "panel.lanesTruncated": "Many branches; the graph's right edge is truncated",
      "panel.noMatches": "No matching commits",
      "panel.copyHash": "Copied {hash}"
    };
    //#endregion

    //#region graph layout (pure)
    const ROW_H = 28;
    const LANE_W = 24;
    const NODE_R = 4.5;
    const MARGIN_LEFT = 18;
    const MARGIN_TOP = 14;
    const MAX_LANES = 10;
    const LABEL_FONT_SIZE = 13;
    const LABEL_PAD_RIGHT = 24;
    const LABEL_MIN_WIDTH = 268;

    function nodeX(col) { return MARGIN_LEFT + Math.min(col, MAX_LANES - 1) * LANE_W; }
    function rowY(row) { return MARGIN_TOP + row * ROW_H; }

    /** Lane-based commit DAG layout (git log --graph style). Pure. */
    function layoutGraph(commits) {
      const lanes = [];
      const colOf = new Map();
      const rows = [];
      const edges = [];
      const edgeKeys = new Set();
      const pushEdge = (from, to) => {
        const key = `${from}->${to}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ from, to });
      };
      const place = (hash, col) => { lanes[col] = hash; colOf.set(hash, col); };
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        const hash = commit.hash;
        let col = lanes.indexOf(hash);
        if (col === -1) { col = lanes.length; place(hash, col); }
        lanes[col] = null;
        colOf.set(hash, col);
        let inherit = true;
        for (const p of commit.parents) {
          if (colOf.has(p)) { pushEdge(hash, p); continue; }
          if (inherit) { place(p, col); inherit = false; }
          else {
            let free = lanes.lastIndexOf(null);
            if (free === -1) { free = lanes.length; lanes.push(null); }
            place(p, free);
          }
          pushEdge(hash, p);
        }
        while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
        rows.push({ commit, col });
      }
      return { rows, edges, colOf };
    }

    function edgePath(from, to, rows, colOf) {
      const fromRow = rows.findIndex((r) => r.commit.hash === from);
      const toRow = rows.findIndex((r) => r.commit.hash === to);
      if (fromRow === -1 || toRow === -1) return null; // parent outside window
      const x1 = nodeX(colOf.get(from)), y1 = rowY(fromRow);
      const x2 = nodeX(colOf.get(to)), y2 = rowY(toRow);
      if (colOf.get(from) === colOf.get(to)) return `M ${x1} ${y1 + NODE_R} L ${x2} ${y2 - NODE_R}`;
      const midY = (y1 + y2) / 2;
      return `M ${x1} ${y1 + NODE_R} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2 - NODE_R}`;
    }

    /** Branch dot palette drawn from the DSH design system (static tokens). */
    const BRANCH_COLORS = [
      "var(--dsw-static-deepseek-450)",
      "var(--dsw-static-blue-450)",
      "var(--dsw-static-green-500)",
      "var(--dsw-static-amber-500)",
      "var(--dsw-static-red-400)",
      "#a78bfa" // DSH tools/violet accent (no static token)
    ];
    function hueOf(s) {
      let hash = 0;
      for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
      return hash;
    }
    function branchNameOf(refs) {
      for (const r of refs) if (r.startsWith("HEAD -> ")) return r.slice(8);
      for (const r of refs) if (!r.startsWith("tag:")) return r;
      return "";
    }
    function colorOf(refs) {
      const name = branchNameOf(refs);
      if (!name) return "var(--dsw-alias-label-tertiary)";
      return BRANCH_COLORS[hueOf(name) % BRANCH_COLORS.length];
    }

    /** Commit label text (refs + subject), shared by measurement and render. */
    function labelOf(commit) {
      const refText = commit.refs.map((r) => r.replace(/^tag: /, "")).join(" ");
      return `${refText}${refText ? " " : ""}${commit.subject}`;
    }

    let measureCtx = null;
    /** Longest label width in px at the label font size; 0 when unmeasurable. */
    function measureLabelWidth(rows) {
      if (typeof document === "undefined" || !rows.length) return 0;
      try {
        if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
        if (!measureCtx) return 0;
        const family = getComputedStyle(document.documentElement)
          .getPropertyValue("--ds-font-family-code").trim() || "monospace";
        measureCtx.font = `${LABEL_FONT_SIZE}px ${family}`;
        let max = 0;
        for (const r of rows) max = Math.max(max, measureCtx.measureText(labelOf(r.commit)).width);
        return max;
      } catch {
        return 0;
      }
    }
    //#endregion

    //#region panel
    const GRAPH_ROUTE = "/git-tree/graph";
    const GRAPH_LIMIT = 200;

    async function fetchGraph(cwd, n, signal) {
      const params = new URLSearchParams({ cwd, n: String(n) });
      const response = await fetch(`${GRAPH_ROUTE}?${params}`, { signal });
      let body = null;
      try { body = await response.json(); } catch { /* non-JSON body */ }
      if (!response.ok) {
        const err = new Error(body?.error?.message ?? `HTTP ${response.status}`);
        err.code = body?.error?.code ?? "internal";
        throw err;
      }
      if (!body?.ok) {
        const err = new Error(body?.error?.message ?? "unknown error");
        err.code = body?.error?.code ?? "internal";
        throw err;
      }
      return body;
    }

    function gitIcon() {
      return h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": "true", className: "dsh-git-tree-trigger-icon" },
        h("path", { fill: "currentColor", d: "M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm2.25 7.002v.008l.001-.008v-.008h-.001v.008ZM2.75 13a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm6.5-9.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" })
      );
    }

    function GitTreePanel({ wide, t, useSessions, useWorkspaces, fetchGraph: loadGraph }) {
      const [open, setOpen] = useState(false);
      const [cwd, setCwd] = useState(null);
      const [payload, setPayload] = useState(null);
      const [error, setError] = useState(null);
      const [loading, setLoading] = useState(false);
      const [query, setQuery] = useState("");
      const [notice, setNotice] = useState(null);
      const controllerRef = useRef(null);
      const cacheRef = useRef(new Map());
      const noticeTimer = useRef(null);

      const sessions = useSessions((state) => state);
      const workspaces = useWorkspaces((state) => state);

      const defaultCwd = useMemo(() => {
        const current = sessions.current && sessions.byId[sessions.current];
        if (current?.cwd) return current.cwd;
        const recent = workspaces.items.find((w) => w.workspaceId === workspaces.recentWorkspaceId) ?? workspaces.items[0];
        return recent?.path;
      }, [sessions, workspaces]);

      const load = useCallback(async (target) => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        setError(null);
        if (cacheRef.current.has(target)) {
          setPayload(cacheRef.current.get(target));
          setLoading(false);
          return;
        }
        try {
          const data = await loadGraph(target, GRAPH_LIMIT, controller.signal);
          cacheRef.current.set(target, data);
          setPayload(data);
        } catch (err) {
          if (err.name === "AbortError") return;
          setPayload(null);
          setError({ code: err.code ?? "internal", message: err.message ?? "" });
        } finally {
          setLoading(false);
        }
      }, [loadGraph]);

      useEffect(() => {
        if (!open) return;
        if (cwd === null) {
          if (defaultCwd) setCwd(defaultCwd);
          return;
        }
        load(cwd);
        return () => controllerRef.current?.abort();
      }, [open, cwd, defaultCwd, load]);

      useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        if (open) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, [open]);

      const visibleCommits = useMemo(() => {
        if (!payload) return [];
        const q = query.trim().toLowerCase();
        if (!q) return payload.commits;
        return payload.commits.filter((c) => c.subject.toLowerCase().includes(q) || c.hash.startsWith(q));
      }, [payload, query]);

      const graph = useMemo(() => layoutGraph(visibleCommits), [visibleCommits]);
      const labelWidth = useMemo(() => measureLabelWidth(graph.rows), [graph.rows]);

      useEffect(() => () => clearTimeout(noticeTimer.current), []);
      const flash = (text) => {
        setNotice(text);
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 1500);
      };
      const copyHash = (hash) => {
        try {
          const promise = navigator.clipboard?.writeText(hash);
          if (!promise) return;
          promise.then(
            () => flash(t("panel.copyHash", { hash: hash.slice(0, 7) })),
            () => { /* silent degrade per spec */ }
          );
        } catch {
          /* silent degrade per spec */
        }
      };

      const errorText = useMemo(() => {
        if (!error) return "";
        switch (error.code) {
          case "not-a-git-repo": return `${t("panel.notRepo")} — ${t("panel.notRepoHint")}`;
          case "git-unavailable": return t("panel.gitUnavailable");
          case "git-timeout": return t("panel.gitTimeout");
          case "invalid-cwd": return t("panel.invalidCwd");
          case "internal": return t("panel.internal", { message: error.message });
          default: return t("panel.gitError", { message: error.message || error.code });
        }
      }, [error, t]);

      if (!open) {
        return h("button", {
          type: "button",
          className: wide ? "dsh-git-tree-trigger" : "dsh-git-tree-trigger dsh-git-tree-trigger-rail",
          title: t("button.label"),
          "aria-label": t("button.label"),
          onClick: () => setOpen(true)
        }, gitIcon(), wide ? h("span", null, t("button.label")) : null);
      }

      const maxCol = graph.rows.reduce((m, r) => Math.max(m, r.col), 0);
      const svgW = Math.ceil(nodeX(Math.max(maxCol, 0)) + 12 + Math.max(labelWidth, LABEL_MIN_WIDTH) + LABEL_PAD_RIGHT);
      const svgH = graph.rows.length > 0 ? rowY(graph.rows.length - 1) + 24 : 60;

      let bodyNode;
      if (loading && !payload) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.loading"));
      } else if (errorText) {
        bodyNode = h("div", { className: "dsh-git-tree-message dsh-git-tree-error" },
          errorText,
          h("button", { type: "button", className: "dsh-git-tree-retry", onClick: () => { cacheRef.current.delete(cwd); load(cwd); } }, t("panel.refresh"))
        );
      } else if (!payload) {
        bodyNode = null;
      } else if (payload.commits.length === 0) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.empty"));
      } else if (graph.rows.length === 0) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.noMatches"));
      } else {
        bodyNode = h("div", { className: "dsh-git-tree-scroll" },
          h("svg", { className: "dsh-git-tree-svg", width: svgW, height: svgH, role: "img" },
            h("g", null,
              graph.edges.map((e) => {
                const d = edgePath(e.from, e.to, graph.rows, graph.colOf);
                if (d === null) return null;
                return h("path", { key: `${e.from}->${e.to}`, d, fill: "none", className: "dsh-git-tree-edge" });
              })
            ),
            h("g", null,
              graph.rows.map((row, i) => {
                const c = row.commit;
                const isHead = c.refs.some((r) => r.startsWith("HEAD -> "));
                const label = labelOf(c);
                const tip = [c.hash, c.subject, `${c.author} · ${c.date}`, c.refs.join(", ")].filter(Boolean).join("\n");
                return h("g", {
                  key: c.hash,
                  transform: `translate(0 ${rowY(i)})`,
                  className: "dsh-git-tree-node",
                  title: tip,
                  onClick: () => copyHash(c.hash)
                },
                  h("circle", {
                    cx: nodeX(row.col), cy: 0, r: isHead ? NODE_R + 1.5 : NODE_R,
                    className: "dsh-git-tree-dot",
                    style: {
                      fill: colorOf(c.refs),
                      stroke: isHead ? "var(--dsw-alias-state-success-primary, #3fb950)" : "none",
                      strokeWidth: isHead ? 2 : 0
                    }
                  }),
                  h("text", { x: nodeX(row.col) + 12, y: 0, className: "dsh-git-tree-label" }, label)
                );
              })
            )
          )
        );
      }

      const meta = [];
      if (payload) {
        meta.push(t("panel.commits", { count: payload.commits.length }));
        meta.push(payload.repo.currentBranch ? t("panel.branch", { branch: payload.repo.currentBranch }) : t("panel.detached"));
        meta.push(payload.repo.dirty > 0 ? t("panel.dirty", { count: payload.repo.dirty }) : t("panel.clean"));
        if (payload.repo.truncated) meta.push(t("panel.truncated", { n: GRAPH_LIMIT }));
        if (maxCol >= MAX_LANES) meta.push(t("panel.lanesTruncated"));
      }

      return h("div", {
        className: "dsh-git-tree-overlay",
        onClick: (e) => { if (e.target === e.currentTarget) setOpen(false); }
      },
        h("div", { className: "dsh-git-tree-panel", role: "dialog", "aria-modal": "true", "aria-label": t("panel.title") },
          h("div", { className: "dsh-git-tree-header" },
            h("span", { className: "dsh-git-tree-title" }, t("panel.title")),
            h("select", {
              className: "dsh-git-tree-workspace",
              value: cwd ?? "",
              onChange: (e) => setCwd(e.target.value),
              "aria-label": t("panel.workspace")
            }, workspaces.items.map((w) => h("option", { key: w.workspaceId, value: w.path }, w.title))),
            h("button", { type: "button", className: "dsh-git-tree-refresh", title: t("panel.refresh"), onClick: () => { cacheRef.current.delete(cwd); load(cwd); } }, "↻"),
            h("button", { type: "button", className: "dsh-git-tree-close", title: t("panel.close"), "aria-label": t("panel.close"), onClick: () => setOpen(false) }, "✕")
          ),
          h("div", { className: "dsh-git-tree-body" }, bodyNode),
          h("div", { className: "dsh-git-tree-footer" },
            h("input", {
              className: "dsh-git-tree-search",
              placeholder: t("panel.search"),
              value: query,
              onChange: (e) => setQuery(e.target.value)
            }),
            h("span", { className: "dsh-git-tree-meta" }, meta.join(" · ")),
            notice ? h("span", { className: "dsh-git-tree-notice" }, notice) : null
          )
        )
      );
    }
    //#endregion

    //#region css
    /* Styled exclusively with real DSH design tokens (dsh-client-ui-theme):
       elevated surfaces use --dsw-alias-bg-layer-2 + --dsw-shadow-lv3, borders
       the --dsw-alias-border-l* ladder, controls --dsw-alias-bg-module-platform
       fills, and the modal mask --dsw-alias-bg-mask-1 + --dsw-mask-blur —
       mirroring the settings modal so the panel reads as a native DSH surface. */
    const CSS = [
      ".dsh-git-tree-panel,.dsh-git-tree-panel *{box-sizing:border-box}",
      ".dsh-git-tree-trigger{box-sizing:border-box;cursor:pointer;width:100%;height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:4px 0;padding:0 12px;font-family:inherit;font-size:14px;line-height:22px;display:flex;white-space:nowrap;overflow:hidden;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-git-tree-trigger:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-trigger-rail{justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0;border-radius:50%}",
      ".dsh-git-tree-trigger-icon{flex:none}",
      ".dsh-git-tree-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}",
      ".dsh-git-tree-panel{display:flex;flex-direction:column;width:min(960px,calc(100vw - 48px));height:min(720px,calc(100vh - 48px));background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:24px;overflow:hidden}",
      ".dsh-git-tree-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-git-tree-title{font-size:16px;font-weight:500;line-height:24px;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-git-tree-workspace{appearance:none;-webkit-appearance:none;max-width:300px;height:28px;padding:0 26px 0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background-color:var(--dsw-alias-bg-module-platform);background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 14px) 55%,calc(100% - 9px) 55%;background-size:5px 5px;background-repeat:no-repeat;color:inherit;font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;outline:none}",
      ".dsh-git-tree-workspace:hover{border-color:var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-workspace:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-refresh,.dsh-git-tree-close{width:28px;height:28px;padding:0;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-refresh:hover,.dsh-git-tree-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-refresh:focus-visible,.dsh-git-tree-close:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-body{flex:1;overflow:auto;min-height:0}",
      ".dsh-git-tree-scroll{overflow:auto;padding:8px 16px 10px}",
      ".dsh-git-tree-svg{display:block}",
      ".dsh-git-tree-edge{stroke:var(--dsw-alias-label-tertiary);stroke-width:1.5;opacity:.55;stroke-linecap:round}",
      ".dsh-git-tree-node{cursor:pointer}",
      `.dsh-git-tree-label{font-size:${LABEL_FONT_SIZE}px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-primary);dominant-baseline:middle;user-select:none}`,
      ".dsh-git-tree-message{padding:32px 24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;display:flex;flex-direction:column;gap:12px;align-items:center}",
      ".dsh-git-tree-error{color:var(--dsw-alias-state-error-primary)}",
      ".dsh-git-tree-retry{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:4px 12px;font-size:12px;line-height:18px;font-family:inherit;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-retry:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-git-tree-footer{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-search{flex:1;min-width:120px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;outline:none;transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-search::placeholder{color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-search:hover{border-color:var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-search:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-git-tree-notice{color:var(--dsw-alias-state-success-primary);white-space:nowrap}"
    ].join("");
    //#endregion

    //#region entry
    const inject = ["slots", "sessions", "workspaces", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-git-tree: dictionaries");
      if (typeof document !== "undefined") {
        const style = document.createElement("style");
        style.setAttribute("data-plugin", "dsh-git-tree");
        style.textContent = CSS;
        document.head.append(style);
        ctx.effect(() => () => { style.remove(); }, "dsh-git-tree: styles");
      }
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
        name: "sidebar.footer.action",
        id: "git-tree-panel",
        locale: NS,
        inject: () => ({ fetchGraph })
      }, GitTreePanel));
    }
    //#endregion

    exports.apply = apply;
    exports.inject = inject;
    exports.layoutGraph = layoutGraph;
    return module.exports;
  }
});
