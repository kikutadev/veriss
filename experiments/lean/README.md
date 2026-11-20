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
