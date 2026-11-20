# Lean certificate checker (research)

## Goal and trust boundary

Independently check the arithmetic of veriss's exported piecewise-affine geometry;
keep the TypeScript migration and npm runtime untouched. Lean 4.19.0 and mathlib
v4.19.0 (pinned commit and dependency manifest) are optional research dependencies.

The checker accepts a certificate for **one supplied inline geometry model**
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
The program rejects missing or ambiguous entries. Only inline coordinates
are checked; arbitrary relational predicates, full layout extraction, native
browser rounding and timing, and dynamic state reachability are not covered.
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

Next: verify reachability and cross-state contracts, certify the full
source semantic bridge and component implication/composition, then connect
to the TypeScript pipeline on an agreed stable IR. Do not claim complete CSS
semantics until extraction itself is validated.
