# Lean certificate checker (research)

## Goal and trust boundary

Independently check the arithmetic of veriss's exported piecewise-affine geometry;
keep the TypeScript migration and npm runtime untouched. Lean 4.19.0 and mathlib
v4.19.0 (pinned commit and dependency manifest) are optional research dependencies.

The initial checker accepts a certificate for **one supplied inline geometry model**
in a rectangular real viewport domain, with integer environment/safe-area
bounds and exact rational affine coordinates. The Python producer uses
Fourier–Motzkin elimination to find nonnegative integer combinations of
inequalities, but its decisions are not trusted. Lean checks each combination,
strictness, both branches of every coverage split, every row's nonnegative
size/safe-area containment, and equality of coordinates on every overlapping
pair of rows. It reconstructs the safety and consistency obligations itself.
The model is total, unambiguous and contained throughout the viewport rectangle
if the checker accepts (theorem `Certificate.total_unique_fit`).
A general shared-progress interpolation theorem is also checked; it is not a
CSS-transition derivation or a proof that an actual animation has that model.

The report-bound mode also checks the selected state/profile/target and every
original affine coefficient, guard, and row against the integer certificate,
using positive denominators and exact cross multiplication. The equivalence
of matched affine literals and strict/non-strict guards is proved in Lean.
JSON decoding, selecting the original report, and the correspondence of that
report to actual HTML/CSS/browser semantics remain outside the formal theorem.
The report's original model is the premise, not a theorem about browser behavior.
The initial program rejects missing or ambiguous entries and checks only inline
coordinates. Subsequent milestones below add full relational rectangles,
reachable cases, composition, motion and restricted source checking.
No certificate is treated as Unknown, not as a confirmed violation.

## Reproduce

From this directory (requires the pinned Lean/Lake toolchain and Python 3):

```sh
lake exe cache get Mathlib.Data.Real.Basic Mathlib.Tactic.Linarith Mathlib.Tactic.Ring Mathlib.Tactic.Positivity
lake build VerissLean
lake env lean KernelExample.lean
python3 generate.py REPORT.json --output certificates/
lake env lean --run Main.lean report REPORT.json STATE PROFILE TARGET certificates/CERT.json
python3 kernelize.py certificates/CERT.json > Concrete.lean
lake env lean Concrete.lean
```

The last step reduces a concrete certificate in the Lean kernel with
`by decide` (not `native_decide`). Inspect axioms with `#print axioms`.
For unbound mathematical checking, omit the four report selection arguments
and supply just the certificate file. Exit 0 means the model certificate is
verified; exit 2 is Unknown. Use a checker wrapper executing
`lake env lean --run Main.lean "$@"` from this directory for
`python3 test.py CHECKER OUTPUT_DIR` and
`python3 replay.py CHECKER REPORT_DIR CERTIFICATE_DIR`.
Native executable linking was not required: on the current macOS host, the old
bundled linker produced a dyld error in the mathlib cache executable.
The interpreted cache command (`lake env lean --run .lake/packages/mathlib/Cache/Main.lean get ...`)
worked with the pinned ProofWidgets tag and the actual mathlib cache; the
standard `lake build VerissLean` then passed. No system-wide Lean installation
or changes to the TypeScript worktrees were made.

## Measured result (2026-11-20)

- All Lean definitions and theorems build. Main theorem and source
  matching lemmas depend only on standard `propext`, `Classical.choice`,
  `Quot.sound`; no `sorryAx`, `native_decide` or custom axioms.
- 16 certificate tests (3 accepted, 13 rejected); five additional unsafe
  producer cases (strict boundary hole, narrow gap, overlap disagreement,
  negative size, overflow) correctly refuse to generate a certificate.
- 10 source-binding tests (3 accepted, 7 rejected), including a valid but
  unrelated certificate, removed row, altered coordinate/guard/domain,
  ambiguous source, unresolved evidence, equivalent rational and unreduced
  literal.
- Replayed the existing five-page portfolio audit from the prior projection
  refinement worktree (3 browser profiles, viewport 320–1920 × 320–1080):
  18/18 certifiable inline entries, 87 rows; the three island entries had no
  geometry evidence and were skipped. All 18 also passed individual concrete
  kernel-reduction proofs in one Lean module. Report-bound replay took 31.22 s
  on the Mac including interpreter launches; this is not a production
  performance claim. The inputs were saved model evidence, not new browser
  measurements or an assertion that the underlying CSS model is correct.
