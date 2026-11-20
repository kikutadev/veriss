import VerissLean
namespace VerissLean

-- The certificate producer is untrusted. Match the exact rational literals
-- of the original evidence to the normalized integer model inside Lean.
structure Literal where
  num : Int
  den : Nat
  deriving Repr

noncomputable def Literal.real (r : Literal) : ℝ := (r.num : ℝ) / (r.den : ℝ)

def Literal.matches (r : Literal) (n : Int) (scale : Nat) : Bool :=
  decide (0 < r.den ∧ 0 < scale ∧ n * (r.den : Int) = r.num * (scale : Int))

theorem Literal.matches_sound (r : Literal) (n : Int) (scale : Nat)
    (ok : r.matches n scale = true) : (n : ℝ) / (scale : ℝ) = r.real := by
  simp only [Literal.matches, decide_eq_true_eq] at ok
  have hd : (0 : ℝ) < r.den := by exact_mod_cast ok.1
  have hs : (0 : ℝ) < scale := by exact_mod_cast ok.2.1
  unfold Literal.real
  apply (div_eq_div_iff (ne_of_gt hs) (ne_of_gt hd)).mpr
  exact_mod_cast ok.2.2

def parseLiteral (s : String) : Except String Literal := do
  if s.length > 128 then throw "Exact rational input limit"
  match s.splitOn "/" with
  | [n] =>
    match n.toInt? with
    | some x => return ⟨x,1⟩
    | none => throw "Invalid integer literal"
  | [n,d] =>
    match n.toInt?, d.toNat? with
    | some x, some den =>
      if den == 0 then throw "Zero denominator"
      return ⟨x, den⟩
    | _,_ => throw "Invalid rational literal"
  | _ => throw "Invalid rational shape"

structure RawAffine where
  coefficient : String
  constant : String
  heightCoefficient : Option String := none
  deriving Lean.FromJson

structure LiteralAffine where
  x : Literal
  y : Literal
  c : Literal

def RawAffine.parse (a : RawAffine) : Except String LiteralAffine := do
  return ⟨← parseLiteral a.coefficient, ← parseLiteral (a.heightCoefficient.getD "0"), ← parseLiteral a.constant⟩
noncomputable def LiteralAffine.eval (a : LiteralAffine) (w h : ℝ) : ℝ := a.x.real*w+a.y.real*h+a.c.real
def LiteralAffine.denominator (a : LiteralAffine) : Nat := a.x.den*a.y.den*a.c.den
def LiteralAffine.matches (a : LiteralAffine) (b : Affine) (scale : Nat) : Bool :=
  a.x.matches b.x scale && a.y.matches b.y scale && a.c.matches b.c scale

theorem LiteralAffine.matches_sound (a : LiteralAffine) (b : Affine) (scale : Nat)
    (w h : ℝ) (ok : a.matches b scale = true) :
    b.eval w h / (scale : ℝ) = a.eval w h := by
  simp only [LiteralAffine.matches, Bool.and_eq_true] at ok
  unfold Affine.eval LiteralAffine.eval
  rw [add_div, add_div, mul_div_right_comm, mul_div_right_comm]
  rw [Literal.matches_sound _ _ _ ok.1.1, Literal.matches_sound _ _ _ ok.1.2,
    Literal.matches_sound _ _ _ ok.2]

theorem LiteralAffine.guard_sound (src : LiteralAffine) (a : Atom) (scale : Nat)
    (w h : ℝ) (ok : src.matches a.affine scale = true) :
    a.holds w h ↔ (if a.strict then 0 < src.eval w h else 0 ≤ src.eval w h) := by
  have he := src.matches_sound a.affine scale w h ok
  have hp : 0 < scale := by
    simp only [LiteralAffine.matches, Bool.and_eq_true, Literal.matches, decide_eq_true_eq] at ok
    exact ok.1.1.2.1
  have hp' : (0 : ℝ) < scale := by exact_mod_cast hp
  rw [← he]
  cases hs : a.strict <;> simp [Atom.holds, hs, le_div_iff₀ hp', lt_div_iff₀ hp']

structure RawAtom extends RawAffine where
  strict : Bool
  deriving Lean.FromJson

structure RawRect where
  inlineStart : RawAffine
  inlineSize : RawAffine
  deriving Lean.FromJson

structure RawRow where
  rect : RawRect
  constraints : List RawAtom := []
  deriving Lean.FromJson

structure RawRange where
  min : Int
  max : Int
  deriving Lean.FromJson

structure RawViewport extends RawRange where
  height : RawRange
  deriving Lean.FromJson

structure RawInsets where
  left : Int := 0
  right : Int := 0
  deriving Lean.FromJson

structure RawProfile where
  id : String
  viewport : RawViewport
  safeArea : Option RawInsets := none
  deriving Lean.FromJson

def RawProfile.normalized (p : RawProfile) : Profile :=
  let s := p.safeArea.getD {}
  ⟨p.viewport.min,p.viewport.max,p.viewport.height.min,p.viewport.height.max,s.left,s.right⟩

structure RawEvidence where
  state : String
  profile : String
  target : String
  axes : Option (List String) := none
  rows : Option (List RawRow) := none
  reason : Option String := none
  deriving Lean.FromJson

structure RawEnvironment where
  profiles : List RawProfile
  deriving Lean.FromJson
structure RawProof where
  environment : RawEnvironment
  deriving Lean.FromJson
structure RawReport where
  evidence : List RawEvidence
  report : RawProof
  deriving Lean.FromJson

def matchAtom (raw : RawAtom) (a : Atom) : Except String Bool := do
  let src ← raw.toRawAffine.parse
  return raw.strict == a.strict && src.matches a.affine src.denominator

def matchList (test : α → β → Except String Bool) : List α → List β → Except String Bool
  | [], [] => .ok true
  | a :: as, b :: bs => do
    if !(← test a b) then return false
    matchList test as bs
  | _, _ => .ok false

def matchRow (scale : Nat) (raw : RawRow) (r : Row) : Except String Bool := do
  let start ← raw.rect.inlineStart.parse
  let size ← raw.rect.inlineSize.parse
  return start.matches r.start scale && size.matches r.size scale &&
    (← matchList matchAtom raw.constraints r.guard)

def bindReport (raw : RawReport) (state profile target : String) (c : Certificate) : Except String Bool := do
  let [p] := raw.report.environment.profiles.filter (·.id == profile)
    | throw "Missing or ambiguous profile"
  let [e] := raw.evidence.filter (fun e => e.state == state && e.profile == profile && e.target == target)
    | throw "Missing or ambiguous evidence entry"
  if e.reason.isSome || !(e.axes == none || e.axes == some ["inline"]) then
    throw "Evidence has no supported inline model"
  let some rows := e.rows | throw "Missing row evidence"
  return decide (p.normalized = c.profile) && (← matchList (matchRow c.scale) rows c.rows)

end VerissLean
