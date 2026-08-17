# 插件自动更新（方案 A）设计文档

日期：2026-08-17 · 状态：已批准（会话内确认） · 涉及版本：≥ 0.4.0

## 背景与目标

`@kulebbb/dsh-git-tree` 当前没有任何更新机制：用户安装的是 npm 上的固定版本，升级需要手动执行
`cd ~/.dsh/profiles/web && pnpm add @kulebbb/dsh-git-tree@latest` 再重启 `dsh web`。
DSH 本身（`dsh plugin` 命令）只是 pnpm 的转发器，无自动更新能力，因此该功能由插件自身实现。

目标（用户已确认）：

- 启动 `dsh web` 时静默检查 npm registry 是否有新版本（不阻塞启动、失败静默）。
- 有新版本时，在 Git 树面板内以非侵入式横幅提示，并提供「一键更新」按钮。
- 点击后插件在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`，成功后提示重启生效。
- 不做自动重启（DSH 无 restart 命令，插件运行在 web server 进程内，无法安全自我重启）。

明确不做（YAGNI）：周期检查、手动「检查更新」按钮、自动重启、扩展到其他插件。

## 总体结构

新增纯逻辑模块 `lib/update.js`（版本比较、profile 定位、状态推导，全部可单测），在 `lib/index.js`
挂两个新路由，在 `lib/client.js` 增加角标与横幅 UI。无新增运行时依赖（使用 Node 22 内置 `fetch` 与
`AbortSignal.timeout` 做 registry 检查；`compareVersions` 为自写纯函数）。

```
lib/update.js       新增：纯函数（compareVersions / isDevSpec / resolveProfileDir / deriveStatus）
lib/index.js        修改：启动异步检查 + GET /git-tree/update/status + POST /git-tree/update
lib/client.js       修改：按钮角标 + 面板横幅（四状态）+ 中英词典
test/update.test.js 新增：纯函数单测
```

## Node 半部：启动时版本检查

- `dsh web` 启动时，插件异步（不阻塞启动、失败静默）请求
  `https://registry.npmjs.org/@kulebbb%2Fdsh-git-tree/latest`，5 秒超时（`AbortSignal.timeout`），
  解析 `{ version }` 得到最新版本。
- 与自身安装版本比较：自身版本读取插件自身 `package.json`（相对 `import.meta.url`）。
- 检查结果缓存在模块内存中，供新路由读取：
  - `GET /git-tree/update/status` → `{ ok, current, latest, updateAvailable, dev, profileDir, checkError }`
    - `current`：当前安装版本（字符串）。
    - `latest`：registry 最新版本；检查失败或离线时为 `null`，并置 `checkError`（仅调试用，UI 不展示）。
    - `updateAvailable`：`latest` 存在且 `compareVersions(latest, current) > 0` 且非开发安装。
    - `dev`：开发安装（link/file）标志。
    - `profileDir`：定位到的 profile 目录，或 `null`。
- 状态为一次性计算并缓存；页面打开时客户端拉取一次。

## Node 半部：一键更新

- `POST /git-tree/update` → 在 profile 目录执行
  `spawn("pnpm", ["add", "@kulebbb/dsh-git-tree@latest"], { cwd: profileDir, env: { ...process.env, CI: "1" } })`，
  120 秒超时，捕获 stdout/stderr（截断 64KB）。
- 守卫（返回 409 + 错误码）：
  - `dev-install`：开发安装（link/file），拒绝更新避免破坏本地链接。
  - `profile-not-found`：无法定位 profile 目录。
  - `already-running`：已有更新请求在执行中（内存标志位）。
- 成功：返回 `{ ok: true, output }`，并把内存缓存中的 `current` 乐观更新为新版本
  （运行中的旧代码不受影响；重启后读取真实版本自然收敛）。客户端横幅进入「已更新」状态。
- 失败（pnpm 非零退出 / 超时 / spawn 错误）：返回 `{ ok: false, code, message, output }`，
  完整输出带给 UI 显示，横幅进入「失败」状态可重试。
