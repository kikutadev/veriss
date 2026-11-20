import VerissLeanCSS

namespace VerissLean.Composition
open Lean Relation

-- Mapping from one parent viewport to a child allocation and origin.
-- This is mathematical geometry transport, not CSS unit localization.
structure Transfer where
  width : Scaled
  height : Scaled
  inlineStart : Scaled
  blockStart : Scaled
  deriving Repr, FromJson, ToJson

def Transfer.valid (t : Transfer) : Bool :=
  0 < t.width.den && 0 < t.height.den &&
  0 < t.inlineStart.den && 0 < t.blockStart.den

def Transfer.substitute (t : Transfer) (a : Scaled) : Scaled :=
  let u := t.width.mulLiteral ⟨a.affine.x,a.den⟩
  let v := t.height.mulLiteral ⟨a.affine.y,a.den⟩
  (u.plus v).plus (fromLiteral ⟨a.affine.c,a.den⟩)

theorem Transfer.substitute_sound (t : Transfer) (a : Scaled) (w h : ℝ)
    (ht : t.valid = true) (ha : 0 < a.den) :
    0 < (t.substitute a).den ∧
    (t.substitute a).eval w h = a.eval (t.width.eval w h) (t.height.eval w h) := by
  simp only [Transfer.valid,Bool.and_eq_true,decide_eq_true_eq] at ht
  have hu : 0 < (t.width.mulLiteral ⟨a.affine.x,a.den⟩).den := Nat.mul_pos ht.1.1.1 ha
  have hv : 0 < (t.height.mulLiteral ⟨a.affine.y,a.den⟩).den := Nat.mul_pos ht.1.1.2 ha
  have hc : 0 < (fromLiteral ⟨a.affine.c,a.den⟩).den := ha
  have huv := CSS.Scaled.plus_pos _ _ hu hv
  refine ⟨CSS.Scaled.plus_pos _ _ huv hc,?_⟩
  unfold Transfer.substitute
  rw [Scaled.plus_sound _ _ w h huv hc,Scaled.plus_sound _ _ w h hu hv,
      Scaled.mulLiteral_sound,Scaled.mulLiteral_sound,fromLiteral_sound]
  simp [Scaled.eval,Affine.eval,Literal.real]
  ring

def Transfer.transportAxis (t : Transfer) (horizontal : Bool) (a : Axis) : Axis :=
  ⟨(t.substitute a.start).plus (if horizontal then t.inlineStart else t.blockStart),
   t.substitute a.size⟩

theorem Transfer.transportAxis_sound (t : Transfer) (horizontal : Bool) (a : Axis)
    (w h : ℝ) (ht : t.valid = true) (ha : a.Valid) :
    (t.transportAxis horizontal a).start.eval w h =
      a.start.eval (t.width.eval w h) (t.height.eval w h) +
      (if horizontal then t.inlineStart else t.blockStart).eval w h ∧
    (t.transportAxis horizontal a).size.eval w h =
      a.size.eval (t.width.eval w h) (t.height.eval w h) := by
  have hx := t.substitute_sound a.start w h ht ha.1
  have hs := t.substitute_sound a.size w h ht ha.2
  have ho : 0 < (if horizontal then t.inlineStart else t.blockStart).den := by
    simp only [Transfer.valid,Bool.and_eq_true,decide_eq_true_eq] at ht
    cases horizontal <;> simp_all
  exact ⟨by simp only [Transfer.transportAxis]; rw [Scaled.plus_sound _ _ w h hx.1 ho,hx.2],
    hs.2⟩

-- Pull back a strict or closed half-plane without changing its strictness.
def Transfer.atom (t : Transfer) (a : Atom) : Atom :=
  ⟨(t.substitute ⟨a.affine,1⟩).affine,a.strict⟩

theorem Transfer.atom_sound (t : Transfer) (a : Atom) (w h : ℝ)
    (ht : t.valid = true) :
    (t.atom a).holds w h ↔ a.holds (t.width.eval w h) (t.height.eval w h) := by
  let s := t.substitute ⟨a.affine,1⟩
  have hs := t.substitute_sound ⟨a.affine,1⟩ w h ht (by change 0 < 1; decide)
  have hp : (0 : ℝ) < s.den := by exact_mod_cast hs.1
  have he : s.affine.eval w h / (s.den : ℝ) =
      a.affine.eval (t.width.eval w h) (t.height.eval w h) := by
    simpa [Scaled.eval] using hs.2
  unfold Transfer.atom Atom.holds
  change (if a.strict then 0 < s.affine.eval w h else 0 ≤ s.affine.eval w h) ↔ _
  rw [← he]
  cases a.strict <;> simp [hp,div_pos_iff,div_nonneg_iff,not_le.mpr hp]

def Transfer.domainCases (t : Transfer) (parent child : List Atom) : List (List Atom) :=
  let positive : List Atom := [⟨t.width.affine,true⟩,⟨t.height.affine,true⟩]
  (positive ++ child.map t.atom).map fun a => parent ++ [a.complement]

def Transfer.checkDomain (t : Transfer) (parent child : List Atom) (certs : List (List Nat)) : Bool :=
  t.valid && checkCases (t.domainCases parent child) certs

