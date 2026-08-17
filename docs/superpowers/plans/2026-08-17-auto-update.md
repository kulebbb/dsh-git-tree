# 插件自动更新（方案 A）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@kulebbb/dsh-git-tree` 增加「启动时静默检查 npm 新版本 + 面板内非侵入式横幅 + 一键 pnpm 更新」的自动更新能力（方案 A，设计文档：`docs/superpowers/specs/2026-08-17-auto-update-design.md`）。

**Architecture:** 新增纯逻辑模块 `lib/update.js`（版本比较 / 开发安装检测 / profile 定位 / 状态推导 / pnpm 执行，全部可注入单测），`lib/index.js` 挂两个新路由（GET status、POST update）并在启动时异步检查 registry，`lib/client.js` 增加按钮角标与面板横幅。无新增依赖（registry 检查用 Node 22 内置 `fetch`）。

**Tech Stack:** Node 22（ESM、`node:test`、`AbortSignal.timeout`/`AbortSignal.any`、`node:child_process.spawn`）、Cordis 插件（`ctx.effect` / `ctx.webServer.register` / 配置透传）、npm registry JSON API。

**Working directory:** `/Users/zhaoliang/Documents/coding/deepseek-plugin/dsh-git-tree`（下文所有命令在该目录执行）。

**TDD 约定：** 每步先写失败测试 → 运行确认失败 → 实现 → 运行确认通过 → 提交。测试运行命令：`node --test`。

**实现偏差说明（相对设计文档，行为不变）：** 设计文档原计划用 schemastery 声明 `Config` schema。仓库是刻意零依赖的（`.gitignore` 忽略 node_modules，`node --test` 免安装直接跑），顶层 `import z from "@deepseek-ai/schemastery"` 会导致测试解析失败。Cordis 的 `resolveConfig` 在插件无 `Config` 导出时**透传原始配置**（`if (!runtime.Config) return config;`），因此 `lib/index.js` 不导出 `Config`，改为 `config?.update?.profileDir ?? ""` 读取可选配置——`update.profileDir` 行为与规格完全一致。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `lib/update.js` | 新建 | 纯逻辑：`compareVersions`、`isDevSpec`、`findProfileDir`、`readDependencySpec`、`deriveStatus`、`checkRegistryLatest`、`runPnpmUpdate` |
| `lib/index.js` | 重写 | 启动异步检查、`GET /git-tree/update/status`、`POST /git-tree/update`（原 graph 路由保留；不导出 Config，配置透传） |
| `lib/client.js` | 修改 | 词典新增 ~10 key、`bannerKind` 纯函数、状态获取 effect、按钮角标、面板横幅、CSS |
| `test/update.test.js` | 新建 | `lib/update.js` 全部纯函数 + client `bannerKind` 单测 |
| `test/index.test.js` | 新建 | 路由挂载、状态 payload、POST 守卫（dev-install / profile-not-found / already-running / 成功路径） |
| `README.md` | 修改 | 文档化自动更新功能、新路由、可选配置 |
| `package.json` | 修改 | `version` 0.3.1 → 0.4.0 |

---

## Task 1: `lib/update.js` — 版本比较与开发安装检测

**Files:**
- Create: `lib/update.js`
- Test: `test/update.test.js`

- [ ] **Step 1: 写失败测试**

创建 `test/update.test.js`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isDevSpec } from "../lib/update.js";

