# veriss

Static verification of responsive CSS over the DOM: layout (every viewport width at once, symbolically), accessibility, and CSS mistakes that the browser silently ignores — without rendering a page or running application code. Each check that reports a warning is measured in Chromium, Firefox and WebKit (`e2e/`).

Unknown is never turned into success: what the model does not cover is reported as Unknown with its reason.

**What it checks**: [the fork rule catalog](https://kikutadev.github.io/veriss/) (Japanese) groups every check by role, says what can and cannot be checked, and shows each role with a detected (NG) and a corrected (OK) example as veriss judges them. Adapted from the [upstream rule catalog](https://mizchi.github.io/veriss/); the fork site runs the bundled TypeScript-origin verifier in-browser on editable HTML/CSS (including F116/F129/F133 presets), and documents the experimental Lean work separately.

## Expanded verification targets (upstream 2026-11-22)

- `@mizchi/veriss/critical`: extract first-view CSS for phone/desktop viewport ranges, conservatively keeping unknown rules; browser demo is on the [fork site](https://kikutadev.github.io/veriss/#first-view).
- Independent L1 Grid/Flex Z3 reference, state-shift counterexamples and three-browser comparisons (`models/layout/`, `docs/adr/0018-coordinate-subset.md`).
- Cross-font and cross-platform text-width reference (`models/text/`, `docs/adr/0019-text-width-type.md`); Linux recorded widths, with unrecorded platform/font data explicitly Unknown. These are distinct from the F116–F133 CSS warning rules.

## Packages

| Package | Directory | |
| --- | --- | --- |
| `@mizchi/veriss` | `packages/veriss` | the core: HTML/box tree + CSS → layout, accessibility and CSS-mistake findings; Z3 verification; text metrics from font files |
| `@mizchi/veriss-adapter-core` | `packages/adapter-core` | shared component adapter: state expansion, analysis per state, lint findings |
| `@mizchi/veriss-react` | `packages/react-adapter` | React (JSX) with StyleX and Linaria |
| `@mizchi/veriss-vue` | `packages/vue-adapter` | Vue 3 SFC |
| `@mizchi/veriss-svelte` | `packages/svelte-adapter` | Svelte 5 |

Users: [mizchi/isle](https://github.com/mizchi/isle) checks its components' layout contracts with `@mizchi/veriss`.

## Use from git

Not published to npm. With pnpm, depend on a package directory at a commit:

```json
{ "dependencies": { "@mizchi/veriss": "github:kikutadev/veriss#<commit>&path:packages/veriss" } }
```

## Develop

```sh
pnpm install
pnpm build:text-metrics   # MoonBit (moon), only after changing text-metrics/; the build output is committed
pnpm build:oracle         # MoonBit, the differential cascade oracle used by tests
pnpm test                 # node --test, every package
pnpm test:e2e -- --project chromium   # browser checks (also firefox, webkit)
```

## Independent proof checker (opt-in research)

[experiments/lean/README.md](experiments/lean/README.md) documents the
separate Lean 4 checker for exact geometry certificates, declared state
reachability, finite dispatch, affine parent/child composition, restricted
CSS source/cascade binding, and shared-progress motion models. Its checker
does not run automatically in the packages or claim browser-wide correctness;
unsupported CSS/JS remains outside its proven subset. The TypeScript sources
and generated ESM in `packages/` remain the ordinary veriss runtime.

## Docs

- [Fork rule catalog + live checker](https://kikutadev.github.io/veriss/) (`docs/rule-catalog.md`) — checks by role, browser demo, and fork changes
- [Original catalog](https://mizchi.github.io/veriss/) — upstream source examples
- `docs/critical-css.md` — initial-view CSS for phones and PCs (`@mizchi/veriss/critical`)
- `docs/adr/0018-coordinate-subset.md` — independent Grid/Flex L1 Z3 model (`models/layout/`)
- `docs/adr/0019-text-width-type.md` — font/platform text-width reasoning (`models/text/`)
- `docs/static-check-checklist.md` — every CSS×DOM pattern, how it was measured
- `docs/layout-checking.md` — the layout model and its subset
- `docs/adr/` — design decisions
