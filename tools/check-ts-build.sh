#!/bin/bash
# Compare the compiler output without changing the checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
pnpm exec tsc -p tsconfig.json --outDir "$out"
while IFS= read -r file; do
  rel=${file#"$out"/}
  if ! cmp -s "$file" "$rel"; then
    echo "Stale or missing generated file: $rel (pnpm build:ts)" >&2
    exit 1
  fi
done < <(find "$out" -type f)
