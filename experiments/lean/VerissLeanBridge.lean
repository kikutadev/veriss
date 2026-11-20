import VerissLeanReport

namespace VerissLean.Relation

-- The meaning of the normalized geometry and predicate before compiling
-- them into halfspaces. Positive denominators are explicit premises.
def Axis.Valid (a : Axis) : Prop := 0 < a.start.den ∧ 0 < a.size.den
def NamedRow.Valid (r : NamedRow) : Prop :=
  (∀ a ∈ r.inline.toList, a.Valid) ∧ (∀ a ∈ r.block.toList, a.Valid)

noncomputable def axisValue (a : Axis) (k : String) (w h : ℝ) : Option ℝ :=
  match k with
  | "inlineStart" | "blockStart" => some (a.start.eval w h)
  | "inlineSize" | "blockSize" => some (a.size.eval w h)
  | "inlineEnd" | "blockEnd" => some (a.start.eval w h + a.size.eval w h)
  | _ => none

noncomputable def NamedRow.fieldValue (r : NamedRow) (k : String) (w h : ℝ) : Option ℝ :=
  (r.selectAxis k).bind
    fun axis => axisValue axis k w h

theorem axisField_sound (a : Axis) (k : String) (z : Scaled) (w h : ℝ)
    (ha : a.Valid)
    (ok : a.field k = .ok z) :
    0 < z.den ∧ axisValue a k w h = some (z.eval w h) := by
  unfold axisValue
  unfold Axis.field at ok
  split at ok <;> try simp_all only [Except.ok.injEq]
  all_goals try subst z
  all_goals try exact ⟨ha.1,trivial⟩
  all_goals try exact ⟨ha.2,trivial⟩
  all_goals try exact ⟨Nat.mul_pos ha.1 ha.2, congrArg some (Scaled.plus_sound _ _ w h ha.1 ha.2).symm⟩
  all_goals contradiction

theorem NamedRow.selectAxis_valid (r : NamedRow) (k : String) (a : Axis)
    (hr : r.Valid) (he : r.selectAxis k = some a) : a.Valid := by
  unfold NamedRow.selectAxis at he
  split at he
  · apply hr.1 a
    rw [he]
    exact List.mem_singleton_self _
  · split at he
    · apply hr.2 a
      rw [he]
      exact List.mem_singleton_self _
    · cases he

theorem fieldOption_sound (oa : Option Axis) (k : String) (z : Scaled) (w h : ℝ)
    (hv : ∀ a, oa = some a → a.Valid)
    (ok : (match oa with
      | none => (Except.error "Required geometry axis missing" : Except String Scaled)
      | some a => a.field k) = .ok z) :
    0 < z.den ∧ (oa.bind fun axis => axisValue axis k w h) = some (z.eval w h) := by
  cases oa with
  | none => cases ok
  | some a => exact axisField_sound a k z w h (hv a rfl) ok

theorem NamedRow.field_sound (r : NamedRow) (k : String) (z : Scaled) (w h : ℝ)
    (hr : r.Valid) (ok : r.field k = .ok z) :
    0 < z.den ∧ r.fieldValue k w h = some (z.eval w h) :=
  fieldOption_sound (r.selectAxis k) k z w h (fun a he => r.selectAxis_valid k a hr he) ok

noncomputable def envMeaning (p : InstanceProfile) (k : String) (w h : ℝ) : Option ℝ :=
  match k with
  | "width" => some w
  | "height" => some h
  | "safeLeft" => some p.base.safeLeft
  | "safeRight" => some (w - p.base.safeRight)
  | "safeTop" => some p.safeTop
  | "safeBottom" => some (h - p.safeBottom)
  | _ => none

theorem envValue_sound (p : InstanceProfile) (k : String) (z : Scaled) (w h : ℝ)
    (ok : envValue p k = .ok z) :
    0 < z.den ∧ envMeaning p k w h = some (z.eval w h) := by
  unfold envValue at ok
  unfold envMeaning
  split at ok <;> try simp_all only [Except.ok.injEq]
  all_goals try subst z
  all_goals try contradiction
  all_goals simp [Scaled.eval, Affine.eval, integer, sub_eq_add_neg]

def Operand.Valid : Operand → Prop
  | .constant k => 0 < k.den
  | .env _ | .field _ _ => True
  | .add a b => a.Valid ∧ b.Valid
  | .scale k a => 0 < k.den ∧ a.Valid

noncomputable def Operand.value (p : InstanceProfile) (rows : List (String × NamedRow))
    (w h : ℝ) : Operand → Option ℝ
  | .constant k => some k.real
  | .env k => envMeaning p k w h
  | .field t k => (rows.lookup t).bind fun r => r.fieldValue k w h
  | .add a b => do return (← a.value p rows w h) + (← b.value p rows w h)
  | .scale k a => do return (← a.value p rows w h) * k.real

