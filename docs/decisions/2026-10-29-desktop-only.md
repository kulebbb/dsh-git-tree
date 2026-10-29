# 决策：只支持 DSH 桌面端，移除 Web 支持

- 日期：2026-10-29
- 状态：代码已实施；v0.7.0 随 tag 发布
- 影响版本：0.7.0 起
- 相关：`README.md`、`lib/update.js`、`lib/index.js`、`lib/client.js`、`test/`、`.github/workflows/publish.yml`

## 背景

插件在 v0.4.0 时代同时面向桌面端与 `dsh web`，更新机制按 Web 场景设计：启动时查 npm
registry，面板里点「更新」就在 profile 目录执行 `pnpm add @kulebbb/dsh-git-tree@latest`，
失败还能展开 pnpm 输出重试。为之配套了 profile 定位、开发安装判定（`link:`/`file:`）、
桌面端识别与 `update.profileDir` 配置。

实际上桌面端 profile 由 App 独占管理，插件在桌面端对 `POST /git-tree/update` 一律返回
409 `desktop-managed`——这条 pnpm 更新链路唯一能走通的环境只剩 `dsh web`，而 Web 侧
从未在 npm 上发布过支持 bundle 的版本（npm latest 停在 0.4.0）。也就是说，代码里存在
一整条「只有 Web 才走得到」的路径。

## 决定

只保留桌面端（DeepSeek Harness.app）支持：

1. 删除 `POST /git-tree/update`、`runPnpmUpdate`、`findProfileDir`、`isDevSpec`、
   `readDependencySpec`、`isDesktopProfile`，以及 `update.profileDir` 配置项。
2. 更新路径只保留「启动时静默查 registry，有新版本就在面板横幅提示去插件页重装」。
3. 文档不再提供 `dsh web` 的安装说明；面板内嵌文案字典、测试与快捷键平台声明同步收窄到桌面端。
4. 版本号 0.6.0 → 0.7.0（对 Web 用户是破坏性变更），发布时打 `v0.7.0` tag。

## 为什么

- 桌面端是实际使用环境，Web 安装路径从未真正可安装（npm 上没有 bundle 版本）。
- 桌面 profile 由 App 独占，插件执行 pnpm 会与 App 抢同一把锁，所以这段代码在桌面端
  只能是死代码。
- 删掉更新写接口后，插件少一个「能在 profile 目录执行 pnpm」的 HTTP 入口，安全面缩小
  到只读的 git 查询。

## 影响与注意事项

- Web 用户：0.7.0 起不再支持，请从 web profile 移除本插件。
- 桌面用户：安装/更新流程不变，仍在「插件」页完成。
- **`package.json` 里的 `dsh.client.platform: "web"` 必须保留**：它决定客户端 bundle 是否
  被 DSH 加载（只认 `web`），桌面端渲染器用的也是这套 web 客户端，与「是否支持
  `dsh web`」是两件事。
- 插件仍会请求 npm registry 查询最新版本（只读 GET，失败静默降级）。

## 未做

- 没有实现桌面端自动安装：App 未向第三方插件提供「更新自身」的接口，更新仍由用户在
  插件页重装完成。
