import Mathlib.Data.Real.Basic
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Ring
import Mathlib.Tactic.Positivity
import Lean

namespace VerissLean

-- Integer coefficients are exact. Each guard is independently scaled by
-- a positive denominator; all rectangles share one positive scale.
structure Affine where
  x : Int
  y : Int
  c : Int
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

def Affine.eval (a : Affine) (w h : ℝ) : ℝ :=
  (a.x : ℝ) * w + (a.y : ℝ) * h + (a.c : ℝ)
def Affine.zero : Affine := ⟨0, 0, 0⟩
def Affine.plus (a b : Affine) : Affine := ⟨a.x+b.x, a.y+b.y, a.c+b.c⟩
def Affine.neg (a : Affine) : Affine := ⟨-a.x, -a.y, -a.c⟩
def Affine.scale (k : Nat) (a : Affine) : Affine :=
  ⟨(k : Int)*a.x, (k : Int)*a.y, (k : Int)*a.c⟩

@[simp] theorem eval_zero (w h : ℝ) : Affine.zero.eval w h = 0 := by
  simp [Affine.zero, Affine.eval]
@[simp] theorem eval_plus (a b : Affine) (w h : ℝ) :
    (a.plus b).eval w h = a.eval w h + b.eval w h := by
  simp [Affine.plus, Affine.eval]; ring
@[simp] theorem eval_neg (a : Affine) (w h : ℝ) :
    a.neg.eval w h = -a.eval w h := by
  simp [Affine.neg, Affine.eval]; ring
@[simp] theorem eval_scale (k : Nat) (a : Affine) (w h : ℝ) :
    (a.scale k).eval w h = (k : ℝ) * a.eval w h := by
  simp [Affine.scale, Affine.eval]; ring

structure Atom where
  affine : Affine
  strict : Bool
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

def Atom.holds (a : Atom) (w h : ℝ) : Prop :=
  if a.strict then 0 < a.affine.eval w h else 0 ≤ a.affine.eval w h
def Atom.complement (a : Atom) : Atom := ⟨a.affine.neg, !a.strict⟩
def Holds (ctx : List Atom) (w h : ℝ) : Prop :=
  ∀ a ∈ ctx, a.holds w h

theorem complement_iff (a : Atom) (w h : ℝ) :
    a.complement.holds w h ↔ ¬ a.holds w h := by
  cases a with
  | mk f s =>
    cases s <;> simp [Atom.complement, Atom.holds]

theorem holds_cons (a : Atom) (ctx : List Atom) (w h : ℝ) :
    Holds (a :: ctx) w h ↔ a.holds w h ∧ Holds ctx w h := by
  simp [Holds]

theorem holds_append (a b : List Atom) (w h : ℝ) :
    Holds (a ++ b) w h ↔ Holds a w h ∧ Holds b w h := by
  constructor
  · intro ha; exact ⟨fun x hx => ha x (List.mem_append_left b hx),
                     fun x hx => ha x (List.mem_append_right a hx)⟩
  · rintro ⟨ha, hb⟩ x hx
    rcases List.mem_append.mp hx with hx | hx
    · exact ha x hx
    · exact hb x hx

structure Combination where
  affine : Affine
  strict : Bool

def combine : List Atom → List Nat → Combination
  | a :: rest, k :: ks =>
    let tail := combine rest ks
    ⟨(a.affine.scale k).plus tail.affine, (k > 0 && a.strict) || tail.strict⟩
  | _, _ => ⟨Affine.zero, false⟩

