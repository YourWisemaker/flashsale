#!/usr/bin/env bash
# Runs mutation testing only for packages that changed, one after another
# (Stryker runs with concurrency 1 against shared Redis/Mongo).
#
# Usage: .tools/stryker/run-changed.sh [--dry-run] [base-ref]   (default origin/main)
set -euo pipefail

dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
  shift
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
targets=$("$here/test-target-selection.sh" "${1:-origin/main}")

if [[ -z "$targets" ]]; then
  echo "No mutation-tested package changed; nothing to run."
  exit 0
fi

while read -r pkg; do
  if $dry_run; then
    echo "would run: pnpm --filter $pkg test:mutation"
  else
    echo "== $pkg"
    pnpm --filter "$pkg" test:mutation
  fi
done <<<"$targets"
