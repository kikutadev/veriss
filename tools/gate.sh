#!/bin/bash
# The check run before every push (see AGENTS.md / docs/handoff.md): every package's unit tests, the component-lint
# eval (its results must not change), and the css-mistakes e2e in Chromium, Firefox and WebKit.
# PLAYWRIGHT_BROWSERS_PATH: set it if the browsers are not where Playwright looks by default.
set -u
set -o pipefail
cd "$(dirname "$0")/.." || exit 1
bad=0
pnpm run check:ts || bad=1
f=$(node --test --test-reporter=tap tests/*.test.mjs 2>&1 | grep -E "^# fail" | awk '{print $3}'); echo "root fail=$f"; [ "$f" = "0" ] || bad=1
for p in veriss adapter-core react-adapter vue-adapter svelte-adapter; do
  f=$(cd packages/$p && node --test --test-reporter=tap test/*.test.mjs 2>&1 | grep -E "^# fail" | awk '{print $3}'); echo "$p fail=$f"; [ "$f" = "0" ] || bad=1
done
for a in '' run-1 run-2 run-3; do node tools/eval-component-lint.mjs ${a:+--attempt $a} >/dev/null 2>&1 || { echo "eval failed ($a)"; bad=1; }; done
[ -z "$(git status --short evals/ | grep -v '^??')" ] || { echo "eval changed"; git status --short evals/ | grep -v '^??'; bad=1; }
r=$(pnpm exec playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs e2e/layout-real-site-input.spec.mjs e2e/layout-partial-geometry.spec.mjs e2e/layout-finite-ui.spec.mjs e2e/layout-critical-css.spec.mjs e2e/layout-shift.spec.mjs e2e/layout-spec.spec.mjs e2e/layout-text-width.spec.mjs 2>&1 | grep -E '^\s+[0-9]+ (passed|failed)' | tr '\n' ' ')
e2e_status=$?
echo "css-mistakes and real-site input e2e: $r"; [ "$e2e_status" = "0" ] && [ -n "$r" ] && ! echo "$r" | grep -q failed || bad=1
exit $bad
