[中文](api.md) · English

Back to the [README](../README.en.md).

## API

`GET /git-tree/graph?session=<session id>&cwd=<directory inside the workspace>&n=<1..2000>` → `{ok, repo, commits, refs}`. Error payload `{ok:false, error:{code, message}}`, with code ∈ `invalid-cwd | not-a-git-repo | git-unavailable | git-timeout | git-error | internal`. `not-a-git-repo` returns `200` + `ok:false` (a soft error the UI uses to show a hint); `invalid-cwd` returns `400`; other errors return `500`. `session` selects the session whose workspace the host owns. Omitting `cwd` uses that workspace root. A provided `cwd` may be absolute or relative to the root, and after `realpath` it must stay inside the workspace.

`commits[].date` is the author time (ISO 8601, `%aI`). The frontend shows it on a second line under each commit subject, formatted as YYYY-MM-DD HH:mm in the browser's local time zone. `commits[].shortHash` is a 7-character short hash; it is shown at the end of each subject line in a muted GitHub-style color (e.g. `feat: xxx (9259220)`). Clicking the row still copies the full hash.

### Long text and horizontal scrolling

Commit-row text is measured in pixel width before rendering. **Overlong subjects are automatically truncated with "…"**. SVG width is capped at the panel's visible content width, and **a horizontal scrollbar never appears** (long text is truncated, never used to widen the view). Hovering any commit row shows a custom tooltip with the **full commit message** (full subject + commit body + hash + author + local time + refs) and **code-change stats** (in the `1 file changed, 24 insertions(+), 16 deletions(-)` style, from `git log --shortstat`; merge commits with no changes omit that line).

### Status bar and local / remote HEAD

A status bar stays at the top of the panel:

- Project name (the directory name of the current session's working directory; hover to see the full path)
- `⑂ <branch-name>`: shows "detached" when HEAD is detached
- `↑n ↓m`: ahead/behind counts (`git rev-list --left-right --count HEAD...<ref>`). The remote side uses the current branch's `@{upstream}`, falling back to `origin/<branch-name>` when that is not configured, and is omitted when both sides are in sync
- Two small chips, "Local <7-char-hash>" and "Remote <7-char-hash>"; when there is no upstream, the remote chip shows "Not pushed"
- Two buttons on the right: search (expands a filter row; Esc collapses it) and refresh

Graph markers stay in sync: the local HEAD commit dot is a **green hollow ring**, and the remote HEAD commit dot is a blue dashed ring. In a wide panel, "Local" and "Remote" badges are appended at the end of the row; they are hidden in a narrow panel (the status bar already shows both hashes).

Payload shape: `commits[].body` (commit body, possibly an empty string), `commits[].stats` (`{files, insertions, deletions}`, or `null` for commits with no changes), `repo.localHead` (`{hash, branch|null}`), `repo.remoteHead` (`{ref, hash, ahead, behind}|null`).

`GET /git-tree/update/status` → `{ok, current, latest, newer, checkError}`. `latest` is `null` when the check failed or the client is offline (the UI degrades silently); `newer` means the registry version is actually higher than the current version. Non-GET methods return `405` with `error.code = method-not-allowed`. The plugin does not provide any install/update write API.

Both routes call `ctx.connection.admit(req)` before doing any work. A failed admission uses the status from the host: `401` with body `unauthorized`, or `403` with body `forbidden`. Git does not run, and the update payload is not returned.