test("compareVersions: numeric ordering", () => {
  assert.equal(compareVersions("0.3.1", "0.4.0"), -1);
  assert.equal(compareVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareVersions("1.0.10", "1.0.9"), 1);
  assert.equal(compareVersions("2.0.0", "10.0.0"), -1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("compareVersions: prerelease sorts below its release", () => {
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-beta"), -1);
});

test("compareVersions: empty and junk inputs degrade to 0", () => {
  assert.equal(compareVersions("", "0.0.1"), -1);
  assert.equal(compareVersions("abc", "0.0.0"), 0);
});

test("isDevSpec: link:/file: specs are dev installs", () => {
  assert.equal(isDevSpec("link:/Users/x/checkout"), true);
  assert.equal(isDevSpec("file:../plugin"), true);
  assert.equal(isDevSpec("file:./plugin"), true);
});

test("isDevSpec: registry/github/plain specs are not dev installs", () => {
  assert.equal(isDevSpec("^0.3.1"), false);
  assert.equal(isDevSpec("0.3.1"), false);
  assert.equal(isDevSpec("github:kulebbb/dsh-git-tree"), false);
  assert.equal(isDevSpec(undefined), false);
  assert.equal(isDevSpec(null), false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/update.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` / `Cannot find module '../lib/update.js'`。

- [ ] **Step 3: 实现 `lib/update.js`（本任务部分）**

创建 `lib/update.js`（本步只含下面两个函数；后续 Task 追加）：

```js
export const PACKAGE_NAME = "@kulebbb/dsh-git-tree";
export const UPDATE_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;

/**
 * Compare two version strings by numeric dot-segments (semver-ish, tolerant
 * of junk). A prerelease suffix (-beta.1) sorts below the release of the
 * same numeric core; two prereleases compare by raw string. Returns -1|0|1.
 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).split("-", 2);
    return { nums: core.split(".").map((s) => Number.parseInt(s, 10) || 0), pre: pre ?? null };
  };
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.nums.length, B.nums.length);
  for (let i = 0; i < len; i++) {
    const x = A.nums[i] ?? 0;
    const y = B.nums[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (A.pre === null) return 1;
  if (B.pre === null) return -1;
  return A.pre < B.pre ? -1 : 1;
}

/**
 * Whether a dependency spec denotes a local/source install that must never
 * be auto-updated (pnpm add would replace the local link with a registry
 * copy and break the developer's checkout).
 */
export function isDevSpec(spec) {
  return /^(?:link|file):/i.test(String(spec ?? ""));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/update.test.js`
Expected: PASS（全部通过；`parse` 对 "abc" 得 `[0]`，对 "" 得 `[0]`）。

- [ ] **Step 5: 提交**

```bash
git add lib/update.js test/update.test.js
git commit -m "feat: update module version comparison and dev-install detection"
```

---

## Task 2: `lib/update.js` — profile 定位与依赖 spec 读取

**Files:**
- Modify: `lib/update.js`
- Test: `test/update.test.js`

- [ ] **Step 1: 写失败测试**

追加到 `test/update.test.js`：

```js
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProfileDir, readDependencySpec } from "../lib/update.js";

test("findProfileDir: config dir wins", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/any/where/lib/index.js", profile, {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "config");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: walks up the own install path", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  const pkg = join(profile, "node_modules", "@kulebbb", "dsh-git-tree", "lib");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const ownFile = join(pkg, "index.js");
  const result = findProfileDir(ownFile, "", {});
  assert.equal(result.dir, profile);
  assert.equal(result.source, "install-path");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: DSH_HOME fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const profile = join(root, "profiles", "web");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), "{}");
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, profile);
  assert.equal(result.source, "dsh-home");
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: nothing found reports reason", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const result = findProfileDir("/unrelated/lib/index.js", "", { DSH_HOME: root });
  assert.equal(result.dir, null);
  assert.match(result.reason, /no <X>\/node_modules/);
  rmSync(root, { recursive: true, force: true });
});

test("findProfileDir: config dir without package.json is ignored", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  const bogus = join(root, "not-a-profile");
  mkdirSync(bogus, { recursive: true });
  const result = findProfileDir("/unrelated/lib/index.js", bogus, { DSH_HOME: root });
  assert.equal(result.dir, null);
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: reads the package spec from profile package.json", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { "@kulebbb/dsh-git-tree": "link:/tmp/checkout" }
  }));
  assert.equal(readDependencySpec(root), "link:/tmp/checkout");
  rmSync(root, { recursive: true, force: true });
});

