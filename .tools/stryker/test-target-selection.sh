#!/usr/bin/env bash
# Prints the pnpm filter for each mutation-tested package with changed files,
# one per line. Changed = committed since BASE (merge base), plus staged,
# unstaged and untracked files in the working tree.
#
# Usage: .tools/stryker/test-target-selection.sh [base-ref]   (default origin/main)
set -euo pipefail

base="${1:-origin/main}"
cd "$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet "$base" >/dev/null; then
  echo "unknown base ref: $base" >&2
  exit 2
fi

changed=$(
  {
    git diff --name-only "$(git merge-base "$base" HEAD)" HEAD
    git diff --name-only HEAD
    git ls-files --others --exclude-standard
  } | sort -u
)

# Only source and tests count; a README or CLAUDE.md edit has nothing to mutate.
# dir:filter pairs. Plain list, not an associative array: macOS ships bash 3.2.
for pair in packages/core:@flashsale/core apps/api:@flashsale/api apps/worker:@flashsale/worker apps/cli:@flashsale/cli; do
  dir="${pair%%:*}"
  if grep -qE "^${dir}/(src/|stryker\.config|vitest\.config|package\.json)" <<<"$changed"; then
    echo "${pair#*:}"
  fi
done
