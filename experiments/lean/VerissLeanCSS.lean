import VerissLeanBridge

namespace VerissLean.CSS
open Lean Relation

-- Closed, post-cascade viewport-anchored box fragment. The CSS parser, cascade, and
-- absence of a transformed containing block are external premises.
-- Each coefficient has the common denominator; vw/vh/percent are CSS
-- percentage units (100vw = viewport width).
structure Length where
  px : Int
  vw : Int
  vh : Int
  percent : Int
  den : Nat
  deriving Repr, DecidableEq, FromJson, ToJson

noncomputable def Length.meaning (l : Length) (horizontal : Bool) (w h : ℝ) : ℝ :=
  ((l.px : ℝ) + l.vw*w/100 + l.vh*h/100 +
    l.percent*(if horizontal then w else h)/100) / l.den

def Length.compile (l : Length) (horizontal : Bool) : Scaled :=
  ⟨⟨l.vw + (if horizontal then l.percent else 0),
    l.vh + (if horizontal then 0 else l.percent),100*l.px⟩,100*l.den⟩

theorem Length.compile_sound (l : Length) (horizontal : Bool) (w h : ℝ)
    (hd : 0 < l.den) : (l.compile horizontal).eval w h = l.meaning horizontal w h := by
  have hd' : (l.den : ℝ) ≠ 0 := by exact_mod_cast (Nat.ne_of_gt hd)
  cases horizontal <;> simp [Length.compile, Length.meaning, Scaled.eval, Affine.eval] <;>
    rw [← div_div] <;> congr 1 <;> ring

structure AxisStyle where
  offset : Length
  size : Length
  padBefore : Length
  padAfter : Length
  borderBefore : Length
  borderAfter : Length
  deriving Repr, FromJson, ToJson

def AxisStyle.lengths (a : AxisStyle) : List Length :=
  [a.offset,a.size,a.padBefore,a.padAfter,a.borderBefore,a.borderAfter]

def AxisStyle.valid (a : AxisStyle) : Bool :=
  a.lengths.all (fun l => decide (0 < l.den)) &&
  a.borderBefore.percent == 0 && a.borderAfter.percent == 0

def AxisStyle.extra (a : AxisStyle) : Scaled :=
  (((a.padBefore.compile true).plus (a.padAfter.compile true)).plus
    (a.borderBefore.compile true)).plus (a.borderAfter.compile true)

noncomputable def AxisStyle.extraMeaning (a : AxisStyle) (w h : ℝ) : ℝ :=
  a.padBefore.meaning true w h + a.padAfter.meaning true w h +
  a.borderBefore.meaning true w h + a.borderAfter.meaning true w h

theorem Length.compile_pos (l : Length) (axis : Bool) (h : 0 < l.den) :
    0 < (l.compile axis).den := Nat.mul_pos (by decide) h

theorem Scaled.plus_pos (a b : Scaled) (ha : 0 < a.den) (hb : 0 < b.den) :
    0 < (a.plus b).den := Nat.mul_pos ha hb

theorem AxisStyle.den_pos (a : AxisStyle) (ok : a.valid = true) :
    ∀ l ∈ a.lengths, 0 < l.den := by
  simp only [AxisStyle.valid,Bool.and_eq_true,List.all_eq_true,decide_eq_true_eq] at ok
  exact ok.1.1