- Further work: verify the raw-input adapter's complete semantic bridge,
  support block/full rectangles and existing relational predicate AST,
  validated counterexamples, component implication, and a fast batch checker;
  leave source extraction and TypeScript production integration for a separate
  stage. No new CSS exceptions or site-specific behavior.


Additional saved evidence:
- Separate UI experiment: 3 verified, 15 skipped, one empty report (3 rows).
- Three games: 14 verified, 8 skipped (19 rows).
- Total: 35 accepted model certificates, 109 rows; all 35 checked with
  concrete Lean kernel reduction. No new browser measurements were performed.
  Missing geometry remains unsupported. The batch replay exits Unknown (2)
  if entries are skipped, a report contains no evidence, or the manifest
  omits an entry. It also checks the original report and certificate digests.
  `kernelize.py` accepts multiple certificate files for a single Lean module.

Baseline gate (unchanged production code at 722fbfd): all six unit-test groups, four component-lint evaluations unchanged, 408/408 E2E; supervisor exit 0, 658 tracked PIDs, 0 remaining. Lean research is isolated in experiments/lean.

## Relational certificates (second milestone)
The second milestone is implemented. Model validity (coverage, nonnegative
dimensions, agreement of overlapping pieces) is proved separately from
contract truth. The relational checker reads the original report's explicit
state/profile/contract instance, selects each geometry entry, combines all
rows, and lowers the supported contract inside Lean. The producer receives
the resulting proof obligations and supplies only evidence; the checker
reconstructs the problem again. It does not trust the producer's plan or the
prior reported status.

Supported contract instances: within-viewport, contains, disjoint (including
zero-area and edge contact), integer min-size, and linear predicates with
all/any/not, six comparisons, addition and rational scaling. Inline-only and
block-only evidence are accepted only when all referenced fields are present.
Full rectangles and multiple targets are supported. A positive certificate
covers every real viewport in the declared rectangle. A negative certificate
includes an exact rational point and must establish the same model validity
plus actual falsity of the selected predicate at the point. Missing evidence,
unknown formulas, unsupported dependencies and budget exhaustion are Unknown.
The producer consumes supplied violation witnesses, rather than finding new
witnesses automatically. State reachability, event/stable contracts, occupancy,
named predicate expansion, decimal minimum sizes and original CSS extraction
are outside this milestone. Parsing and the complete raw-report-to-model
semantic bridge are not yet mechanically certified end-to-end; the theorems
cover normalized geometry/formulas, including arithmetic normalization and
comparison meaning. These results do not establish CSS/browser correspondence.

Reproduce a relational check (from this directory):

```sh
lake build VerissLean
lake env lean --run Main.lean plan REPORT.json STATE PROFILE CONTRACT
lake env lean --run Main.lean verify REPORT.json STATE PROFILE CONTRACT CERT.json
lake env lean --run Main.lean violate REPORT.json STATE PROFILE CONTRACT CERT.json
lake env lean --run Main.lean batch REQUESTS.json
python3 relational.py CHECKER REPORT1.json REPORT2.json --output relational-results/
python3 kernel_relational.py relational-results/kernel-input.json > ConcreteRelations.lean
lake env lean ConcreteRelations.lean
python3 test_relational.py CHECKER TEST_OUTPUT_DIR
```

Use the same wrapper described for the first milestone. Requests for batch
are an array of objects with mode (plan/verify/violate), report, state, profile,
contract, and certificate (required for verify/violate). Codes: 0 verified
(or plan generated, for plan requests), 1 exact violation, 2 Unknown. A batch
with any Unknown exits 2, otherwise any violation exits 1. The replay runner
selects the saved explicit case instances for comparison, not all possible
reachable states. It does not make new CSS models.

2026-11-20 result:
- Existing reports from five portfolio pages and three games: 46 contract
  instances, 28 verified, 4 violated, 14 Unknown, zero classification
  mismatches. The four saved Voxel Tide Defense violations have witness
  1120 × 360 CSS px. Unknown includes missing geometry and action cases.
- All 32 accepted real-data results (including violations) and 14 positive/
  negative synthetic cases passed concrete kernel reduction via `by decide`.
- The 29 regression cases (14 expected classifications and 15 rejected
  certificates/sources) all passed in the final batch execution. Rejected
  cases include omitted obligations, an alternative source, absent axis,
  missing boundary, inconsistent overlapping rows, invalid dimensions,
  wrong profile/state, and invalid or non-violating witness.