theorem Operand.compile_sound (o : Operand) (p : InstanceProfile) (rows : List (String × NamedRow))
    (w h : ℝ) (z : Scaled) (hv : o.Valid)
    (hr : ∀ t r, rows.lookup t = some r → r.Valid)
    (ok : o.compile p rows = .ok z) :
    0 < z.den ∧ o.value p rows w h = some (z.eval w h) := by
  induction o generalizing z with
  | constant k =>
    simp only [Operand.compile, Except.ok.injEq] at ok
    subst z
    exact ⟨hv,congrArg some (fromLiteral_sound k w h).symm⟩
  | env k => exact envValue_sound p k z w h ok
  | field t k =>
    simp only [Operand.compile] at ok
    cases he : rows.lookup t with
    | none => simp [he] at ok
    | some r =>
      simp [he] at ok
      simpa [Operand.value,he] using r.field_sound k z w h (hr t r he) ok
  | add a b ia ib =>
    simp only [Operand.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha, bind, Except.bind] at ok
    | ok x =>
      cases hb : b.compile p rows with
      | error e => simp [ha,hb, bind, Except.bind] at ok
      | ok y =>
        simp [ha,hb, bind, Except.bind, pure, Except.pure] at ok
        subst z
        obtain ⟨hxd,hx⟩ := ia x hv.1 ha
        obtain ⟨hyd,hy⟩ := ib y hv.2 hb
        exact ⟨Nat.mul_pos hxd hyd, by simp [Operand.value,hx,hy,Scaled.plus_sound x y w h hxd hyd]⟩
  | scale k a ia =>
    simp only [Operand.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha, bind, Except.bind] at ok
    | ok x =>
      simp [ha, bind, Except.bind, pure, Except.pure] at ok
      subst z
      obtain ⟨hxd,hx⟩ := ia x hv.2 ha
      exact ⟨Nat.mul_pos hxd hv.1, by simp [Operand.value,hx,Scaled.mulLiteral_sound]⟩

def Predicate.Valid : Predicate → Prop
  | .compare _ a b => a.Valid ∧ b.Valid
  | .both a b | .either a b => a.Valid ∧ b.Valid
  | .not a => a.Valid

-- The result is present only when all operands were defined.
noncomputable def Predicate.meaning (p : InstanceProfile) (rows : List (String × NamedRow))
    (w h : ℝ) : Predicate → Option Prop
  | .compare rel a b => do return comparisonMeaning rel (← a.value p rows w h) (← b.value p rows w h)
  | .both a b => do return (← a.meaning p rows w h) ∧ (← b.meaning p rows w h)
  | .either a b => do return (← a.meaning p rows w h) ∨ (← b.meaning p rows w h)
  | .not a => do return ¬ (← a.meaning p rows w h)

theorem Predicate.compile_sound (pred : Predicate) (p : InstanceProfile)
    (rows : List (String × NamedRow)) (w h : ℝ) (f : Formula)
    (hv : pred.Valid) (hr : ∀ t r, rows.lookup t = some r → r.Valid)
    (ok : pred.compile p rows = .ok f) :
    pred.meaning p rows w h = some (f.holds w h) := by
  induction pred generalizing f with
  | compare rel a b =>
    simp only [Predicate.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha,bind,Except.bind] at ok
    | ok x =>
      cases hb : b.compile p rows with
      | error e => simp [ha,hb,bind,Except.bind] at ok
      | ok y =>
        simp [ha,hb,bind,Except.bind] at ok
        obtain ⟨hxd,hx⟩ := a.compile_sound p rows w h x hv.1 hr ha
        obtain ⟨hyd,hy⟩ := b.compile_sound p rows w h y hv.2 hr hb
        simp [Predicate.meaning,hx,hy,compareFormula_sound rel x y f hxd hyd w h ok]
  | both a b ia ib =>
    simp only [Predicate.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha,bind,Except.bind] at ok
    | ok x =>
      cases hb : b.compile p rows with
      | error e => simp [ha,hb,bind,Except.bind] at ok
      | ok y =>
        simp [ha,hb,bind,Except.bind,pure,Except.pure] at ok
        subst f
        simp [Predicate.meaning,ia x hv.1 ha,ib y hv.2 hb,Formula.holds]
  | either a b ia ib =>
    simp only [Predicate.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha,bind,Except.bind] at ok
    | ok x =>
      cases hb : b.compile p rows with
      | error e => simp [ha,hb,bind,Except.bind] at ok
      | ok y =>
        simp [ha,hb,bind,Except.bind,pure,Except.pure] at ok
        subst f
        simp [Predicate.meaning,ia x hv.1 ha,ib y hv.2 hb,Formula.holds]
  | not a ia =>
    simp only [Predicate.compile] at ok
    cases ha : a.compile p rows with
    | error e => simp [ha,bind,Except.bind] at ok
    | ok x =>
      simp [ha,bind,Except.bind,pure,Except.pure] at ok
      subst f
      simp [Predicate.meaning,ia x hv ha,Formula.holds]

theorem Predicate.checked_piece_sound (pred : Predicate) (env : InstanceProfile)
    (rows : List (String × NamedRow)) (p : Problem) (c : VerifiedCertificate)
    (r : Piece) (w h : ℝ)
    (valid : pred.Valid) (rowValid : ∀ t a, rows.lookup t = some a → a.Valid)
    (compiled : pred.compile env rows = .ok r.goal)
    (checked : p.checkVerified c = true) (domain : Holds p.domain w h)
    (member : r ∈ p.pieces) (guard : Holds r.guard w h) :
    ∃ claim, pred.meaning env rows w h = some claim ∧ claim := by
  exact ⟨r.goal.holds w h, pred.compile_sound env rows w h r.goal valid rowValid compiled,
    (p.verified_sound c checked w h domain).2 r member guard⟩

#print axioms Operand.compile_sound
#print axioms Predicate.compile_sound
#print axioms Predicate.checked_piece_sound

end VerissLean.Relation
