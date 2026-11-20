import VerissLeanCSS

namespace VerissLean.Cascade
open Lean Relation CSS

structure Selector where
  id : Option String
  cls : Option String
  tag : Bool
  deriving Repr, DecidableEq, FromJson, ToJson

def Selector.valid (s : Selector) (root : String) : Bool :=
  (s.id.isSome || s.cls.isSome) &&
  (s.id.map (fun x => sourceId x && x != root)).getD true &&
  (s.cls.map sourceId).getD true

def Selector.matches (s : Selector) (target cls : String) : Bool :=
  (s.id.map (· == target)).getD true && (s.cls.map (· == cls)).getD true

def Selector.rank (s : Selector) : Nat :=
  (if s.id.isSome then 100 else 0) + (if s.cls.isSome then 10 else 0) +
  (if s.tag then 1 else 0)

def Selector.css (s : Selector) : String :=
  (if s.tag then "div" else "") ++ (s.id.map ("#" ++ ·)).getD "" ++
  (s.cls.map ("." ++ ·)).getD ""

inductive Property where
  | left | top | width | height
  deriving Repr, DecidableEq, FromJson, ToJson

def Property.css : Property → String
  | .left => "left"
  | .top => "top"
  | .width => "width"
  | .height => "height"

structure Media where
  horizontal : Bool
  minimum : Bool
  bound : Nat
  deriving Repr, DecidableEq, FromJson, ToJson

def Media.atom (m : Media) : Atom :=
  let sign : Int := if m.minimum then 1 else -1
  ⟨⟨if m.horizontal then sign else 0,if m.horizontal then 0 else sign,
    -sign * (m.bound : Int)⟩,false⟩

def Media.meaning (m : Media) (w h : ℝ) : Prop :=
  if m.minimum then (m.bound : ℝ) ≤ (if m.horizontal then w else h)
  else (if m.horizontal then w else h) ≤ m.bound

theorem Media.atom_sound (m : Media) (w h : ℝ) :
    m.atom.holds w h ↔ m.meaning w h := by
  cases m with
  | mk horizontal minimum bound =>
    cases horizontal <;> cases minimum <;>
      simp [Media.atom,Media.meaning,Atom.holds,Affine.eval]

def Media.css (m : Media) : String :=
  "@media (" ++ (if m.minimum then "min-" else "max-") ++
  (if m.horizontal then "width:" else "height:") ++ toString m.bound ++ "px)"

structure Rule where
  selector : Selector
  property : Property
  value : Length
  important : Bool
  media : Option Media
  deriving Repr, DecidableEq, FromJson, ToJson

def Rule.rank (r : Rule) : Nat :=
  (if r.important then 1000 else 0) + r.selector.rank

def Rule.valid (r : Rule) (root : String) : Bool :=
  r.selector.valid root && r.value.literal.isSome &&
  (if r.property == .width || r.property == .height
   then 0 ≤ r.value.px && 0 ≤ r.value.vw && 0 ≤ r.value.vh && 0 ≤ r.value.percent else true) &&
  (r.media.map (fun m => decide (m.bound ≤ 1000000))).getD true

def Rule.css (r : Rule) : Option String := do
  let v ← r.value.literal
  let decl := r.selector.css ++ "{" ++ r.property.css ++ ":" ++ v ++
    (if r.important then "!important" else "") ++ "}"
  return match r.media with
  | none => decl
  | some m => m.css ++ "{" ++ decl ++ "}"

-- Recursion visits the tail first. A tie goes to the later declaration.
-- 100 is the specificity of the complete base #target style.
def eligible (target cls : String) (p : Property) (r : Rule) : Bool :=
  r.selector.matches target cls && r.property == p && 100 ≤ r.rank

def best : List Rule → Option Rule
  | [] => none
  | r :: rs =>
    match best rs with
    | none => some r
    | some b => if b.rank < r.rank then some r else some b

theorem best_mem (rs : List Rule) (r : Rule) (eq : best rs = some r) : r ∈ rs := by
  induction rs with
  | nil => simp [best] at eq
  | cons a as ih =>
    simp only [best] at eq
    split at eq
    next h =>
      cases eq
      exact List.mem_cons_self
    next b h =>
      split at eq
      · cases eq
        exact List.mem_cons_self
      · cases eq
        exact List.mem_cons_of_mem _ (ih h)