- General theorems model_sound, nonnegative_sizes, overlap_agreement,
  verified_sound, violated_sound, normalizeAffine_sound, plus_sound,
  mulLiteral_sound and compareFormula_sound built and depend only on
  standard propext/Classical.choice/Quot.sound. Concrete checks depend
  only on propext. No sorry or native_decide.
- 46-instance batch planning/generation/checking took 15.43 s on the local
  host, including Lean interpreter startup. This is one measurement on
  saved reports, not a production performance guarantee.
- Unchanged production baseline passed all six unit groups, component-lint
  evaluations and 408/408 E2E, supervisor exit 0, 688 tracked PIDs, 0 remaining.
  TypeScript worktrees, npm packages and main were not modified.

Next: [detailed design for state reachability, component proof composition,
and CSS extraction soundness (DESIGN.md)](DESIGN.md). This is a proposed
implementation plan, not an assertion that its theorems already hold. The
TypeScript integration remains separate.


## Reachability, state-wide certificates, semantic lowering and time (third milestone)
Implemented on the separate Lean research branch; the npm/TypeScript runtime is unchanged.

- `VerissLeanState`: recomputes finite reachability for each declared profile,
  accepts only closed results, and regenerates exact static and event case keys.
  `Graph.checkedReach_spec`, `Scope.cases_spec`, `Graph.required_spec` and
  `Graph.checkCases_spec` prove membership equivalence, not merely absence of
  a missing edge in a test. Invalid IDs, duplicated states/edges/contracts,
  unknown profile selections, missing/extra/duplicate cases and empty contract
  scope are rejected. The graph describes declared reachability, not arbitrary JS.
- `state-cases OBLIGATION.json` checks serialized relational ObligationIR v1
  case keys from its original state/environment/contract, never trusting the
  producer's case list. This is coverage only, not target binding or truth.
  The state-wide certificate protocol added here is extended in the fourth
  milestone below. The graph/selector decoder, JSON binding, whole report
  semantics and evidence's browser/CSS provenance remain trusted boundaries.
- `VerissLeanBridge`: independent real-valued interpretation of normalized
  coordinate fields, safe-area/environment values, rational/scaled operands,
  and Boolean predicate AST. Theorems `Operand.compile_sound`,
  `Predicate.compile_sound`, and `Predicate.checked_piece_sound` connect
  compiled halfspaces with that interpretation and checked relational proofs.
  Positive denominator and row correspondence premises are explicit. This
  closes the normalized predicate-lowering step, not the raw CSS extraction,
  parser, profile-key provenance or whole-report combination correctness.
- `VerissLeanTime`: normalized shared piecewise-linear progress traces with
  exact rational knots and integer time boundaries. Strictly increasing times,
  full start/end coverage, progress endpoints 0/1 and values in [0,1] are
  independently checked. `Trace.continuous_domain_safe` covers every real
  time in the declared duration and preserves any scalar interval satisfied
  by both interpolated endpoints. `time-domain TRACE.json` accepts
  `{duration,knots:[{time,num,den},...]}`. It does not infer CSS duration,
  cubic-bezier curves, independent property progress or asynchronous transitions.

Reproduce (from this directory, pinned toolchain):

```sh
lake build VerissLean
lake env lean StateTest.lean
lake env lean TimeTest.lean
lake env lean KernelExample.lean
lake env lean --run Main.lean state-cases OBLIGATION.json
lake env lean --run Main.lean state-proofs OBLIGATION.json CERTIFICATES.json
lake env lean --run Main.lean time-domain TRACE.json
python3 test_state.py CHECKER OUTPUT_DIR
python3 test_relational.py CHECKER OUTPUT_DIR
```

Verified in this milestone: 20 reachability/case kernel fixtures (including
64-state chain and 65-state rejection), 8 time kernel fixtures, 12 integration
cases using the actual veriss ObligationIR constructor (8 required mixed-mode
keys; 5 static model certificates), all 29 existing relational regression
cases, and the existing KernelExample. All build; inspected axioms are only
propext, Classical.choice and Quot.sound (some theorems use fewer); no sorry
or native_decide. The earlier saved real-site reports and browser gate were
not rerun in this milestone. No new production warnings or browser code.

## Cross-state geometry and reachable counterexamples (fourth milestone)

