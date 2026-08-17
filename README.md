# @kulebbb/dsh-git-tree

DSH Web GUI 插件：侧边栏底部「Git 树」按钮 → 全屏弹层展示当前工作区（可切换已注册工作区）的 git 提交/分支 DAG 图。每次打开面板时，工作区选择器自动跟随**右侧对话栏当前所在的工作区**（即当前会话所属的项目）；面板打开期间可手动切换其他工作区查看，但关闭后再打开会再次自动跟随激活工作区。

仓库：<https://github.com/kulebbb/dsh-git-tree> · npm：<https://www.npmjs.com/package/@kulebbb/dsh-git-tree>

## 结构

| 文件 | 职责 |
|---|---|
| `lib/index.js` | Node half：在 webserver 注册 `GET /git-tree/graph?cwd=&n=`，执行 git 并返回 JSON |
| `lib/client.js` | Browser half：`sidebar.footer.action` 按钮 + SVG 提交图弹层（`__ModuleLoader__` bundle） |
| `lib/git.js` / `lib/parse.js` | 进程调用与纯解析器 |
| `test/` | node --test 单测 + 夹具仓库脚本 |

## 安装（web profile）

```sh
cd ~/.dsh/profiles/web
pnpm add @kulebbb/dsh-git-tree
```

在 `cordis.patch.yml` 的 insert 列表追加：

```yaml
- insert:
    - id: git-tree
      name: '@kulebbb/dsh-git-tree'
```

然后重启 `dsh web`。

也可以直接从 GitHub 安装（不经过 npm registry）：`pnpm add github:kulebbb/dsh-git-tree`。

> 本插件无运行时第三方依赖（`@deepseek-ai/*` 运行库由 DSH 安装自带），安装后即可使用。

## 🤖 Agent 一键安装

