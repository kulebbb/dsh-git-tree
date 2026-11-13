# Changelog

[中文 README](README.md) · [English README](README.en.md)

## 中文

版本脉络：v0.5.0 起改为 bundle 分发；v0.6.0 起入口从「左侧栏按钮 + 全屏弹层」改为**右侧栏 tab 类型**并删除工作区选择器；v0.7.0 起只保留桌面端，移除面板内的一键更新与 `POST /git-tree/update`；v0.7.1 更新版权人与上架元数据，不改变运行行为；v0.7.2 起 `GET /git-tree/graph` 与 `GET /git-tree/update/status` 在处理前经宿主 `ctx.connection.admit()` 认证，且 graph 的 `cwd` 只能落在当前会话所属工作区之内。取舍与影响见 `docs/decisions/2026-10-29-desktop-only.md`。

## English

Version history: v0.5.0 switched to bundle distribution; v0.6.0 moved the entry point from a "left-sidebar button + fullscreen overlay" to a **right-sidebar tab type** and removed the workspace picker; v0.7.0 kept the desktop app only and removed one-click update inside the panel plus `POST /git-tree/update`; v0.7.1 updated the copyright holder and listing metadata, with no change to runtime behavior; v0.7.2 requires `ctx.connection.admit()` before `GET /git-tree/graph` and `GET /git-tree/update/status`, and limits graph `cwd` to the current session's workspace. Trade-offs and impact are documented in `docs/decisions/2026-10-29-desktop-only.md`.