The same relational certificate checker now handles static and settled
transition cases from canonical ObligationIR v1. No production package or
TypeScript worktree was modified.

- `VerissLeanReport` uses a structured (before/after, target ID) reference,
  independently resolves each endpoint's evidence, and lowers `stable` to
  equality of the four border-rectangle coordinates/sizes. Expanded event
  predicates support the existing linear Boolean grammar. No viewport
  changes occur between the endpoints. The reported target bindings must
  exactly match the independently generated references, including the state
  ID and endpoint. `combineRows_sound` and `combineRows_covers` prove complete
  Cartesian selection and joint guard coverage of the normalized row sets;
  no feasible combination is discarded. Existing geometry validation
  checks coverage, nonnegative dimensions and overlap agreement.
- `VerissLeanState`: `Graph.walk_sound`, `Graph.checkPath_sound` and
  `Graph.checkPath_edge` prove that a path follows actual declared edges
  enabled for the given profile, from initial to from, and that the target
  event/destination is reachable. A path contains the exact Edge objects
  from the declared graph, including restricted profiles when present.
- `VerissLeanStateProof`: the normalized input carries a proof that its
  required keys are exactly the generated obligations. `all_reachable_verified`
  and `reachable_violation` link graph completeness to the arithmetic
  checker for positive and negative results. The graph is the declared
  model, not proven to be an overapproximation of arbitrary JavaScript.

Current protocol (third-milestone static positive certificates still work):

```sh
lake build VerissLean
lake env lean StateTest.lean
lake env lean TimeTest.lean
lake env lean --run Main.lean state-plan OBLIGATION.json
lake env lean --run Main.lean state-proofs OBLIGATION.json CERTIFICATES.json
python3 test_state.py CHECKER OUTPUT_DIR
python3 kernel_relational.py OUTPUT_DIR/transition-kernel-input.json > Concrete.lean
lake env lean Concrete.lean
python3 test_relational.py CHECKER OUTPUT_DIR
```

`state-plan` returns a list of {key,code,result} objects for the complete
regenerated case set, with per-case unsupported results (2). A key has
contract, profile, from and optional event/to. For positive entries supply
{key,certificate: VerifiedCertificate}; for counterexamples supply
{key,violation: ViolationCertificate,path: Edge[]}. The path may be empty
only when from is the initial state. No submitted problem or report status
is trusted. Duplicate or extraneous certificate keys and inconsistent graph
keys are rejected. A verified bundle needs every required case to pass;
a valid in-scope counterexample suffices for exit 1 even if other cases
lack evidence or are unsupported. Otherwise incomplete/invalid bundles
exit 2. Action, occupancy and arbitrary temporal behavior remain Unknown.
The old individual report CLI remains static-only.

Validation:
- StateTest: 29 concrete kernel tests, including 9 new path tests; TimeTest:
  8, all successful. Existing KernelExample also passes.
- test_state.py: 28 integration cases (16 additional since milestone three),
  including non-deterministic event destinations, stable/self-loop,
  directional before/after predicate, a rational witness at 601.5 × 400
  inside a 601–603 width region, and rejection of modified path/profile,
  swapped target direction, missing axis/geometry/target/certificate and
  non-violating boundary. Production veriss IR construction and selected
  contract classifications agree with the independent checker.
- 18 accepted transition/static model certificates from test_state plus
  14 accepted existing relational cases checked by concrete kernel
  reduction. All 29 existing relational regression cases passed.
- New theorem axiom audits: only propext, Classical.choice, Quot.sound.
  Concrete reduction checks depend only on propext. No sorryAx or
  native_decide.
- Saved portfolio project media-build-smoke reports (converted to
  ObligationIR with the original state/environment/contract/evidence,
  then independently replanned and checked): result.json
  (SHA256 6a3bc06f31fb27a0c8ac9ef4892144153298d9060d9aa9de4c4b3f2847e553f6)
  3/3 required cases verified; wrong-result.json
  (SHA256 30ab09eecc18bdd559a463183824c1c33551075a5859f80f01e027cb8d2d42bd)
  2/2 Unknown with zero evidence. These are saved static models, not new
  browser measurements. The complete prior 46-instance dataset and
  three-browser gate were not rerun.

