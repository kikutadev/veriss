import VerissLeanSource

namespace VerissLean.Relation

/-- A rational affine expression. Comparison multiplies by positive
denominators, so no approximate arithmetic occurs in the checker. -/
structure Scaled where
  affine : Affine
  den : Nat
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

noncomputable def Scaled.eval (v : Scaled) (w h : ℝ) : ℝ :=
  v.affine.eval w h / (v.den : ℝ)
def Scaled.plus (a b : Scaled) : Scaled :=
  ⟨(a.affine.scale b.den).plus (b.affine.scale a.den), a.den*b.den⟩
def Scaled.neg (a : Scaled) : Scaled := ⟨a.affine.neg,a.den⟩
def Scaled.diff (a b : Scaled) : Scaled := a.plus b.neg
def Scaled.compare (a b : Scaled) (strict : Bool) : Atom :=
  ⟨(a.diff b).affine,strict⟩

theorem Scaled.compare_sound (a b : Scaled) (strict : Bool) (w h : ℝ)
    (ha : 0 < a.den) (hb : 0 < b.den) :
    (a.compare b strict).holds w h ↔
      (if strict then b.eval w h < a.eval w h else b.eval w h ≤ a.eval w h) := by
  have ha' : (0 : ℝ) < a.den := by exact_mod_cast ha
  have hb' : (0 : ℝ) < b.den := by exact_mod_cast hb
  cases strict <;> simp [Scaled.compare, Scaled.diff, Scaled.plus, Scaled.neg, Atom.holds, Scaled.eval]
  · rw [div_le_div_iff₀ hb' ha']
    constructor <;> intro h' <;> linarith
  · rw [div_lt_div_iff₀ hb' ha']
    constructor <;> intro h' <;> linarith

inductive Formula where
  | atom (a : Atom)
  | both (a b : Formula)
  | either (a b : Formula)
  | not (a : Formula)
  deriving Repr, Lean.FromJson, Lean.ToJson

def Formula.holds : Formula → ℝ → ℝ → Prop
  | .atom a,w,h => a.holds w h
  | .both a b,w,h => a.holds w h ∧ b.holds w h
  | .either a b,w,h => a.holds w h ∨ b.holds w h
  | .not a,w,h => ¬ a.holds w h

def Formula.known (ctx : List Atom) : Formula → Bool → Bool
  | .atom a,wanted => decide ((if wanted then a else a.complement) ∈ ctx)
  | .both a b,true => a.known ctx true && b.known ctx true
  | .both a b,false => a.known ctx false || b.known ctx false
  | .either a b,true => a.known ctx true || b.known ctx true
  | .either a b,false => a.known ctx false && b.known ctx false
  | .not a,wanted => a.known ctx (!wanted)

theorem Formula.known_sound (f : Formula) (ctx : List Atom) (wanted : Bool)
    (w h : ℝ) (ok : f.known ctx wanted = true) (hm : Holds ctx w h) :
    if wanted then f.holds w h else ¬ f.holds w h := by
  induction f generalizing wanted with
  | atom a =>
    cases wanted
    · exact (complement_iff a w h).mp (hm _ (of_decide_eq_true ok))
    · exact hm _ (of_decide_eq_true ok)
  | both a b ia ib =>
    cases wanted
    · simp only [Formula.known, Bool.or_eq_true] at ok
      rcases ok with ha | hb
      · exact fun hh => ia false ha hh.1
      · exact fun hh => ib false hb hh.2
    · simp only [Formula.known, Bool.and_eq_true] at ok
      exact ⟨ia true ok.1, ib true ok.2⟩
  | either a b ia ib =>
    cases wanted
    · simp only [Formula.known, Bool.and_eq_true] at ok
      exact fun hh => hh.elim (ia false ok.1) (ib false ok.2)
    · simp only [Formula.known, Bool.or_eq_true] at ok
      exact ok.elim (fun ha => Or.inl (ia true ha)) (fun hb => Or.inr (ib true hb))
  | not a ia =>
    cases wanted
    · exact fun hn => hn (ia true ok)
    · exact ia false ok

inductive TruthTree where
  | empty (weights : List Nat)
  | known
  | split (atom : Atom) (yes no : TruthTree)
  deriving Repr, Lean.FromJson, Lean.ToJson

def checkTruth (ctx : List Atom) (f : Formula) : TruthTree → Bool
  | .empty weights => checkRefute ctx weights
  | .known => f.known ctx true
  | .split a yes no =>
    checkTruth (a::ctx) f yes && checkTruth (a.complement::ctx) f no