test("readDependencySpec: returns null when absent or unreadable", () => {
  const root = mkdtempSync(join(tmpdir(), "gt-update-"));
  writeFileSync(join(root, "package.json"), "{}");
  assert.equal(readDependencySpec(root), null);
  assert.equal(readDependencySpec(join(root, "missing")), null);
  rmSync(root, { recursive: true, force: true });
});
```

（注意：`import` 语句必须集中在文件顶部，把新增的三个 import 合并到 Step 1 已有的 import 块。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/update.test.js`
Expected: FAIL — `findProfileDir is not a function` / `readDependencySpec is not a function`。

- [ ] **Step 3: 实现（追加到 `lib/update.js`）**

在 `isDevSpec` 之后追加（顶部 import 需新增 `existsSync, readFileSync` from `node:fs` 与 `dirname, join` from `node:path`）：

```js
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Locate the DSH profile directory hosting this plugin.
 * Resolution chain: explicit config dir → own install path → $DSH_HOME/profiles/web.
 * @param {string} ownFile - absolute path of this module (fileURLToPath(import.meta.url)).
 * @param {string} configDir - user-configured update.profileDir ("" = unset).
 * @param {object} env - environment mapping (process.env in production).
 * @returns {{dir: string, source: string}|{dir: null, reason: string}}
 */
export function findProfileDir(ownFile, configDir = "", env = {}) {
  if (configDir && configDir.trim()) {
    if (existsSync(join(configDir, "package.json"))) return { dir: configDir, source: "config" };
  }
  // Walk up from the module file looking for <X>/node_modules/@kulebbb/dsh-git-tree.
  let p = dirname(ownFile);
  while (p && p !== dirname(p)) {
    if (existsSync(join(p, "node_modules", PACKAGE_NAME))) return { dir: p, source: "install-path" };
    p = dirname(p);
  }
  const home = env.DSH_HOME && env.DSH_HOME.trim() ? env.DSH_HOME : join(env.HOME ?? "", ".dsh");
  const fallback = join(home, "profiles", "web");
  if (existsSync(join(fallback, "package.json"))) return { dir: fallback, source: "dsh-home" };
  return {
    dir: null,
    reason: `no <X>/node_modules/${PACKAGE_NAME} ancestor of ${ownFile} and no profile at ${fallback}`
  };
}

/**
 * Read this plugin's dependency spec from the profile's package.json
 * (dependencies first, devDependencies second). Returns null when the
 * profile is unreadable or does not depend on the plugin.
 */
export function readDependencySpec(profileDir, pkgName = PACKAGE_NAME) {
  try {
    const pkg = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8"));
    return pkg.dependencies?.[pkgName] ?? pkg.devDependencies?.[pkgName] ?? null;
  } catch {
    return null;
  }
}
```

（把两个 `import` 行与 `lib/update.js` 顶部的 `export const PACKAGE_NAME` 等合并为同一 import 块。）

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/update.test.js`
Expected: PASS（含 Task 1 用例，共 15 个用例）。

- [ ] **Step 5: 提交**

```bash
git add lib/update.js test/update.test.js
git commit -m "feat: profile directory resolution and dev-install spec detection"
```

---

## Task 3: `lib/update.js` — 状态推导与 registry 检查

**Files:**
- Modify: `lib/update.js`
- Test: `test/update.test.js`

- [ ] **Step 1: 写失败测试**

追加到 `test/update.test.js`：

```js
import { deriveStatus, checkRegistryLatest } from "../lib/update.js";

test("deriveStatus: update available when newer, non-dev, profile found", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: false, profileDir: "/p" });
  assert.equal(s.updateAvailable, true);
  assert.equal(s.current, "0.3.1");
  assert.equal(s.latest, "0.4.0");
});

test("deriveStatus: not available when already current", () => {
  const s = deriveStatus({ current: "0.4.0", latest: "0.4.0", dev: false, profileDir: "/p" });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: dev install never offers update", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: true, profileDir: "/p" });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: missing profile dir never offers update", () => {
  const s = deriveStatus({ current: "0.3.1", latest: "0.4.0", dev: false, profileDir: null });
  assert.equal(s.updateAvailable, false);
});

test("deriveStatus: check failure keeps latest null and surfaces checkError", () => {
  const s = deriveStatus({ current: "0.3.1", latest: null, dev: false, profileDir: "/p", checkError: "ECONNREFUSED" });
  assert.equal(s.updateAvailable, false);
  assert.equal(s.checkError, "ECONNREFUSED");
});

test("checkRegistryLatest: parses latest from registry payload", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: "0.4.0" }) });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, "0.4.0");
  assert.equal(result.checkError, null);
});