Remaining: actual JS-to-StateIR refinement (S5), component composition
(C1–C4), CSS subset extraction (X0–X3) and source-bound timing. The
semantic theorem is for normalized predicates/geometry; decoding,
raw CSS/browser correspondence, profile-key provenance and full
source-model linkage are not formalized end-to-end. This is not a proof
of concrete UI reachability or of actual browser animations.


## Fifth milestone: extraction, composition, finite refinement and motion

Added opt-in research commands, without changing veriss's runtime or TypeScript
worktrees. All claims refer to the formal fragment or normalized model, never an
unrestricted browser or arbitrary JavaScript.

### Extraction

`VerissLeanCSS` independently interprets explicit left/top, width/height,
padding and solid-border widths for a viewport-anchored rectangle with zero
margins, definite containing block, horizontal-tb/ltr and no unmodeled geometry
dependencies. Lengths are exact linear combinations of px/vw/vh/percent, with
a common positive denominator. Padding percentages use the viewport width
basis even for the block axis. Both content-box and border-box are handled;
a possible negative used size or border-box clamping is rejected unless
the no-clamp admissibility proof holds throughout the viewport domain.
`AnchoredStyle.extraction_exact` proves exact field equality for every row
and model coverage for all real-valued viewports in the domain. Matching uses
cross multiplication of affine coefficients, not measurements.

`css-plan STYLE REPORT STATE PROFILE TARGET` and
`css-check STYLE REPORT STATE PROFILE TARGET CERTIFICATE` select the original
full DOM evidence and reconstruct obligations for model validity and source
admissibility. STYLE is a JSON object:
- version 1, kind "viewport-anchored-computed-style", position "absolute"
  or "fixed", borderBox boolean, inline and block axis objects.
- Each axis has offset, size, padBefore, padAfter, borderBefore, borderAfter.
- Each length is {px,vw,vh,percent,den} (integer numerators, positive integer
  denominator). Unsupported or missing evidence remains Unknown.

`css-source-plan SOURCE REPORT STATE PROFILE` and
`css-source-check SOURCE REPORT STATE PROFILE CERTIFICATE` also require
the original complete HTML and author CSS strings to match the independently
rendered closed grammar. SOURCE is {version:1,root,target,html,css,style}.
This is restricted literal source binding, not arbitrary CSS parsing:
one empty absolute child of a definite viewport-sized root, simple ASCII
IDs, standards-mode HTML, fixed complete stylesheet grammar with physical
longhands and single integer-unit lengths, no other declarations, CSS
sources or scripts. Canonical HTML and CSS forms are in
`canonicalHTML` and `AnchoredStyle.canonicalCSS`; the caller must supply
the actual source, not substitute a generated lookalike for the source bytes.
`SourceFragment.exact` combines grammar binding with the exact formal geometry
theorem. The supplied HTML/CSS must be the actual code selected by the caller.
The existing browser correspondence/UA/scrollbar assumptions remain.
Noncanonical whitespace and extra harmless CSS are conservatively rejected.
The current veriss producer does not expose some fixed/viewport-unit geometries;
the checker explicitly rejects those rather than inventing evidence.

The plan result contains {plan,admissibility}; use `create_model(plan)` and
`prove` for each of the admissibility cases to construct
{model,admissibility}. See `test_css.py`.

### Composition

`VerissLeanComposition` supports one full two-axis rectangle per piece,
one parent and one child, identity or affine allocation/translation.
It proves exact substitution of child coordinates and strict/closed guards,
source model domain inclusion, coordinate agreement of each feasible pair,
and the parent goal from the transported child guarantee. The parent domain
must admit an exact positive witness; empty or contradictory domains fail.
The checker separately verifies the child's certificate, parent model, allocation,
binding and implication certificates. The arbitrary normalized parent and
child Problem inputs are not automatically tied to original component sources.

`composition-plan INPUT` / `composition-check INPUT CERTIFICATE` accepts
{transfer:{width,height,inlineStart,blockStart},parent,child,parentPoint}.
Transfer fields are exact Scaled values, parent/child are normalized Problems,
parentPoint is an exact rational Point. This is the normalized mathematical
C1/C2 core, not the complete existing composition import/adapter protocol.
C3 (higher-dimensional abstract implication), C4 (DAG dependency binding and
cache evaluation), C5 (opaque source-backed children) remain open. The new
checker does not establish any speedup; the parent geometry is still required.

### Finite dispatch