theorem AxisStyle.extra_sound (a : AxisStyle) (w h : ℝ) (ok : a.valid = true) :
    0 < a.extra.den ∧ a.extra.eval w h = a.extraMeaning w h := by
  have hp := a.den_pos ok
  have h1 := a.padBefore.compile_pos true (hp _ (by simp [AxisStyle.lengths]))
  have h2 := a.padAfter.compile_pos true (hp _ (by simp [AxisStyle.lengths]))
  have h3 := a.borderBefore.compile_pos true (hp _ (by simp [AxisStyle.lengths]))
  have h4 := a.borderAfter.compile_pos true (hp _ (by simp [AxisStyle.lengths]))
  have h12 := Scaled.plus_pos _ _ h1 h2
  have h123 := Scaled.plus_pos _ _ h12 h3
  refine ⟨Scaled.plus_pos _ _ h123 h4, ?_⟩
  unfold AxisStyle.extra AxisStyle.extraMeaning
  rw [Scaled.plus_sound _ _ w h h123 h4, Scaled.plus_sound _ _ w h h12 h3,
    Scaled.plus_sound _ _ w h h1 h2]
  rw [Length.compile_sound _ _ _ _ (hp _ (by simp [AxisStyle.lengths])),
    Length.compile_sound _ _ _ _ (hp _ (by simp [AxisStyle.lengths])),
    Length.compile_sound _ _ _ _ (hp _ (by simp [AxisStyle.lengths])),
    Length.compile_sound _ _ _ _ (hp _ (by simp [AxisStyle.lengths]))]

def AxisStyle.compile (a : AxisStyle) (horizontal borderBox : Bool) : Axis :=
  ⟨a.offset.compile horizontal,
    if borderBox then a.size.compile horizontal else (a.size.compile horizontal).plus a.extra⟩

noncomputable def AxisStyle.meaning (a : AxisStyle) (horizontal borderBox : Bool)
    (w h : ℝ) : ℝ × ℝ :=
  (a.offset.meaning horizontal w h,
    if borderBox then max (a.size.meaning horizontal w h) (a.extraMeaning w h)
    else a.size.meaning horizontal w h + a.extraMeaning w h)

-- Domain proof must establish no negative used length and no border-box
-- clamp. In a future piecewise lowering the max branch can be supported.
def AxisStyle.admissible (a : AxisStyle) (horizontal borderBox : Bool) : List Atom :=
  [⟨(a.size.compile horizontal).affine,false⟩,
   ⟨(a.padBefore.compile true).affine,false⟩,
   ⟨(a.padAfter.compile true).affine,false⟩,
   ⟨(a.borderBefore.compile true).affine,false⟩,
   ⟨(a.borderAfter.compile true).affine,false⟩] ++
    if borderBox then [(a.size.compile horizontal).compare a.extra false] else []

theorem AxisStyle.compile_sound (a : AxisStyle) (horizontal borderBox : Bool)
    (w h : ℝ) (ok : a.valid = true) (ha : Holds (a.admissible horizontal borderBox) w h) :
    (a.compile horizontal borderBox).start.eval w h = (a.meaning horizontal borderBox w h).1 ∧
    (a.compile horizontal borderBox).size.eval w h = (a.meaning horizontal borderBox w h).2 := by
  have hp := a.den_pos ok
  have hd0 := hp a.offset (by simp [AxisStyle.lengths])
  have hd1 := hp a.size (by simp [AxisStyle.lengths])
  have ex := a.extra_sound w h ok
  have hs := a.size.compile_pos horizontal hd1
  constructor
  · exact a.offset.compile_sound horizontal w h hd0
  · cases borderBox with
    | false =>
      simp only [AxisStyle.compile,AxisStyle.meaning,Bool.false_eq_true,if_false]
      rw [Scaled.plus_sound _ _ w h hs ex.1, a.size.compile_sound horizontal w h hd1,ex.2]
    | true =>
      have hb := ha ((a.size.compile horizontal).compare a.extra false) (by simp [AxisStyle.admissible])
      have hh := ((a.size.compile horizontal).compare_sound a.extra false w h hs ex.1).mp hb
      rw [a.size.compile_sound horizontal w h hd1,ex.2] at hh
      simp [AxisStyle.compile,AxisStyle.meaning,a.size.compile_sound horizontal w h hd1,max_eq_left hh]

structure AnchoredStyle where
  inline : AxisStyle
  block : AxisStyle
  borderBox : Bool
  deriving Repr, FromJson, ToJson

def AnchoredStyle.valid (s : AnchoredStyle) : Bool := s.inline.valid && s.block.valid