theorem best_none (rs : List Rule) (eq : best rs = none) : rs = [] := by
  cases rs with
  | nil => rfl
  | cons a as =>
    simp only [best] at eq
    split at eq
    · contradiction
    · split at eq <;> contradiction

theorem best_dominates (rs : List Rule) (r : Rule) (eq : best rs = some r) :
    ∀ a ∈ rs, a.rank ≤ r.rank := by
  induction rs generalizing r with
  | nil => simp
  | cons x xs ih =>
    simp only [best] at eq
    split at eq
    next hn =>
      cases eq
      rw [best_none xs hn]
      simp
    next b hb =>
      split at eq
      next hlt =>
        cases eq
        intro a ha
        rcases List.mem_cons.mp ha with he | ht
        · subst a; exact le_rfl
        · exact le_trans (ih b hb a ht) hlt.le
      next hle =>
        cases eq
        intro a ha
        rcases List.mem_cons.mp ha with he | ht
        · subst a; exact Nat.le_of_not_gt hle
        · exact ih _ hb _ ht

theorem best_later_tie (r b : Rule) (rs : List Rule)
    (hb : best rs = some b) (hle : r.rank ≤ b.rank) :
    best (r :: rs) = some b := by simp [best,hb,not_lt.mpr hle]

def winner (target cls : String) (p : Property) (rs : List Rule) : Option Rule :=
  best (rs.filter (eligible target cls p))

theorem winner_spec (target cls : String) (p : Property) (rs : List Rule) (r : Rule)
    (eq : winner target cls p rs = some r) :
    r ∈ rs ∧ eligible target cls p r = true ∧
    ∀ a ∈ rs, eligible target cls p a = true → a.rank ≤ r.rank := by
  have hm := List.mem_filter.mp (best_mem _ _ eq)
  exact ⟨hm.1,hm.2,fun a ha he => best_dominates _ _ eq _ (List.mem_filter.mpr ⟨ha,he⟩)⟩

def chosen (target cls : String) (p : Property) (rs : List Rule) (base : Length) : Length :=
  ((winner target cls p rs).map (·.value)).getD base

def resolve (base : AnchoredStyle) (target cls : String) (rs : List Rule) : AnchoredStyle :=
  ⟨⟨chosen target cls .left rs base.inline.offset,
    chosen target cls .width rs base.inline.size,base.inline.padBefore,base.inline.padAfter,
    base.inline.borderBefore,base.inline.borderAfter⟩,
   ⟨chosen target cls .top rs base.block.offset,
    chosen target cls .height rs base.block.size,base.block.padBefore,base.block.padAfter,
    base.block.borderBefore,base.block.borderAfter⟩,base.borderBox⟩

structure Branch where
  guard : List Atom
  rules : List Rule
  deriving Repr

def Branch.yes (r : Rule) (m : Option Media) (b : Branch) : Branch :=
  ⟨(m.toList.map Media.atom) ++ b.guard,r :: b.rules⟩

def Branch.no (m : Media) (b : Branch) : Branch :=
  ⟨m.atom.complement :: b.guard,b.rules⟩

def branches : List Rule → List Branch
  | [] => [⟨[],[]⟩]
  | r :: rs =>
    let bs := branches rs
    match r.media with
    | none => bs.map (Branch.yes r none)
    | some m => bs.map (Branch.yes r (some m)) ++ bs.map (Branch.no m)

noncomputable def activeAt (w h : ℝ) : List Rule → List Rule
  | [] => []
  | r::rs =>
    let tail := activeAt w h rs
    match r.media with
    | none => r::tail
    | some m => @ite _ (m.meaning w h) (Classical.propDecidable _) (r::tail) tail

