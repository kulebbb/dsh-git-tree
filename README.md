# @kulebbb/dsh-git-tree

DSH Web GUI 插件（Web 与桌面端通用）：侧边栏底部「Git 树」按钮 → 全屏弹层展示当前工作区（可切换已注册工作区）的 git 提交/分支 DAG 图。每次打开面板时，工作区选择器自动跟随**右侧对话栏当前所在的工作区**（即当前会话所属的项目）；面板打开期间可手动切换其他工作区查看，但关闭后再打开会再次自动跟随激活工作区。

仓库：<https://github.com/kulebbb/dsh-git-tree> · npm：<https://www.npmjs.com/package/@kulebbb/dsh-git-tree>

自 v0.5.0 起本包是一个 **bundle（组合包）**：`dsh.bundle.patch` 指向自带的 `cordis.patch.yml`，因此可以被 DSH 桌面端和 Web 的「插件」页直接安装、启用和卸载，不再需要手工编辑 profile 的 `cordis.patch.yml`。

## 结构

| 文件 | 职责 |
|---|---|
| `lib/index.js` | Node half：在 webserver 注册 `GET /git-tree/graph?cwd=&n=`、更新状态与更新路由，执行 git 并返回 JSON |
| `lib/client.js` | Browser half：`sidebar.footer.action` 按钮 + SVG 提交图弹层（`__ModuleLoader__` bundle） |
| `lib/git.js` / `lib/parse.js` | 进程调用与纯解析器 |
| `cordis.patch.yml` | bundle patch：把本包插入为 `git-tree` 加载项 |
| `locale/*.json` / `icon.svg` | 插件页展示用的标题、描述与图标 |
| `test/` | node --test 单测 + 夹具仓库脚本 |

## 安装

### 桌面端（DeepSeek Harness.app）

1. 侧边栏打开「插件」页 → 安装，填入下面任一地址：
   - npm：`@kulebbb/dsh-git-tree`
   - GitHub：`https://github.com/kulebbb/dsh-git-tree`（改动未发版时用这个）
2. 安装完成后按提示**重启 DeepSeek Harness**（桌面端没有 HMR，重启后新插件才生效）。
3. 侧边栏底部出现「Git 树」按钮。

也可以用 agent 的 `plugin_manager` 工具安装：`action: install_bundle`，`target` 填上面的地址。

> 桌面端的 profile 由 App 独占管理，请不要自己往 `~/.dsh/profiles/desktop` 里 `pnpm add`，也别用 CLI 启停它；更新和卸载都走「插件」页。

### Web（`dsh web`）

同样在侧边栏「插件」页安装；若 profile 开了 HMR，安装后即时生效，否则重启 `dsh web`。

### 脚本化安装（无界面 / CI）

```sh
cd ~/.dsh/profiles/<profile>      # 桌面端不要这样做
pnpm add @kulebbb/dsh-git-tree
```

然后把包名追加到该 profile `package.json` 的 `dsh.profile.bundles` 列表（顺序即配置优先级，追加到末尾）：

```json
{
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@kulebbb/dsh-git-tree"] } }
}
```

重启 `dsh web`。不需要再往 `cordis.patch.yml` 写任何东西——bundle patch 已经带了 `git-tree` 这一行。

## 🤖 Agent 一键安装

