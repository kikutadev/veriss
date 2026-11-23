# veriss

Static verification of responsive CSS over the DOM: layout (every viewport width at once, symbolically), accessibility, and CSS mistakes that the browser silently ignores — without rendering a page or running application code. Each check that reports a warning is measured in Chromium, Firefox and WebKit (`e2e/`).

Unknown is never turned into success: what the model does not cover is reported as Unknown with its reason.

**What it checks**: [the fork rule catalog](https://kikutadev.github.io/veriss/) (Japanese) groups every check by role, says what can and cannot be checked, and shows each role with a detected (NG) and a corrected (OK) example as veriss judges them. Adapted from the [upstream rule catalog](https://mizchi.github.io/veriss/); the fork site runs the bundled TypeScript-origin verifier in-browser on editable HTML/CSS (including F116/F129/F133 presets), and documents the experimental Lean work separately.

## Try the product

**[Try the live responsive verifier](https://kikutadev.github.io/veriss/#live-check)**: the first example intentionally overflows at narrow widths. Switch **NG** → **修正後 OK** to see a real counterexample disappear; edit HTML/CSS directly, and change the viewport width range. Use the CLI below for files and complete stylesheets; the website does not fetch arbitrary URLs or use Cloudflare Workers.

**Use it with files** (Node 24+, pnpm 12; this fork is not published to npm):

```sh
pnpm add 'github:kikutadev/veriss#<commit>&path:packages/veriss'
pnpm exec veriss check --html page.html --css styles.css --min-width 320 --max-width 1280
pnpm exec veriss check --html page.html --css styles.css --json
```

To try directly in the repository without installing the package into another project:

```sh
node packages/veriss/bin/veriss.mjs check --html tests/fixtures/veriss-cli/grid.html --css tests/fixtures/veriss-cli/grid-broken.css
node packages/veriss/bin/veriss.mjs check --html tests/fixtures/veriss-cli/grid.html --css tests/fixtures/veriss-cli/grid-fixed.css
```

The first command reports a failing viewport (416px in this fixture), the second reports **VERIFIED**. The CLI checks a **static HTML fragment** plus the **complete author CSS** that you provide, running the analyzer and the independent Z3 layout proof. It does **not** fetch external stylesheets or run JS. Unsupported cases return **UNKNOWN**, not success. Exit codes: 0 verified, 1 violated, 2 unknown, 3 invalid input/runtime failure. Errors/warnings/Unknown are separate counts; `--json` includes the failing width interval and witness when available.

[Product-value plan and release acceptance](docs/product-value-plan.md). [Real-world UI findings and reproduction](docs/product-real-ui-evidence.md): three static real-site inputs remain Unknown, while separate **post-login browser observations** on two public demo apps reproduce a hidden-drawer keyboard-focus problem and a 320px orders-list overflow. Runtime findings are not static proof.

**Audit post-login demo states (requires network, not part of the offline gate):** `node tools/gate-guarded.mjs --external-e2e`. Uses only publicly documented demo accounts, observes two distinct apps on Chromium/Firefox/WebKit at four widths, and reports `verifyUI` observation failures while preserving static `UNKNOWN`.

## Check an authenticated web app from an existing Playwright test

Use the **app's existing login and navigation steps**; veriss does not need credentials or a URL-fetching worker. The adapter-core observer measures **only a browser document's horizontal extent, the selected main rectangle, and focus geometry**. It does not collect text, input values, cookies, tokens or HTML/CSS source. This is a **runtime observation**, not a proof that every width or application state is covered.

Install the two Git packages at matching commits in a project that already uses Playwright: `@mizchi/veriss` and `@mizchi/veriss-adapter-core` (the latter has a peer dependency on the former). Then, inside a Playwright test **after the application has reached a stable logged-in state**:

```js
import {captureViewport, captureClosedScopeTabFocus, verifyUI} from '@mizchi/veriss-adapter-core';

// page: the Playwright Page returned by your own authenticated E2E setup.
const viewport = await captureViewport(page, {state:'dashboard',profile:'phone'});
// For menus, call only while this specific scope is CLOSED.
const focus = await captureClosedScopeTabFocus(page, {
  state:'dashboard', profile:'phone',
  anchor:'[aria-label="Open menu"]', closedScope:'#sidebar', steps:6
});
const model = {
  version:1, initial:'dashboard', states:['dashboard'],
  transitions:[{from:'dashboard',event:'keyboard-focus-visible',to:'dashboard'}],
  profiles:[{id:'phone',viewport:{min:320,max:1280,height:{min:844,max:844}}}],
  contracts:[
    {id:'root-fit',kind:'predicate',predicate:{op:'compare',relation:'le',
      left:{target:'scrollExtent',field:'inlineEnd'},right:{environment:'safeRight'}}},
    {id:'focus',kind:'action',event:'keyboard-focus-visible'}
  ]
};
const report = verifyUI({model,observations:[viewport.observation,focus.observation]});
// Check sampled failures separately from the static proof status.
if (report.observationStatus === 'failed') throw new Error('Observed UI contract violation');
// Without closed CSS/geometry evidence, report.status is UNKNOWN, even if samples pass.
```

For a genuinely **open** accessible modal (`role=dialog`, `aria-modal=true`), audit background focus escape without clicking Save or reading form values:

```js
import {captureModalTabFocus} from '@mizchi/veriss-adapter-core';
// In the caller's test, open the modal first and wait until visible.
const modal = await captureModalTabFocus(page, {
  state:'query-dialog-open', profile:'phone', steps:8
});
const modalModel = {
  version:1,initial:'query-dialog-open',states:['query-dialog-open'],
  transitions:[{from:'query-dialog-open',event:'modal-focus-contained',to:'query-dialog-open'}],
  profiles:[{id:'phone',viewport:{min:320,max:1280,height:{min:844,max:844}}}],
  contracts:[{id:'dialog-focus',kind:'action',event:'modal-focus-contained'}]
};
const modalReport = verifyUI({model:modalModel,observations:[modal.observation]});
if (modalReport.observationStatus === 'failed') throw new Error('Background focus leaked from modal');
// A passing sample still has static status UNKNOWN.
```

A nonmodal popover or missing dialog is rejected rather than accepted. If a browser transiently reports document `body` focus (observed with native `<dialog>`), the sample is **inconclusive**, not an asserted background escape. This is a finite Tab observation, not full focus-trap or static proof.

For **role-dependent UI availability** on an existing authenticated screen, declare the controls that must be allowed or blocked. Do not click destructive controls in the audit:

```js
import {captureControlAvailability} from '@mizchi/veriss-adapter-core';
const permissions = await captureControlAvailability(page, {
  state:'viewer-users', profile:'phone', controls:[
    {id:'edit',selector:'button[data-action="edit"]',expect:'all-blocked'},
    {id:'suspend',selector:'button[data-action="suspend"]',expect:'all-blocked'}
  ]
});
const roleModel={version:1,initial:'viewer-users',states:['viewer-users'],
  transitions:[{from:'viewer-users',event:'role-controls-match',to:'viewer-users'}],
  profiles:[{id:'phone',viewport:{min:320,max:1280,height:{min:844,max:844}}}],
  contracts:[{id:'role-controls',kind:'action',event:'role-controls-match'}]};
const roleResult=verifyUI({model:roleModel,observations:[permissions.observation]});
if(roleResult.observationStatus==='failed')throw new Error('Unexpected accessible UI action');
```

Each declared selector must match at least one control. `all-enabled`, `some-enabled`, and `all-blocked` can be combined (e.g. Admin may edit all users but may not suspend themselves). Native `disabled` and `inert` are treated as blocked; an `aria-disabled`-only or pointer-events-only control is **inconclusive** instead of assumed secure. Results contain only caller-chosen group IDs and counts, not screen text, user rows, cookies, or input values. **Server-side authorization cannot be established from the DOM**; test APIs independently. As with every runtime observation, a passing sample does not change the static verdict from UNKNOWN.

`captureViewport` returns `frame.documentWidth`, `frame.main` and structural selectors for overflow contributors; `captureClosedScopeTabFocus` returns the sampled Tab steps and an action observation. For SPA navigation or animation, **wait for the relevant state to settle** before capturing. Use separate `state` names for each list/dialog/menu configuration and declare their transitions in the model. You can review the complete login → dashboard → menu → list examples in [`e2e/external-authenticated-ui.spec.mts`](e2e/external-authenticated-ui.spec.mts); the repeatable offline control is [`e2e/layout-browser-observations.spec.mts`](e2e/layout-browser-observations.spec.mts).

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
