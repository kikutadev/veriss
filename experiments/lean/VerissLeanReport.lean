import VerissLeanRelation

namespace VerissLean.Relation
open Lean

def require (b : Bool) (msg : String) : Except String Unit :=
  if b then .ok () else .error msg

def str (j : Json) (k : String) : Except String String := j.getObjValAs? String k
def items (j : Json) (k : String) : Except String (List Json) := do
  return (← (← j.getObjVal? k).getArr?).toList
def shape (j : Json) (keys : List String) : Except String Unit := do
  let fields ← j.getObj?
  require (fields.all fun k _ => keys.contains k) "Unsupported JSON field"

def zero : Scaled := ⟨Affine.zero,1⟩
def integer (n : Int) : Scaled := ⟨⟨0,0,n⟩,1⟩
def fromLiteral (a : Literal) : Scaled := ⟨⟨0,0,a.num⟩,a.den⟩
def normalizeAffine (v : LiteralAffine) : Scaled :=
  ⟨⟨v.x.num*(v.y.den*v.c.den : Nat),
     v.y.num*(v.x.den*v.c.den : Nat),
     v.c.num*(v.x.den*v.y.den : Nat)⟩,v.denominator⟩

theorem normalizeAffine_matches (v : LiteralAffine)
    (hx : 0 < v.x.den) (hy : 0 < v.y.den) (hc : 0 < v.c.den) :
    v.matches (normalizeAffine v).affine (normalizeAffine v).den = true := by
  have hp : 0 < v.denominator := mul_pos (mul_pos hx hy) hc
  simp only [LiteralAffine.matches,Bool.and_eq_true,Literal.matches,decide_eq_true_eq,
    normalizeAffine,LiteralAffine.denominator,Nat.cast_mul] at *
  exact ⟨⟨⟨hx,hp,by ring⟩,⟨hy,hp,by ring⟩⟩,⟨hc,hp,by ring⟩⟩

theorem normalizeAffine_sound (v : LiteralAffine) (w h : ℝ)
    (hx : 0 < v.x.den) (hy : 0 < v.y.den) (hc : 0 < v.c.den) :
    (normalizeAffine v).eval w h = v.eval w h :=
  v.matches_sound _ _ w h (normalizeAffine_matches v hx hy hc)

def fromRawAffine (a : RawAffine) : Except String Scaled := do
  return normalizeAffine (← a.parse)

def Scaled.mulLiteral (a : Scaled) (b : Literal) : Scaled :=
  ⟨⟨b.num*a.affine.x,b.num*a.affine.y,b.num*a.affine.c⟩,a.den*b.den⟩

