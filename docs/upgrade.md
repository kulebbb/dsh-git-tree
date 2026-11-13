中文 · [English](upgrade.en.md)

返回 [README](../README.md)。

## 从旧版本升级

- **v0.4.0（手工改 patch 的装法）**：先删掉旧的那条 `insert` 行，再在「插件」页安装 0.7.2。否则同一 id 会有两条来源（profile patch 与 bundle 各一条）：启动不会失败，但插件页的启用/禁用会归因到错误的层，卸载时还可能报「组合包正在使用」。

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