`VerissLeanFinite` models closed boolean assignments and render choices
independently of the state enumerator. `Machine.reach_refines` proves every
reachable normalized valuation maps to a reachable declared graph state,
and `Machine.edge_sound` rejects invented dispatch edges.
`finite-check INPUT` expects {machine,graph,variants}. See test_finite.py
for the normalized schema: variable list and initial values, literal or
variable/negation assignment, partial render choices and attached buttons,
state ID/valuation/render mapping. It independently compares all enabled
dispatches with the graph. Test fixtures use actual React/Vue/Svelte
adapter output and compare rendered button inventories. The source AST and
HTML parser/inventory are external inputs; this is not source-to-AST
validation, actual browser action success or general JS semantics.

### Motion

`VerissLeanMotion` independently regenerates the before/after full rectangle
evidence and viewport-fit obligations for an event case selected from the
original ObligationIR. `Model.continuous_fit` proves that both endpoint
models cover the declared viewport and the linearly interpolated rectangle
stays within the safe-area bounds for **every real time**, provided all
coordinates share the checked progress trace and the viewport does not
change. It is a new fit claim, not a proof of the selected original event
contract (such as stable).

`motion-plan INPUT` / `motion-check INPUT CERTIFICATE` accepts
{obligation,key,target,trace}; the key must be a regenerated reachable
event case. Trace is as in Time, with exact rational knots at integer times.
The producer creates {before,after} verified certificates from the plans.
The model does not infer the actual CSS animation/timing or enforce shared
progress at runtime. Unknown CSS easing, independent progress, transforms
and intermediate layout changes remain unmodeled.

### Reproduce

From this directory, after installing the pinned toolchain and existing
veriss dependencies, with CHECKER the wrapper described above:

```sh
lake build VerissLean
for n in css composition finite motion; do
  python3 test_$n.py CHECKER OUTPUT_DIR/$n
done
python3 kernel_research.py OUTPUT_DIR > Concrete.lean
lake env lean Concrete.lean
lake env lean StateTest.lean
lake env lean TimeTest.lean
python3 test_state.py CHECKER OUTPUT_DIR/state
python3 test_relational.py CHECKER OUTPUT_DIR/relational
python3 kernel_relational.py OUTPUT_DIR/state/transition-kernel-input.json \
  OUTPUT_DIR/relational/kernel-input.json > RegressionConcrete.lean
lake env lean RegressionConcrete.lean
```

The independent producer fixtures, positive checks, and modified negative
inputs are retained as scripts, not just result logs.

2026-11-21 fifth-milestone validation: 58 new integration fixtures passed
(20 CSS including 7 canonical-source, 14 composition, 13 finite dispatch,
11 motion). The 94 earlier fixtures also passed (29 state and 8 time
Lean examples, 28 state and 29 relational integration tests), with Lake
build and KernelExample successful. All 32 earlier representative concrete
certificates passed kernel reduction again. Four new representative concrete certificates were checked by
Lean kernel reduction (`by decide`), and the new audited semantic theorems
depend only on standard Lean axioms (`propext`, `Classical.choice`,
`Quot.sound`, or subsets). The full browser/production gate and the
previous real-site replay dataset were not rerun in this research pass.

Remaining to meet the full design: general CSS selector/cascade/AST
binding (X0/X1), additional lengths/clamps/layout/axis projection
(X2–X5), actual adapter source-to-normalized-state validation (S5),
existing import binding and multi-child abstract proof composition
(C1–C5), CSS timing extraction, complete profile provenance and
full TypeScript opt-in export/adapter integration. None of those are
implied by a successful normalized or canonical-fragment check.


## Sixth milestone: closed cascade and profile identity

`VerissLeanCascade` extends the canonical source fragment to a target with
one simple class, multiple competing author declarations, and viewport media
queries. It independently determines applicability, specificity, importance
and source order for each of left/top/width/height. The full original strings
must match the rendered fragment. Supported selector syntax is an optional
div type with at most one ID and one class (at least one ID/class); the ID
must not be the root's. Selectors that do not match the sole target are
excluded, not treated as overrides. The complete base stylesheet from the
fifth milestone remains at ID specificity, ordinary importance; subsequent
declarations can override the four supported properties. Each subsequent
rule must contain exactly one such declaration and may be wrapped in one
min/max width/height query at a nonnegative integer px boundary. At most 32
declarations, six media-bearing declarations (64 branches), 32 evidence
rows. Both impossible and possible source-branch/evidence-row pairs are
checked by existing exact refutation certificates; no pruning is trusted.