test("checkRegistryLatest: non-ok response is a silent failure", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /404/);
});

test("checkRegistryLatest: thrown fetch error is a silent failure", async () => {
  const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
  const result = await checkRegistryLatest({ fetchImpl: fakeFetch });
  assert.equal(result.latest, null);
  assert.match(result.checkError, /ECONNREFUSED/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/update.test.js`
Expected: FAIL — `deriveStatus is not a function` / `checkRegistryLatest is not a function`。

- [ ] **Step 3: 实现（追加到 `lib/update.js`）**

```js
/**
 * Derive the client-facing update status from the raw facts.
 * `updateAvailable` requires a newer version AND a non-dev install AND a
 * locatable profile dir (only then can the one-click update actually run).
 */
export function deriveStatus({ current, latest, dev, profileDir, checkError = null }) {
  const newer = latest != null && compareVersions(latest, current) > 0;
  return {
    current,
    latest,
    dev,
    profileDir,
    checkError,
    updateAvailable: Boolean(newer && !dev && profileDir)
  };
}

/**
 * Query the npm registry for the latest published version. Never throws:
 * every failure resolves to `{ latest: null, checkError }` so the caller can
 * degrade silently. `signal` (optional) is combined with a timeout.
 */
export async function checkRegistryLatest({ fetchImpl = globalThis.fetch, timeoutMs = 5000, signal } = {}) {
  try {
    const combined = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const res = await fetchImpl(UPDATE_REGISTRY_URL, { signal: combined });
    if (!res.ok) return { latest: null, checkError: `registry HTTP ${res.status}` };
    const body = await res.json();
    return { latest: typeof body?.version === "string" ? body.version : null, checkError: null };
  } catch (error) {
    return { latest: null, checkError: String(error?.message ?? error) };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/update.test.js`
Expected: PASS（共 23 个用例）。

- [ ] **Step 5: 提交**

```bash
git add lib/update.js test/update.test.js
git commit -m "feat: update status derivation and registry check"
```

---

## Task 4: `lib/update.js` — pnpm 更新执行

**Files:**
- Modify: `lib/update.js`
- Test: `test/update.test.js`

- [ ] **Step 1: 写失败测试**

追加到 `test/update.test.js`：

```js
import { EventEmitter } from "node:events";
import { runPnpmUpdate } from "../lib/update.js";

test("runPnpmUpdate: pnpm add with latest tag and CI env", async () => {
  let captured;
  const fakeSpawn = (cmd, args, opts) => {
    captured = { cmd, args, opts };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, true);
  assert.equal(captured.cmd, "pnpm");
  assert.deepEqual(captured.args, ["add", "@kulebbb/dsh-git-tree@latest"]);
  assert.equal(captured.opts.cwd, "/p");
  assert.equal(captured.opts.env.CI, "1");
  assert.equal(captured.opts.stdio[0], "ignore");
});

test("runPnpmUpdate: resolves error with output on non-zero exit", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stderr.emit("data", "ERR_PNPM_FETCH_404 Package not found");
      child.emit("close", 1);
    });
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, "pnpm-error");
  assert.match(result.message, /code 1/);
  assert.match(result.output, /ERR_PNPM_FETCH_404/);
});

test("runPnpmUpdate: spawn failure maps to spawn-error", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, "spawn-error");
});