theorem truth_sound (ctx : List Atom) (f : Formula) (t : TruthTree) (w h : ℝ)
    (ok : checkTruth ctx f t = true) (hm : Holds ctx w h) : f.holds w h := by
  induction t generalizing ctx with
  | empty weights => exact False.elim (refute_sound ctx weights w h ok hm)
  | known => exact f.known_sound ctx true w h ok hm
  | split a yes no iy ino =>
    simp only [checkTruth, Bool.and_eq_true] at ok
    by_cases ha : a.holds w h
    · exact iy _ ok.1 ((holds_cons a ctx w h).mpr ⟨ha,hm⟩)
    · exact ino _ ok.2 ((holds_cons a.complement ctx w h).mpr ⟨(complement_iff a w h).mpr ha,hm⟩)

structure Axis where
  start : Scaled
  size : Scaled
  deriving Repr, Lean.FromJson, Lean.ToJson

structure Piece where
  guard : List Atom
  axes : List Axis
  goal : Formula
  deriving Repr, Lean.FromJson, Lean.ToJson

def Piece.values (r : Piece) : List Scaled := r.axes.flatMap fun a => [a.start,a.size]
def Piece.dimensions (r : Piece) : List Atom := r.axes.map fun a => ⟨a.size.affine,false⟩
def Piece.valid (r : Piece) : Bool := r.values.all fun a => decide (0 < a.den)

def Piece.agreement (a b : Piece) : List Atom :=
  (a.values.zip b.values).flatMap fun (x,y) => [x.compare y false,y.compare x false]

structure Problem where
  domain : List Atom
  pieces : List Piece
  deriving Repr, Lean.FromJson, Lean.ToJson

def Problem.dimCases (p : Problem) : List (List Atom) :=
  p.pieces.flatMap fun r => r.dimensions.map fun g => p.domain ++ r.guard ++ [g.complement]
def Problem.agreeCases (p : Problem) : List (List Atom) :=
  p.pieces.flatMap fun a => p.pieces.flatMap fun b =>
    (a.agreement b).map fun g => p.domain ++ a.guard ++ b.guard ++ [g.complement]

structure ModelCertificate where
  coverage : CoverTree
  dimensions : List (List Nat)
  agreement : List (List Nat)
  deriving Repr, Lean.FromJson, Lean.ToJson

def Problem.checkModel (p : Problem) (c : ModelCertificate) : Bool :=
  !p.pieces.isEmpty && p.pieces.length ≤ 128 &&
  p.pieces.all (fun r => r.valid && r.axes.length == (p.pieces.head?.map (·.axes.length)).getD 0) &&
  checkCover (p.pieces.map (·.guard)) p.domain c.coverage &&
  checkCases p.dimCases c.dimensions && checkCases p.agreeCases c.agreement

theorem holdsGoal (pre : List Atom) (g : Atom) (w h : ℝ)
    (hm : Holds pre w h) (hbad : ¬ Holds (pre ++ [g.complement]) w h) : g.holds w h := by
  by_contra hn
  apply hbad
  apply (holds_append _ _ w h).mpr
  refine ⟨hm,?_⟩
  intro x hx
  have eq : x = g.complement := by simpa using hx
  subst x
  exact (complement_iff g w h).mpr hn

