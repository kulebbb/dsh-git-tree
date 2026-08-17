window.__ModuleLoader__.load({
  id: "@kulebbb/dsh-git-tree",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    const { createElement: h, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } = react;

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
      "panel.copyHash": "已复制 {hash}",
      "panel.headLocal": "本地 {branch} → {hash}",
      "panel.headLocalDetached": "本地 HEAD（游离）→ {hash}",
      "panel.headRemote": "云端 {ref} → {hash}",
      "panel.headNoRemote": "云端：未推送",
      "panel.aheadBehind": "↑{ahead} ↓{behind}",
      "panel.aheadBehindTitle": "领先 {ahead} · 落后 {behind}",
      "panel.badgeLocal": "本地",
      "panel.badgeRemote": "云端",
      "panel.statsFiles": "{n} 个文件变更",
      "panel.statsFilesOne": "1 个文件变更",
      "panel.statsIns": "{n} 行新增(+)",
      "panel.statsInsOne": "1 行新增(+)",
      "panel.statsDel": "{n} 行删除(-)",
      "panel.statsDelOne": "1 行删除(-)",
      "panel.statsSep": "，",
      "update.available": "新版本 {latest}（当前 {current}）",
      "update.updating": "正在更新…",
      "update.updated": "已安装 {latest}，重启 dsh web 后生效",
      "update.error": "更新失败：{message}",
      "update.dev": "开发安装（本地链接），请手动更新源码",
      "update.noProfile": "检测到新版本，但无法定位 profile 目录（可在 cordis.patch.yml 配置 update.profileDir）",
      "update.action": "更新",
      "update.retry": "重试",
      "update.close": "关闭提示",
      "update.output": "pnpm 输出"
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
      "panel.copyHash": "Copied {hash}",
      "panel.headLocal": "Local {branch} → {hash}",
      "panel.headLocalDetached": "Local HEAD (detached) → {hash}",
      "panel.headRemote": "Remote {ref} → {hash}",
      "panel.headNoRemote": "Remote: not pushed",
      "panel.aheadBehind": "↑{ahead} ↓{behind}",
      "panel.aheadBehindTitle": "{ahead} ahead · {behind} behind",
      "panel.badgeLocal": "LOCAL",
      "panel.badgeRemote": "REMOTE",
      "panel.statsFiles": "{n} files changed",
      "panel.statsFilesOne": "1 file changed",
      "panel.statsIns": "{n} insertions(+)",
      "panel.statsInsOne": "1 insertion(+)",
      "panel.statsDel": "{n} deletions(-)",
      "panel.statsDelOne": "1 deletion(-)",
      "panel.statsSep": ", ",
      "update.available": "New version {latest} (current {current})",
      "update.updating": "Updating…",
      "update.updated": "Installed {latest}; restart dsh web to apply",
      "update.error": "Update failed: {message}",
      "update.dev": "Dev install (local link); update the source manually",
      "update.noProfile": "New version found, but the profile directory could not be located (set update.profileDir in cordis.patch.yml)",
      "update.action": "Update",
      "update.retry": "Retry",
      "update.close": "Dismiss",
      "update.output": "pnpm output"
    };
    //#endregion

    //#region graph layout (pure)
    const ROW_H = 40; // two-line rows: subject + date
    const LANE_W = 24;
    const NODE_R = 4.5;
    const CORNER_R = 5;
    const MARGIN_LEFT = 18;
    const MARGIN_TOP = 14;
    const MAX_LANES = 10;
    const LABEL_FONT_SIZE = 13;
    const LABEL_PAD_RIGHT = 32; // right breathing room inside the SVG, after the longest row
    const LABEL_MIN_WIDTH = 268;
    const LABEL_OFFSET = 12;
    const DATE_LINE_DY = 12; // second-line (date) y offset within a row
    const DATE_FONT_SIZE = 11;
    // Scroll container horizontal padding (16px each side); the SVG is sized
    // to the remaining content width so no row can ever overflow it.
    const SCROLL_PAD_X = 32;
    // Panel design max width (see .dsh-git-tree-panel: min(960px, 100vw-48px)),
    // minus the scroll padding — the widest the SVG may ever legitimately be.
    const DEFAULT_PANEL_CONTENT_W = 960 - SCROLL_PAD_X;
    // Head badges (本地/云端 chips) drawn after the hash suffix.
    const BADGE_H = 16;
    const BADGE_PAD_X = 5;
    const BADGE_GAP = 6;
    // Text zones within a row (generous half-heights of the glyph boxes) and
    // the horizontal clearance kept between text and any crossing edge line.
    const SUBJECT_HALF = 8;
    const DATE_HALF = 7;
    const LINE_CLEAR = 10;

    function nodeX(col) { return MARGIN_LEFT + Math.min(col, MAX_LANES - 1) * LANE_W; }
    function rowY(row) { return MARGIN_TOP + row * ROW_H; }
    /** Nearest free lane strictly to the right of `col`; -1 when none (caller appends). */
    function pickFreeLane(lanes, col) {
      for (let i = col + 1; i < lanes.length; i++) {
        if (lanes[i] === null) return i;
      }
      return -1;
    }

    /** Lane-based commit DAG layout (git log --graph style). Pure. */
    function layoutGraph(commits) {
      const NEUTRAL = "var(--dsw-alias-label-tertiary)";
      const colorByHash = branchColors(commits);
      const lanes = [];
      const colOf = new Map();
      const colorOfCommit = new Map();
      const rows = [];
      const edges = [];
      const edgeKeys = new Set();
      const pushEdge = (from, to, color) => {
        const key = `${from}->${to}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ from, to, color });
      };
      const place = (hash, col, color) => {
        lanes[col] = hash;
        colOf.set(hash, col);
        colorOfCommit.set(hash, color);
      };
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i];
        const hash = commit.hash;
        let col = lanes.indexOf(hash);
        let commitColor;
        if (col === -1) {
          col = lanes.length;
          const name = branchNameOf(commit.refs);
          commitColor = name
            ? BRANCH_COLORS[hueOf(name) % BRANCH_COLORS.length]
            : (colorByHash.get(hash) || NEUTRAL);
          place(hash, col, commitColor);
        } else {
          commitColor = colorOfCommit.get(hash) || colorByHash.get(hash) || NEUTRAL;
        }
        lanes[col] = null;
        colOf.set(hash, col);
        let inherit = true;
        for (const p of commit.parents) {
          if (colOf.has(p)) { pushEdge(hash, p, commitColor); continue; }
          if (inherit) {
            place(p, col, commitColor);
            inherit = false;
            pushEdge(hash, p, commitColor);
          } else {
            let free = pickFreeLane(lanes, col);
            if (free === -1) { free = lanes.length; lanes.push(null); }
            const pColor = colorByHash.get(p) || NEUTRAL;
            place(p, free, pColor);
            pushEdge(hash, p, pColor);
          }
        }
        while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
        rows.push({ commit, col, color: commitColor });
      }
      return { rows, edges, colOf };
    }

    /** Render edge geometry: merged vertical runs + vertical-tangent S-curves. Pure. */
    function buildEdgePaths(graph) {
      const { edges, rows, colOf } = graph;
      const rowOf = new Map(rows.map((r, i) => [r.commit.hash, i]));
      const straight = new Map(); // `${col}:${fromRow}` -> { toRow, color }
      const curved = [];
      for (const e of edges) {
        const fromRow = rowOf.get(e.from);
        const toRow = rowOf.get(e.to);
        if (fromRow === undefined || toRow === undefined) continue; // parent outside window
        const cf = colOf.get(e.from);
        const ct = colOf.get(e.to);
        if (cf === ct) straight.set(`${cf}:${fromRow}`, { toRow, color: e.color });
        else curved.push({ fromRow, toRow, cf, ct, color: e.color });
      }
      const paths = [];
      const incoming = new Set();
      for (const [key, v] of straight) incoming.add(`${key.slice(0, key.indexOf(":"))}:${v.toRow}`);
      const visited = new Set();
      for (const [key, v] of straight) {
        if (visited.has(key)) continue;
        const sep = key.indexOf(":");
        const col = Number(key.slice(0, sep));
        const fromRow = Number(key.slice(sep + 1));
        if (incoming.has(`${col}:${fromRow}`)) continue; // not a run start
        let endRow = v.toRow;
        visited.add(key);
        while (straight.has(`${col}:${endRow}`)) {
          visited.add(`${col}:${endRow}`);
          endRow = straight.get(`${col}:${endRow}`).toRow;
        }
        const x = nodeX(col);
        paths.push({ d: `M ${x} ${rowY(fromRow) + NODE_R} L ${x} ${rowY(endRow) - NODE_R}`, color: v.color });
      }
      for (const c of curved) {
        const x1 = nodeX(c.cf);
        const x2 = nodeX(c.ct);
        const y1 = rowY(c.fromRow) + NODE_R;
        const y2 = rowY(c.toRow) - NODE_R;
        const midY = (y1 + y2) / 2;
        const dir = x2 >= x1 ? 1 : -1;
        const radius = Math.min(CORNER_R, Math.abs(x2 - x1) / 2, (y2 - y1) / 2);
        // Orthogonal rounded route: vertical → corner → horizontal → corner → vertical.
        const d = [
          `M ${x1} ${y1}`,
          `L ${x1} ${midY - radius}`,
          `Q ${x1} ${midY}, ${x1 + dir * radius} ${midY}`,
          `L ${x2 - dir * radius} ${midY}`,
          `Q ${x2} ${midY}, ${x2} ${midY + radius}`,
          `L ${x2} ${y2}`
        ].join(" ");
        paths.push({ d, color: c.color });
      }
      return paths;
    }

    /**
     * Per-row label start x. Each label stays anchored to its own commit's dot
     * (nodeX(col) + LABEL_OFFSET) — a stepped layout, never a global
     * left-align — but is pushed right just enough that neither the subject nor
     * the date line crosses any edge segment (vertical runs, curve corners, or
     * the horizontal span of an S-curve) passing through that row's text zone.
     * Pure: rows with no nearby lines keep their dot-anchored position.
     * @param {{rows: Array}} graph - layoutGraph() output.
     * @param {Array<{d: string}>} edgePaths - buildEdgePaths() output.
     * @returns {number[]} label x per row.
     */
    function computeLabelXs(graph, edgePaths) {
      const { rows } = graph;
      if (!rows.length) return [];
      // Flatten every edge path into axis-aligned segment bounds. Q corners are
      // taken as their endpoint chord; slightly over-covering a corner only
      // nudges text a couple px further right, which is harmless.
      const segs = [];
      for (const p of edgePaths) {
        const toks = p.d.split(/[\s,]+/).filter(Boolean);
        let cx = 0, cy = 0;
        for (let i = 0; i < toks.length; ) {
          const cmd = toks[i++];
          if (cmd === "M") { cx = +toks[i++]; cy = +toks[i++]; }
          else if (cmd === "L") { const x = +toks[i++], y = +toks[i++]; segs.push({ x0: Math.min(cx, x), x1: Math.max(cx, x), y0: Math.min(cy, y), y1: Math.max(cy, y) }); cx = x; cy = y; }
          else if (cmd === "Q") { const qx = +toks[i++], qy = +toks[i++], x = +toks[i++], y = +toks[i++]; segs.push({ x0: Math.min(cx, x), x1: Math.max(cx, x), y0: Math.min(cy, y), y1: Math.max(cy, y) }); cx = x; cy = y; }
        }
      }
      const out = new Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        const yC = rowY(i);
        const subjectLo = yC - SUBJECT_HALF, subjectHi = yC + SUBJECT_HALF;
        const dateLo = yC + DATE_LINE_DY - DATE_HALF, dateHi = yC + DATE_LINE_DY + DATE_HALF;
        let blockX = -Infinity;
        for (const s of segs) {
          const crossesZone =
            (s.y0 <= subjectHi && s.y1 >= subjectLo) ||
            (s.y0 <= dateHi && s.y1 >= dateLo);
          if (crossesZone) blockX = Math.max(blockX, s.x1);
        }
        out[i] = Math.max(nodeX(rows[i].col) + LABEL_OFFSET, blockX + LINE_CLEAR);
      }
      return out;
    }

    /** Branch dot palette drawn from the DSH design system (static tokens). */
    const BRANCH_COLORS = [
      "var(--dsw-static-deepseek-450)",
      "var(--dsw-static-blue-450)",
      "var(--dsw-static-green-500)",
      "var(--dsw-static-amber-500)",
      "var(--dsw-static-red-400)",
      "#a78bfa", // violet
      "#f472b6", // pink
      "#22d3ee", // cyan
      "#fb923c", // orange
      "#2dd4bf", // teal
      "#a3e635", // lime
      "#e879f9"  // magenta
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
    /** Map each commit to the color of its nearest branch tip (multi-source BFS). Pure. */
    function branchColors(commits) {
      const colorByHash = new Map();
      const byHash = new Map(commits.map((c) => [c.hash, c]));
      const queue = [];
      for (const c of commits) {
        const name = branchNameOf(c.refs);
        if (!name || colorByHash.has(c.hash)) continue;
        const color = BRANCH_COLORS[hueOf(name) % BRANCH_COLORS.length];
        colorByHash.set(c.hash, color);
        queue.push([c.hash, color]);
      }
      let head = 0;
      while (head < queue.length) {
        const [hash, color] = queue[head++];
        const node = byHash.get(hash);
        if (!node) continue;
        for (const p of node.parents) {
          if (colorByHash.has(p)) continue;
          colorByHash.set(p, color);
          queue.push([p, color]);
        }
      }
      return colorByHash;
    }

    /** Commit label text (refs + subject), shared by measurement and render. */
    function labelOf(commit) {
      const refText = commit.refs.map((r) => r.replace(/^tag: /, "")).join(" ");
      return `${refText}${refText ? " " : ""}${commit.subject}`;
    }

    /** Trailing short-hash suffix, GitHub style: " (9259220)". */
    function hashSuffixOf(commit) {
      const short = commit.shortHash || commit.hash.slice(0, 7);
      return ` (${short})`;
    }

    /** Full row text: refs + subject, then the short-hash suffix. */
    function rowTextOf(commit) {
      return `${labelOf(commit)}${hashSuffixOf(commit)}`;
    }

    /**
     * Format an ISO-8601 timestamp (git %aI output) as local-time
     * "YYYY-MM-DD HH:mm". Falls back to the raw input when unparseable
     * so a bad date never breaks rendering.
     * @param {string} iso
     * @returns {string}
     */
    function formatLocalTime(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    let measureCtx = null;
    /**
     * Lazily create (once) the canvas 2d context used to measure label text.
     * @returns {CanvasRenderingContext2D|null}
     */
    function ensureMeasureCtx() {
      if (measureCtx) return measureCtx;
      if (typeof document === "undefined") return null;
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return null;
        const family = getComputedStyle(document.documentElement)
          .getPropertyValue("--ds-font-family-code").trim() || "monospace";
        ctx.font = `${LABEL_FONT_SIZE}px ${family}`;
        measureCtx = ctx;
        return ctx;
      } catch {
        return null;
      }
    }

    /**
     * Measure a string in the label font. Falls back to a monospace estimate
     * when canvas measurement is unavailable (Node, headless, etc.).
     * @param {string} text
     * @returns {number} width in px.
     */
    function measureTextWidth(text) {
      const ctx = ensureMeasureCtx();
      const str = String(text);
      if (!ctx) return str.length * (LABEL_FONT_SIZE * 0.6);
      return ctx.measureText(str).width;
    }

    /**
     * Truncate `text` to fit within `maxWidth` px, appending an ellipsis.
     * Returns the text unchanged when it already fits. Binary search keeps the
     * number of measure() calls logarithmic in the string length, so a single
     * 10k-char subject stays cheap.
     * @param {string} text
     * @param {number} maxWidth - maximum rendered width in px.
     * @param {(s: string) => number} measure - width function (injectable for tests).
     * @returns {string}
     */
    function truncateText(text, maxWidth, measure) {
      const str = String(text);
      if (maxWidth <= 0) return "…";
      const ellipsis = "…";
      if (measure(str) <= maxWidth) return str;
      const budget = maxWidth - measure(ellipsis);
      if (budget <= 0) return ellipsis;
      let lo = 0;
      let hi = str.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measure(str.slice(0, mid)) <= budget) lo = mid;
        else hi = mid - 1;
      }
      return lo === 0 ? ellipsis : str.slice(0, lo) + ellipsis;
    }

    /**
     * Localized diff-stat line parts for one commit, git --shortstat style
     * ("1 file changed, 24 insertions(+), 16 deletions(-)"). Zero-valued
     * insertions/deletions parts are omitted, mirroring git. Merge commits
     * without a diff have no stats at all → empty array.
     * @param {(key: string, vars?: object) => string} t - locale translator.
     * @param {{files: number, insertions: number, deletions: number}|null} stats
     * @returns {Array<{text: string, kind: "plain"|"ins"|"del"}>}
     */
    function statsParts(t, stats) {
      if (!stats) return [];
      const parts = [];
      parts.push({ text: t(stats.files === 1 ? "panel.statsFilesOne" : "panel.statsFiles", { n: stats.files }), kind: "plain" });
      if (stats.insertions > 0) {
        parts.push({ text: t(stats.insertions === 1 ? "panel.statsInsOne" : "panel.statsIns", { n: stats.insertions }), kind: "ins" });
      }
      if (stats.deletions > 0) {
        parts.push({ text: t(stats.deletions === 1 ? "panel.statsDelOne" : "panel.statsDel", { n: stats.deletions }), kind: "del" });
      }
      return parts;
    }

    /** 7-char short hash, defensive against missing input. */
    function shortHashOf(hash) {
      return hash ? hash.slice(0, 7) : "?";
    }

    /**
     * Final SVG width: the natural width (widest row + padding), clamped to
     * the scroll container's measured content width so a long subject can
     * never overflow into a horizontal scrollbar. When the container has not
     * been measured yet (viewportW === 0), clamp to the panel's maximum
     * content width instead — the "no horizontal scroll" invariant holds
     * unconditionally, even if measurement never runs.
     * @param {number} naturalW - unclamped desired width in px.
     * @param {number} viewportW - measured container clientWidth, 0 when unknown.
     * @returns {number}
     */
    function computeSvgWidth(naturalW, viewportW) {
      if (viewportW > 0) {
        return Math.min(naturalW, Math.max(0, Math.floor(viewportW) - SCROLL_PAD_X));
      }
      return Math.min(naturalW, DEFAULT_PANEL_CONTENT_W);
    }

    /**
     * Per-row text widths in px at the label font size: `subject` (refs +
     * subject, without the hash suffix) and `full` (subject + hash suffix).
     * Zeros when unmeasurable (Node, canvas unavailable, etc.).
     * @param {Array} rows - layoutGraph() rows.
     * @returns {Array<{subject: number, full: number}>}
     */
    function measureRowWidths(rows) {
      if (typeof document === "undefined" || !rows.length) return rows.map(() => ({ subject: 0, full: 0 }));
      const ctx = ensureMeasureCtx();
      if (!ctx) return rows.map(() => ({ subject: 0, full: 0 }));
      return rows.map((r) => {
        const subject = ctx.measureText(labelOf(r.commit)).width;
        const full = ctx.measureText(rowTextOf(r.commit)).width;
        return { subject, full };
      });
    }
    //#endregion

    //#region panel
    const GRAPH_ROUTE = "/git-tree/graph";
    const UPDATE_STATUS_ROUTE = "/git-tree/update/status";
    const UPDATE_ROUTE = "/git-tree/update";
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

    /**
     * Decide which update banner (if any) the panel shows. Pure, exported for
     * tests. phase is "idle" | "updating" | "updated" | "error".
     * Returns null | "available" | "updating" | "updated" | "error" | "dev" | "noProfile".
     */
    function bannerKind({ update, phase, dismissed }) {
      if (!update || !update.latest || dismissed) return null;
      if (phase === "updating") return "updating";
      if (phase === "updated") return "updated";
      if (phase === "error") return "error";
      if (update.updateAvailable) return "available";
      if (update.dev) return "dev";
      if (!update.profileDir) return "noProfile";
      return null;
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
      // Auto-update UI state: server-derived status + local phase machine.
      const [update, setUpdate] = useState(null);
      const [updatePhase, setUpdatePhase] = useState("idle");
      const [updateMsg, setUpdateMsg] = useState("");
      const [updateDismissed, setUpdateDismissed] = useState(false);
      const [updateOutput, setUpdateOutput] = useState("");
      // Hovered commit for the custom tooltip; the mouse position itself is
      // tracked in a ref and applied directly to the DOM (no re-render per
      // mousemove — setTip bails out when the commit is unchanged).
      const [tip, setTip] = useState(null);
      // Content-box width of the scroll container; the SVG is clamped to it so
      // long subjects can never push the graph into horizontal scrolling.
      const [viewportW, setViewportW] = useState(0);
      const controllerRef = useRef(null);
      const cacheRef = useRef(new Map());
      const noticeTimer = useRef(null);
      const scrollRef = useRef(null);
      const tipRef = useRef(null);
      const tipPos = useRef({ x: 0, y: 0 });

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

      // Auto-refresh on open: drop the result cache so the first load after
      // opening always re-fetches instead of serving a stale snapshot from a
      // previous open. Declared before the load effect so the cache is cleared
      // before load() consults it. (Within one open session, switching between
      // workspaces still hits the cache.)
      useEffect(() => {
        if (open) cacheRef.current.clear();
      }, [open]);

      // Fetch the update status on mount (so the trigger badge can appear
      // without opening the panel) and again whenever the panel toggles.
      // The server's startup check runs asynchronously (up to ~5s), so when
      // it has not settled yet (latest is null) retry once after a delay —
      // otherwise the badge would silently stay hidden on first load.
      useEffect(() => {
        let cancelled = false;
        let retryTimer = null;
        const fetchStatus = () => {
          fetch(UPDATE_STATUS_ROUTE)
            .then((r) => r.json())
            .then((body) => {
              if (cancelled) return;
              if (body?.ok) setUpdate(body);
              if (!body?.latest && retryTimer === null) {
                retryTimer = setTimeout(fetchStatus, 4000);
              }
            })
            .catch(() => { /* silent: update UI is best-effort */ });
        };
        fetchStatus();
        return () => { cancelled = true; clearTimeout(retryTimer); };
      }, [open]);

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

      // Track the scroll container's content width (drives subject truncation
      // and the SVG width cap). useLayoutEffect measures before the browser
      // paints, so the very first frame is already clamped and no horizontal
      // scrollbar ever flashes in. The ref only exists once the graph body is
      // rendered, so re-run whenever the payload switches between states.
      useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => setViewportW(el.clientWidth);
        update();
        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(update);
          ro.observe(el);
          return () => ro.disconnect();
        }
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
      }, [payload, open]);

      // Place the tooltip next to the mouse once its content has been laid
      // out (we need its size to clamp against the viewport edges).
      useEffect(() => {
        if (!tip || !tipRef.current) return;
        const el = tipRef.current;
        const r = el.getBoundingClientRect();
        const pad = 10;
        let x = tipPos.current.x + 14;
        let y = tipPos.current.y + 14;
        if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
        if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
        el.style.left = `${Math.max(pad, x)}px`;
        el.style.top = `${Math.max(pad, y)}px`;
      }, [tip]);

      const visibleCommits = useMemo(() => {
        if (!payload) return [];
        const q = query.trim().toLowerCase();
        if (!q) return payload.commits;
        return payload.commits.filter((c) => c.subject.toLowerCase().includes(q) || c.hash.startsWith(q));
      }, [payload, query]);

      const graph = useMemo(() => layoutGraph(visibleCommits), [visibleCommits]);
      const edgePaths = useMemo(() => buildEdgePaths(graph), [graph]);
      const labelXs = useMemo(() => computeLabelXs(graph, edgePaths), [graph, edgePaths]);
      const labelWidths = useMemo(() => measureRowWidths(graph.rows), [graph.rows]);

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

      const runUpdate = async () => {
        if (updatePhase === "updating") return;
        setUpdatePhase("updating");
        setUpdateMsg("");
        setUpdateOutput("");
        try {
          const response = await fetch(UPDATE_ROUTE, { method: "POST" });
          const body = await response.json().catch(() => null);
          if (response.ok && body?.ok) {
            setUpdatePhase("updated");
            // Optimistically converge the cached status so a later refetch
            // (which reads the Node half's refreshed state anyway) agrees.
            setUpdate((prev) => (prev ? { ...prev, current: prev.latest, updateAvailable: false } : prev));
          } else {
            setUpdatePhase("error");
            setUpdateMsg(body?.error?.message ?? `HTTP ${response.status}`);
            setUpdateOutput(body?.output ?? "");
          }
        } catch (err) {
          setUpdatePhase("error");
          setUpdateMsg(err?.message ?? String(err));
        }
      };

      const bannerKindValue = bannerKind({ update, phase: updatePhase, dismissed: updateDismissed });
      const bannerNode = (() => {
        if (!bannerKindValue) return null;
        let text = null;
        let action = null;
        let cmd = null;
        let cls = "info";
        if (bannerKindValue === "available") {
          text = t("update.available", { latest: update.latest, current: update.current });
          action = h("button", { type: "button", className: "dsh-git-tree-update-action", onClick: runUpdate }, t("update.action"));
        } else if (bannerKindValue === "updating") {
          text = t("update.updating");
        } else if (bannerKindValue === "updated") {
          text = t("update.updated", { latest: update.latest });
          cls = "success";
          cmd = "dsh web";
        } else if (bannerKindValue === "error") {
          text = t("update.error", { message: updateMsg });
          cls = "error";
          action = h("button", { type: "button", className: "dsh-git-tree-update-action", onClick: runUpdate }, t("update.retry"));
        } else if (bannerKindValue === "dev") {
          text = t("update.dev");
          cls = "muted";
        } else if (bannerKindValue === "noProfile") {
          text = t("update.noProfile");
          cls = "muted";
        }
        return h("div", { className: `dsh-git-tree-update dsh-git-tree-update-${cls}` },
          h("div", { className: "dsh-git-tree-update-row" },
            h("span", { className: "dsh-git-tree-update-text" }, text),
            cmd ? h("code", { className: "dsh-git-tree-update-cmd" }, cmd) : null,
            action ?? null,
            h("button", { type: "button", className: "dsh-git-tree-update-close", title: t("update.close"), "aria-label": t("update.close"), onClick: () => setUpdateDismissed(true) }, "✕")
          ),
          updateOutput ? h("details", { className: "dsh-git-tree-update-details" },
            h("summary", null, t("update.output")),
            h("pre", null, updateOutput)
          ) : null
        );
      })();

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
          onClick: () => {
            // Follow the workspace the conversation panel is currently in on
            // every open: re-derive the initial cwd from the active session
            // instead of remembering the last selection (manual picks stay
            // valid only within one open session). Falls back to null so the
            // open effect waits for defaultCwd when no session/workspace has
            // loaded yet.
            setCwd(defaultCwd ?? null);
            setOpen(true);
          }
        },
          gitIcon(),
          wide ? h("span", null, t("button.label")) : null,
          update?.updateAvailable && !updateDismissed ? h("span", { className: "dsh-git-tree-dot-badge", "aria-hidden": "true" }) : null
        );
      }

      const maxCol = graph.rows.reduce((m, r) => Math.max(m, r.col), 0);
      const localHead = payload?.repo?.localHead ?? null;
      const remoteHead = payload?.repo?.remoteHead ?? null;
      const remoteHeadHash = remoteHead?.hash ?? null;
      // Size the SVG to the widest per-row text extent (label start varies per
      // row to dodge edge lines), floored by a comfortable minimum width, then
      // clamp it to the scroll container's content width so a very long
      // subject can never produce a horizontal scrollbar. Rows longer than the
      // clamp are truncated with an ellipsis in the render pass below.
      const naturalW = Math.ceil(
        Math.max(
          graph.rows.reduce((m, r, i) => Math.max(m, labelXs[i] + (labelWidths[i]?.full || 0)), 0),
          nodeX(maxCol) + LABEL_OFFSET + LABEL_MIN_WIDTH
        ) + LABEL_PAD_RIGHT
      );
      const svgW = computeSvgWidth(naturalW, viewportW);
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
        bodyNode = h("div", { ref: scrollRef, className: "dsh-git-tree-scroll" },
          h("svg", { className: "dsh-git-tree-svg", width: svgW, height: svgH, role: "img" },
            h("g", null,
              edgePaths.map((seg, i) =>
                h("path", {
                  key: `edge-${i}`,
                  d: seg.d,
                  fill: "none",
                  className: "dsh-git-tree-edge",
                  style: { stroke: seg.color }
                })
              )
            ),
            h("g", null,
              graph.rows.map((row, i) => {
                const c = row.commit;
                const isHead = c.refs.some((r) => r.startsWith("HEAD -> "));
                const isRemoteHead = remoteHeadHash != null && c.hash === remoteHeadHash;
                const subject = labelOf(c);
                const hashSuffix = hashSuffixOf(c);
                const w = labelWidths[i] ?? { subject: 0, full: 0 };
                const hashW = Math.max(0, (w.full || 0) - (w.subject || 0));
                // 本地/云端 head badges (right of the hash suffix).
                const badges = [];
                if (isHead) badges.push({ label: t("panel.badgeLocal"), cls: "local" });
                if (isRemoteHead) badges.push({ label: t("panel.badgeRemote"), cls: "remote" });
                const badgeTotalW = badges.reduce((s, b) => s + measureTextWidth(b.label) + BADGE_PAD_X * 2 + BADGE_GAP, 0) - (badges.length ? BADGE_GAP : 0);
                // Reserve the hash suffix + badges, truncate the subject to the rest.
                const subjectMaxW = Math.max(0, svgW - LABEL_PAD_RIGHT - labelXs[i] - hashW - badgeTotalW);
                const subjectText = truncateText(subject, subjectMaxW, measureTextWidth);
                const subjectW = measureTextWidth(subjectText);
                const textEndX = labelXs[i] + subjectW + hashW;
                const tipRow = (e) => {
                  tipPos.current = { x: e.clientX, y: e.clientY };
                  setTip(c);
                  const el = tipRef.current;
                  if (el) {
                    const r = el.getBoundingClientRect();
                    const pad = 10;
                    let x = e.clientX + 14, y = e.clientY + 14;
                    if (x + r.width + pad > window.innerWidth) x = window.innerWidth - r.width - pad;
                    if (y + r.height + pad > window.innerHeight) y = window.innerHeight - r.height - pad;
                    el.style.left = `${Math.max(pad, x)}px`;
                    el.style.top = `${Math.max(pad, y)}px`;
                  }
                };
                return h("g", {
                  key: c.hash,
                  transform: `translate(0 ${rowY(i)})`,
                  className: "dsh-git-tree-node",
                  onClick: () => copyHash(c.hash),
                  onMouseEnter: tipRow,
                  onMouseMove: tipRow,
                  onMouseLeave: () => setTip(null)
                },
                  h("circle", {
                    cx: nodeX(row.col), cy: 0,
                    r: (isHead || isRemoteHead) ? NODE_R + 1.5 : NODE_R,
                    className: "dsh-git-tree-dot",
                    style: {
                      fill: row.color,
                      stroke: isHead
                        ? "var(--dsw-alias-state-success-primary, #3fb950)"
                        : (isRemoteHead ? "var(--dsw-static-blue-450)" : "none"),
                      strokeWidth: (isHead || isRemoteHead) ? 2 : 0,
                      strokeDasharray: isRemoteHead && !isHead ? "3 2" : undefined
                    }
                  }),
                  h("text", { x: labelXs[i], y: 0, className: "dsh-git-tree-label" }, subjectText),
                  h("text", { x: labelXs[i] + subjectW, y: 0, className: "dsh-git-tree-hash" }, hashSuffix),
                  badges.map((b, bi) => {
                    const bx = textEndX + BADGE_GAP + badges.slice(0, bi).reduce((s, p) => s + measureTextWidth(p.label) + BADGE_PAD_X * 2 + BADGE_GAP, 0);
                    const bw = measureTextWidth(b.label) + BADGE_PAD_X * 2;
                    return h("g", {
                      key: `badge-${b.cls}`,
                      className: `dsh-git-tree-badge dsh-git-tree-badge-${b.cls}`
                    },
                      h("rect", { x: bx, y: -BADGE_H / 2, width: bw, height: BADGE_H, rx: 4 }),
                      h("text", { x: bx + BADGE_PAD_X, y: 0, className: "dsh-git-tree-badge-text" }, b.label)
                    );
                  }),
                  h("text", { x: labelXs[i], y: DATE_LINE_DY, className: "dsh-git-tree-date" }, formatLocalTime(c.date))
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
            h("div", { className: "dsh-git-tree-header-row" },
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
            h("div", { className: "dsh-git-tree-headline" },
              localHead ? h("span", { className: "dsh-git-tree-head-item", title: localHead.hash },
                h("span", { className: "dsh-git-tree-head-dot dsh-git-tree-head-dot-local" }),
                localHead.branch
                  ? t("panel.headLocal", { branch: localHead.branch, hash: shortHashOf(localHead.hash) })
                  : t("panel.headLocalDetached", { hash: shortHashOf(localHead.hash) })
              ) : null,
              remoteHead ? h("span", { className: "dsh-git-tree-head-item", title: `${remoteHead.ref} ${remoteHead.hash}` },
                h("span", { className: "dsh-git-tree-head-dot dsh-git-tree-head-dot-remote" }),
                t("panel.headRemote", { ref: remoteHead.ref, hash: shortHashOf(remoteHead.hash) }),
                (remoteHead.ahead + remoteHead.behind > 0)
                  ? h("span", {
                      className: "dsh-git-tree-head-ab",
                      title: t("panel.aheadBehindTitle", { ahead: remoteHead.ahead, behind: remoteHead.behind })
                    }, t("panel.aheadBehind", { ahead: remoteHead.ahead, behind: remoteHead.behind }))
                  : null
              ) : (localHead ? h("span", { className: "dsh-git-tree-head-item dsh-git-tree-head-no-remote" }, t("panel.headNoRemote")) : null)
            )
          ),
          bannerNode,
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
        ),
        tip ? h("div", { ref: tipRef, className: "dsh-git-tree-tooltip", role: "tooltip" },
          h("div", { className: "dsh-git-tree-tip-subject" }, tip.subject),
          tip.body ? h("div", { className: "dsh-git-tree-tip-body" }, tip.body) : null,
          tip.stats ? h("div", { className: "dsh-git-tree-tip-stats" },
            statsParts(t, tip.stats).map((p, i) =>
              h("span", {
                key: i,
                className: p.kind === "ins" ? "dsh-git-tree-tip-ins" : (p.kind === "del" ? "dsh-git-tree-tip-del" : undefined)
              }, i === 0 ? p.text : `${t("panel.statsSep")}${p.text}`)
            )
          ) : null,
          h("div", { className: "dsh-git-tree-tip-meta" },
            h("span", null, `${tip.shortHash} · ${tip.author} · ${formatLocalTime(tip.date)}`),
            tip.refs.length ? h("span", { className: "dsh-git-tree-tip-refs" }, tip.refs.join(" · ")) : null
          )
        ) : null
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
      ".dsh-git-tree-header{display:flex;flex-direction:column;gap:8px;padding:14px 16px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-git-tree-header-row{display:flex;align-items:center;gap:10px}",
      ".dsh-git-tree-title{font-size:16px;font-weight:500;line-height:24px;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-git-tree-headline{display:flex;align-items:center;gap:18px;flex-wrap:wrap;row-gap:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code)}",
      ".dsh-git-tree-head-item{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;min-width:0}",
      ".dsh-git-tree-head-dot{width:8px;height:8px;border-radius:50%;flex:none}",
      ".dsh-git-tree-head-dot-local{background:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-head-dot-remote{background:var(--dsw-static-blue-450)}",
      ".dsh-git-tree-head-ab{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
      ".dsh-git-tree-head-no-remote{color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-workspace{appearance:none;-webkit-appearance:none;max-width:300px;height:28px;padding:0 26px 0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background-color:var(--dsw-alias-bg-module-platform);background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 14px) 55%,calc(100% - 9px) 55%;background-size:5px 5px;background-repeat:no-repeat;color:inherit;font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;outline:none}",
      ".dsh-git-tree-workspace:hover{border-color:var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-workspace:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-refresh,.dsh-git-tree-close{width:28px;height:28px;padding:0;border-radius:999px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-refresh:hover,.dsh-git-tree-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-refresh:focus-visible,.dsh-git-tree-close:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-body{flex:1;overflow:auto;min-height:0}",
      ".dsh-git-tree-scroll{overflow:auto;padding:8px 16px 10px}",
      ".dsh-git-tree-svg{display:block}",
      ".dsh-git-tree-edge{stroke:var(--dsw-alias-label-tertiary);stroke-width:2;opacity:.9;stroke-linecap:round}",
      ".dsh-git-tree-node{cursor:pointer}",
      `.dsh-git-tree-label{font-size:${LABEL_FONT_SIZE}px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-primary);paint-order:stroke;stroke:var(--dsw-alias-bg-layer-2);stroke-width:3px;stroke-linejoin:round;dominant-baseline:middle;user-select:none}`,
      `.dsh-git-tree-hash{font-size:${LABEL_FONT_SIZE}px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-tertiary);paint-order:stroke;stroke:var(--dsw-alias-bg-layer-2);stroke-width:3px;stroke-linejoin:round;dominant-baseline:middle;user-select:none}`,
      `.dsh-git-tree-date{font-size:${DATE_FONT_SIZE}px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-tertiary);paint-order:stroke;stroke:var(--dsw-alias-bg-layer-2);stroke-width:3px;stroke-linejoin:round;dominant-baseline:middle;user-select:none}`,
      ".dsh-git-tree-badge rect{fill:var(--dsw-alias-bg-module-platform);stroke:var(--dsw-alias-border-l2);stroke-width:1}",
      ".dsh-git-tree-badge-local rect{stroke:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-badge-remote rect{stroke:var(--dsw-static-blue-450)}",
      ".dsh-git-tree-badge-text{font-size:10px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-secondary);dominant-baseline:middle;user-select:none}",
      ".dsh-git-tree-tooltip{position:fixed;z-index:1001;max-width:min(440px,calc(100vw - 32px));pointer-events:none;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:normal}",
      ".dsh-git-tree-tip-subject{font-weight:600;white-space:pre-wrap;word-break:break-word}",
      ".dsh-git-tree-tip-body{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);margin-top:6px;max-height:180px;overflow:auto}",
      ".dsh-git-tree-tip-stats{margin-top:8px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-tip-ins{color:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-tip-del{color:var(--dsw-alias-state-error-primary,#f85149)}",
      ".dsh-git-tree-tip-meta{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:flex;flex-direction:column;gap:2px}",
      ".dsh-git-tree-tip-refs{color:var(--dsw-alias-label-secondary)}",
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
      ".dsh-git-tree-notice{color:var(--dsw-alias-state-success-primary);white-space:nowrap}",
      ".dsh-git-tree-trigger{position:relative}",
      ".dsh-git-tree-dot-badge{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fb950);border:1px solid var(--dsw-alias-bg-layer-2)}",
      ".dsh-git-tree-update{display:flex;flex-direction:column;gap:4px;padding:8px 16px;font-size:12px;line-height:18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-git-tree-update-row{display:flex;align-items:center;gap:10px;min-width:0}",
      ".dsh-git-tree-update-details{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-update-details summary{cursor:pointer;user-select:none}",
      ".dsh-git-tree-update-details pre{margin:4px 0 0;padding:6px 8px;max-height:120px;overflow:auto;border-radius:6px;background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-all}",
      ".dsh-git-tree-update-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-git-tree-update-info{color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-update-success{color:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-update-error{color:var(--dsw-alias-state-error-primary,#f85149)}",
      ".dsh-git-tree-update-muted{color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-update-action{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:2px 10px;font-size:12px;line-height:18px;font-family:inherit;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-update-action:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-git-tree-update-cmd{font-family:var(--ds-font-family-code);background:var(--dsw-alias-bg-module-platform);border-radius:6px;padding:1px 6px}",
      ".dsh-git-tree-update-close{width:20px;height:20px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px;line-height:1;border-radius:4px}",
      ".dsh-git-tree-update-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}"
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
    exports.buildEdgePaths = buildEdgePaths;
    exports.computeLabelXs = computeLabelXs;
    exports.branchColors = branchColors;
    exports.pickFreeLane = pickFreeLane;
    exports.formatLocalTime = formatLocalTime;
    exports.labelOf = labelOf;
    exports.hashSuffixOf = hashSuffixOf;
    exports.rowTextOf = rowTextOf;
    exports.truncateText = truncateText;
    exports.statsParts = statsParts;
    exports.shortHashOf = shortHashOf;
    exports.computeSvgWidth = computeSvgWidth;
    exports.bannerKind = bannerKind;
    return module.exports;
  }
});