test("runPnpmUpdate: timeout kills the child and maps to update-timeout", async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let killed = false;
    child.kill = () => { killed = true; };
    setTimeout(() => child.emit("close", 0), 50); // close arrives AFTER the 20ms timeout
    return child;
  };
  const result = await runPnpmUpdate("/p", { spawnImpl: fakeSpawn, env: {}, timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "update-timeout");
});
```

（timeout 测试说明：`close(0)` 必须用 `setTimeout(..., 50)` 在 20ms 超时**之后**发出——若用 `queueMicrotask`，微任务先于定时器执行，`close` 会先 settle 为成功，测试不可能通过。`settled` 守卫保证先到先得，结果仍是超时。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/update.test.js`
Expected: FAIL — `runPnpmUpdate is not a function`。

- [ ] **Step 3: 实现（追加到 `lib/update.js`）**

```js
import { spawn } from "node:child_process";

const PNPM_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 64 * 1024;

/**
 * Run `pnpm add @kulebbb/dsh-git-tree@latest` in the profile directory with
 * CI=1 (non-interactive). Captures stdout+stderr (truncated), kills the
 * child on timeout, and always resolves — never rejects — with
 * `{ ok: boolean, code?, message?, output }`.
 * @param {string} profileDir - directory pnpm runs in.
 * @param {object} [opts] - `spawnImpl` (test seam), `env`, `timeoutMs`.
 */
export async function runPnpmUpdate(profileDir, { spawnImpl = spawn, env = process.env, timeoutMs = PNPM_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl("pnpm", ["add", `${PACKAGE_NAME}@latest`], {
      cwd: profileDir,
      env: { ...env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({ ok: false, code: "update-timeout", message: `pnpm timed out after ${timeoutMs}ms`, output });
    }, timeoutMs);
    const onData = (chunk) => { output = (output + chunk.toString()).slice(0, MAX_OUTPUT); };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => settle({ ok: false, code: "spawn-error", message: err.message, output }));
    child.on("close", (code) => {
      settle(code === 0
        ? { ok: true, output }
        : { ok: false, code: "pnpm-error", message: `pnpm exited with code ${code}`, output });
    });
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/update.test.js`
Expected: PASS（共 27 个用例）。注意 `pnpm exited with code ${code}` 中的 `code` 来自 `close` 事件回调参数——Step 1 断言 `/code 1/` 与此一致。

- [ ] **Step 5: 提交**

```bash
git add lib/update.js test/update.test.js
git commit -m "feat: one-click pnpm update runner with timeout and output capture"
```

---

## Task 5: `lib/index.js` — 启动检查与两个新路由

**Files:**
- Rewrite: `lib/index.js`
- Create: `test/index.test.js`

- [ ] **Step 1: 写失败测试**

创建 `test/index.test.js`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, GRAPH_ROUTE, UPDATE_STATUS_ROUTE, UPDATE_ROUTE } from "../lib/index.js";

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
  assert.equal(body.current, "9.9.9"); // the startup check read the real package.json of this plugin
  assert.equal(body.latest, "9.9.9");
  assert.equal(body.dev, false);
  assert.equal(body.profileDir, profile);
  assert.equal(body.updateAvailable, false); // current == latest
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
```

测试说明（写给执行者）：
- `makeContext` 的 `ctx.effect` 立即执行并调用 cleanup——启动检查的 async IIFE 仍在后台跑，测试用 `await new Promise((r) => setTimeout(r, 50))` 短暂等待让其完成。`state.current` 来自真实 `../package.json`。若当前插件版本恰好是 0.3.1，则 `current === "0.3.1"`，`latest === "9.9.9"`，`updateAvailable === true`。因此该用例断言应写成：

```js
  assert.equal(body.latest, "9.9.9");
  assert.equal(body.dev, false);
  assert.equal(body.profileDir, profile);
  assert.equal(body.updateAvailable, compareVersions("9.9.9", body.current) > 0);
```

（把 `import { compareVersions } from "../lib/update.js";` 加到文件顶部；删除 Step 1 中该用例里错误的 `current`/`updateAvailable` 断言。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/index.test.js`
Expected: FAIL — `Cannot find module '../lib/index.js'` 或 `apply is not a function`。

- [ ] **Step 3: 重写 `lib/index.js`**

完整替换 `lib/index.js` 为：

