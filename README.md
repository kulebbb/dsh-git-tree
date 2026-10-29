# @kulebbb/dsh-git-tree

DSH 桌面端（DeepSeek Harness.app）右侧栏插件：在右侧栏的标签页里用图形展示**当前会话所属项目**的 git 提交/分支 DAG。它和文件、浏览器、终端是同一套 tab 机制——展开右侧栏 → 点「＋」打开开始页 → 点「Git 提交图」卡片，或按 `⌘⇧G`（Windows / Linux 为 `Ctrl+Shift+G`）。

项目不需要选择：面板直接跟随会话的工作目录，切换会话即切换项目；每个会话的右侧栏布局相互独立（在哪个会话打开过，就在哪个会话里出现）。

> **平台支持**：自 **v0.7.0** 起只支持 **DSH 桌面端**，不再支持 `dsh web`。需要带右侧栏的 DSH 版本（0.2.x）。

仓库：<https://github.com/kulebbb/dsh-git-tree> · npm：<https://www.npmjs.com/package/@kulebbb/dsh-git-tree>

本包是一个 **bundle（组合包）**：`dsh.bundle.patch` 指向自带的 `cordis.patch.yml`，因此可以被 DSH 桌面端的「插件」页直接安装、启用和卸载，不需要手工编辑 profile 的 `cordis.patch.yml`。

版本脉络：v0.5.0 起改为 bundle 分发；v0.6.0 起入口从「左侧栏按钮 + 全屏弹层」改为**右侧栏 tab 类型**并删除工作区选择器；v0.7.0 起只保留桌面端，移除面板内的一键更新与 `POST /git-tree/update`。取舍与影响见 `docs/decisions/2026-10-29-desktop-only.md`。

## 结构

| 文件 | 职责 |
|---|---|
| `lib/index.js` | Node half：在 webserver 注册 `GET /git-tree/graph?cwd=&n=` 与 `GET /git-tree/update/status`，执行 git 并返回 JSON（只读，不写 profile） |
| `lib/client.js` | Browser half：注册右侧栏 tab 类型（`git-tree`）+ 开始页卡片 + SVG 提交图（`__ModuleLoader__` bundle） |
| `lib/git.js` / `lib/parse.js` | 进程调用与纯解析器 |
| `lib/update.js` | 版本比较与 npm registry 最新版本查询 |
| `cordis.patch.yml` | bundle patch：把本包插入为 `git-tree` 加载项 |
| `locale/*.json` / `icon.svg` | 插件页展示用的标题、描述与图标 |
| `docs/decisions/` | 架构决策记录（含「只支持桌面端」的决定） |
| `test/` | node --test 单测 + 夹具仓库脚本（仅仓库，不随 npm 包发布） |

## 安装（桌面端）

1. 侧边栏打开「插件」页 → 安装，填入下面任一地址：
   - GitHub：`https://github.com/kulebbb/dsh-git-tree`（推荐；改动未发版时也用这个）
   - npm：`@kulebbb/dsh-git-tree`（**0.7.0 起**为桌面端专用版本；0.4.0 及更早会被插件页以「不是组合包」拒绝）
2. 安装完成后按提示**重启 DeepSeek Harness**（桌面端没有 HMR，重启后新插件才生效）。
3. 重启后展开右侧栏 → 点「＋」打开开始页 → 点「Git 提交图」卡片。

也可以用 agent 的 `plugin_manager` 工具安装：`action: install_bundle`，`target` 填上面的地址。

**更新与卸载**：桌面端没有「更新」按钮，更新＝在「插件」页重新安装新版本（插件管理器会覆盖安装并提示重启）；卸载也在「插件」页，若提示需要先停止 DSH，按提示退出 App 后再操作。

> 桌面端的 profile 由 App 独占管理，请不要自己往 `~/.dsh/profiles/desktop` 里 `pnpm add`，也别用 CLI 启停它；安装、更新、卸载都走「插件」页。

## 从旧版本升级

