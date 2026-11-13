中文 · [English](api.en.md)

返回 [README](../README.md)。

## 接口

`GET /git-tree/graph?session=<会话 id>&cwd=<工作区内目录>&n=<1..2000>` → `{ok, repo, commits, refs}`；错误负载 `{ok:false, error:{code, message}}`，code ∈ `invalid-cwd | not-a-git-repo | git-unavailable | git-timeout | git-error | internal`。`not-a-git-repo` 返回 `200` + `ok:false`（软错误，UI 据此显示提示）；`invalid-cwd` 返回 `400`；其余错误返回 `500`。`session` 用来向宿主定位当前会话的工作区；省略 `cwd` 时用该工作区根，给出的 `cwd` 可以是绝对路径或相对工作区根的路径，但 `realpath` 之后必须落在工作区内。

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

两条路由都先调用 `ctx.connection.admit(req)`。未通过时按宿主给出的状态码拒绝：`401` 正文 `unauthorized`，`403` 正文 `forbidden`，并且不会执行 git 或返回更新状态。
