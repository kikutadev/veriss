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

-- false = before, true = after. A pair avoids collisions with arbitrary target IDs.
abbrev TargetRef := Bool × String

inductive Operand where
  | constant (v : Literal)
  | env (k : String)
  | field (target : TargetRef) (name : String)
  | add (a b : Operand)
  | scale (factor : Literal) (a : Operand)

def Operand.nodeCount : Operand → Nat
  | .constant _ | .env _ | .field _ _ => 1
  | .add a b => 1+a.nodeCount+b.nodeCount
  | .scale _ a => 1+a.nodeCount

def Operand.refs : Operand → List TargetRef
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

def Predicate.refs : Predicate → List TargetRef
  | .compare _ a b => a.refs ++ b.refs
  | .both a b | .either a b => a.refs ++ b.refs
  | .not a => a.refs

def parseOperand (allowAfter : Bool) : Nat → Json → Except String Operand
  | 0,_ => .error "Operand depth limit"
  | fuel+1,j => do
    if let .ok s := j.getStr? then return .constant (← parseLiteral s)
    if let .ok e := str j "environment" then
      shape j ["environment"]
      require (["width","height","safeLeft","safeRight","safeTop","safeBottom"].contains e) "Unsupported environment"
      return .env e
    if let .ok t := str j "target" then
      shape j ["target","field","endpoint"]
      let endpoint ← if j.getObjValD "endpoint" == .null then pure "before" else str j "endpoint"
      require (endpoint == "before" || (allowAfter && endpoint == "after")) "Transition endpoint unsupported"
      let f ← str j "field"
      require (["inlineStart","inlineSize","inlineEnd","blockStart","blockSize","blockEnd"].contains f) "Unsupported geometry field"
      return .field (endpoint == "after",t) f
    match ← str j "op" with
    | "add" =>
      shape j ["op","items"]
      let xs ← items j "items"
      require (xs.length > 0 && xs.length ≤ 16) "Operand count limit"
      let vs ← xs.mapM (parseOperand allowAfter fuel)
      return vs.foldl Operand.add (.constant ⟨0,1⟩)
    | "scale" =>
      shape j ["op","factor","item"]
      return .scale (← parseLiteral (← str j "factor")) (← parseOperand allowAfter fuel (← j.getObjVal? "item"))
    | _ => throw "Unsupported operand"

def parsePredicate (allowAfter : Bool) : Nat → Json → Except String Predicate
  | 0,_ => .error "Predicate depth limit"
  | fuel+1,j => do
    match ← str j "op" with
    | "compare" =>
      shape j ["op","relation","left","right"]
      let r ← str j "relation"
      require (["ge","gt","le","lt","eq","ne"].contains r) "Unsupported comparison"
      return .compare r (← parseOperand allowAfter fuel (← j.getObjVal? "left")) (← parseOperand allowAfter fuel (← j.getObjVal? "right"))
    | "all" | "any" =>
      shape j ["op","items"]
      let xs ← items j "items"
      require (xs.length > 0 && xs.length ≤ 16) "Predicate count limit"
      let vs ← xs.mapM (parsePredicate allowAfter fuel)
      let head :: rest := vs | throw "Empty predicate"
      return rest.foldl (if (← str j "op") == "all" then Predicate.both else Predicate.either) head
    | "not" =>
      shape j ["op","item"]
      return .not (← parsePredicate allowAfter fuel (← j.getObjVal? "item"))
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

@[irreducible] def NamedRow.selectAxis (r : NamedRow) (k : String) : Option Axis :=
  if k.startsWith "inline" then r.inline else if k.startsWith "block" then r.block else none

def Axis.field (axis : Axis) (k : String) : Except String Scaled :=
  match k with
  | "inlineStart" | "blockStart" => .ok axis.start
  | "inlineSize" | "blockSize" => .ok axis.size
  | "inlineEnd" | "blockEnd" => .ok (axis.start.plus axis.size)
  | _ => .error "Invalid field"

def NamedRow.field (r : NamedRow) (k : String) : Except String Scaled :=
  match r.selectAxis k with
  | none => .error "Required geometry axis missing"
  | some a => a.field k

def Operand.compile (p : InstanceProfile) (rows : List (TargetRef × NamedRow)) :
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

def Predicate.compile (p : InstanceProfile) (rows : List (TargetRef × NamedRow)) :
    Predicate → Except String Formula
  | .compare r a b => do compareFormula r (← a.compile p rows) (← b.compile p rows)
  | .both a b => do return .both (← a.compile p rows) (← b.compile p rows)
  | .either a b => do return .either (← a.compile p rows) (← b.compile p rows)
  | .not a => do return .not (← a.compile p rows)

def all (head : Predicate) (rest : List Predicate) : Predicate := rest.foldl Predicate.both head
def any (head : Predicate) (rest : List Predicate) : Predicate := rest.foldl Predicate.either head