- **v0.4.0（手工改 patch 的装法）**：先删掉旧的那条 `insert` 行，再在「插件」页安装 0.7.0。否则同一 id 会有两条来源（profile patch 与 bundle 各一条）：启动不会失败，但插件页的启用/禁用会归因到错误的层，卸载时还可能报「组合包正在使用」。

  ```yaml
  # ~/.dsh/profiles/desktop/cordis.patch.yml —— 删除这一段
  - insert:
      - id: git-tree
        name: '@kulebbb/dsh-git-tree'
  ```

  装完在「插件」页的插件列表里确认只有一条 Git 树条目即可（桌面端 profile 不能对 CLI 执行 `--dump-config`）。

- **v0.5.0 / 0.6.0**：按「插件」页正常重装即可，无额外手工步骤。
- **之前在 `dsh web` 的 profile 里装过**：0.7.0 起不再支持 Web，请把该 profile 里的本插件移除：`pnpm remove @kulebbb/dsh-git-tree`；若当初按 v0.4.0 老装法，再删掉该 profile `cordis.patch.yml` 里的 `insert git-tree` 段；若当初按 v0.5.0+ bundle 装法则把包名从 `dsh.profile.bundles` 列表里去掉。
- v0.4.0 自带的「更新」按钮只会把新版本装成普通依赖、不会写进 `dsh.profile.bundles`——升级请按本节走，不要点旧版的更新按钮。

## 🤖 Agent 一键安装