def AnchoredStyle.admissible (s : AnchoredStyle) : List Atom :=
  s.inline.admissible true s.borderBox ++ s.block.admissible false s.borderBox

def AnchoredStyle.axes (s : AnchoredStyle) : List Axis :=
  [s.inline.compile true s.borderBox,s.block.compile false s.borderBox]

-- Match affine coefficients by exact cross multiplication, not by samples.
def sameAffine (a b : Scaled) : Bool :=
  0 < a.den && 0 < b.den &&
  a.affine.scale b.den == b.affine.scale a.den

theorem sameAffine_sound (a b : Scaled) (w h : ℝ) (ok : sameAffine a b = true) :
    a.eval w h = b.eval w h := by
  simp only [sameAffine,Bool.and_eq_true,decide_eq_true_eq,beq_iff_eq] at ok
  have ha : (0 : ℝ) < a.den := by exact_mod_cast ok.1.1
  have hb : (0 : ℝ) < b.den := by exact_mod_cast ok.1.2
  apply (div_eq_div_iff (ne_of_gt ha) (ne_of_gt hb)).mpr
  have he := congrArg (fun x : Affine => x.eval w h) ok.2
  simpa [eval_scale,mul_comm] using he

def sameAxis (a b : Axis) : Bool := sameAffine a.start b.start && sameAffine a.size b.size

theorem sameAxis_sound (a b : Axis) (w h : ℝ) (ok : sameAxis a b = true) :
    a.start.eval w h = b.start.eval w h ∧ a.size.eval w h = b.size.eval w h := by
  simp only [sameAxis,Bool.and_eq_true] at ok
  exact ⟨sameAffine_sound _ _ w h ok.1,sameAffine_sound _ _ w h ok.2⟩

def AnchoredStyle.matches (s : AnchoredStyle) (r : Piece) : Bool :=
  match r.axes with
  | [x,y] => sameAxis x (s.inline.compile true s.borderBox) &&
      sameAxis y (s.block.compile false s.borderBox)
  | _ => false

-- Independent source admissibility obligations are checked over the whole domain.
-- The existing model certificate proves evidence coverage and nonnegative sizes.
structure ExtractionCertificate where
  model : ModelCertificate
  admissibility : List (List Nat)
  deriving FromJson, ToJson

def AnchoredStyle.admissibilityCases (s : AnchoredStyle) (domain : List Atom) : List (List Atom) :=
  s.admissible.map fun a => domain ++ [a.complement]

def AnchoredStyle.check (s : AnchoredStyle) (p : Problem) (c : ExtractionCertificate) : Bool :=
  s.valid && p.checkModel c.model && p.pieces.all s.matches &&
  checkCases (s.admissibilityCases p.domain) c.admissibility

