window.__ModuleLoader__.load({
  id: "@kulebbb/dsh-git-tree",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    const { createElement: h, useState, useEffect, useLayoutEffect, useRef, useMemo } = react;

    //#region dictionaries
    const NS = "gitTree";
    const zh = {
      "panel.title": "Git 提交图",
      "panel.refresh": "刷新",
      "panel.search": "过滤提交…",
      "panel.searchOpen": "搜索提交",
      "panel.guideDescription": "当前会话项目的提交 / 分支图",
      "panel.noSession": "该会话还没有关联项目目录",
      "shortcut.open": "打开 Git 提交图",
      "shortcut.noSession": "请先选择一个会话",
      "panel.loading": "正在读取提交历史…",
      "panel.notRepo": "该目录不是 git 仓库",
      "panel.notRepoHint": "在此目录执行 git init 创建仓库。",
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
      "update.managed": "新版本 {latest}（当前 {current}），请在 DSH 侧边栏「插件」页重装以更新",
      "update.close": "关闭提示"
    };
    const en = {
      "panel.title": "Git Commit Graph",
      "panel.refresh": "Refresh",
      "panel.search": "Filter commits…",
      "panel.searchOpen": "Search commits",
      "panel.guideDescription": "Commits and branches of the current session's project",
      "panel.noSession": "This session has no project directory yet",
      "shortcut.open": "Open Git commit graph",
      "shortcut.noSession": "Select a session first",
      "panel.loading": "Reading commit history…",
      "panel.notRepo": "This directory is not a git repository",
      "panel.notRepoHint": "Run git init in this directory to create one.",
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
      "update.managed": "New version {latest} (current {current}); reinstall it from the DSH sidebar Plugins page",
      "update.close": "Dismiss"
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
    // Scroll container horizontal padding (12px each side, see
    // .dsh-git-tree-scroll); the SVG is sized to the remaining content width
    // so no row can ever overflow it.
    const SCROLL_PAD_X = 24;
    // Fallback content width when the pane has not been measured yet — the
    // widest the SVG may legitimately be in a full-screen pane.
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

    /** Refs prefix shown ahead of the subject, e.g. "HEAD -> main origin/main". */
    function refTextOf(commit) {
      return commit.refs.map((r) => r.replace(/^tag: /, "")).join(" ");
    }

    /** Commit label text (refs + subject), shared by measurement and render. */
    function labelOf(commit) {
      const refText = refTextOf(commit);
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
     * Whether the panel shows the "newer version" banner. Pure, exported for
     * tests. The desktop app owns plugin installs, so the banner only ever
     * points at the Plugins page — this plugin never installs anything itself.
     */
    function showUpdateBanner({ update, dismissed }) {
      return Boolean(update?.newer) && !dismissed;
    }

    function GitTreePane({ sessionId, t, useSessions, fetchGraph: loadGraph }) {
      // The tab belongs to a session; the project is that session's current
      // directory. Nothing to pick — the tab follows the conversation.
      const session = useSessions((state) => (sessionId ? state.byId[sessionId] : undefined));
      const cwd = session?.cwd ?? null;
      const [payload, setPayload] = useState(null);
      const [error, setError] = useState(null);
      const [loading, setLoading] = useState(false);
      const [query, setQuery] = useState("");
      const [searchOpen, setSearchOpen] = useState(false);
      const [reloadToken, setReloadToken] = useState(0);
      const [notice, setNotice] = useState(null);
      // Registry-check status from the Node half; drives the "newer version"
      // banner. Dismissal is per panel instance.
      const [update, setUpdate] = useState(null);
      const [updateDismissed, setUpdateDismissed] = useState(false);
      // Hovered commit for the custom tooltip; the mouse position itself is
      // tracked in a ref and applied directly to the DOM (no re-render per
      // mousemove — setTip bails out when the commit is unchanged).
      const [tip, setTip] = useState(null);
      // Content-box width of the scroll container; the SVG is clamped to it so
      // long subjects can never push the graph into horizontal scrolling.
      const [viewportW, setViewportW] = useState(0);
      const noticeTimer = useRef(null);
      const loadedCwdRef = useRef(null);
      const scrollRef = useRef(null);
      const searchRef = useRef(null);
      const searchButtonRef = useRef(null);
      const tipRef = useRef(null);
      const tipPos = useRef({ x: 0, y: 0 });

      // Fetch (or refetch) the graph whenever the session's project changes and
      // whenever the user asks for a refresh. Aborting the previous request
      // keeps a slow response from overwriting a newer project's rows.
      useEffect(() => {
        if (!cwd) {
          loadedCwdRef.current = null;
          setPayload(null);
          setError(null);
          setLoading(false);
          return;
        }
        // Switching projects must not keep the previous repo's graph on screen
        // while the new one loads; a refresh of the same project may.
        if (loadedCwdRef.current !== cwd) {
          loadedCwdRef.current = cwd;
          setPayload(null);
        }
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        loadGraph(cwd, GRAPH_LIMIT, controller.signal).then(
          (data) => {
            if (controller.signal.aborted) return;
            setPayload(data);
            setLoading(false);
          },
          (err) => {
            if (controller.signal.aborted || err?.name === "AbortError") return;
            setPayload(null);
            setError({ code: err?.code ?? "internal", message: err?.message ?? "" });
            setLoading(false);
          }
        );
        return () => controller.abort();
      }, [cwd, reloadToken, loadGraph]);

      // Update status is a page-level fact, not a per-project one: ask once on
      // mount. The Node half checks the registry once at startup (5s timeout),
      // so a null `latest` with no error only means "still checking" — retry a
      // couple of times so the banner is not missed on first mount. A settled
      // failure (checkError) stops the retries.
      useEffect(() => {
        let cancelled = false;
        let retryTimer = null;
        let attempts = 0;
        const fetchStatus = () => {
          fetch(UPDATE_STATUS_ROUTE)
            .then((r) => r.json())
            .then((body) => {
              if (cancelled) return;
              if (body?.ok) setUpdate(body);
              const stillChecking = !body?.latest && !body?.checkError;
              if (stillChecking && attempts < 2) {
                attempts += 1;
                retryTimer = setTimeout(() => { retryTimer = null; fetchStatus(); }, 3000);
              }
            })
            .catch(() => { /* silent: update UI is best-effort */ });
        };
        fetchStatus();
        return () => { cancelled = true; clearTimeout(retryTimer); };
      }, []);

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
      }, [payload, cwd, query, searchOpen]);

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

      useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
      useEffect(() => () => clearTimeout(noticeTimer.current), []);

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

      const showBanner = showUpdateBanner({ update, dismissed: updateDismissed });
      const bannerNode = showBanner ? h("div", { className: "dsh-git-tree-update dsh-git-tree-update-muted" },
            h("span", { className: "dsh-git-tree-update-text" }, t("update.managed", { latest: update.latest, current: update.current })),
            h("button", { type: "button", className: "dsh-git-tree-update-close", title: t("update.close"), "aria-label": t("update.close"), onClick: () => setUpdateDismissed(true) }, "✕")
          ) : null;

      const repo = payload?.repo ?? null;
      const localHead = repo?.localHead ?? null;
      const remoteHead = repo?.remoteHead ?? null;
      const remoteHeadHash = remoteHead?.hash ?? null;

      const projectName = useMemo(() => {
        const root = repo?.root || cwd || "";
        const segments = root.split(/[\\/]/).filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : t("panel.title");
      }, [repo, cwd, t]);

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

      const maxCol = graph.rows.reduce((m, r) => Math.max(m, r.col), 0);
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
      if (!cwd) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.noSession"));
      } else if (loading && !payload) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.loading"));
      } else if (errorText) {
        bodyNode = h("div", { className: "dsh-git-tree-message dsh-git-tree-error" },
          errorText,
          h("button", { type: "button", className: "dsh-git-tree-retry", onClick: () => setReloadToken((n) => n + 1) }, t("panel.refresh"))
        );
      } else if (!payload) {
        bodyNode = null;
      } else if (payload.commits.length === 0) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.empty"));
      } else if (graph.rows.length === 0) {
        bodyNode = h("div", { className: "dsh-git-tree-message" }, t("panel.noMatches"));
      } else {
        bodyNode = h("div", { ref: scrollRef, className: "dsh-git-tree-scroll" },
          h("svg", { className: "dsh-git-tree-svg", width: svgW, height: svgH, role: "img", "aria-label": t("panel.title") },
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
                const isHead = localHead != null && c.hash === localHead.hash;
                const isRemoteHead = remoteHeadHash != null && c.hash === remoteHeadHash;
                // Refs are tinted like the lane they sit on; the local HEAD row
                // borrows the success green so the current branch reads first.
                const fullRefs = refTextOf(c);
                const hashSuffix = hashSuffixOf(c);
                const w = labelWidths[i] ?? { subject: 0, full: 0 };
                const hashW = Math.max(0, (w.full || 0) - (w.subject || 0));
                // 本地/云端 head badges (right of the hash suffix). In a narrow
                // right-sidebar pane they crowd the row, so the status bar above
                // (which always carries both hashes) is enough.
                const badges = [];
                if ((viewportW > 0 ? viewportW : svgW) >= 560) {
                  if (isHead) badges.push({ label: t("panel.badgeLocal"), cls: "local" });
                  if (isRemoteHead) badges.push({ label: t("panel.badgeRemote"), cls: "remote" });
                }
                const badgeTotalW = badges.reduce((s, b) => s + measureTextWidth(b.label) + BADGE_PAD_X * 2 + BADGE_GAP, 0) - (badges.length ? BADGE_GAP : 0);
                // A long refs prefix (HEAD + branch + remote) must not eat the
                // whole subject: cap it and leave the subject a readable share.
                const refBudget = Math.max(0, svgW - LABEL_PAD_RIGHT - labelXs[i] - hashW - badgeTotalW - 96);
                const refText = fullRefs && refBudget > 0
                  ? truncateText(fullRefs, refBudget - measureTextWidth(" "), measureTextWidth)
                  : "";
                const refW = refText ? measureTextWidth(`${refText} `) : 0;
                // Reserve refs + hash suffix + badges, truncate the subject to the rest.
                const subjectMaxW = Math.max(0, svgW - LABEL_PAD_RIGHT - labelXs[i] - refW - hashW - badgeTotalW);
                const subjectText = truncateText(c.subject, subjectMaxW, measureTextWidth);
                const subjectW = measureTextWidth(subjectText);
                const hashX = labelXs[i] + refW + subjectW;
                const textEndX = hashX + hashW;
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
                    style: {
                      fill: isHead ? "var(--dsw-alias-bg-layer-2)" : row.color,
                      stroke: isHead
                        ? "var(--dsw-alias-state-success-primary, #3fb950)"
                        : (isRemoteHead ? "var(--dsw-static-blue-450)" : "none"),
                      strokeWidth: (isHead || isRemoteHead) ? 2 : 0,
                      strokeDasharray: isRemoteHead && !isHead ? "3 2" : undefined
                    }
                  }),
                  h("text", { x: labelXs[i], y: 0, className: "dsh-git-tree-label" },
                    refText
                      ? h("tspan", {
                          className: "dsh-git-tree-refs",
                          style: { fill: isHead ? "var(--dsw-alias-state-success-primary, #3fb950)" : row.color }
                        }, `${refText} `)
                      : null,
                    subjectText
                  ),
                  h("text", { x: hashX, y: 0, className: "dsh-git-tree-hash" }, hashSuffix),
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
      if (repo) {
        meta.push(t("panel.commits", { count: payload.commits.length }));
        meta.push(repo.currentBranch ? t("panel.branch", { branch: repo.currentBranch }) : t("panel.detached"));
        meta.push(repo.dirty > 0 ? t("panel.dirty", { count: repo.dirty }) : t("panel.clean"));
        if (repo.truncated) meta.push(t("panel.truncated", { n: GRAPH_LIMIT }));
        if (maxCol >= MAX_LANES) meta.push(t("panel.lanesTruncated"));
      }
      const statusTitle = meta.length > 0 ? meta.join(" · ") : (repo?.root || cwd || "");
      const aheadBehind = remoteHead && (remoteHead.ahead + remoteHead.behind > 0)
        ? t("panel.aheadBehind", { ahead: remoteHead.ahead, behind: remoteHead.behind })
        : null;

      return h("div", { className: "dsh-git-tree-pane" },
        h("div", { className: "dsh-git-tree-statusbar", title: statusTitle },
          h("span", { className: "dsh-git-tree-project", title: repo?.root || cwd || "" }, projectName),
          localHead ? h("span", { className: "dsh-git-tree-status-sep", "aria-hidden": "true" }, "·") : null,
          localHead
            ? h("span", { className: "dsh-git-tree-status-branch", title: localHead.hash },
                h("span", { className: "dsh-git-tree-head-dot dsh-git-tree-head-dot-local" }),
                localHead.branch || t("panel.detached"))
            : null,
          aheadBehind
            ? h("span", {
                className: "dsh-git-tree-status-ab",
                title: t("panel.aheadBehindTitle", { ahead: remoteHead.ahead, behind: remoteHead.behind })
              }, aheadBehind)
            : null,
          localHead
            ? h("span", { className: "dsh-git-tree-pill dsh-git-tree-pill-local", title: localHead.hash },
                `${t("panel.badgeLocal")} ${shortHashOf(localHead.hash)}`)
            : null,
          remoteHead
            ? h("span", { className: "dsh-git-tree-pill dsh-git-tree-pill-remote", title: `${remoteHead.ref} ${remoteHead.hash}` },
                `${t("panel.badgeRemote")} ${shortHashOf(remoteHead.hash)}`)
            : null,
          h("span", { className: "dsh-git-tree-status-spacer" }),
          h("button", {
            ref: searchButtonRef,
            type: "button",
            className: "dsh-git-tree-action",
            title: t("panel.searchOpen"),
            "aria-label": t("panel.searchOpen"),
            "aria-pressed": searchOpen ? "true" : "false",
            onClick: () => {
              if (searchOpen) setQuery("");
              setSearchOpen(!searchOpen);
            }
          }, "⌕"),
          h("button", {
            type: "button",
            className: "dsh-git-tree-action",
            title: t("panel.refresh"),
            "aria-label": t("panel.refresh"),
            onClick: () => setReloadToken((n) => n + 1)
          }, "↻")
        ),
        searchOpen
          ? h("div", { className: "dsh-git-tree-searchrow" },
              h("input", {
                ref: searchRef,
                className: "dsh-git-tree-search",
                "aria-label": t("panel.search"),
                placeholder: t("panel.search"),
                value: query,
                onChange: (e) => setQuery(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    setSearchOpen(false);
                    searchButtonRef.current?.focus();
                  }
                }
              })
            )
          : null,
        bannerNode,
        h("div", { className: "dsh-git-tree-body" }, bodyNode),
        notice ? h("div", { className: "dsh-git-tree-toast", role: "status" }, notice) : null,
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
    /* Styled exclusively with real DSH design tokens (dsh-client-ui-theme): the
       pane owns no surface of its own (it is a sidebar column), popovers use
       --dsw-alias-bg-layer-2 + --dsw-shadow-lv3, borders follow the
       --dsw-alias-border-l* ladder and controls --dsw-alias-bg-module-platform. */
    const CSS = [
      /* The pane lives in the right sidebar tab body: it owns no frame of its
         own, so it simply fills the tab and keeps the graph as the main event.
         Every colour comes from real DSH design tokens (dsh-client-ui-theme). */
      ".dsh-git-tree-pane,.dsh-git-tree-pane *{box-sizing:border-box}",
      ".dsh-git-tree-pane{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}",
      ".dsh-git-tree-statusbar{display:flex;align-items:center;gap:8px;flex:none;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden}",
      ".dsh-git-tree-project{flex:none;max-width:130px;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-status-sep{flex:none;color:var(--dsw-alias-label-tertiary);opacity:.6}",
      ".dsh-git-tree-status-branch{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code)}",
      ".dsh-git-tree-status-ab{flex:none;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-variant-numeric:tabular-nums}",
      ".dsh-git-tree-status-spacer{margin-left:auto}",
      ".dsh-git-tree-head-dot{width:7px;height:7px;border-radius:50%;flex:none}",
      ".dsh-git-tree-head-dot-local{background:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-pill{display:inline-flex;align-items:center;height:20px;min-width:0;padding:0 7px;border-radius:6px;background:var(--dsw-alias-bg-module-platform);font-family:var(--ds-font-family-code);font-size:11px;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-git-tree-pill-local{color:var(--dsw-alias-state-success-primary,#3fb950)}",
      ".dsh-git-tree-pill-remote{color:var(--dsw-static-blue-450)}",
      ".dsh-git-tree-action{flex:none;width:24px;height:24px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),color var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dsh-git-tree-action:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-action[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform)}",
      ".dsh-git-tree-searchrow{flex:none;display:flex;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-git-tree-search{flex:1;min-width:80px;height:26px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:20px;outline:none;transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out)}",
      ".dsh-git-tree-search::placeholder{color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-search:hover{border-color:var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-search:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
      ".dsh-git-tree-body{flex:1;overflow:auto;min-height:0}",
      ".dsh-git-tree-scroll{overflow:auto;padding:8px 12px 10px}",
      ".dsh-git-tree-svg{display:block}",
      ".dsh-git-tree-edge{stroke:var(--dsw-alias-label-tertiary);stroke-width:2;opacity:.9;stroke-linecap:round}",
      ".dsh-git-tree-node{cursor:pointer}",
      `.dsh-git-tree-label{font-size:${LABEL_FONT_SIZE}px;font-family:var(--ds-font-family-code);fill:var(--dsw-alias-label-primary);paint-order:stroke;stroke:var(--dsw-alias-bg-layer-2);stroke-width:3px;stroke-linejoin:round;dominant-baseline:middle;user-select:none}`,
      ".dsh-git-tree-refs{font-weight:600}",
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
      ".dsh-git-tree-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);padding:4px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap;pointer-events:none}",
      ".dsh-git-tree-update{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:12px;line-height:18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dsh-git-tree-update-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-git-tree-update-muted{color:var(--dsw-alias-label-tertiary)}",
      ".dsh-git-tree-update-close{width:20px;height:20px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:12px;line-height:1;border-radius:4px;flex:none}",
      ".dsh-git-tree-update-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}"

    ].join("");
    //#endregion

    //#region entry
    // One tab type per package. The id is what the right sidebar persists tab
    // records by, and it doubles as the slot key for the body seat.
    const TAB_ID = "@kulebbb/dsh-git-tree";
    const TAB_KIND = "git-tree";

    // Shortcut defaults are desktop-only on purpose: the plugin targets the
    // desktop app, and the DSH shortcut registry rejects the whole set when any
    // declared platform is illegal. Exported so tests can pin the key set.
    const SHORTCUT_DEFAULTS = {
      "desktop:macos": { code: "KeyG", modifiers: ["meta", "shift"] },
      "desktop:windows": { code: "KeyG", modifiers: ["control", "shift"] },
      "desktop:linux": { code: "KeyG", modifiers: ["control", "shift"] }
    };

    const inject = ["slots", "sessions", "locale", "sidebarRight", "sidebarRightTabs"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-git-tree: dictionaries");
      if (typeof document !== "undefined") {
        const style = document.createElement("style");
        style.setAttribute("data-plugin", "dsh-git-tree");
        style.textContent = CSS;
        document.head.append(style);
        ctx.effect(() => () => { style.remove(); }, "dsh-git-tree: styles");
      }

      // The right sidebar is the only host since 0.6.0. A host without its
      // services gets no entry point at all — a dead button would be worse.
      const sidebarRight = ctx.sidebarRight;
      const sidebarRightTabs = ctx.sidebarRightTabs;
      if (!sidebarRight || !sidebarRightTabs) return;

      const t = ctx.locale.bind(NS);

      ctx.effect(() => sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: "extension",
        title: () => t("panel.title"),
        guide: [{
          id: TAB_ID,
          order: 30,
          title: () => t("panel.title"),
          description: () => t("panel.guideDescription"),
          commandId: "git-tree.open"
        }]
      }), "dsh-git-tree: tab type");

      ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
        name: "sidebar.right.pane.tab",
        key: TAB_ID,
        locale: NS,
        inject: (sessionId) => ({
          sessionId,
          fetchGraph,
          hooks: { sessions: ctx.sessions.list }
        })
      }, GitTreePane)), "dsh-git-tree: tab body");

      // Optional page shortcut, mirroring the built-in terminal/browser
      // providers. Registered through a scoped injection so it still binds when
      // the shortcuts service arrives after this plugin; the guide card stays
      // the primary entry, so a host without the service simply has no key.
      if (typeof sidebarRight.openTabFromTarget === "function" && typeof ctx.inject === "function") {
        ctx.inject(["shortcuts"], (scope) => {
          scope.effect(() => {
            try {
              return scope.shortcuts.register({
                id: "git-tree.open",
                label: () => t("shortcut.open"),
                aliases: ["git tree", "git graph"],
                defaults: SHORTCUT_DEFAULTS,
                regions: ["page", "editable"],
                modals: [],
                resolve: ({ target: element }) => {
                  const target = sidebarRight.commandTarget(element);
                  if (target === undefined) return { status: "blocked", reason: t("shortcut.noSession") };
                  return {
                    status: "handled",
                    run: () => { sidebarRight.openTabFromTarget(TAB_KIND, target); }
                  };
                }
              });
            } catch (error) {
              ctx.logger?.warn?.("[dsh-git-tree] shortcut registration failed:", error);
              return undefined;
            }
          }, "dsh-git-tree: shortcut");
        });
      }
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
    exports.refTextOf = refTextOf;
    exports.hashSuffixOf = hashSuffixOf;
    exports.rowTextOf = rowTextOf;
    exports.truncateText = truncateText;
    exports.statsParts = statsParts;
    exports.shortHashOf = shortHashOf;
    exports.computeSvgWidth = computeSvgWidth;
    exports.showUpdateBanner = showUpdateBanner;
    exports.shortcutDefaults = SHORTCUT_DEFAULTS;
    exports.dictionaries = { zh, en };
    return module.exports;
  }
});