```js
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
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/index.test.js`
Expected: PASS（7 个用例）。

- [ ] **Step 5: 回归 + 提交**

Run: `node --test`
Expected: 全部通过（含既有 test/layout、test/parse、test/git、test/format 与新增两个测试文件）。

```bash
git add lib/index.js test/index.test.js
git commit -m "feat: update status and one-click update routes with startup registry check"
```

---

## Task 6: `lib/client.js` — 角标、横幅与状态获取

**Files:**
- Modify: `lib/client.js`（词典、常量、面板状态、effect、banner 渲染、触发按钮角标、CSS、exports）
- Test: `test/update.test.js`（追加 `bannerKind` 用例，复用 bundle 加载 stub）

- [ ] **Step 1: 写失败测试**

在 `test/update.test.js` 顶部（import 块后）追加 bundle 加载 stub 与 `bannerKind` 用例：

```js
// Stub the browser module system so the bundle can materialize in Node
// (same pattern as test/format.test.js). The factory lazily touches react.
globalThis.window = {
  __ModuleLoader__: { load: (handoff) => { globalThis.__DSH_GT_LOADED = handoff; } }
};
const fakeReact = {
  createElement: () => null,
  useState: () => [],
  useEffect: () => {},
  useRef: () => ({}),
  useMemo: () => null,
  useCallback: (fn) => fn
};
await import(new URL("../lib/client.js", import.meta.url));
const loaded = globalThis.__DSH_GT_LOADED;
assert.ok(loaded, "bundle must call __ModuleLoader__.load");
const { bannerKind } = loaded.factory((spec) => {
  if (spec === "react") return fakeReact;
  throw new Error(`unexpected require: ${spec}`);
});

test("bannerKind: hidden without status or when dismissed", () => {
  assert.equal(bannerKind({ update: null, phase: "idle", dismissed: false }), null);
  assert.equal(bannerKind({ update: { latest: "0.4.0" }, phase: "idle", dismissed: true }), null);
  assert.equal(bannerKind({ update: { latest: null }, phase: "idle", dismissed: false }), null);
});

test("bannerKind: derives banner from status when phase is idle", () => {
  const base = { phase: "idle", dismissed: false };
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: true, dev: false, profileDir: "/p" }, ...base }), "available");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: true, profileDir: "/p" }, ...base }), "dev");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: false, profileDir: null }, ...base }), "noProfile");
  assert.equal(bannerKind({ update: { latest: "0.4.0", updateAvailable: false, dev: false, profileDir: "/p" }, ...base }), null);
});

test("bannerKind: phase overrides status", () => {
  const update = { latest: "0.4.0", updateAvailable: true, dev: false, profileDir: "/p" };
  assert.equal(bannerKind({ update, phase: "updating", dismissed: false }), "updating");
  assert.equal(bannerKind({ update, phase: "updated", dismissed: false }), "updated");
  assert.equal(bannerKind({ update, phase: "error", dismissed: false }), "error");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/update.test.js`
Expected: FAIL — `bannerKind is not a function`（client bundle 加载部分通过）。

- [ ] **Step 3: 实现 client.js 修改**

按下列 6 处修改 `lib/client.js`（定位锚点基于当前文件行号）：

**(3a) 词典 — zh 块**：在 `"panel.statsSep": "，"` 行后追加：

```js
      "update.available": "新版本 {latest}（当前 {current}）",
      "update.updating": "正在更新…",
      "update.updated": "已安装 {latest}，重启 dsh web 后生效",
      "update.error": "更新失败：{message}",
      "update.dev": "开发安装（本地链接），请手动更新源码",
      "update.noProfile": "检测到新版本，但无法定位 profile 目录（可在 cordis.patch.yml 配置 update.profileDir）",
      "update.action": "更新",
      "update.retry": "重试",
      "update.close": "关闭提示"
```

**(3b) 词典 — en 块**：在 `"panel.statsSep": ", "` 行后追加：