theorem AnchoredStyle.extraction_exact (s : AnchoredStyle) (p : Problem) (c : ExtractionCertificate)
    (ok : s.check p c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    ∀ r ∈ p.pieces, ∃ x y, r.axes = [x,y] ∧
      (x.start.eval w h,x.size.eval w h) = s.inline.meaning true s.borderBox w h ∧
      (y.start.eval w h,y.size.eval w h) = s.block.meaning false s.borderBox w h := by
  simp only [AnchoredStyle.check,Bool.and_eq_true,List.all_eq_true,AnchoredStyle.valid] at ok
  have valid := ok.1.1.1
  have had : Holds s.admissible w h := by
    intro a hm
    apply holdsGoal p.domain a w h hd
    exact cases_sound _ _ ok.2 w h _ (List.mem_map.mpr ⟨a,hm,rfl⟩)
  have hsplit := (holds_append _ _ w h).mp had
  have hx := s.inline.compile_sound true s.borderBox w h valid.1 hsplit.1
  have hy := s.block.compile_sound false s.borderBox w h valid.2 hsplit.2
  refine ⟨(p.model_sound c.model ok.1.1.2 w h hd).1, ?_⟩
  intro r hr
  have hm := ok.1.2 r hr
  unfold AnchoredStyle.matches at hm
  split at hm
  next x y he =>
    have hh := Bool.and_eq_true_iff.mp hm
    have ex := sameAxis_sound _ _ w h hh.1
    have ey := sameAxis_sound _ _ w h hh.2
    exact ⟨x,y,he,Prod.ext (ex.1.trans hx.1) (ex.2.trans hx.2),
      Prod.ext (ey.1.trans hy.1) (ey.2.trans hy.2)⟩
  next => contradiction

-- Wire format is deliberately closed. It is a computed-style fragment,
-- not raw CSS; unsupported declarations must not be dropped by the exporter.
def readStyle (j : Json) : Except String AnchoredStyle := do
  shape j ["version","kind","position","inline","block","borderBox"]
  require ((← j.getObjValAs? Nat "version") == 1 &&
    (← str j "kind") == "viewport-anchored-computed-style") "Unsupported style format"
  require (["fixed","absolute"].contains (← str j "position")) "Unsupported position"
  for axis in ["inline","block"] do
    let a ← j.getObjVal? axis
    shape a ["offset","size","padBefore","padAfter","borderBefore","borderAfter"]
    for k in ["offset","size","padBefore","padAfter","borderBefore","borderAfter"] do
      shape (← a.getObjVal? k) ["px","vw","vh","percent","den"]
  let s : AnchoredStyle ← fromJson? j
  require s.valid "Unsupported lengths or nonpositive denominator"
  return s

def sourceProblem (raw : Json) (state profile target : String) : Except String Problem := do
  let report ← raw.getObjVal? "report"
  let env ← selectOne (← items (← report.getObjVal? "environment") "profiles") (fun j => matchesId j "id" profile)
  let p ← getProfile env
  -- Scrollbar/containing-block equivalence is an explicit premise of this
  -- model; reject known non-overlay profiles rather than treating them as zero.
  if env.getObjValD "scrollbar" != .null then
    let sb ← env.getObjVal? "scrollbar"
    require ((← str sb "name") == "overlay" &&
      (← sb.getObjValAs? Int "inlineSize") == 0 &&
      (← sb.getObjValAs? Int "blockSize") == 0) "Unsupported scrollbar"
  let e ← selectOne (← items raw "evidence") (fun j =>
    matchesId j "state" state && matchesId j "profile" profile && matchesId j "target" target)
  checkProfileBinding env e true
  require (e.getObjValD "reason" == .null && e.getObjValD "axes" == .null &&
    e.getObjValD "source" == toJson "dom") "Missing full DOM geometry"
  let rs ← items e "rows"
  require (!rs.isEmpty && rs.length ≤ 32) "Unsupported row count"
  let pieces ← rs.mapM fun j => do
    let r ← readRow j ["inline","block"]
    return (⟨r.guard,r.axes,.atom ⟨Affine.zero,false⟩⟩ : Piece)
  return ⟨p.base.domain,pieces⟩

def extractionPlan (s : AnchoredStyle) (p : Problem) : Json :=
  Json.mkObj [("plan",planJson p),("admissibility",toJson (s.admissibilityCases p.domain))]

-- Restricted literal source binding (X0b). Verify the complete closed HTML
-- and author stylesheet, not a substring selected by the producer.
-- The canonical grammar is intentionally narrow; arbitrary whitespace,
-- selectors, nested trees and stylesheets are not silently normalized.
def sourceId (s : String) : Bool :=
  !s.isEmpty && s.length ≤ 64 && s.toList.all (fun c =>
    ('a' ≤ c && c ≤ 'z') || ('A' ≤ c && c ≤ 'Z') || c == '-' || c == '_' ||
    ('0' ≤ c && c ≤ '9')) &&
  (match s.toList with
    | c::_ => ('a' ≤ c && c ≤ 'z') || ('A' ≤ c && c ≤ 'Z') || c == '_'
    | [] => false)

def Length.literal (l : Length) : Option String :=
  if l.den != 1 then none else
  match ([(l.px,"px"),(l.vw,"vw"),(l.vh,"vh"),(l.percent,"%")].filter (fun p => p.1 != 0)) with
  | [] => some "0px"
  | [(n,u)] => some (toString n ++ u)
  | _ => none

def Length.borderLiteral (l : Length) : Option String :=
  if l.vw == 0 && l.vh == 0 && l.percent == 0 && 0 ≤ l.px then l.literal else none

def canonicalHTML (root target : String) : String :=
  "<!doctype html><html lang=\"en\"><head><title>Layout</title></head><body><div id=\"" ++
    root ++ "\"><div id=\"" ++ target ++ "\"></div></div></body></html>"

def AnchoredStyle.canonicalCSS (s : AnchoredStyle) (root target : String) : Option String := do
  if !(sourceId root && sourceId target && root != target) then none else
  let x ← s.inline.offset.literal
  let y ← s.block.offset.literal
  let w ← s.inline.size.literal
  let h ← s.block.size.literal
  let pt ← s.block.padBefore.literal
  let pr ← s.inline.padAfter.literal
  let pb ← s.block.padAfter.literal
  let pl ← s.inline.padBefore.literal
  let bt ← s.block.borderBefore.borderLiteral
  let br ← s.inline.borderAfter.borderLiteral
  let bb ← s.block.borderAfter.borderLiteral
  let bl ← s.inline.borderBefore.borderLiteral
  return "*{margin:0;padding:0;border:0;box-sizing:border-box}#" ++ root ++
    "{position:relative;width:100%;height:100vh}#" ++ target ++
    "{position:absolute;left:" ++ x ++ ";top:" ++ y ++ ";width:" ++ w ++ ";height:" ++ h ++
    ";padding-top:" ++ pt ++ ";padding-right:" ++ pr ++ ";padding-bottom:" ++ pb ++ ";padding-left:" ++ pl ++
    ";border-style:solid;border-top-width:" ++ bt ++ ";border-right-width:" ++ br ++
    ";border-bottom-width:" ++ bb ++ ";border-left-width:" ++ bl ++
    ";box-sizing:" ++ (if s.borderBox then "border-box" else "content-box") ++ "}"

structure SourceFragment where
  root : String
  target : String
  html : String
  css : String
  style : AnchoredStyle

def SourceFragment.bound (s : SourceFragment) : Bool :=
  s.html == canonicalHTML s.root s.target &&
    s.style.canonicalCSS s.root s.target == some s.css

def SourceFragment.check (s : SourceFragment) (p : Problem) (c : ExtractionCertificate) : Bool :=
  s.bound && s.style.check p c

theorem SourceFragment.exact (s : SourceFragment) (p : Problem) (c : ExtractionCertificate)
    (ok : s.check p c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    s.html = canonicalHTML s.root s.target ∧
    s.style.canonicalCSS s.root s.target = some s.css ∧
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    ∀ r ∈ p.pieces, ∃ x y, r.axes = [x,y] ∧
      (x.start.eval w h,x.size.eval w h) = s.style.inline.meaning true s.style.borderBox w h ∧
      (y.start.eval w h,y.size.eval w h) = s.style.block.meaning false s.style.borderBox w h := by
  simp only [SourceFragment.check,SourceFragment.bound,Bool.and_eq_true,beq_iff_eq] at ok
  exact ⟨ok.1.1,ok.1.2,s.style.extraction_exact p c ok.2 w h hd⟩

def readFragment (j : Json) : Except String SourceFragment := do
  shape j ["version","root","target","html","css","style"]
  require ((← j.getObjValAs? Nat "version") == 1) "Unsupported source fragment version"
  let style ← j.getObjVal? "style"
  require ((← str style "position") == "absolute") "Only viewport-root absolute positioning"
  let s : SourceFragment := ⟨← str j "root",← str j "target",← str j "html",← str j "css",← readStyle style⟩
  require s.bound "Source bytes do not match the closed canonical HTML/CSS grammar"
  return s

end VerissLean.CSS