def lowerContract (c : Json) (event : Option String := none) : Except String Predicate := do
  let kind ← str c "kind"
  let declared : Option String ← fromJson? (c.getObjValD "event")
  require (declared == event) "Event/transition contracts unsupported or event mismatch"
  if kind == "predicate" then
    shape c ["id","kind","states","profiles","predicate","event"]
    return ← parsePredicate event.isSome 24 (← c.getObjVal? "predicate")
  let t ← str c "target"
  let a := Operand.field (false,t)
  let cmp := Predicate.compare
  match kind with
  | "stable" =>
    shape c ["id","kind","states","profiles","target","event"]
    require event.isSome "Stable requires event"
    let eq (field : String) := cmp "eq" (a field) (.field (true,t) field)
    return all (eq "inlineStart") [eq "blockStart",eq "inlineSize",eq "blockSize"]
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
    let b := Operand.field (false,other)
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

-- Rebuild the v1 producer profile key as structured JSON, without relying
-- on JavaScript's serialization or a hash. Only the declared identity is
-- checked: this is not evidence that the browser used those settings.
def profileIdentity (p : Json) : Except String Json := do
  shape p ["id","viewport","safeArea","ua","dpr","scrollbar","input","fontProfile","assumptions","mediaFeatures"]
  let v ← p.getObjVal? "viewport"
  shape v ["min","max","height"]
  let h ← v.getObjVal? "height"
  shape h ["min","max"]
  let sa := p.getObjValD "safeArea"
  if sa != .null then shape sa ["top","right","bottom","left"]
  let sb := p.getObjValD "scrollbar"
  if sb != .null then shape sb ["name","inlineSize","blockSize","thinInlineSize","thinBlockSize"]
  let field (j : Json) (k : String) (fallback : Json) : Json :=
    let x := j.getObjValD k
    if x == .null then fallback else x
  let zeroJ := toJson (0 : Nat)
  let ua := field p "ua" (toJson "chromium")
  require (["chromium","firefox","webkit"].any (fun u => toJson u == ua)) "Unsupported UA"
  let assumptions := field p "assumptions" (.arr #[])
  let _ ← fromJson? (α := List String) assumptions
  let media := p.getObjValD "mediaFeatures"
  let supported := [("hover",["none","hover"]),("pointer",["none","coarse","fine"]),
    ("prefers-reduced-motion",["no-preference","reduce"])]
  let mut entries : Array Json := #[]
  if media != .null then
    shape media (supported.map Prod.fst)
    for (name,values) in supported do
      if let .ok value := media.getObjVal? name then
        require (values.any (fun v => toJson v == value)) "Unsupported media feature value"
        entries := entries.push (.arr #[toJson name,value])
  let base : Array Json := #[
    ← v.getObjVal? "min",← v.getObjVal? "max",← h.getObjVal? "min",← h.getObjVal? "max",
    field sa "top" zeroJ,field sa "right" zeroJ,field sa "bottom" zeroJ,field sa "left" zeroJ,
    ua,p.getObjValD "dpr",field sb "name" (toJson "overlay"),field sb "inlineSize" zeroJ,
    field sb "blockSize" zeroJ,sb.getObjValD "thinInlineSize",sb.getObjValD "thinBlockSize",
    p.getObjValD "input",p.getObjValD "fontProfile",assumptions]
  return .arr (if entries.isEmpty then base else base.push (.arr entries))

def checkProfileBinding (p e : Json) (required : Bool := false) : Except String Unit := do
  let expected ← profileIdentity p
  match e.getObjVal? "profileKey" with
  | .ok j =>
    let actual ← Json.parse (← j.getStr?)
    require (actual == expected) "Geometry evidence profile mismatch"
  | .error _ =>
    let media := p.getObjValD "mediaFeatures"
    let nonempty := media != .null && media != Json.mkObj []
    let dom := ["dom","local-dom"].any (fun k => e.getObjValD "source" == toJson k)
    require (!required && !(nonempty && dom)) "Missing geometry profile key"

def selectAllowed (j : Json) (key value : String) : Except String Unit := do
  if j.getObjValD key == .null then return ()
  let choices ← j.getObjValAs? (List String) key
  require (choices.contains value) "Selected instance is outside contract"

-- Each endpoint/target has its own row partition. Enumerate the complete
-- product without pruning, so no feasible cross-state region can disappear.
abbrev RowSources := List (TargetRef × List NamedRow)
abbrev RowSelection := List (TargetRef × NamedRow)

def combineRows : RowSources → List RowSelection
  | [] => [[]]
  | (ref,rows) :: rest =>
    let tail := combineRows rest
    rows.flatMap fun r => tail.map fun rs => (ref,r) :: rs

inductive Selects : RowSources → RowSelection → Prop
  | nil : Selects [] []
  | cons {ref : TargetRef} {rows : List NamedRow} {rest : RowSources}
      {r : NamedRow} {rs : RowSelection} :
      r ∈ rows → Selects rest rs → Selects ((ref,rows)::rest) ((ref,r)::rs)

theorem combineRows_sound (sources : RowSources) (rs : RowSelection) :
    rs ∈ combineRows sources ↔ Selects sources rs := by
  induction sources generalizing rs with
  | nil =>
    constructor
    · intro h
      simp [combineRows] at h
      subst rs
      exact Selects.nil
    · intro h
      cases h
      simp [combineRows]
  | cons src rest ih =>
    obtain ⟨ref,rows⟩ := src
    constructor
    · intro h
      simp only [combineRows,List.mem_flatMap,List.mem_map] at h
      obtain ⟨r,hr,tail,ht,rfl⟩ := h
      exact Selects.cons hr ((ih tail).mp ht)
    · intro h
      cases h with
      | cons hr hs =>
        exact List.mem_flatMap.mpr ⟨_,hr,List.mem_map.mpr ⟨_,(ih _).mpr hs,rfl⟩⟩

theorem combineRows_covers (sources : RowSources) (w h : ℝ)
    (covered : ∀ s ∈ sources, ∃ r ∈ s.2, Holds r.guard w h) :
    ∃ rs ∈ combineRows sources, Holds (rs.flatMap (fun p => p.2.guard)) w h := by
  induction sources with
  | nil => exact ⟨[],by simp [combineRows],by simp [Holds]⟩
  | cons src rest ih =>
    obtain ⟨r,hr,hg⟩ := covered src (by simp)
    obtain ⟨rs,hm,hguards⟩ := ih (fun s hs => covered s (by simp [hs]))
    obtain ⟨ref,rows⟩ := src
    refine ⟨(ref,r)::rs, List.mem_flatMap.mpr ⟨r,hr,List.mem_map.mpr ⟨rs,hm,rfl⟩⟩, ?_⟩
    exact (holds_append _ _ w h).mpr ⟨hg,hguards⟩

def getProblemFor (raw : Json) (state profile contract : String)
    (event afterState : Option String) (targets : Option (List Json) := none) : Except String Problem := do
  require (event.isSome == afterState.isSome) "Missing transition endpoint"
  let report ← raw.getObjVal? "report"
  let p ← selectOne (← items (← report.getObjVal? "environment") "profiles") (fun j => matchesId j "id" profile)
  let env ← getProfile p
  let c ← selectOne (← items (← report.getObjVal? "contract") "contracts") (fun j => matchesId j "id" contract)
  selectAllowed c "states" state
  selectAllowed c "profiles" profile
  let predicate ← lowerContract c event
  require (predicate.nodeCount ≤ 256) "Predicate node limit"
  let refs := predicate.refs.eraseDups
  require (refs.length ≤ 8) "Target count limit"
  if let some actual := targets then
    let expected := refs.map fun (after,t) => Json.mkObj [
      ("state",toJson (if after then afterState.getD state else state)),
      ("target",toJson t),("endpoint",toJson (if after then "after" else "before"))]
    require (actual.length == expected.length &&
      actual.all (fun k => expected.contains k) && expected.all (fun k => actual.contains k))
      "Missing, duplicate or incorrect case target binding"
  let evidence ← items raw "evidence"
  let mut sources : RowSources := []
  let mut count : Nat := 1
  for ref in refs do
    let (after,t) := ref
    let sourceState := if after then afterState.getD state else state
    let e ← selectOne evidence (fun j => matchesId j "state" sourceState && matchesId j "profile" profile && matchesId j "target" t)
    checkProfileBinding p e
    require (e.getObjValD "reason" == .null) "Unresolved geometry"
    let axes ← if e.getObjValD "axes" == .null then pure ["inline","block"] else e.getObjValAs? (List String) "axes"
    require (axes == ["inline"] || axes == ["block"] || axes == ["inline","block"] || axes == ["block","inline"]) "Unsupported axes"
    let rs ← items e "rows"
    require (rs.length > 0 && rs.length * count ≤ 128) "Combined row limit"
    let rows ← rs.mapM (fun r => readRow r axes)
    sources := sources ++ [(ref,rows)]
    count := count * rows.length
  let pieces ← (combineRows sources).mapM fun rs => do
    let goal ← predicate.compile env rs
    return (⟨rs.flatMap (fun (_,r) => r.guard),rs.flatMap (fun (_,r) => r.axes),goal⟩ : Piece)
  let maxGuard := pieces.foldl (fun n r => max n r.guard.length) 0
  let axisCount := pieces.head?.map (·.axes.length) |>.getD 0
  require (pieces.length * pieces.length * max 1 (4*axisCount) * (5+2*maxGuard) ≤ 2000000) "Proof obligation budget"
  return ⟨env.base.domain,pieces⟩

-- Legacy individual checks are static only; event cases must be graph-bound.
def getProblem (raw : Json) (state profile contract : String) : Except String Problem :=
  getProblemFor raw state profile contract none none

def planJson (p : Problem) : Json :=
  Json.mkObj [("problem",toJson p),("dimensions",toJson p.dimCases),("agreement",toJson p.agreeCases)]

end VerissLean.Relation