把下面**任一段**提示词（中文或英文）复制发给你的 AI 助手（DeepSeek / Claude / Cursor 等），它会自动完成安装。如需同时安装 [dsh-vision](https://github.com/kulebbb/dsh-vision)，把两个插件的提示词一起发给助手，它会依次完成。

**中文版**

```text
你是一个安装助手。请帮我把 DSH（DeepSeek Harness）桌面端插件 @kulebbb/dsh-git-tree 安装到桌面端 profile（desktop）。

【背景】
@kulebbb/dsh-git-tree 是一个 bundle：自带 cordis.patch.yml，会在 DSH 右侧栏注册一个「Git 提交图」标签页（与文件、浏览器、终端同级），打开后展示当前会话所属项目的 git 提交/分支图。无第三方运行时依赖，仅支持 DSH 桌面端（不支持 dsh web）。

【安装步骤】
1. 先检查桌面端 profile 的 cordis.patch.yml：如果里面已有 id 为 git-tree 的插入行（v0.4.0 的老装法），先删掉那段再继续，否则同一 id 会有两条来源。
2. 优先使用 plugin_manager 工具的 install_bundle，target 填 @kulebbb/dsh-git-tree（未发版时填 https://github.com/kulebbb/dsh-git-tree）。
3. 如果没有 plugin_manager 工具或调用被拒绝，告诉我用侧边栏「插件」页安装，并说明步骤。
4. 不要手工编辑桌面端 profile 的 package.json 或 cordis.patch.yml，也不要在 profile 目录里跑 pnpm——桌面端的 profile 由 App 独占管理。

【验证】
- 安装结果里 application 为 applied 或 restart-required；restart-required 时需要重启 DeepSeek Harness。
- 重启后：展开右侧栏 → 点「＋」→ 点「Git 提交图」卡片，面板展示当前会话项目的提交/分支图。

【异常处理】
- 任何错误把完整信息原样转达给我，不要自行改配置或换方案。
- 需要我确认的信息先问我，再继续。
```

**English**

```text
You are an installation assistant. Install the DSH (DeepSeek Harness) desktop plugin @kulebbb/dsh-git-tree into the desktop profile.

[Context]
@kulebbb/dsh-git-tree is a bundle: it ships its own cordis.patch.yml and registers a "Git commit graph" tab in the DSH right sidebar (alongside Files, Browser and Terminal) that renders the commit/branch graph of the current session's project. No third-party runtime dependencies. Desktop app only — `dsh web` is not supported.

[Install]
1. First check the desktop profile's cordis.patch.yml: if it already has an insert row with id git-tree (the v0.4.0 setup), delete that block first — otherwise the same id comes from two layers.
2. Prefer the plugin_manager tool with action install_bundle and target @kulebbb/dsh-git-tree (use https://github.com/kulebbb/dsh-git-tree for unreleased changes).
3. If plugin_manager is unavailable or refused, tell me to install it from the sidebar Plugins page and give the steps.
4. Do not hand-edit the desktop profile's package.json or cordis.patch.yml, and do not run pnpm in the profile directory — the desktop app owns its profile.

[Verify]
- The install result reports application applied or restart-required; when it is restart-required, restart DeepSeek Harness.
- After restart: expand the right sidebar, click "+", and choose the "Git commit graph" card; the panel shows the current session project's commit/branch graph.

[On errors]
- Relay the full error verbatim; do not improvise config changes or fall back to other approaches.
- Ask me before continuing whenever you need information I have not provided.
```

## 新版本提示

插件启动时**静默**检查 npm registry 是否有新版本（不阻塞启动、离线时自动降级、不产生日志噪音）：

- 打开 Git 面板后，状态行下方显示细横幅：「新版本 {latest}（当前 {current}），请在 DSH 侧边栏「插件」页重装以更新」。
- 桌面端不提供「更新」按钮：桌面 profile 由 App 独占管理，安装/更新都交给「插件」页（对非官方插件是「重装新版本」）。
- 横幅可 ✕ 关闭；关闭状态只保留在当前面板实例内，面板重新挂载时会重新检查。

## 接口

`GET /git-tree/graph?cwd=<绝对目录>&n=<1..2000>` → `{ok, repo, commits, refs}`；错误负载 `{ok:false, error:{code, message}}`，code ∈ `invalid-cwd | not-a-git-repo | git-unavailable | git-timeout | git-error | internal`。`not-a-git-repo` 返回 `200` + `ok:false`（软错误，UI 据此显示提示）；`invalid-cwd` 返回 `400`；其余错误返回 `500`。

commits[].date 为作者时间（ISO 8601，%aI），前端在每行提交说明下方第二行按浏览器本地时区展示为 YYYY-MM-DD HH:mm。commits[].shortHash 为 7 位短哈希；每行提交说明末尾以 GitHub 风格弱化色展示（如 `feat: xxx (9259220)`），点击该行仍复制完整哈希。

### 超长文案与横向滚动

提交行文本按像素宽度测量后渲染，**超长 subject 自动以 "…" 截断**，SVG 宽度封顶为面板可视内容宽度，**任何情况下都不会出现横向滚动条**（长文案只截断，不撑宽）。悬停任意提交行时弹出自定义 tooltip，展示**完整提交信息**（完整 subject + 提交正文 body + 哈希 + 作者 + 本地时间 + refs）与**代码变动量**（`1 file changed, 24 insertions(+), 16 deletions(-)` 风格，来自 `git log --shortstat`；无变动的 merge 提交不显示该行）。

### 状态条与本地 / 云端 HEAD

面板顶部常驻一行状态条：

- 项目名（当前会话工作目录的目录名，悬停可看完整路径）
- `⑂ <分支名>`：HEAD 游离时显示「游离」
- `↑n ↓m`：领先/落后提交数（`git rev-list --left-right --count HEAD...<ref>`），云端取当前分支的 `@{upstream}`，未配置时回退 `origin/<分支名>`，两端同步时省略
- 「本地 <7位哈希>」「云端 <7位哈希>」两个小色块；没有上游时云端显示「未推送」
- 右侧两个按钮：搜索（展开一行过滤框，Esc 收起）与刷新

图上同步标记：本地 HEAD 提交圆点是**绿色空心环**，云端 HEAD 提交圆点是蓝色虚线环；宽栏时行尾追加「本地」「云端」小角标，窄栏隐藏（状态条已给出两份哈希）。

payload 结构：`commits[].body`（提交正文，可能为空字符串）、`commits[].stats`（`{files, insertions, deletions}`，无变动的提交为 `null`）、`repo.localHead`（`{hash, branch|null}`）、`repo.remoteHead`（`{ref, hash, ahead, behind}|null`）。

`GET /git-tree/update/status` → `{ok, current, latest, newer, checkError}`。`latest` 为 `null` 表示检查失败/离线（UI 静默降级）；`newer` 表示 registry 版本确实高于当前版本。非 GET 方法返回 `405` + `error.code = method-not-allowed`。插件不提供任何安装/更新写接口。

## 安全说明

该路由接受任意 `cwd` 并在其上执行 git，属于本机开发工具。请保持 web server 绑定在回环地址（默认 `127.0.0.1`）；不要用 `--host 0.0.0.0` 暴露到网络。

## 测试

```sh
node --test          # 在仓库根目录；零依赖，用系统 node 运行即可
```

## License

[MIT](LICENSE)