theorem Scaled.plus_sound (a b : Scaled) (w h : ℝ)
    (ha : 0 < a.den) (hb : 0 < b.den) :
    (a.plus b).eval w h = a.eval w h + b.eval w h := by
  have ha' : (0 : ℝ) < a.den := by exact_mod_cast ha
  have hb' : (0 : ℝ) < b.den := by exact_mod_cast hb
  simp only [Scaled.plus, Scaled.eval, eval_plus, eval_scale, Nat.cast_mul, add_div]
  congr 1
  · rw [mul_comm (a.den : ℝ) (b.den : ℝ)]
    exact mul_div_mul_left _ _ (ne_of_gt hb')
  · exact mul_div_mul_left _ _ (ne_of_gt ha')

theorem Scaled.mulLiteral_sound (a : Scaled) (b : Literal) (w h : ℝ) :
    (a.mulLiteral b).eval w h = a.eval w h * b.real := by
  unfold Scaled.mulLiteral Scaled.eval Literal.real
  have he : (Affine.mk (b.num*a.affine.x) (b.num*a.affine.y) (b.num*a.affine.c)).eval w h =
      a.affine.eval w h * (b.num : ℝ) := by
    simp [Affine.eval]
    ring
  rw [he, Nat.cast_mul, div_mul_div_comm]

theorem fromLiteral_sound (a : Literal) (w h : ℝ) :
    (fromLiteral a).eval w h = a.real := by
  simp [fromLiteral,Scaled.eval,Affine.eval,Literal.real]

inductive Operand where
  | constant (v : Literal)
  | env (k : String)
  | field (target name : String)
  | add (a b : Operand)
  | scale (factor : Literal) (a : Operand)

def Operand.nodeCount : Operand → Nat
  | .constant _ | .env _ | .field _ _ => 1
  | .add a b => 1+a.nodeCount+b.nodeCount
  | .scale _ a => 1+a.nodeCount

def Operand.refs : Operand → List String
  | .constant _ | .env _ => []
  | .field t _ => [t]
  | .add a b => a.refs ++ b.refs
  | .scale _ a => a.refs

inductive Predicate where
  | compare (rel : String) (a b : Operand)
  | both (a b : Predicate)
  | either (a b : Predicate)
  | not (a : Predicate)

def Predicate.nodeCount : Predicate → Nat
  | .compare _ a b => 1+a.nodeCount+b.nodeCount
  | .both a b | .either a b => 1+a.nodeCount+b.nodeCount
  | .not a => 1+a.nodeCount

def Predicate.refs : Predicate → List String
  | .compare _ a b => a.refs ++ b.refs
  | .both a b | .either a b => a.refs ++ b.refs
  | .not a => a.refs

def parseOperand : Nat → Json → Except String Operand
  | 0,_ => .error "Operand depth limit"
  | fuel+1,j => do
    if let .ok s := j.getStr? then return .constant (← parseLiteral s)
    if let .ok e := str j "environment" then
      shape j ["environment"]
      require (["width","height","safeLeft","safeRight","safeTop","safeBottom"].contains e) "Unsupported environment"
      return .env e
    if let .ok t := str j "target" then
      shape j ["target","field","endpoint"]
      if let .ok endpoint := str j "endpoint" then
        require (endpoint == "before") "Transition endpoint unsupported"
      else require (j.getObjValD "endpoint" == .null) "Invalid endpoint"
      let f ← str j "field"
      require (["inlineStart","inlineSize","inlineEnd","blockStart","blockSize","blockEnd"].contains f) "Unsupported geometry field"
      return .field t f
    match ← str j "op" with
    | "add" =>
      shape j ["op","items"]
      let xs ← items j "items"
      require (xs.length > 0 && xs.length ≤ 16) "Operand count limit"
      let vs ← xs.mapM (parseOperand fuel)
      return vs.foldl Operand.add (.constant ⟨0,1⟩)
    | "scale" =>
      shape j ["op","factor","item"]
      return .scale (← parseLiteral (← str j "factor")) (← parseOperand fuel (← j.getObjVal? "item"))
    | _ => throw "Unsupported operand"

def parsePredicate : Nat → Json → Except String Predicate
  | 0,_ => .error "Predicate depth limit"
  | fuel+1,j => do
    match ← str j "op" with
    | "compare" =>
      shape j ["op","relation","left","right"]
      let r ← str j "relation"
      require (["ge","gt","le","lt","eq","ne"].contains r) "Unsupported comparison"
      return .compare r (← parseOperand fuel (← j.getObjVal? "left")) (← parseOperand fuel (← j.getObjVal? "right"))
    | "all" | "any" =>
      shape j ["op","items"]
      let xs ← items j "items"
      require (xs.length > 0 && xs.length ≤ 16) "Predicate count limit"
      let vs ← xs.mapM (parsePredicate fuel)
      let head :: rest := vs | throw "Empty predicate"
      return rest.foldl (if (← str j "op") == "all" then Predicate.both else Predicate.either) head
    | "not" =>
      shape j ["op","item"]
      return .not (← parsePredicate fuel (← j.getObjVal? "item"))
    | _ => throw "Unsupported predicate op"

structure InstanceProfile where
  base : Profile
  safeTop : Int
  safeBottom : Int

def getProfile (j : Json) : Except String InstanceProfile := do
  let p : RawProfile ← fromJson? j
  let sa := j.getObjValD "safeArea"
  let inset (k : String) : Except String Int :=
    match sa.getObjVal? k with
    | .ok v => v.getInt?
    | .error _ => .ok 0
  let top ← inset "top"
  let bottom ← inset "bottom"
  require (p.normalized.valid && top ≥ 0 && bottom ≥ 0) "Invalid environment bounds"
  require (p.normalized.safeLeft+p.normalized.safeRight < p.normalized.widthMin &&
    top+bottom < p.normalized.heightMin) "Empty safe area"
  return ⟨p.normalized,top,bottom⟩

def envValue (p : InstanceProfile) (k : String) : Except String Scaled :=
  match k with
  | "width" => .ok ⟨⟨1,0,0⟩,1⟩
  | "height" => .ok ⟨⟨0,1,0⟩,1⟩
  | "safeLeft" => .ok (integer p.base.safeLeft)
  | "safeRight" => .ok ⟨⟨1,0,-p.base.safeRight⟩,1⟩
  | "safeTop" => .ok (integer p.safeTop)
  | "safeBottom" => .ok ⟨⟨0,1,-p.safeBottom⟩,1⟩
  | _ => .error "Unknown environment"

structure NamedRow where
  guard : List Atom
  inline : Option Axis
  block : Option Axis

def NamedRow.axes (r : NamedRow) : List Axis :=
  r.inline.toList ++ r.block.toList

def NamedRow.field (r : NamedRow) (k : String) : Except String Scaled := do
  let some axis := (if k.startsWith "inline" then r.inline else if k.startsWith "block" then r.block else none)
    | throw "Required geometry axis missing"
  match k with
  | "inlineStart" | "blockStart" => return axis.start
  | "inlineSize" | "blockSize" => return axis.size
  | "inlineEnd" | "blockEnd" => return axis.start.plus axis.size
  | _ => throw "Invalid field"

def Operand.compile (p : InstanceProfile) (rows : List (String × NamedRow)) :
    Operand → Except String Scaled
  | .constant a => .ok (fromLiteral a)
  | .env k => envValue p k
  | .field t k => do
    let some r := rows.lookup t | throw "Missing target row"
    r.field k
  | .add a b => do return (← a.compile p rows).plus (← b.compile p rows)
  | .scale k a => do return (← a.compile p rows).mulLiteral k

def compareFormula (rel : String) (a b : Scaled) : Except String Formula :=
  let ge := Formula.atom (a.compare b false)
  let le := Formula.atom (b.compare a false)
  match rel with
  | "ge" => .ok ge
  | "le" => .ok le
  | "gt" => .ok (.atom (a.compare b true))
  | "lt" => .ok (.atom (b.compare a true))
  | "eq" => .ok (.both ge le)
  | "ne" => .ok (.not (.both ge le))
  | _ => .error "Unsupported comparison"

def comparisonMeaning (rel : String) (a b : ℝ) : Prop :=
  match rel with
  | "ge" => b ≤ a
  | "le" => a ≤ b
  | "gt" => b < a
  | "lt" => a < b
  | "eq" => a = b
  | "ne" => a ≠ b
  | _ => False

theorem compareFormula_sound (rel : String) (a b : Scaled) (f : Formula)
    (ha : 0 < a.den) (hb : 0 < b.den) (w h : ℝ)
    (ok : compareFormula rel a b = .ok f) :
    f.holds w h ↔ comparisonMeaning rel (a.eval w h) (b.eval w h) := by
  unfold compareFormula at ok
  split at ok <;> simp_all only [Except.ok.injEq]
  all_goals try subst f
  all_goals simp_all [Formula.holds, comparisonMeaning, Scaled.compare_sound,ha,hb]
  · exact ⟨fun h' => le_antisymm h'.2 h'.1, fun h' => h' ▸ ⟨le_rfl,le_rfl⟩⟩
  · constructor
    · intro h' he
      have hle : b.eval w h ≤ a.eval w h := he.ge
      have hlt := h' hle
      linarith
    · intro h' hab
      exact lt_of_le_of_ne hab (Ne.symm h')

def Predicate.compile (p : InstanceProfile) (rows : List (String × NamedRow)) :
    Predicate → Except String Formula
  | .compare r a b => do compareFormula r (← a.compile p rows) (← b.compile p rows)
  | .both a b => do return .both (← a.compile p rows) (← b.compile p rows)
  | .either a b => do return .either (← a.compile p rows) (← b.compile p rows)
  | .not a => do return .not (← a.compile p rows)

def all (head : Predicate) (rest : List Predicate) : Predicate := rest.foldl Predicate.both head
def any (head : Predicate) (rest : List Predicate) : Predicate := rest.foldl Predicate.either head

def lowerContract (c : Json) : Except String Predicate := do
  let kind ← str c "kind"
  require (c.getObjValD "event" == .null) "Event/transition contracts unsupported"
  if kind == "predicate" then
    shape c ["id","kind","states","profiles","predicate"]
    return ← parsePredicate 24 (← c.getObjVal? "predicate")
  let t ← str c "target"
  let a := Operand.field t
  let cmp := Predicate.compare
  match kind with
  | "within-viewport" =>
    shape c ["id","kind","states","profiles","target"]
    return all (cmp "ge" (a "inlineStart") (.env "safeLeft"))
      [cmp "ge" (a "blockStart") (.env "safeTop"),cmp "le" (a "inlineEnd") (.env "safeRight"),
       cmp "le" (a "blockEnd") (.env "safeBottom")]
  | "min-size" =>
    shape c ["id","kind","states","profiles","target","width","height"]
    let w ← c.getObjValAs? Int "width"
    let h ← c.getObjValAs? Int "height"
    require (w ≥ 0 && h ≥ 0) "Negative minimum"
    return .both (cmp "ge" (a "inlineSize") (.constant ⟨w,1⟩))
      (cmp "ge" (a "blockSize") (.constant ⟨h,1⟩))
  | "contains" | "disjoint" =>
    shape c ["id","kind","states","profiles","target","other"]
    let other ← str c "other"
    require (other != t) "Repeated target"
    let b := Operand.field other
    if kind == "contains" then
      return all (cmp "le" (a "inlineStart") (b "inlineStart"))
        [cmp "ge" (a "inlineEnd") (b "inlineEnd"),cmp "le" (a "blockStart") (b "blockStart"),
         cmp "ge" (a "blockEnd") (b "blockEnd")]
    else
      let z := Operand.constant ⟨0,1⟩
      return any (cmp "le" (a "inlineEnd") (b "inlineStart"))
        [cmp "le" (b "inlineEnd") (a "inlineStart"),cmp "eq" (a "inlineSize") z,cmp "eq" (b "inlineSize") z,
         cmp "le" (a "blockEnd") (b "blockStart"),cmp "le" (b "blockEnd") (a "blockStart"),
         cmp "eq" (a "blockSize") z,cmp "eq" (b "blockSize") z]
  | _ => throw "Unsupported contract kind"

def readRow (j : Json) (axes : List String) : Except String NamedRow := do
  let raw : List RawAtom ← j.getObjValAs? (List RawAtom) "constraints"
  require (raw.length ≤ 64) "Constraint count limit"
  let gs ← raw.mapM fun g => do
    let a ← fromRawAffine g.toRawAffine
    return (⟨a.affine,g.strict⟩ : Atom)
  let r ← j.getObjVal? "rect"
  let expected := axes.flatMap fun a => [a++"Start",a++"Size"]
  shape r expected
  let axis (k : String) : Except String (Option Axis) := do
    if !axes.contains k then return none
    let start ← fromRawAffine (← r.getObjValAs? RawAffine (k++"Start"))
    let size ← fromRawAffine (← r.getObjValAs? RawAffine (k++"Size"))
    return some ⟨start,size⟩
  return ⟨gs,← axis "inline",← axis "block"⟩

def selectOne (xs : List Json) (test : Json → Bool) : Except String Json :=
  match xs.filter test with
  | [x] => .ok x
  | _ => .error "Missing or ambiguous source entry"

def matchesId (j : Json) (key value : String) : Bool :=
  j.getObjValD key == toJson value

def selectAllowed (j : Json) (key value : String) : Except String Unit := do
  if j.getObjValD key == .null then return ()
  let choices ← j.getObjValAs? (List String) key
  require (choices.contains value) "Selected instance is outside contract"

def getProblem (raw : Json) (state profile contract : String) : Except String Problem := do
  let report ← raw.getObjVal? "report"
  let p ← selectOne (← items (← report.getObjVal? "environment") "profiles") (fun j => matchesId j "id" profile)
  let env ← getProfile p
  let c ← selectOne (← items (← report.getObjVal? "contract") "contracts") (fun j => matchesId j "id" contract)
  selectAllowed c "states" state
  selectAllowed c "profiles" profile
  let predicate ← lowerContract c
  require (predicate.nodeCount ≤ 256) "Predicate node limit"
  let refs := predicate.refs.eraseDups
  require (refs.length ≤ 8) "Target count limit"
  let evidence ← items raw "evidence"
  let mut combinations : List (List (String × NamedRow)) := [[]]
  for t in refs do
    let e ← selectOne evidence (fun j => matchesId j "state" state && matchesId j "profile" profile && matchesId j "target" t)
    require (e.getObjValD "reason" == .null) "Unresolved geometry"
    let axes ← if e.getObjValD "axes" == .null then pure ["inline","block"] else e.getObjValAs? (List String) "axes"
    require (axes == ["inline"] || axes == ["block"] || axes == ["inline","block"] || axes == ["block","inline"]) "Unsupported axes"
    let rs ← items e "rows"
    require (rs.length > 0 && rs.length * combinations.length ≤ 128) "Combined row limit"
    let rows ← rs.mapM (fun r => readRow r axes)
    combinations := combinations.flatMap fun cs => rows.map fun r => cs ++ [(t,r)]
  let pieces ← combinations.mapM fun rs => do
    let goal ← predicate.compile env rs
    return (⟨rs.flatMap (fun (_,r) => r.guard),rs.flatMap (fun (_,r) => r.axes),goal⟩ : Piece)
  let maxGuard := pieces.foldl (fun n r => max n r.guard.length) 0
  let axisCount := pieces.head?.map (·.axes.length) |>.getD 0
  require (pieces.length * pieces.length * max 1 (4*axisCount) * (5+2*maxGuard) ≤ 2000000) "Proof obligation budget"
  return ⟨env.base.domain,pieces⟩

def planJson (p : Problem) : Json :=
  Json.mkObj [("problem",toJson p),("dimensions",toJson p.dimCases),("agreement",toJson p.agreeCases)]

end VerissLean.Relation
