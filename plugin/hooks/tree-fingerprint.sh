#!/usr/bin/env bash
# Print the git tree id of "HEAD plus the whole working tree" (tracked edits, staged changes,
# untracked non-ignored files; top-level .xenomoon/ left out) of the repo that holds [dir].
# Built on a temporary index, so the real index and working tree are untouched.
# Exit non-zero with one stderr line when dir is not a git repo or has no first commit.
set -u

dir="${1:-.}"

if ! top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || [ -z "$top" ]; then
  echo "tree-fingerprint: not a git repository: $dir" >&2
  exit 2
fi

if ! git -C "$top" rev-parse --verify --quiet HEAD^{commit} >/dev/null 2>&1; then
  echo "tree-fingerprint: repository has no first commit: $top" >&2
  exit 3
fi

idx=$(mktemp "${TMPDIR:-/tmp}/tree-fingerprint.XXXXXX") || {
  echo "tree-fingerprint: cannot create temporary index" >&2
  exit 4
}
trap 'rm -f "$idx"' EXIT

export GIT_INDEX_FILE="$idx"

if ! git -C "$top" read-tree HEAD >/dev/null 2>&1 \
  || ! git -C "$top" add -A -- . ':(exclude,top).xenomoon' >/dev/null 2>&1 \
  || ! tree=$(git -C "$top" write-tree 2>/dev/null) || [ -z "$tree" ]; then
  echo "tree-fingerprint: git failed to build the tree for: $top" >&2
  exit 5
fi

printf '%s\n' "$tree"