theorem combine_sound (ctx : List Atom) (weights : List Nat) (w h : ℝ)
    (hm : Holds ctx w h) :
    0 ≤ (combine ctx weights).affine.eval w h ∧
      ((combine ctx weights).strict = true → 0 < (combine ctx weights).affine.eval w h) := by
  induction ctx generalizing weights with
  | nil => simp [combine]
  | cons a rest ih =>
    cases weights with
    | nil => simp [combine]
    | cons k ks =>
      obtain ⟨ha, ht⟩ := (holds_cons a rest w h).mp hm
      have hn : 0 ≤ a.affine.eval w h := by
        unfold Atom.holds at ha
        split at ha <;> linarith
      obtain ⟨hr, hs⟩ := ih ks ht
      have hk : 0 ≤ (k : ℝ) := by positivity
      simp only [combine, eval_plus, eval_scale]
      constructor
      · exact add_nonneg (mul_nonneg hk hn) hr
      · intro hh
        simp only [Bool.or_eq_true, Bool.and_eq_true, decide_eq_true_eq] at hh
        rcases hh with ⟨kp, ap⟩ | hp
        · have kp' : 0 < (k : ℝ) := by exact_mod_cast kp
          have ap' : 0 < a.affine.eval w h := by simpa [Atom.holds, ap] using ha
          exact add_pos_of_pos_of_nonneg (mul_pos kp' ap') hr
        · exact add_pos_of_nonneg_of_pos (mul_nonneg hk hn) (hs hp)

/-- Farkas/Motzkin-style nonnegative multiplier certificate. A strictly
    positive combination may also refute a zero constant. -/
def checkRefute (ctx : List Atom) (weights : List Nat) : Bool :=
  let t := combine ctx weights
  weights.length == ctx.length &&
  decide (t.affine.x = 0 ∧ t.affine.y = 0 ∧
    (t.affine.c < 0 ∨ (t.affine.c = 0 ∧ t.strict = true)))

theorem refute_sound (ctx : List Atom) (weights : List Nat) (w h : ℝ)
    (ok : checkRefute ctx weights = true) : ¬ Holds ctx w h := by
  intro hm
  obtain ⟨hn, hs⟩ := combine_sound ctx weights w h hm
  simp only [checkRefute, Bool.and_eq_true, decide_eq_true_eq] at ok
  obtain ⟨_, hx, hy, hc⟩ := ok
  have he : (combine ctx weights).affine.eval w h = ((combine ctx weights).affine.c : ℝ) := by
    simp [Affine.eval, hx, hy]
  rcases hc with hc | ⟨hc, ht⟩
  · have hn' : ((combine ctx weights).affine.c : ℝ) < 0 := by exact_mod_cast hc
    linarith
  · have hs' := hs ht
    rw [he, hc] at hs'
    norm_num at hs'

inductive CoverTree where
  | empty (weights : List Nat)
  | row (guard : List Atom)
  | split (atom : Atom) (yes no : CoverTree)
  deriving Repr, Lean.FromJson, Lean.ToJson

def checkCover (guards : List (List Atom)) (ctx : List Atom) : CoverTree → Bool
  | .empty weights => checkRefute ctx weights
  | .row guard => decide (guard ∈ guards) && guard.all (fun a => decide (a ∈ ctx))
  | .split a yes no =>
    checkCover guards (a :: ctx) yes && checkCover guards (a.complement :: ctx) no

