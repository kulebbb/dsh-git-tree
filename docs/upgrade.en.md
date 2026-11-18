[中文](upgrade.md) · English

Back to the [README](../README.en.md).

## Switching to npm for one-click updates

In-app updates with a Versions section are only offered for a registry install saved under the package's own name. GitHub installs (without a pinned commit) and local directory installs can only be reinstalled; a Git install pinned to a full 40-character commit updates from the Plugins page's Discover tab.

1. Uninstall the Git tree plugin on the "Plugins" page; if it asks you to stop DSH first, quit the app as prompted and continue. The same package name cannot keep both a GitHub and an npm dependency.
2. Install `@kulebbb/dsh-git-tree` (npm) on the "Plugins" page, then restart once when prompted.
3. Later, when a newer version exists, the version entry on the status bar becomes "↑ vX". Clicking "Update" opens the bundle's page on the Plugins page; use "Update to x" in its Versions section.

To keep editing local code, temporarily switch to a `link:` install, then publish and repeat the steps above to return to npm.

## Upgrading from older versions

- **v0.4.0 (the hand-edited patch install)**: delete the old `insert` row first, then install 0.7.3 from the "Plugins" page. Otherwise the same id will have two sources (one from the profile patch and one from the bundle): startup will not fail, but enable/disable on the Plugins page will be attributed to the wrong layer, and uninstall may report that "the bundle is in use".

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