- 安全说明不变：服务仅绑定回环地址；更新路由同 graph 路由一样仅为本机开发工具服务。

## Profile 目录定位与开发安装检测

定位链（依次尝试，命中即用）：

1. 可选配置 `config.update.profileDir`（显式指定，最高优先级；cordis.patch.yml 中配置）。
   `lib/index.js` 将新增 `Config` schema（schemastery 可选对象，仅 `update.profileDir` 一个可选字段），
   保持插件零配置即可用。
2. 从插件自身安装路径上溯：`fileURLToPath(import.meta.url)` → 逐级上溯，
   找到形如 `<X>/node_modules/@kulebbb/dsh-git-tree` 的祖先目录 → profile = `X`
   （即该 `node_modules` 的父目录）。registry 安装天然命中。
3. `$DSH_HOME/profiles/web`（`DSH_HOME` 环境变量或默认 `~/.dsh` 兜底）。

开发安装检测：读 profile 的 `package.json` 的 `dependencies`，若 `@kulebbb/dsh-git-tree` 的 spec
以 `link:` 或 `file:` 开头 → `dev: true`（如用户开发 profile 中的
`"link:/Users/zhaoliang/Documents/coding/deepseek-harness/plugins/dsh-git-tree"`）。

全部失败 → `profileDir: null` 并带原因；UI 只提示不提供按钮。

## 浏览器半部：非侵入式 UI

- 侧边栏「Git 树」按钮右上角小圆点角标（仅 `updateAvailable` 时显示，使用 DSH 状态色 token）。
- 面板头部下方细横幅（可 ✕ 关闭，关闭后本次会话内不再显示），四种状态：
  - 可更新：「新版本 {latest}（当前 {current}）」+「更新」按钮。
  - 更新中：按钮禁用 + 文案。
  - 已更新：「已安装 {latest}，重启 dsh web 后生效」+ 重启命令（`dsh web`，等宽字体展示）。
  - 失败：「更新失败：{message}」+ 重试 + 截断输出。
- 开发安装且有新版 → 横幅只提示「开发安装（本地链接），请手动更新源码」，无按钮。
- 中英双语词典各新增 ~8 个 key；样式沿用现有 DSH design token
  （`--dsw-alias-*`、`--ds-transition-duration-fast`、`--ds-ease-in-out`）。
- 横幅组件独立于 git 图渲染逻辑，位于面板 header 与 body 之间。

## 测试与发布

- 新增 `test/update.test.js`（沿用 `node --test` 约定）：
  - `compareVersions`：常规递增、预发布（`1.0.0-beta.1 < 1.0.0`）、不同段长（`1.0 < 1.0.0`）、相等、非法输入。
  - `isDevSpec`：`link:`/`file:` 为真；registry 语义版本 / GitHub URL / 裸版本为假。
  - `resolveProfileDir`：假路径与假 env 组合（配置项 > 自身路径上溯 > DSH_HOME 兜底）。
  - `deriveStatus`：各状态组合（有更新 / 无更新 / 检查失败 / 开发安装 / profile 缺失）。
- 现有测试不动，`node --test` 全绿。
- 发布流程（tag push → npm publish）不变；自动更新只是消费 registry。

## 错误码汇总

| code | HTTP | 场景 |
|---|---|---|
| `dev-install` | 409 | 开发安装（link/file），拒绝更新 |
| `profile-not-found` | 409 | 无法定位 profile 目录 |
| `already-running` | 409 | 已有更新请求在执行 |
| `registry-unreachable` | 200（status 内 checkError） | 启动时 registry 检查失败，静默降级 |

## 风险与对策

- 更新时 pnpm 交互卡死：`CI=1` + 120s 超时 + 输出截断。
- 运行中代码不受影响：pnpm 只替换 node_modules 文件，已加载模块不变；重启后新版本生效。
- link/file 开发安装被误更新：`dev-install` 守卫拒绝。
- registry 检查失败：静默降级，`latest: null`，UI 不展示横幅，不影响任何现有功能。