把下面**任一段**提示词（中文或英文）复制发给你的 AI 助手（DeepSeek / Claude / Cursor 等），它会自动完成安装。如需同时安装 [dsh-vision](https://github.com/kulebbb/dsh-vision)，把两个插件的提示词一起发给助手，它会依次完成。

**中文版**

```text
你是一个安装助手。请帮我把 DSH（DeepSeek Harness）插件 @kulebbb/dsh-git-tree 安装到我的 web profile 中。

【背景】
@kulebbb/dsh-git-tree 是 DSH Web GUI 插件：侧边栏底部的「Git 树」按钮，点击后全屏展示当前工作区的 git 提交/分支图。无第三方运行时依赖。

【前置检查】
1. 运行 dsh --version 确认 DSH 已安装；若命令不存在，告诉我"未检测到 dsh，需要先安装 DSH"并停止。
2. 确认目录 ~/.dsh/profiles/web（或 $DSH_HOME/profiles/web）存在；若不存在，先运行 dsh web 完成首次初始化。

【安装步骤】
1. cd ~/.dsh/profiles/web
2. 运行：pnpm add @kulebbb/dsh-git-tree
3. 打开（或创建）cordis.patch.yml，在顶层 insert 列表【末尾追加】以下条目。注意：片段中的 - insert: 是文件的顶层列表项，写入时必须顶格（去掉每行前导空格），片段内部缩进保持不变；不要覆盖或改动其他已有条目；若已存在 id 为 git-tree 的条目，只更新它的 name：
   - insert:
       - id: git-tree
         name: '@kulebbb/dsh-git-tree'
4. 重启 dsh web（若正在运行）。

【验证】
- 运行 dsh --profile web --dump-config，确认输出包含 id: git-tree 与 name: '@kulebbb/dsh-git-tree'。
- 重启后：侧边栏底部出现「Git 树」按钮，点击弹出当前工作区的提交/分支图。

【异常处理】
- 任何命令报错，把完整错误信息原样转达给我，不要擅自修改配置或改用其他方案。
- 若 pnpm 报 peer 依赖相关错误（如 ERR_PNPM_FETCH_404），可尝试：pnpm add @kulebbb/dsh-git-tree --config.auto-install-peers=false，然后重试；正常情况下不需要。
- 若你没有执行命令的能力，请把上述命令与 yaml 片段整理成一份手动操作清单交给我。
- 需要我确认的信息先问我，再继续。
```

**English**

```text
You are an installation assistant. Install the DSH (DeepSeek Harness) plugin @kulebbb/dsh-git-tree into my web profile.

[Context]
@kulebbb/dsh-git-tree is a DSH Web GUI plugin: a "Git tree" button at the bottom of the sidebar that opens a fullscreen commit/branch graph of the current workspace. It has no third-party runtime dependencies.

[Preflight]
1. Run dsh --version to confirm DSH is installed; if the command is missing, tell me "dsh is not installed" and stop.
2. Confirm the directory ~/.dsh/profiles/web (or $DSH_HOME/profiles/web) exists; if not, run dsh web once to initialize it.

[Install]
1. cd ~/.dsh/profiles/web
2. Run: pnpm add @kulebbb/dsh-git-tree
3. Open (or create) cordis.patch.yml and APPEND the following entry to the top-level insert list. Note: - insert: is a top-level list item of the file — write it flush-left (strip the leading whitespace from every line) while keeping the inner indentation as-is; do not overwrite or modify other entries. If an entry with id git-tree already exists, update only its name:
   - insert:
       - id: git-tree
         name: '@kulebbb/dsh-git-tree'
4. Restart dsh web (if it is running).

[Verify]
- Run dsh --profile web --dump-config and confirm the output contains id: git-tree and name: '@kulebbb/dsh-git-tree'.
- After restart: a "Git tree" button appears at the bottom of the sidebar; clicking it opens the commit/branch graph of the current workspace.

[On errors]
- If any command fails, relay the full error to me verbatim; do not improvise config changes or fall back to other approaches.
- If pnpm reports peer-dependency errors (e.g. ERR_PNPM_FETCH_404), retry with: pnpm add @kulebbb/dsh-git-tree --config.auto-install-peers=false (normally not needed).
- If you cannot run commands, hand me a step-by-step manual checklist instead.
- Ask me before continuing whenever you need information I have not provided.
```

## 自动更新

自 v0.4.0 起，插件在 `dsh web` 启动时**静默**检查 npm registry 是否有新版本（不阻塞启动、离线时自动降级、不产生日志噪音）：

- 侧边栏「Git 树」按钮右上角出现小圆点角标 = 有新版本。
- 打开面板后，头部下方显示细横幅：「新版本 {latest}（当前 {current}）」+「更新」按钮。
- 点击「更新」：插件自动在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`，成功后横幅变为「已安装，重启 dsh web 后生效」；重启后新版本生效。
- 更新失败时横幅显示错误信息与可折叠的 pnpm 输出，可重试。
- 开发安装（`link:`/`file:` spec）不会出现更新按钮，只提示手动更新源码——避免破坏本地链接。
- 横幅可 ✕ 关闭（本次页面会话内不再显示，角标同步消失）。

可选配置（`cordis.patch.yml` 该插件条目的 `config`，通常不需要）：当插件无法自动定位 profile 目录时，显式指定：

```yaml
- insert:
    - id: git-tree
      name: '@kulebbb/dsh-git-tree'
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

`GET /git-tree/update/status` → `{ok, current, latest, updateAvailable, dev, profileDir, checkError}`。`latest` 为 `null` 表示检查失败/离线（UI 静默降级）；`updateAvailable` 仅在「存在更新版本 + 非开发安装 + profile 可定位」时为其。

`POST /git-tree/update` → 在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`；成功 `{ok:true, output}`；失败 `{ok:false, error:{code, message}, output}`（`output` 为截断的 pnpm 输出），code ∈ `dev-install | profile-not-found | already-running | pnpm-error | update-timeout | spawn-error | method-not-allowed`。更新完成后需重启 `dsh web` 生效。

## 安全说明

该路由接受任意 `cwd` 并在其上执行 git，属于本机开发工具。请保持 web server 绑定在回环地址（默认 `127.0.0.1`）；不要用 `--host 0.0.0.0` 暴露到网络。

## 测试

```sh
cd plugins/dsh-git-tree && node --test
```

## License

[MIT](LICENSE)