Theorems:
- `Media.atom_sound` proves each closed integer threshold against its
  independent real-valued semantics.
- `winner_spec` and `best_later_tie` establish maximum eligible priority
  and the later-wins step. The ordered list is the source order.
- `branches_cover` establishes that every real viewport has a branch
  with exactly the independently active ordered rules, including equality
  at min/max boundaries.
- `Source.exact` proves the supplied canonical strings are bound, the
  evidence covers the viewport domain, and **every applicable evidence
  row** agrees with the resolved box geometry. The theorem is for the
  formal fragment, not the full CSS language or a real browser.

`cascade-plan SOURCE REPORT STATE PROFILE` / `cascade-check SOURCE REPORT
STATE PROFILE CERTIFICATE`. SOURCE = {version:1,root,target,cls,html,css,
base,rules}. Base is the earlier computed-style object. Each rule is
{selector:{id,cls,tag},property,value,important,media}; id/cls may be null,
tag/important boolean, property one of left/top/width/height, value an
earlier length literal (integer single unit), media null or
{horizontal,minimum,bound}. Input order is semantic. The plan returns
{plan,admissibility,agreement}. Generate the model certificate with
`create_model(plan)` and the other two lists with `prove` on each
obligation. See test_cascade.py.

The `profileIdentity`/ `checkProfileBinding` JSON adapter rebuilds the
existing veriss v1 profileKey using original viewport dimensions, safe
insets, UA, DPR, scrollbar metadata, input, font profile, ordered
assumptions and the three supported finite media features in canonical
order. Stored key is parsed as JSON, not trusted or compared by a hash.
CSS extraction and motion now require a matching key, and ordinary
relational/state proof checking validates it whenever present, requiring it
for DOM/local-DOM evidence with nonempty finite media features. Legacy
unkeyed mathematical evidence without those features is still accepted by
the ordinary relational path; the initial inline legacy CLI is unchanged.
This is identity/metadata checking, not proof that a physical browser
actually used the declared profile. Duplicate raw JSON property handling
and JSON parser semantics remain in the trusted boundary.

### Evaluation and limitations

- 25 new integration tests passed, including actual veriss LayoutIR
  production with overlapping selectors, 601–603px width interval, both
  viewport axes, max thresholds, important/source-order, and tampered
  source/geometry/metadata. A wholly re-planned geometric model with a
  shifted 602px breakpoint cannot discharge the exact source agreement
  obligations. Both positive fixtures passed kernel reduction on typed
  inputs. Raw JSON parser reduction was attempted but gets stuck on Lean's
  standard parser; it is **not** claimed as a kernel proof. The concrete
  typed tests include the actual source strings. All 152 previous fixtures
  passed again (94 earlier state/time/relational and 58 research integration
  cases). The previous four representative typed research certificates
  also passed kernel reduction after refactoring the generator.
- Real browser observations at DPR 1: 49 points each on Chromium
  156.0.8078.4 and WebKit 27.2, max absolute field error 0.0125 CSS px
  (tolerance 0.03125). These are observations of the two CSS fixtures,
  not proof of browser/profile correspondence for every viewport or DPR
  (second synthetic profile-key fixture declares DPR 1.25).
  Firefox 1555 launch failed with "Could not find profile folder" even
  with explicit TMPDIR and persistent profile, so no Firefox observation.
  Existing guarded Chromium launcher passed a separate SIGKILL cleanup
  probe; post-run Chrome PID inspection was clean.
- The full production gate was not run. No production package or TypeScript
  worktree edits. General cascade (descendants, inheritance, layers,
  inline style, selector lists, arbitrary CSS parser, media boolean
  expressions), min/max/calc branches, axis projection, Flex/Grid,
  JS source linking, multi-child composition, actual CSS timing and
  production integration remain open. Exact canonical source is intentionally
  restricted and ordinary formatting may be rejected. No new W_* warning.

Reproduce (from this directory):
```sh
lake build VerissLean
python3 test_cascade.py CHECKER OUTPUT_DIR
python3 kernel_cascade.py OUTPUT_DIR > CascadeConcrete.lean
lake env lean CascadeConcrete.lean
# Optional point observations; supply a tested guarded Chromium launcher.
node test_cascade_browser.mjs OUTPUT_DIR GUARDED_CHROMIUM_MODULE
# Or individually append chromium, firefox, or webkit.
```