```js
      "update.available": "New version {latest} (current {current})",
      "update.updating": "Updating…",
      "update.updated": "Installed {latest}; restart dsh web to apply",
      "update.error": "Update failed: {message}",
      "update.dev": "Dev install (local link); update the source manually",
      "update.noProfile": "New version found, but the profile directory could not be located (set update.profileDir in cordis.patch.yml)",
      "update.action": "Update",
      "update.retry": "Retry",
      "update.close": "Dismiss"
```

**(3c) 常量**：在 `const GRAPH_ROUTE = "/git-tree/graph";` 行后追加：

```js
    const UPDATE_STATUS_ROUTE = "/git-tree/update/status";
    const UPDATE_ROUTE = "/git-tree/update";
```

**(3d) `bannerKind` 纯函数**：在 `gitIcon()` 函数定义之前插入：

```js
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
```

**(3e) 面板状态与逻辑**：在 `GitTreePanel` 组件内 `const [notice, setNotice] = useState(null);` 行后追加：

```js
      // Auto-update UI state: server-derived status + local phase machine.
      const [update, setUpdate] = useState(null);
      const [updatePhase, setUpdatePhase] = useState("idle");
      const [updateMsg, setUpdateMsg] = useState("");
      const [updateDismissed, setUpdateDismissed] = useState(false);
```

在 `useEffect(() => { if (open) cacheRef.current.clear(); }, [open]);` 之后追加状态获取 effect：

```js
      // Fetch the update status on mount (so the trigger badge can appear
      // without opening the panel) and again on every open (fresh banner).
      useEffect(() => {
        let cancelled = false;
        fetch(UPDATE_STATUS_ROUTE)
          .then((r) => r.json())
          .then((body) => { if (!cancelled && body?.ok) setUpdate(body); })
          .catch(() => { /* silent: update UI is best-effort */ });
        return () => { cancelled = true; };
      }, [open]);
```

在 `const copyHash = (hash) => { ... };` 之后追加 `runUpdate` 与 `banner` 推导：

```js
      const runUpdate = async () => {
        if (updatePhase === "updating") return;
        setUpdatePhase("updating");
        setUpdateMsg("");
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
          h("span", { className: "dsh-git-tree-update-text" }, text),
          cmd ? h("code", { className: "dsh-git-tree-update-cmd" }, cmd) : null,
          action ?? null,
          h("button", { type: "button", className: "dsh-git-tree-update-close", title: t("update.close"), "aria-label": t("update.close"), onClick: () => setUpdateDismissed(true) }, "✕")
        );
      })();
```

**(3f) 触发按钮角标**：`if (!open) { return h("button", {...}, gitIcon(), wide ? h("span", null, t("button.label")) : null); }` 中，把返回值改为：

```js
      if (!open) {
        return h("button", {
          type: "button",
          className: wide ? "dsh-git-tree-trigger" : "dsh-git-tree-trigger dsh-git-tree-trigger-rail",
          title: t("button.label"),
          "aria-label": t("button.label"),
          onClick: () => {
            setCwd(defaultCwd ?? null);
            setOpen(true);
          }
        },
          gitIcon(),
          wide ? h("span", null, t("button.label")) : null,
          update?.updateAvailable ? h("span", { className: "dsh-git-tree-dot-badge", "aria-hidden": "true" }) : null
        );
      }
```

**(3g) 面板内横幅挂载**：在面板 JSX 中 `h("div", { className: "dsh-git-tree-header" }, ...)` 结束的 `),` 之后、`h("div", { className: "dsh-git-tree-body" }, bodyNode),` 之前，插入：

```js
          bannerNode,
```

**(3h) CSS**：在 `CSS` 数组 `".dsh-git-tree-notice{...}"` 条目后追加：

```js
      ".dsh-git-tree-trigger{position:relative}",
      ".dsh-git-tree-dot-badge{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fb950);border:1px solid var(--dsw-alias-bg-layer-2)}",
      ".dsh-git-tree-update{display:flex;align-items:center;gap:10px;padding:8px 16px;font-size:12px;line-height:18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
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
```

**(3i) exports**：在 `exports.computeSvgWidth = computeSvgWidth;` 行后追加：

