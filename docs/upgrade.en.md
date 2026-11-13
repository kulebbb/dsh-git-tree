[中文](upgrade.md) · English

Back to the [README](../README.en.md).

## Upgrading from older versions

- **v0.4.0 (the hand-edited patch install)**: delete the old `insert` row first, then install 0.7.2 from the "Plugins" page. Otherwise the same id will have two sources (one from the profile patch and one from the bundle): startup will not fail, but enable/disable on the Plugins page will be attributed to the wrong layer, and uninstall may report that "the bundle is in use".

  ```yaml
  # ~/.dsh/profiles/desktop/cordis.patch.yml — delete this block
  - insert:
      - id: git-tree
        name: '@kulebbb/dsh-git-tree'
  ```

  After installing, confirm there is only one Git tree entry in the plugin list on the "Plugins" page (the desktop profile cannot run `--dump-config` against the CLI).

- **v0.5.0 / 0.6.0**: a normal reinstall from the "Plugins" page is enough; no extra manual steps.
- **Previously installed in a `dsh web` profile**: Web is no longer supported from 0.7.0. Remove this plugin from that profile with `pnpm remove @kulebbb/dsh-git-tree`; if it was originally installed the v0.4.0 way, also delete the `insert git-tree` block in that profile's `cordis.patch.yml`; if it was installed as a v0.5.0+ bundle, remove the package name from the `dsh.profile.bundles` list.
- The "Update" button that shipped with v0.4.0 only installs the new version as a regular dependency and does not write `dsh.profile.bundles` — follow this section to upgrade, and do not click the old Update button.
