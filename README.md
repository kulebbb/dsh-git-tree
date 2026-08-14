# @deepseek-ai/dsh-git-tree

DSH Web GUI 插件：侧边栏底部「Git 树」按钮 → 全屏弹层展示当前工作区（可切换已注册工作区）的 git 提交/分支 DAG 图。

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
pnpm add link:/Users/zhaoliang/Documents/coding/deepseek-harness/plugins/dsh-git-tree
# 在 cordis.patch.yml 的 insert 列表追加：
#   - id: git-tree
#     name: '@deepseek-ai/dsh-git-tree'
# 然后重启 dsh web。
```

## 接口

`GET /git-tree/graph?cwd=<绝对目录>&n=<1..2000>` → `{ok, repo, commits, refs}`；错误负载 `{ok:false, error:{code, message}}`，code ∈ `invalid-cwd | not-a-git-repo | git-unavailable | git-timeout | git-error | internal`。`not-a-git-repo` 返回 `200` + `ok:false`（软错误，UI 据此显示提示）；`invalid-cwd` 返回 `400`；其余错误返回 `500`。

## 安全说明

该路由接受任意 `cwd` 并在其上执行 git，属于本机开发工具。请保持 web server 绑定在回环地址（默认 `127.0.0.1`）；不要用 `--host 0.0.0.0` 暴露到网络。