```js
    exports.bannerKind = bannerKind;
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/update.test.js`
Expected: PASS（bannerKind 用例通过）。再跑 `node --test` 全量回归，Expected: 全部通过（format.test.js 的 bundle 加载不受影响）。

- [ ] **Step 5: 提交**

```bash
git add lib/client.js test/update.test.js
git commit -m "feat: update badge and banner UI in the git tree panel"
```

---

## Task 7: README 与版本号

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: 更新 README**

在「接口」小节之前插入「自动更新」小节：

```markdown
## 自动更新

自 v0.4.0 起，插件在 `dsh web` 启动时**静默**检查 npm registry 是否有新版本（不阻塞启动、离线时自动降级、不产生任何日志噪音）：

- 侧边栏「Git 树」按钮右上角出现小圆点角标 = 有新版本。
- 打开面板后，头部下方显示细横幅：「新版本 {latest}（当前 {current}）」+「更新」按钮。
- 点击「更新」：插件自动在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`，成功后横幅变为「已安装，重启 dsh web 后生效」；重启后新版本生效。
- 开发安装（`link:`/`file:` spec）不会出现更新按钮，只提示手动更新源码——避免破坏本地链接。
- 横幅可 ✕ 关闭（本次页面会话内不再显示）。

可选配置（`cordis.patch.yml` 该插件条目的 `config`，通常不需要）：当插件无法自动定位 profile 目录时，显式指定：

```yaml
- insert:
    - id: git-tree
      name: '@kulebbb/dsh-git-tree'
      config:
        update:
          profileDir: /absolute/path/to/profile
```
```

在「接口」小节末尾追加：

```markdown
`GET /git-tree/update/status` → `{ok, current, latest, updateAvailable, dev, profileDir, checkError}`（latest 为 null 表示检查失败/离线，UI 静默降级）。

`POST /git-tree/update` → 在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`；成功 `{ok:true, output}`；失败 `{ok:false, error:{code,message}, output}`，code ∈ `dev-install | profile-not-found | already-running | pnpm-error | update-timeout | spawn-error | method-not-allowed`。更新完成后需重启 `dsh web` 生效。
```

- [ ] **Step 2: 更新版本号**

`package.json`：`"version": "0.3.1"` → `"version": "0.4.0"`。

- [ ] **Step 3: 全量回归**

Run: `node --test`
Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add README.md package.json
git commit -m "chore: document auto-update and bump version to 0.4.0"
```

---

## 发布（不自动执行，交给维护者）

打 tag 触发 GitHub Actions 发布到 npm：

```bash
git tag v0.4.0 && git push origin main --tags
```

---

## Self-Review 记录（写计划时已核对）

1. **规格覆盖**：规格中「启动检查」「GET status」「POST update」「profile 定位链」「dev-install 守卫」「非侵入式 UI 四状态 + dev 提示」「测试与发布」均有对应 Task（1-7）；「明确不做」项未出现在计划中。✓
2. **占位符扫描**：无 TBD/TODO；每个代码步骤都有完整代码与预期输出。✓
3. **类型/命名一致性**：`compareVersions`/`isDevSpec`/`findProfileDir`/`readDependencySpec`/`deriveStatus`/`checkRegistryLatest`/`runPnpmUpdate` 在 Task 1-5 与 `lib/index.js` 中的导入名一致；`bannerKind` 返回值集合（`available/updating/updated/error/dev/noProfile`）在 Task 6 的测试、实现、渲染分支三处一致；路由常量 `GRAPH_ROUTE`/`UPDATE_STATUS_ROUTE`/`UPDATE_ROUTE` 在 index.js 导出与 index.test.js 导入一致。✓
4. **已知注意点**：`test/index.test.js` 中「GET status」用例断言依赖当前插件真实版本，已在测试内用 `compareVersions` 做相对断言（Task 5 Step 1 末尾的更正说明）。`ctx.effect` 在 fake ctx 中同步执行并调用 cleanup，启动检查的 async 部分通过短等待完成。✓