-- Every real viewport has a branch containing exactly its active rules.
theorem branches_cover (rs : List Rule) (w h : ℝ) :
    ∃ b ∈ branches rs, Holds b.guard w h ∧ b.rules = activeAt w h rs := by
  classical
  induction rs with
  | nil => exact ⟨⟨[],[]⟩,by simp [branches],by simp [Holds],rfl⟩
  | cons r rs ih =>
    obtain ⟨b,hb,hg,he⟩ := ih
    cases hm : r.media with
    | none =>
      refine ⟨b.yes r none, ?_, ?_, ?_⟩
      · simp only [branches,hm]
        exact List.mem_map.mpr ⟨b,hb,rfl⟩
      · simpa [Branch.yes] using hg
      · simp [Branch.yes,activeAt,hm,he]
    | some m =>
      by_cases hp : m.meaning w h
      · refine ⟨b.yes r (some m), ?_, ?_, ?_⟩
        · simp only [branches,hm]
          exact List.mem_append_left _ (List.mem_map.mpr ⟨b,hb,rfl⟩)
        · exact (holds_cons _ _ _ _).mpr ⟨(m.atom_sound w h).mpr hp,hg⟩
        · simp [Branch.yes,activeAt,hm,hp,he]
      · refine ⟨b.no m, ?_, ?_, ?_⟩
        · simp only [branches,hm]
          exact List.mem_append_right _ (List.mem_map.mpr ⟨b,hb,rfl⟩)
        · exact (holds_cons _ _ _ _).mpr ⟨(complement_iff _ _ _).mpr (fun hx => hp ((m.atom_sound w h).mp hx)),hg⟩
        · simp [Branch.no,activeAt,hm,hp,he]

structure Source where
  root : String
  target : String
  cls : String
  html : String
  css : String
  base : AnchoredStyle
  rules : List Rule

def Source.canonicalHTML (s : Source) : String :=
  "<!doctype html><html lang=\"en\"><head><title>Layout</title></head><body><div id=\"" ++
  s.root ++ "\"><div id=\"" ++ s.target ++ "\" class=\"" ++ s.cls ++ "\"></div></div></body></html>"

def Source.canonicalCSS (s : Source) : Option String := do
  let base ← s.base.canonicalCSS s.root s.target
  let extras ← s.rules.mapM Rule.css
  return base ++ String.join extras

def Source.bound (s : Source) : Bool :=
  sourceId s.cls && s.rules.length ≤ 32 &&
  (s.rules.filter (·.media.isSome)).length ≤ 6 &&
  s.rules.all (·.valid s.root) &&
  s.html == s.canonicalHTML && s.canonicalCSS == some s.css

def Source.style (s : Source) (b : Branch) : AnchoredStyle := resolve s.base s.target s.cls b.rules

def Source.piece (s : Source) (b : Branch) : Piece :=
  ⟨b.guard,(s.style b).axes,.atom ⟨Affine.zero,false⟩⟩

def Source.branches (s : Source) : List Branch := Cascade.branches s.rules

def Source.admissibilityCases (s : Source) (p : Problem) : List (List Atom) :=
  s.branches.flatMap fun b =>
    (s.style b).admissible.map fun a => p.domain ++ b.guard ++ [a.complement]

def Source.agreementCases (s : Source) (p : Problem) : List (List Atom) :=
  s.branches.flatMap fun b => p.pieces.flatMap fun r =>
    (r.agreement (s.piece b)).map fun a => p.domain ++ b.guard ++ r.guard ++ [a.complement]

structure Certificate where
  model : ModelCertificate
  admissibility : List (List Nat)
  agreement : List (List Nat)
  deriving FromJson, ToJson

def Source.check (s : Source) (p : Problem) (c : Certificate) : Bool :=
  s.bound && s.base.valid && p.checkModel c.model &&
  p.pieces.all (fun r => r.axes.length == 2) &&
  s.branches.all (fun b => (s.style b).valid) &&
  checkCases (s.admissibilityCases p) c.admissibility &&
  checkCases (s.agreementCases p) c.agreement

-- The proof generator may not discard an active region or assume that
-- overlapping rows agree. Every feasible source/evidence pair is checked.
theorem Source.branch_admissible (s : Source) (p : Problem) (c : Certificate)
    (ok : s.check p c = true) (b : Branch) (hb : b ∈ s.branches)
    (w h : ℝ) (hd : Holds p.domain w h) (hg : Holds b.guard w h) :
    Holds (s.style b).admissible w h := by
  simp only [Source.check,Bool.and_eq_true] at ok
  intro a ha
  have hm : p.domain ++ b.guard ++ [a.complement] ∈ s.admissibilityCases p :=
    List.mem_flatMap.mpr ⟨b,hb,List.mem_map.mpr ⟨a,ha,rfl⟩⟩
  exact holdsGoal (p.domain ++ b.guard) a w h ((holds_append _ _ _ _).mpr ⟨hd,hg⟩)
    (cases_sound _ _ ok.1.2 w h _ hm)