theorem cover_sound (guards : List (List Atom)) (ctx : List Atom) (tree : CoverTree)
    (w h : ℝ) (ok : checkCover guards ctx tree = true) (hm : Holds ctx w h) :
    ∃ guard ∈ guards, Holds guard w h := by
  induction tree generalizing ctx with
  | empty weights =>
    exact False.elim (refute_sound ctx weights w h ok hm)
  | row guard =>
    simp only [checkCover, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at ok
    exact ⟨guard, ok.1, fun a ha => hm a (ok.2 a ha)⟩
  | split a yes no ihYes ihNo =>
    simp only [checkCover, Bool.and_eq_true] at ok
    by_cases ha : a.holds w h
    · exact ihYes (a :: ctx) ok.1 ((holds_cons a ctx w h).mpr ⟨ha, hm⟩)
    · exact ihNo (a.complement :: ctx) ok.2
        ((holds_cons a.complement ctx w h).mpr ⟨(complement_iff a w h).mpr ha, hm⟩)

structure Profile where
  widthMin : Int
  widthMax : Int
  heightMin : Int
  heightMax : Int
  safeLeft : Int
  safeRight : Int
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

def Profile.domain (p : Profile) : List Atom :=
  [⟨⟨1,0,-p.widthMin⟩,false⟩, ⟨⟨-1,0,p.widthMax⟩,false⟩,
   ⟨⟨0,1,-p.heightMin⟩,false⟩, ⟨⟨0,-1,p.heightMax⟩,false⟩]

def Profile.valid (p : Profile) : Bool := decide (0 < p.widthMin ∧ p.widthMin ≤ p.widthMax ∧
    0 < p.heightMin ∧ p.heightMin ≤ p.heightMax ∧ 0 ≤ p.safeLeft ∧ 0 ≤ p.safeRight)

structure Row where
  guard : List Atom
  start : Affine
  size : Affine
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

def Row.goals (p : Profile) (scale : Nat) (r : Row) : List Atom :=
  [⟨r.start.plus ⟨0,0,-((scale : Int)*p.safeLeft)⟩,false⟩,
   ⟨r.size,false⟩,
   ⟨(Affine.mk (scale : Int) 0 (-((scale : Int)*p.safeRight))).plus
     (r.start.plus r.size).neg,false⟩]

def Row.agreement (a b : Row) : List Atom :=
  [⟨a.start.plus b.start.neg,false⟩,⟨b.start.plus a.start.neg,false⟩,
   ⟨a.size.plus b.size.neg,false⟩,⟨b.size.plus a.size.neg,false⟩]

def safetyCases (p : Profile) (scale : Nat) (rows : List Row) : List (List Atom) :=
  rows.flatMap (fun r => (r.goals p scale).map (fun g => p.domain ++ r.guard ++ [g.complement]))

-- Check every ordered pair, including redundant rows. Overlap with
-- conflicting coordinates must not become a well-defined geometry.
def agreementCases (p : Profile) (rows : List Row) : List (List Atom) :=
  rows.flatMap (fun a => rows.flatMap (fun b =>
    (a.agreement b).map (fun g => p.domain ++ a.guard ++ b.guard ++ [g.complement])))

def checkCases : List (List Atom) → List (List Nat) → Bool
  | [], [] => true
  | ctx :: rest, ws :: certs => checkRefute ctx ws && checkCases rest certs
  | _, _ => false

theorem cases_sound (cases : List (List Atom)) (certs : List (List Nat))
    (ok : checkCases cases certs = true) (w h : ℝ) :
    ∀ ctx ∈ cases, ¬ Holds ctx w h := by
  induction cases generalizing certs with
  | nil => simp
  | cons ctx rest ih =>
    cases certs with
    | nil => simp [checkCases] at ok
    | cons ws certs =>
      simp only [checkCases, Bool.and_eq_true] at ok
      intro c hc
      rcases List.mem_cons.mp hc with hc | hc
      · subst c; exact refute_sound ctx ws w h ok.1
      · exact ih certs ok.2 c hc

structure Certificate where
  version : Nat
  profile : Profile
  scale : Nat
  rows : List Row
  coverage : CoverTree
  safety : List (List Nat)
  agreement : List (List Nat)
  deriving Repr, Lean.FromJson, Lean.ToJson

def Certificate.check (c : Certificate) : Bool :=
  c.version == 1 && c.profile.valid && c.scale > 0 &&
  !c.rows.isEmpty && c.rows.length ≤ 128 &&
  checkCover (c.rows.map Row.guard) c.profile.domain c.coverage &&
  checkCases (safetyCases c.profile c.scale c.rows) c.safety &&
  checkCases (agreementCases c.profile c.rows) c.agreement

theorem Certificate.sound (c : Certificate) (ok : c.check = true) (w h : ℝ)
    (hd : Holds c.profile.domain w h) :
    (∃ r ∈ c.rows, Holds r.guard w h) ∧
    (∀ r ∈ c.rows, Holds r.guard w h → ∀ g ∈ r.goals c.profile c.scale, g.holds w h) ∧
    (∀ a ∈ c.rows, ∀ b ∈ c.rows, Holds a.guard w h → Holds b.guard w h →
      ∀ g ∈ a.agreement b, g.holds w h) := by
  simp only [Certificate.check, Bool.and_eq_true] at ok
  obtain ⟨⟨⟨_, hc⟩, hs⟩, ha⟩ := ok
  constructor
  · obtain ⟨g, hg, hh⟩ := cover_sound _ _ _ w h hc hd
    obtain ⟨r, hr, rfl⟩ := List.mem_map.mp hg
    exact ⟨r, hr, hh⟩
  constructor
  · intro r hr hg g hgoal
    by_contra hn
    have hbad := cases_sound _ _ hs w h (c.profile.domain ++ r.guard ++ [g.complement]) (by
      apply List.mem_flatMap.mpr
      exact ⟨r, hr, List.mem_map.mpr ⟨g, hgoal, rfl⟩⟩)
    apply hbad
    apply (holds_append _ _ w h).mpr
    refine ⟨(holds_append _ _ w h).mpr ⟨hd,hg⟩, ?_⟩
    intro a hmem
    have eq : a = g.complement := by simpa using hmem
    subst a
    exact (complement_iff g w h).mpr hn
  · intro a ha' b hb' hga hgb g hg
    by_contra hn
    have hbad := cases_sound _ _ ha w h (c.profile.domain ++ a.guard ++ b.guard ++ [g.complement]) (by
      apply List.mem_flatMap.mpr
      exact ⟨a, ha', List.mem_flatMap.mpr ⟨b, hb', List.mem_map.mpr ⟨g, hg, rfl⟩⟩⟩)
    apply hbad
    apply (holds_append _ _ w h).mpr
    refine ⟨(holds_append _ _ w h).mpr ⟨(holds_append _ _ w h).mpr ⟨hd,hga⟩,hgb⟩, ?_⟩
    intro x hx
    have eq : x = g.complement := by simpa using hx
    subst x
    exact (complement_iff g w h).mpr hn

/-- Actual semantics of the shared-scale rectangle representation. -/
def Row.InlineFit (r : Row) (p : Profile) (scale : Nat) (w h : ℝ) : Prop :=
  (p.safeLeft : ℝ) ≤ r.start.eval w h / scale ∧
  0 ≤ r.size.eval w h / scale ∧
  (r.start.eval w h + r.size.eval w h) / scale ≤ w - (p.safeRight : ℝ)

theorem Row.goals_fit (r : Row) (p : Profile) (scale : Nat) (w h : ℝ)
    (hp : 0 < (scale : ℝ)) (hg : Holds (r.goals p scale) w h) :
    r.InlineFit p scale w h := by
  have hl := hg ⟨r.start.plus ⟨0,0,-((scale : Int)*p.safeLeft)⟩,false⟩ (by simp [goals])
  have hs := hg ⟨r.size,false⟩ (by simp [goals])
  have hr := hg ⟨(Affine.mk (scale : Int) 0 (-((scale : Int)*p.safeRight))).plus (r.start.plus r.size).neg,false⟩ (by simp [goals])
  -- Make the three guards explicit; no assumptions about evaluator output.
  change 0 ≤ (r.start.plus ⟨0,0,-((scale : Int)*p.safeLeft)⟩).eval w h at hl
  change 0 ≤ r.size.eval w h at hs
  change 0 ≤ ((Affine.mk (scale : Int) 0 (-((scale : Int)*p.safeRight))).plus
    (r.start.plus r.size).neg).eval w h at hr
  rw [eval_plus] at hl
  rw [eval_plus, eval_neg, eval_plus] at hr
  simp [Affine.eval] at hl hr
  refine ⟨(le_div_iff₀ hp).2 ?_, div_nonneg hs hp.le, (div_le_iff₀ hp).2 ?_⟩
  · simp [Affine.eval]; nlinarith
  · simp [Affine.eval]; nlinarith

theorem Certificate.verified_inline (c : Certificate) (ok : c.check = true)
    (w h : ℝ) (hd : Holds c.profile.domain w h) :
    (∃ r ∈ c.rows, Holds r.guard w h) ∧
    (∀ r ∈ c.rows, Holds r.guard w h → r.InlineFit c.profile c.scale w h) := by
  obtain ⟨cover, safe, _⟩ := c.sound ok w h hd
  have hp : 0 < c.scale := by
    simp only [Certificate.check, Bool.and_eq_true, decide_eq_true_eq] at ok
    exact ok.1.1.1.1.1.2
  exact ⟨cover, fun r hr hg => r.goals_fit c.profile c.scale w h (by exact_mod_cast hp) (safe r hr hg)⟩

theorem Profile.domain_iff (p : Profile) (w h : ℝ) :
    Holds p.domain w h ↔ ((p.widthMin : ℝ) ≤ w ∧ w ≤ (p.widthMax : ℝ) ∧
      (p.heightMin : ℝ) ≤ h ∧ h ≤ (p.heightMax : ℝ)) := by
  simp [Holds, Profile.domain, Atom.holds, Affine.eval]

theorem Row.agreement_eq (a b : Row) (w h : ℝ)
    (hg : Holds (a.agreement b) w h) :
    a.start.eval w h = b.start.eval w h ∧ a.size.eval w h = b.size.eval w h := by
  have al := hg ⟨a.start.plus b.start.neg,false⟩ (by simp [agreement])
  have ar := hg ⟨b.start.plus a.start.neg,false⟩ (by simp [agreement])
  have bl := hg ⟨a.size.plus b.size.neg,false⟩ (by simp [agreement])
  have br := hg ⟨b.size.plus a.size.neg,false⟩ (by simp [agreement])
  change 0 ≤ (a.start.plus b.start.neg).eval w h at al
  change 0 ≤ (b.start.plus a.start.neg).eval w h at ar
  change 0 ≤ (a.size.plus b.size.neg).eval w h at bl
  change 0 ≤ (b.size.plus a.size.neg).eval w h at br
  simp only [eval_plus, eval_neg] at al ar bl br
  exact ⟨by linarith, by linarith⟩

/-- The accepted piecewise model is total, unambiguous and contained on the
    entire real viewport rectangle, not just a finite sample of points. -/
theorem Certificate.total_unique_fit (c : Certificate) (ok : c.check = true)
    (w h : ℝ) (hw₁ : (c.profile.widthMin : ℝ) ≤ w) (hw₂ : w ≤ c.profile.widthMax)
    (hh₁ : (c.profile.heightMin : ℝ) ≤ h) (hh₂ : h ≤ c.profile.heightMax) :
    (∃ r ∈ c.rows, Holds r.guard w h ∧ r.InlineFit c.profile c.scale w h) ∧
    (∀ a ∈ c.rows, ∀ b ∈ c.rows, Holds a.guard w h → Holds b.guard w h →
      a.start.eval w h = b.start.eval w h ∧ a.size.eval w h = b.size.eval w h) := by
  have hd := (c.profile.domain_iff w h).mpr ⟨hw₁,hw₂,hh₁,hh₂⟩
  obtain ⟨cover, safe⟩ := c.verified_inline ok w h hd
  obtain ⟨r, hr, hg⟩ := cover
  refine ⟨⟨r,hr,hg,safe r hr hg⟩,?_⟩
  intro a ha b hb hga hgb
  exact a.agreement_eq b w h ((c.sound ok w h hd).2.2 a ha b hb hga hgb)

/-- Independent of the CSS producer: any shared affine progress in [0,1]
    preserves a linear scalar interval whose two endpoints satisfy it. -/
theorem interpolation_within (a b lo hi t : ℝ)
    (ha₁ : lo ≤ a) (ha₂ : a ≤ hi) (hb₁ : lo ≤ b) (hb₂ : b ≤ hi)
    (ht₁ : 0 ≤ t) (ht₂ : t ≤ 1) :
    lo ≤ (1-t)*a+t*b ∧ (1-t)*a+t*b ≤ hi := by
  constructor <;> nlinarith
    [mul_nonneg (sub_nonneg.mpr ht₂) (sub_nonneg.mpr ha₁),
     mul_nonneg ht₁ (sub_nonneg.mpr hb₁),
     mul_nonneg (sub_nonneg.mpr ht₂) (sub_nonneg.mpr ha₂),
     mul_nonneg ht₁ (sub_nonneg.mpr hb₂)]

end VerissLean