theorem Transfer.domain_sound (t : Transfer) (parent child : List Atom) (certs : List (List Nat))
    (ok : t.checkDomain parent child certs = true) (w h : ℝ) (hm : Holds parent w h) :
    0 < t.width.eval w h ∧ 0 < t.height.eval w h ∧
    Holds child (t.width.eval w h) (t.height.eval w h) := by
  simp only [Transfer.checkDomain,Bool.and_eq_true] at ok
  have all : Holds ([⟨t.width.affine,true⟩,⟨t.height.affine,true⟩] ++ child.map t.atom) w h := by
    intro a ha
    exact holdsGoal parent a w h hm (cases_sound _ _ ok.2 w h _
      (List.mem_map.mpr ⟨a,ha,rfl⟩))
  have da := ok.1
  simp only [Transfer.valid,Bool.and_eq_true,decide_eq_true_eq] at da
  have dw := da.1.1.1
  have dh := da.1.1.2
  have hw := all ⟨t.width.affine,true⟩ (by simp)
  have hh := all ⟨t.height.affine,true⟩ (by simp)
  refine ⟨div_pos hw (by exact_mod_cast dw),div_pos hh (by exact_mod_cast dh),?_⟩
  intro a ha
  exact (t.atom_sound a w h ok.1).mp (all _ (by simp [List.mem_map.mpr ⟨a,ha,rfl⟩]))

def Transfer.formula (t : Transfer) : Formula → Formula
  | .atom a => .atom (t.atom a)
  | .both a b => .both (t.formula a) (t.formula b)
  | .either a b => .either (t.formula a) (t.formula b)
  | .not a => .not (t.formula a)

theorem Transfer.formula_sound (t : Transfer) (f : Formula) (w h : ℝ)
    (ok : t.valid = true) :
    (t.formula f).holds w h ↔ f.holds (t.width.eval w h) (t.height.eval w h) := by
  induction f with
  | atom a => exact t.atom_sound a w h ok
  | both a b ia ib => simp [Transfer.formula,Formula.holds,ia,ib]
  | either a b ia ib => simp [Transfer.formula,Formula.holds,ia,ib]
  | not a ia => simp [Transfer.formula,Formula.holds,ia]

theorem Transfer.guard_sound (t : Transfer) (xs : List Atom) (w h : ℝ)
    (ok : t.valid = true) :
    Holds (xs.map t.atom) w h ↔ Holds xs (t.width.eval w h) (t.height.eval w h) := by
  constructor
  · intro hm a ha
    exact (t.atom_sound a w h ok).mp (hm _ (List.mem_map.mpr ⟨a,ha,rfl⟩))
  · intro hm a ha
    obtain ⟨b,hb,rfl⟩ := List.mem_map.mp ha
    exact (t.atom_sound b w h ok).mpr (hm _ hb)

-- One complete border rectangle (inline, block) per child/parent piece.
-- The implicit binding is one target, parent global coordinate system.
def Transfer.transportPiece (t : Transfer) (r : Piece) : Option Piece :=
  match r.axes with
  | [x,y] => some ⟨r.guard.map t.atom,
      [t.transportAxis true x,t.transportAxis false y],t.formula r.goal⟩
  | _ => none

def Transfer.bindingAtoms (t : Transfer) (parent child : Piece) : Option (List Atom) := do
  let transported ← t.transportPiece child
  if parent.axes.length != 2 then none else some (parent.agreement transported)

def Transfer.context (t : Transfer) (parent : Problem) (r s : Piece) : List Atom :=
  parent.domain ++ r.guard ++ s.guard.map t.atom

def Transfer.pairCases (t : Transfer) (parent : Problem) (r s : Piece) : List (List Atom) :=
  (t.bindingAtoms r s).getD [] |>.map fun a => t.context parent r s ++ [a.complement]

def Transfer.bindingCases (t : Transfer) (parent child : Problem) : List (List Atom) :=
  parent.pieces.flatMap fun r => child.pieces.flatMap fun s => t.pairCases parent r s

def Transfer.shapeOK (parent child : Problem) : Bool :=
  (parent.pieces ++ child.pieces).all fun r => r.axes.length == 2

def Transfer.implicationPieces (t : Transfer) (parent child : Problem) : List Piece :=
  parent.pieces.flatMap fun r => child.pieces.map fun s =>
    ⟨r.guard ++ s.guard.map t.atom, [],.either (.not (t.formula s.goal)) r.goal⟩

structure CompositionCertificate where
  child : VerifiedCertificate
  parentModel : ModelCertificate
  allocation : List (List Nat)
  binding : List (List Nat)
  implication : List TruthTree
  deriving FromJson, ToJson

def Transfer.checkComposition (t : Transfer) (parent child : Problem) (c : CompositionCertificate) : Bool :=
  Transfer.shapeOK parent child &&
    child.checkVerified c.child && parent.checkModel c.parentModel &&
    t.checkDomain parent.domain child.domain c.allocation &&
    checkCases (t.bindingCases parent child) c.binding &&
    checkGoals parent.domain (t.implicationPieces parent child) c.implication