把下面**任一段**提示词（中文或英文）复制发给你的 AI 助手（DeepSeek / Claude / Cursor 等），它会自动完成安装。如需同时安装 [dsh-vision](https://github.com/kulebbb/dsh-vision)，把两个插件的提示词一起发给助手，它会依次完成。

**中文版**

```text
你是一个安装助手。请帮我把 DSH（DeepSeek Harness）插件 @kulebbb/dsh-git-tree 安装到当前 profile（桌面端是 desktop，命令行是 web）。

【背景】
@kulebbb/dsh-git-tree 是一个 bundle：自带 cordis.patch.yml，会插入一个侧边栏底部的「Git 树」按钮，点击后全屏展示当前工作区的 git 提交/分支图。无第三方运行时依赖。

【安装步骤】
1. 优先使用 plugin_manager 工具的 install_bundle，target 填 @kulebbb/dsh-git-tree（未发版时填 https://github.com/kulebbb/dsh-git-tree）。
2. 如果没有 plugin_manager 工具或调用被拒绝，告诉我用侧边栏「插件」页安装，并说明步骤。
3. 不要手工编辑 profile 的 package.json 或 cordis.patch.yml，也不要在 profile 目录里跑 pnpm——桌面端的 profile 由 App 独占管理。

【验证】
- 安装结果里 application 为 applied 或 restart-required；restart-required 时需要重启 DSH（桌面端重启 App，命令行重启 dsh web）。
- 重启后：侧边栏底部出现「Git 树」按钮，点击弹出当前工作区的提交/分支图。

【异常处理】
- 任何错误把完整信息原样转达给我，不要自行改配置或换方案。
- 需要我确认的信息先问我，再继续。
```

**English**

```text
You are an installation assistant. Install the DSH (DeepSeek Harness) plugin @kulebbb/dsh-git-tree into the current profile (desktop for the app, web for the CLI).

[Context]
@kulebbb/dsh-git-tree is a bundle: it ships its own cordis.patch.yml and inserts a "Git tree" button at the bottom of the sidebar that opens a fullscreen commit/branch graph of the current workspace. No third-party runtime dependencies.

[Install]
1. Prefer the plugin_manager tool with action install_bundle and target @kulebbb/dsh-git-tree (use https://github.com/kulebbb/dsh-git-tree for unreleased changes).
2. If plugin_manager is unavailable or refused, tell me to install it from the sidebar Plugins page and give the steps.
3. Do not hand-edit the profile's package.json or cordis.patch.yml, and do not run pnpm in the profile directory — the desktop app owns its profile.

[Verify]
- The install result reports application applied or restart-required; when it is restart-required, restart DSH (restart the app on desktop, restart dsh web with the CLI).
- After restart: a "Git tree" button appears at the bottom of the sidebar; clicking it opens the commit/branch graph of the current workspace.

[On errors]
- Relay the full error verbatim; do not improvise config changes or fall back to other approaches.
- Ask me before continuing whenever you need information I have not provided.
```

## 自动更新

自 v0.4.0 起，插件在启动时**静默**检查 npm registry 是否有新版本（不阻塞启动、离线时自动降级、不产生日志噪音）：

- 侧边栏「Git 树」按钮右上角出现小圆点角标 = 有新版本。
- 打开面板后，头部下方显示细横幅：「新版本 {latest}（当前 {current}）」+「更新」按钮。
- 点击「更新」：插件自动在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`，成功后横幅变为「已安装，重启 dsh web 后生效」；重启后新版本生效。
- 更新失败时横幅显示错误信息与可折叠的 pnpm 输出，可重试。
- 开发安装（`link:`/`file:` spec）不会出现更新按钮，只提示手动更新源码——避免破坏本地链接。
- **桌面端只提示、不提供按钮**：桌面 profile 由 App 独占管理，插件会在横幅里显示「新版本 {latest}（当前 {current}），请在 DSH 侧边栏「插件」页更新」，更新动作交给 App；对 `/git-tree/update` 的调用会返回 `409 desktop-managed`。
- 横幅可 ✕ 关闭（本次页面会话内不再显示，角标同步消失）。

可选配置（`cordis.patch.yml` 该插件条目的 `config`，通常不需要）：当插件无法自动定位 profile 目录时，显式指定：

```yaml
- id: git-tree
  config:
    update:
      profileDir: /absolute/path/to/profile
```

## 接口

`GET /git-tree/graph?cwd=<绝对目录>&n=<1..2000>` → `{ok, repo, commits, refs}`；错误负载 `{ok:false, error:{code, message}}`，code ∈ `invalid-cwd | not-a-git-repo | git-unavailable | git-timeout | git-error | internal`。`not-a-git-repo` 返回 `200` + `ok:false`（软错误，UI 据此显示提示）；`invalid-cwd` 返回 `400`；其余错误返回 `500`。

commits[].date 为作者时间（ISO 8601，%aI），前端在每行提交说明下方第二行按浏览器本地时区展示为 YYYY-MM-DD HH:mm。commits[].shortHash 为 7 位短哈希；每行提交说明末尾以 GitHub 风格弱化色展示（如 `feat: xxx (9259220)`），点击该行仍复制完整哈希。

### 超长文案与横向滚动

提交行文本按像素宽度测量后渲染，**超长 subject 自动以 "…" 截断**，SVG 宽度封顶为面板可视内容宽度，**任何情况下都不会出现横向滚动条**（长文案只截断，不撑宽）。悬停任意提交行时弹出自定义 tooltip，展示**完整提交信息**（完整 subject + 提交正文 body + 哈希 + 作者 + 本地时间 + refs）与**代码变动量**（`1 file changed, 24 insertions(+), 16 deletions(-)` 风格，来自 `git log --shortstat`；无变动的 merge 提交不显示该行）。

### 本地 / 云端 HEAD

面板头部常驻状态条展示：

- `本地 <branch> → <7位哈希>`（HEAD 游离时显示「本地 HEAD（游离）→ <哈希>」）
- `云端 <upstream> → <7位哈希> ↑n ↓m`：云端取当前分支的 `@{upstream}`，未配置上游时回退到 `origin/<分支名>`，均不存在时显示「云端：未推送」；↑n ↓m 为领先/落后提交数（`git rev-list --left-right --count HEAD...<ref>`），两端同步时省略。

图上同步标记：本地 HEAD 提交圆点带绿色实线环 + 「本地」角标，云端 HEAD 提交圆点带蓝色虚线环 + 「云端」角标（本地与云端指向同一提交时两个角标并排显示）。

payload 结构：`commits[].body`（提交正文，可能为空字符串）、`commits[].stats`（`{files, insertions, deletions}`，无变动的提交为 `null`）、`repo.localHead`（`{hash, branch|null}`）、`repo.remoteHead`（`{ref, hash, ahead, behind}|null`）。

`GET /git-tree/update/status` → `{ok, current, latest, updateAvailable, newer, desktop, dev, profileDir, checkError}`。`latest` 为 `null` 表示检查失败/离线（UI 静默降级）；`newer` 表示 registry 版本确实更高；`desktop` 表示当前 profile 由桌面端 App 管理；`updateAvailable` 仅在「有新版本 + 非开发安装 + profile 可定位 + 非桌面端」时为真。

`POST /git-tree/update` → 在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`；成功 `{ok:true, output}`；失败 `{ok:false, error:{code, message}, output}`（`output` 为截断的 pnpm 输出），code ∈ `dev-install | profile-not-found | desktop-managed | already-running | pnpm-error | update-timeout | spawn-error | method-not-allowed`。更新完成后需重启 DSH 生效。

## 安全说明

该路由接受任意 `cwd` 并在其上执行 git，属于本机开发工具；更新路由（`/git-tree/update`）同样会在 profile 目录执行 pnpm（桌面端被拒绝，返回 `desktop-managed`），安全面同类。请保持 web server 绑定在回环地址（默认 `127.0.0.1`）；不要用 `--host 0.0.0.0` 暴露到网络。

## 测试

```sh
cd plugins/dsh-git-tree && node --test
```

## License

[MIT](LICENSE)
