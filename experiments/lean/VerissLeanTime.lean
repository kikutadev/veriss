import VerissLean

namespace VerissLean.Time

/-- A normalized, shared piecewise-linear progress model, not CSS timing extraction. -/
structure Knot where
  time : Nat
  num : Nat
  den : Nat
  deriving Repr, Lean.FromJson, Lean.ToJson

def Knot.valid (k : Knot) : Bool := 0 < k.den && k.num ≤ k.den
noncomputable def Knot.value (k : Knot) : ℝ := (k.num : ℝ) / (k.den : ℝ)

theorem Knot.bounded (k : Knot) (ok : k.valid = true) :
    0 ≤ k.value ∧ k.value ≤ 1 := by
  simp only [Knot.valid, Bool.and_eq_true, decide_eq_true_eq] at ok
  have hd : (0 : ℝ) < k.den := by exact_mod_cast ok.1
  have hn : (k.num : ℝ) ≤ k.den := by exact_mod_cast ok.2
  constructor
  · exact div_nonneg (Nat.cast_nonneg _) hd.le
  · exact (div_le_one hd).mpr hn

noncomputable def fraction (a b : Knot) (t : ℝ) : ℝ :=
  (t - a.time) / ((b.time : ℝ) - a.time)

noncomputable def interpolate (a b : Knot) (t : ℝ) : ℝ :=
  (1 - fraction a b t) * a.value + fraction a b t * b.value

theorem interpolate_bounded (a b : Knot) (t : ℝ)
    (ha : a.valid = true) (hb : b.valid = true)
    (hab : a.time < b.time) (ht₁ : (a.time : ℝ) ≤ t) (ht₂ : t ≤ b.time) :
    0 ≤ interpolate a b t ∧ interpolate a b t ≤ 1 := by
  have hab' : (a.time : ℝ) < b.time := by exact_mod_cast hab
  have hd := sub_pos.mpr hab'
  have h₀ : 0 ≤ fraction a b t := div_nonneg (sub_nonneg.mpr ht₁) hd.le
  have h₁ : fraction a b t ≤ 1 := (div_le_one hd).mpr (by linarith)
  exact interpolation_within a.value b.value 0 1 (fraction a b t)
    (a.bounded ha).1 (a.bounded ha).2 (b.bounded hb).1 (b.bounded hb).2 h₀ h₁

def checkChain (duration : Nat) (a : Knot) : List Knot → Bool
  | [] => a.valid && a.time == duration && a.num == a.den
  | b :: bs => a.valid && decide (a.time < b.time) && checkChain duration b bs

def At (a : Knot) (t u : ℝ) : List Knot → Prop
  | [] => t = a.time ∧ u = a.value
  | b :: bs => ((a.time : ℝ) ≤ t ∧ t ≤ b.time ∧ u = interpolate a b t) ∨ At b t u bs

theorem chain_head_valid (duration : Nat) (a : Knot) (bs : List Knot)
    (ok : checkChain duration a bs = true) : a.valid = true := by
  cases bs <;> simp only [checkChain, Bool.and_eq_true] at ok <;> exact ok.1.1

theorem chain_covers (duration : Nat) (a : Knot) (bs : List Knot)
    (ok : checkChain duration a bs = true) (t : ℝ)
    (hlo : (a.time : ℝ) ≤ t) (hhi : t ≤ duration) :
    ∃ u, At a t u bs := by
  induction bs generalizing a with
  | nil =>
    simp only [checkChain, Bool.and_eq_true, beq_iff_eq] at ok
    have he : (a.time : ℝ) = duration := by exact_mod_cast ok.1.2
    exact ⟨a.value, by simp [At]; linarith⟩
  | cons b bs ih =>
    simp only [checkChain, Bool.and_eq_true, decide_eq_true_eq] at ok
    by_cases ht : t ≤ (b.time : ℝ)
    · exact ⟨interpolate a b t, Or.inl ⟨hlo,ht,rfl⟩⟩
    · obtain ⟨u,hu⟩ := ih b ok.2 (le_of_lt (lt_of_not_ge ht))
      exact ⟨u,Or.inr hu⟩

theorem chain_bounded (duration : Nat) (a : Knot) (bs : List Knot)
    (ok : checkChain duration a bs = true) (t u : ℝ) (hu : At a t u bs) :
    0 ≤ u ∧ u ≤ 1 := by
  induction bs generalizing a with
  | nil =>
    obtain ⟨_,rfl⟩ := hu
    exact a.bounded (chain_head_valid duration a [] ok)
  | cons b bs ih =>
    simp only [checkChain, Bool.and_eq_true, decide_eq_true_eq] at ok
    rcases hu with ⟨hlo,hhi,rfl⟩ | ht
    · exact interpolate_bounded a b t ok.1.1 (chain_head_valid duration b bs ok.2) ok.1.2 hlo hhi
    · exact ih b ok.2 ht

structure Trace where
  duration : Nat
  knots : List Knot
  deriving Repr, Lean.FromJson, Lean.ToJson

def Trace.check (tr : Trace) : Bool :=
  match tr.knots with
  | [] => false
  | a :: bs => 0 < tr.duration && tr.duration ≤ 1000000000 &&
      tr.knots.length ≤ 256 && a.time == 0 && a.num == 0 && checkChain tr.duration a bs

theorem Trace.continuous_domain_safe (tr : Trace) (a : Knot) (bs : List Knot)
    (hk : tr.knots = a :: bs) (ok : tr.check = true) (t : ℝ)
    (h₀ : 0 ≤ t) (h₁ : t ≤ tr.duration) (lo hi x y : ℝ)
    (hx₀ : lo ≤ x) (hx₁ : x ≤ hi) (hy₀ : lo ≤ y) (hy₁ : y ≤ hi) :
    (∃ u, At a t u bs) ∧
    ∀ u, At a t u bs → lo ≤ (1-u)*x+u*y ∧ (1-u)*x+u*y ≤ hi := by
  simp only [Trace.check, hk, Bool.and_eq_true, decide_eq_true_eq, beq_iff_eq] at ok
  have ht : (a.time : ℝ) ≤ t := by
    rw [ok.1.1.2]
    simpa using h₀
  refine ⟨chain_covers tr.duration a bs ok.2 t ht h₁, ?_⟩
  intro u hu
  have hb := chain_bounded tr.duration a bs ok.2 t u hu
  exact interpolation_within x y lo hi u hx₀ hx₁ hy₀ hy₁ hb.1 hb.2

end VerissLean.Time