theorem Source.branch_agrees (s : Source) (p : Problem) (c : Certificate)
    (ok : s.check p c = true) (b : Branch) (hb : b ∈ s.branches)
    (r : Piece) (hr : r ∈ p.pieces) (w h : ℝ)
    (hd : Holds p.domain w h) (hg : Holds b.guard w h) (hg' : Holds r.guard w h) :
    Holds (r.agreement (s.piece b)) w h := by
  simp only [Source.check,Bool.and_eq_true] at ok
  intro a ha
  have hm : p.domain ++ b.guard ++ r.guard ++ [a.complement] ∈ s.agreementCases p :=
    List.mem_flatMap.mpr ⟨b,hb,List.mem_flatMap.mpr ⟨r,hr,List.mem_map.mpr ⟨a,ha,rfl⟩⟩⟩
  exact holdsGoal (p.domain ++ b.guard ++ r.guard) a w h
    ((holds_append _ _ _ _).mpr ⟨(holds_append _ _ _ _).mpr ⟨hd,hg⟩,hg'⟩)
    (cases_sound _ _ ok.2 w h _ hm)

theorem compiled_axis_valid (a : AxisStyle) (ax bb : Bool) (ok : a.valid = true) :
    (a.compile ax bb).Valid := by
  have hp := a.den_pos ok
  have ho := a.offset.compile_pos ax (hp _ (by simp [AxisStyle.lengths]))
  have hs := a.size.compile_pos ax (hp _ (by simp [AxisStyle.lengths]))
  have he := (a.extra_sound 0 0 ok).1
  cases bb with
  | false => exact ⟨ho,Nat.mul_pos hs he⟩
  | true => exact ⟨ho,hs⟩

theorem agreement_value (r s : Piece) (hr : r.valid = true) (hs : s.valid = true)
    (w h : ℝ) (ok : Holds (r.agreement s) w h) (a b : Scaled)
    (hm : (a,b) ∈ r.values.zip s.values) : a.eval w h = b.eval w h := by
  obtain ⟨ha,hb⟩ := zip_mem _ _ _ _ hm
  have da := r.valid_den hr a ha
  have db := s.valid_den hs b hb
  have h1 := ok (a.compare b false) (List.mem_flatMap.mpr ⟨(a,b),hm,by simp⟩)
  have h2 := ok (b.compare a false) (List.mem_flatMap.mpr ⟨(a,b),hm,by simp⟩)
  exact le_antisymm ((Scaled.compare_sound b a false w h db da).mp h2)
    ((Scaled.compare_sound a b false w h da db).mp h1)

theorem Source.branch_exact (s : Source) (p : Problem) (c : Certificate)
    (ok : s.check p c = true) (b : Branch) (hb : b ∈ s.branches)
    (r : Piece) (hr : r ∈ p.pieces) (w h : ℝ)
    (hd : Holds p.domain w h) (hg : Holds b.guard w h) (hg' : Holds r.guard w h) :
    ∃ x y, r.axes = [x,y] ∧
      (x.start.eval w h,x.size.eval w h) = (s.style b).inline.meaning true (s.style b).borderBox w h ∧
      (y.start.eval w h,y.size.eval w h) = (s.style b).block.meaning false (s.style b).borderBox w h := by
  have had := s.branch_admissible p c ok b hb w h hd hg
  have hag := s.branch_agrees p c ok b hb r hr w h hd hg hg'
  simp only [Source.check,Bool.and_eq_true,List.all_eq_true] at ok
  obtain ⟨⟨⟨⟨⟨⟨_,_⟩,hm⟩,hshape⟩,hv⟩,_⟩,_⟩ := ok
  let st := s.style b
  have vst : st.valid = true := hv b hb
  have vi := (Bool.and_eq_true_iff.mp vst).1
  have vb := (Bool.and_eq_true_iff.mp vst).2
  have split := (holds_append _ _ _ _).mp had
  have ex := st.inline.compile_sound true st.borderBox w h vi split.1
  have ey := st.block.compile_sound false st.borderBox w h vb split.2
  let cx := st.inline.compile true st.borderBox
  let cy := st.block.compile false st.borderBox
  have vx := compiled_axis_valid st.inline true st.borderBox vi
  have vy := compiled_axis_valid st.block false st.borderBox vb
  have sv : (s.piece b).valid = true := by
    simp only [Source.piece,CSS.AnchoredStyle.axes,Piece.valid,Piece.values,List.flatMap_cons,
      List.flatMap_nil,List.append_nil,List.cons_append,List.nil_append,List.all_cons,List.all_nil,
      Bool.and_true, Bool.and_eq_true,decide_eq_true_eq]
    exact ⟨vx.1,vx.2,vy.1,vy.2⟩
  have rv := p.validPiece c.model hm r hr
  have len : r.axes.length = 2 := by simpa using hshape r hr
  cases eq : r.axes with
  | nil => simp [eq] at len
  | cons x xs =>
    cases xs with
    | nil => simp [eq] at len
    | cons y ys =>
      have hnil : ys = [] := by simpa [eq] using len
      subst ys
      have vals : r.values.zip (s.piece b).values =
          [(x.start,cx.start),(x.size,cx.size),(y.start,cy.start),(y.size,cy.size)] := by
        simp [Piece.values,Source.piece,AnchoredStyle.axes,eq,cx,cy,st]
      have h1 := agreement_value r (s.piece b) rv sv w h hag x.start cx.start (by rw [vals]; simp)
      have h2 := agreement_value r (s.piece b) rv sv w h hag x.size cx.size (by rw [vals]; simp)
      have h3 := agreement_value r (s.piece b) rv sv w h hag y.start cy.start (by rw [vals]; simp)
      have h4 := agreement_value r (s.piece b) rv sv w h hag y.size cy.size (by rw [vals]; simp)
      exact ⟨x,y,rfl,Prod.ext (h1.trans ex.1) (h2.trans ex.2),Prod.ext (h3.trans ey.1) (h4.trans ey.2)⟩

-- Independent semantics: choose the actual active CSS rules at a real
-- viewport, not the subset claimed by an evidence row.
noncomputable def Source.computedAt (s : Source) (w h : ℝ) : AnchoredStyle :=
  resolve s.base s.target s.cls (activeAt w h s.rules)

theorem Source.exact (s : Source) (p : Problem) (c : Certificate)
    (ok : s.check p c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    s.html = s.canonicalHTML ∧ s.canonicalCSS = some s.css ∧
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    ∀ r ∈ p.pieces, Holds r.guard w h →
      ∃ x y, r.axes = [x,y] ∧
        (x.start.eval w h,x.size.eval w h) = (s.computedAt w h).inline.meaning true (s.computedAt w h).borderBox w h ∧
        (y.start.eval w h,y.size.eval w h) = (s.computedAt w h).block.meaning false (s.computedAt w h).borderBox w h := by
  obtain ⟨b,hb,hg,he⟩ := branches_cover s.rules w h
  have ck := ok
  simp only [Source.check,Bool.and_eq_true] at ck
  have bound := ck.1.1.1.1.1.1
  simp only [Source.bound,Bool.and_eq_true,beq_iff_eq] at bound
  refine ⟨bound.1.2,bound.2,(p.model_sound c.model ck.1.1.1.1.2 w h hd).1,?_⟩
  intro r hr hg'
  simpa [Source.style,Source.computedAt,he] using s.branch_exact p c ok b hb r hr w h hd hg hg'

def Source.plan (s : Source) (p : Problem) : Json :=
  Json.mkObj [("plan",planJson p),("admissibility",toJson (s.admissibilityCases p)),
    ("agreement",toJson (s.agreementCases p))]

def readSource (j : Json) : Except String Source := do
  shape j ["version","root","target","cls","html","css","base","rules"]
  require ((← j.getObjValAs? Nat "version") == 1) "Unsupported cascade source version"
  let base ← j.getObjVal? "base"
  require ((← str base "position") == "absolute") "Only viewport-root absolute positioning"
  let rules ← items j "rules"
  require (rules.length ≤ 32) "Too many declarations"
  for r in rules do
    shape r ["selector","property","value","important","media"]
    shape (← r.getObjVal? "selector") ["id","cls","tag"]
    shape (← r.getObjVal? "value") ["px","vw","vh","percent","den"]
    if r.getObjValD "media" != .null then
      shape (← r.getObjVal? "media") ["horizontal","minimum","bound"]
  let s : Source := ⟨← str j "root",← str j "target",← str j "cls",← str j "html",← str j "css",
    ← readStyle base,← rules.mapM fromJson?⟩
  require s.bound "Unsupported or mismatched closed CSS cascade"
  return s

end VerissLean.Cascade