theorem Problem.model_sound (p : Problem) (c : ModelCertificate)
    (ok : p.checkModel c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    (∀ r ∈ p.pieces, Holds r.guard w h → Holds r.dimensions w h) ∧
    (∀ a ∈ p.pieces, ∀ b ∈ p.pieces, Holds a.guard w h → Holds b.guard w h →
      Holds (a.agreement b) w h) := by
  simp only [Problem.checkModel, Bool.and_eq_true] at ok
  obtain ⟨⟨⟨_, hc⟩,hs⟩,ha⟩ := ok
  constructor
  · obtain ⟨g,hg,hh⟩ := cover_sound _ _ _ w h hc hd
    obtain ⟨r,hr,rfl⟩ := List.mem_map.mp hg
    exact ⟨r,hr,hh⟩
  constructor
  · intro r hr hg g hgoal
    apply holdsGoal (p.domain ++ r.guard) g w h ((holds_append _ _ w h).mpr ⟨hd,hg⟩)
    exact cases_sound _ _ hs w h _ (List.mem_flatMap.mpr ⟨r,hr,List.mem_map.mpr ⟨g,hgoal,rfl⟩⟩)
  · intro a ha' b hb' hga hgb g hg
    apply holdsGoal (p.domain ++ a.guard ++ b.guard) g w h
      ((holds_append _ _ w h).mpr ⟨(holds_append _ _ w h).mpr ⟨hd,hga⟩,hgb⟩)
    exact cases_sound _ _ ha w h _ (List.mem_flatMap.mpr
      ⟨a,ha',List.mem_flatMap.mpr ⟨b,hb',List.mem_map.mpr ⟨g,hg,rfl⟩⟩⟩)

theorem Problem.validPiece (p : Problem) (c : ModelCertificate)
    (ok : p.checkModel c = true) (r : Piece) (hr : r ∈ p.pieces) : r.valid = true := by
  simp only [Problem.checkModel,Bool.and_eq_true] at ok
  have h := (List.all_eq_true.mp ok.1.1.1.2) r hr
  simp only [Bool.and_eq_true] at h
  exact h.1

theorem Piece.valid_den (r : Piece) (hr : r.valid = true)
    (a : Scaled) (ha : a ∈ r.values) : 0 < a.den := by
  exact of_decide_eq_true ((List.all_eq_true.mp hr) a ha)

theorem Problem.nonnegative_sizes (p : Problem) (c : ModelCertificate)
    (ok : p.checkModel c = true) (w h : ℝ) (hd : Holds p.domain w h)
    (r : Piece) (hr : r ∈ p.pieces) (hg : Holds r.guard w h)
    (a : Axis) (ha : a ∈ r.axes) :
    0 ≤ a.size.eval w h := by
  have hm := (p.model_sound c ok w h hd).2.1 r hr hg
  have hn := hm ⟨a.size.affine,false⟩ (List.mem_map.mpr ⟨a,ha,rfl⟩)
  change 0 ≤ a.size.affine.eval w h at hn
  unfold Scaled.eval
  exact div_nonneg hn (by positivity)

theorem zip_mem {α β : Type} (xs : List α) (ys : List β) (a : α) (b : β)
    (h : (a,b) ∈ xs.zip ys) : a ∈ xs ∧ b ∈ ys := by
  induction xs generalizing ys with
  | nil => simp at h
  | cons x xs ih =>
    cases ys with
    | nil => simp at h
    | cons y ys =>
      simp only [List.zip_cons_cons,List.mem_cons,Prod.mk.injEq] at h
      rcases h with ⟨rfl,rfl⟩ | h
      · simp
      · obtain ⟨ha,hb⟩ := ih ys h
        exact ⟨List.mem_cons_of_mem _ ha,List.mem_cons_of_mem _ hb⟩

theorem Problem.overlap_agreement (p : Problem) (c : ModelCertificate)
    (ok : p.checkModel c = true) (w h : ℝ) (hd : Holds p.domain w h)
    (r s : Piece) (hr : r ∈ p.pieces) (hs : s ∈ p.pieces)
    (hgr : Holds r.guard w h) (hgs : Holds s.guard w h)
    (a b : Scaled) (hab : (a,b) ∈ r.values.zip s.values) :
    a.eval w h = b.eval w h := by
  have hagree := (p.model_sound c ok w h hd).2.2 r hr s hs hgr hgs
  obtain ⟨ha,hb⟩ := zip_mem _ _ _ _ hab
  have da := r.valid_den (p.validPiece c ok r hr) a ha
  have db := s.valid_den (p.validPiece c ok s hs) b hb
  have h₁ := hagree (a.compare b false) (List.mem_flatMap.mpr ⟨(a,b),hab,by simp⟩)
  have h₂ := hagree (b.compare a false) (List.mem_flatMap.mpr ⟨(a,b),hab,by simp⟩)
  exact le_antisymm ((Scaled.compare_sound b a false w h db da).mp h₂)
    ((Scaled.compare_sound a b false w h da db).mp h₁)

def checkGoals (domain : List Atom) : List Piece → List TruthTree → Bool
  | [],[] => true
  | r::rs,t::ts => checkTruth (domain ++ r.guard) r.goal t && checkGoals domain rs ts
  | _,_ => false

theorem goals_sound (domain : List Atom) (rs : List Piece) (ts : List TruthTree)
    (ok : checkGoals domain rs ts = true) (w h : ℝ) (hd : Holds domain w h) :
    ∀ r ∈ rs, Holds r.guard w h → r.goal.holds w h := by
  induction rs generalizing ts with
  | nil => simp
  | cons r rs ih =>
    cases ts with
    | nil => simp [checkGoals] at ok
    | cons t ts =>
      simp only [checkGoals,Bool.and_eq_true] at ok
      intro x hx hg
      rcases List.mem_cons.mp hx with hx | hx
      · subst x
        exact truth_sound _ _ _ w h ok.1 ((holds_append _ _ w h).mpr ⟨hd,hg⟩)
      · exact ih ts ok.2 x hx hg

structure VerifiedCertificate where
  model : ModelCertificate
  goals : List TruthTree
  deriving Repr, Lean.FromJson, Lean.ToJson

def Problem.checkVerified (p : Problem) (c : VerifiedCertificate) : Bool :=
  p.checkModel c.model && checkGoals p.domain p.pieces c.goals

theorem Problem.verified_sound (p : Problem) (c : VerifiedCertificate)
    (ok : p.checkVerified c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    (∀ r ∈ p.pieces, Holds r.guard w h → r.goal.holds w h) := by
  simp only [Problem.checkVerified,Bool.and_eq_true] at ok
  exact ⟨(p.model_sound c.model ok.1 w h hd).1,goals_sound _ _ _ ok.2 w h hd⟩

/-- Exact rational counterexample. One shared positive denominator. -/
structure Point where
  x : Int
  y : Int
  den : Nat
  deriving Repr, Lean.FromJson, Lean.ToJson
noncomputable def Point.width (v : Point) : ℝ := (v.x : ℝ) / (v.den : ℝ)
noncomputable def Point.height (v : Point) : ℝ := (v.y : ℝ) / (v.den : ℝ)
def Point.eval (v : Point) (a : Affine) : Int := a.x*v.x+a.y*v.y+a.c*(v.den : Int)
def Point.atom (v : Point) (a : Atom) : Bool :=
  if a.strict then decide (0 < v.eval a.affine) else decide (0 ≤ v.eval a.affine)

theorem Point.atom_sound (v : Point) (a : Atom) (hv : 0 < v.den) :
    v.atom a = true ↔ a.holds v.width v.height := by
  have hp : (0 : ℝ) < v.den := by exact_mod_cast hv
  have he : (v.eval a.affine : ℝ) = a.affine.eval v.width v.height * (v.den : ℝ) := by
    unfold Point.eval
    simp [Affine.eval, Point.width, Point.height]
    rw [add_mul,add_mul,mul_assoc,mul_assoc,div_mul_cancel₀ _ (ne_of_gt hp),div_mul_cancel₀ _ (ne_of_gt hp)]
  cases hs : a.strict
  · simp only [Point.atom, Atom.holds, hs, Bool.false_eq_true, ↓reduceIte, decide_eq_true_eq]
    rw [← Int.cast_nonneg (R := ℝ), he, mul_nonneg_iff_of_pos_right hp]
  · simp only [Point.atom, Atom.holds, hs, ↓reduceIte, decide_eq_true_eq]
    rw [← Int.cast_pos (R := ℝ), he, mul_pos_iff_of_pos_right hp]

def Point.holds (v : Point) (ctx : List Atom) : Bool := ctx.all v.atom

theorem Point.holds_sound (v : Point) (ctx : List Atom) (hv : 0 < v.den) :
    v.holds ctx = true ↔ Holds ctx v.width v.height := by
  simp [Point.holds, Holds, List.all_eq_true, v.atom_sound _ hv]

def Point.formula (v : Point) : Formula → Bool
  | .atom a => v.atom a
  | .both a b => v.formula a && v.formula b
  | .either a b => v.formula a || v.formula b
  | .not a => !(v.formula a)

theorem Point.formula_sound (v : Point) (f : Formula) (hv : 0 < v.den) :
    v.formula f = true ↔ f.holds v.width v.height := by
  induction f with
  | atom a => exact v.atom_sound a hv
  | both a b ia ib => simp [Point.formula, Formula.holds, ia, ib]
  | either a b ia ib => simp [Point.formula, Formula.holds, ia, ib]
  | not a ia => simp [Point.formula, Formula.holds, ← ia]

structure ViolationCertificate where
  model : ModelCertificate
  point : Point
  deriving Repr, Lean.FromJson, Lean.ToJson

def Problem.checkViolated (p : Problem) (c : ViolationCertificate) : Bool :=
  p.checkModel c.model && c.point.den > 0 && c.point.holds p.domain &&
  p.pieces.any (fun r => c.point.holds r.guard && !(c.point.formula r.goal))

theorem Problem.violated_sound (p : Problem) (c : ViolationCertificate)
    (ok : p.checkViolated c = true) :
    Holds p.domain c.point.width c.point.height ∧
    ∃ r ∈ p.pieces, Holds r.guard c.point.width c.point.height ∧
      ¬ r.goal.holds c.point.width c.point.height := by
  simp only [Problem.checkViolated, Bool.and_eq_true, decide_eq_true_eq,List.any_eq_true] at ok
  obtain ⟨⟨⟨_,hv⟩,hd⟩,r,hr,hg,hf⟩ := ok
  refine ⟨(c.point.holds_sound _ hv).mp hd,r,hr,(c.point.holds_sound _ hv).mp hg,?_⟩
  intro ht
  have htrue := (c.point.formula_sound r.goal hv).mpr ht
  simp [htrue] at hf

end VerissLean.Relation