theorem Transfer.composition_sound (t : Transfer) (parent child : Problem) (c : CompositionCertificate)
    (ok : t.checkComposition parent child c = true) (w h : ℝ) (hd : Holds parent.domain w h) :
    (∃ r ∈ parent.pieces, Holds r.guard w h) ∧
    ∀ r ∈ parent.pieces, Holds r.guard w h → r.goal.holds w h := by
  simp only [Transfer.checkComposition,Bool.and_eq_true] at ok
  have ha := t.domain_sound parent.domain child.domain c.allocation ok.1.1.2 w h hd
  obtain ⟨cover,truth⟩ := child.verified_sound c.child ok.1.1.1.1.2
    (t.width.eval w h) (t.height.eval w h) ha.2.2
  obtain ⟨s,hs,hg⟩ := cover
  have valid : t.valid = true := (Bool.and_eq_true_iff.mp ok.1.1.2).1
  have guards := (t.guard_sound s.guard w h valid).mpr hg
  refine ⟨(parent.model_sound c.parentModel ok.1.1.1.2 w h hd).1,?_⟩
  intro r hr hgr
  let piece : Piece := ⟨r.guard ++ s.guard.map t.atom, [], .either (.not (t.formula s.goal)) r.goal⟩
  have hm : piece ∈ t.implicationPieces parent child :=
    List.mem_flatMap.mpr ⟨r,hr,List.mem_map.mpr ⟨s,hs,rfl⟩⟩
  have hg' : Holds piece.guard w h := (holds_append _ _ w h).mpr ⟨hgr,guards⟩
  have hi := goals_sound parent.domain _ _ ok.2 w h hd piece hm hg'
  have ht := (t.formula_sound s.goal w h valid).mpr (truth s hs hg)
  exact hi.resolve_left (fun hn => hn ht)

theorem Transfer.binding_sound (t : Transfer) (parent child : Problem) (c : CompositionCertificate)
    (ok : t.checkComposition parent child c = true) (w h : ℝ) (hd : Holds parent.domain w h)
    (r s transported : Piece) (hr : r ∈ parent.pieces) (hs : s ∈ child.pieces)
    (hgr : Holds r.guard w h) (hgs : Holds s.guard (t.width.eval w h) (t.height.eval w h))
    (eq : t.transportPiece s = some transported) :
    Holds (r.agreement transported) w h := by
  simp only [Transfer.checkComposition,Bool.and_eq_true] at ok
  have hl := (List.all_eq_true.mp ok.1.1.1.1.1) r (List.mem_append_left _ hr)
  have valid : t.valid = true := (Bool.and_eq_true_iff.mp ok.1.1.2).1
  have hguard := (t.guard_sound s.guard w h valid).mpr hgs
  have hctx : Holds (t.context parent r s) w h :=
    (holds_append _ _ w h).mpr ⟨(holds_append _ _ w h).mpr ⟨hd,hgr⟩,hguard⟩
  intro a ha
  apply holdsGoal (t.context parent r s) a w h hctx
  apply cases_sound _ _ ok.1.2 w h
  apply List.mem_flatMap.mpr
  refine ⟨r,hr,List.mem_flatMap.mpr ⟨s,hs,?_⟩⟩
  simp only [Transfer.pairCases,Transfer.bindingAtoms,eq,bind,Option.bind]
  have hlen : r.axes.length = 2 := by simpa using hl
  simp [hlen]
  exact ⟨a,ha,rfl⟩

structure CompositionInput where
  transfer : Transfer
  parent : Problem
  child : Problem
  parentPoint : Point
  deriving FromJson

def CompositionInput.plan (i : CompositionInput) : Json :=
  Json.mkObj [("child",planJson i.child),("parent",planJson i.parent),
    ("allocation",toJson (i.transfer.domainCases i.parent.domain i.child.domain)),
    ("binding",toJson (i.transfer.bindingCases i.parent i.child)),
    ("implication",toJson (i.transfer.implicationPieces i.parent i.child))]

def CompositionInput.valid (i : CompositionInput) : Bool :=
  0 < i.parentPoint.den && 0 < i.parentPoint.x && 0 < i.parentPoint.y &&
  i.parentPoint.holds i.parent.domain &&
  i.transfer.valid && Transfer.shapeOK i.parent i.child &&
  !i.parent.pieces.isEmpty && !i.child.pieces.isEmpty &&
  i.parent.pieces.length * i.child.pieces.length ≤ 128

def CompositionInput.check (i : CompositionInput) (c : CompositionCertificate) : Bool :=
  i.valid && i.transfer.checkComposition i.parent i.child c

theorem CompositionInput.nonempty (i : CompositionInput) (ok : i.valid = true) :
    Holds i.parent.domain i.parentPoint.width i.parentPoint.height := by
  simp only [CompositionInput.valid,Bool.and_eq_true,decide_eq_true_eq] at ok
  exact (i.parentPoint.holds_sound i.parent.domain ok.1.1.1.1.1.1.1.1).mp
    ok.1.1.1.1.1.2

end VerissLean.Composition
