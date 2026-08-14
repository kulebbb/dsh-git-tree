#!/usr/bin/env bash
# Build a deterministic multi-branch fixture repo (7 commits, 1 merge, 1 tag).
# Each commit writes its own file, so the feature->main merge is clean.
# Fixed, increasing author/committer dates make SHAs and log order reproducible.
# Usage: make-fixture.sh [dir]  — prints the repo path (stdout stays pure).
set -euo pipefail
DIR="${1:-/tmp/dsh-git-tree-fixture}"
rm -rf "$DIR"
git init -q -b main "$DIR"
git -C "$DIR" config user.email "t@example.com"
git -C "$DIR" config user.name "T"
cd "$DIR"
N=1
commit() {
  export GIT_AUTHOR_DATE="2026-08-01T00:00:0${N}+08:00"
  export GIT_COMMITTER_DATE="2026-08-01T00:00:0${N}+08:00"
  echo "$1" > "$1.txt"; git add "$1.txt"; git commit -q -m "$1"
  N=$((N+1))
}
commit A
commit B
git tag v1.0
commit C
git checkout -q -b feature HEAD~1
commit D
commit E
git checkout -q main
git merge -q --no-ff -m M feature >&2
git checkout -q -b fix HEAD~1
commit G
echo "$DIR"
