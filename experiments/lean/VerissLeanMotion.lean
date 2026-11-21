import VerissLeanStateProof
import VerissLeanCSS
import VerissLeanTime

namespace VerissLean.Motion
open Lean Relation

-- Motion between two settled rectangles at one viewport, with a common
-- normalized progress. This deliberately excludes independent easing,
-- transforms and intermediate layout changes.
structure Bounds where
  left : Scaled
  right : Scaled
  top : Scaled
  bottom : Scaled

def Bounds.valid (b : Bounds) : Bool :=
  0 < b.left.den && 0 < b.right.den && 0 < b.top.den && 0 < b.bottom.den

def Bounds.ofProfile (p : InstanceProfile) : Bounds :=
  ⟨integer p.base.safeLeft,⟨⟨1,0,-p.base.safeRight⟩,1⟩,
    integer p.safeTop,⟨⟨0,1,-p.safeBottom⟩,1⟩⟩

def axisGoal (a : Axis) (lo hi : Scaled) : Formula :=
  .both (.atom (a.start.compare lo false)) (.both
    (.atom (a.size.compare zero false)) (.atom (hi.compare (a.start.plus a.size) false)))

def fits (start size lo hi : ℝ) : Prop :=
  lo ≤ start ∧ 0 ≤ size ∧ start + size ≤ hi

theorem axisGoal_sound (a : Axis) (lo hi : Scaled) (w h : ℝ)
    (hs : 0 < a.start.den) (hz : 0 < a.size.den)
    (hl : 0 < lo.den) (hh : 0 < hi.den)
    (ok : (axisGoal a lo hi).holds w h) :
    fits (a.start.eval w h) (a.size.eval w h) (lo.eval w h) (hi.eval w h) := by
  change (a.start.compare lo false).holds w h ∧
    (a.size.compare zero false).holds w h ∧
    (hi.compare (a.start.plus a.size) false).holds w h at ok
  have h1 := (Scaled.compare_sound a.start lo false w h hs hl).mp ok.1
  have h2 := (Scaled.compare_sound a.size zero false w h hz (by decide)).mp ok.2.1
  have h3 := (Scaled.compare_sound hi (a.start.plus a.size) false w h hh (Nat.mul_pos hs hz)).mp ok.2.2
  change lo.eval w h ≤ a.start.eval w h at h1
  change zero.eval w h ≤ a.size.eval w h at h2
  change (a.start.plus a.size).eval w h ≤ hi.eval w h at h3
  rw [Scaled.plus_sound _ _ w h hs hz] at h3
  exact ⟨h1,by simpa [zero,Scaled.eval,Affine.zero,Affine.eval] using h2,h3⟩

def fitPiece (b : Bounds) (r : Piece) : Piece :=
  {r with goal := match r.axes with
    | [x,y] => .both (axisGoal x b.left b.right) (axisGoal y b.top b.bottom)
    | _ => .not (.atom ⟨Affine.zero,false⟩)}

def fitProblem (b : Bounds) (p : Problem) : Problem :=
  ⟨p.domain,p.pieces.map (fitPiece b)⟩

def endpointShape (p : Problem) : Bool :=
  p.pieces.all fun r => r.axes.length == 2

def endpointCheck (b : Bounds) (p : Problem) (c : VerifiedCertificate) : Bool :=
  b.valid && endpointShape p && (fitProblem b p).checkVerified c

def rectFits (b : Bounds) (r : Piece) (w h : ℝ) : Prop :=
  ∃ x y, r.axes = [x,y] ∧
    fits (x.start.eval w h) (x.size.eval w h) (b.left.eval w h) (b.right.eval w h) ∧
    fits (y.start.eval w h) (y.size.eval w h) (b.top.eval w h) (b.bottom.eval w h)

theorem endpoint_sound (b : Bounds) (p : Problem) (c : VerifiedCertificate)
    (ok : endpointCheck b p c = true) (w h : ℝ) (hd : Holds p.domain w h) :
    (∃ r ∈ p.pieces, Holds r.guard w h) ∧
    ∀ r ∈ p.pieces, Holds r.guard w h → rectFits b r w h := by
  simp only [endpointCheck,Bool.and_eq_true] at ok
  have bv := ok.1.1
  simp only [Bounds.valid,Bool.and_eq_true,decide_eq_true_eq] at bv
  obtain ⟨covers,goals⟩ := (fitProblem b p).verified_sound c ok.2 w h hd
  refine ⟨?_,?_⟩
  · obtain ⟨r, hr, hg⟩ := covers
    obtain ⟨raw,hm,eq⟩ := List.mem_map.mp hr
    exact ⟨raw,hm,by simpa [← eq,fitPiece] using hg⟩
  · intro r hr hg
    have hm : fitPiece b r ∈ (fitProblem b p).pieces := List.mem_map.mpr ⟨r,hr,rfl⟩
    have goal := goals _ hm hg
    have rv := (fitProblem b p).validPiece c.model (Bool.and_eq_true_iff.mp ok.2).1 _ hm
    have hlen : r.axes.length = 2 := by
      simpa using (List.all_eq_true.mp ok.1.2) r hr
    cases eq : r.axes with
    | nil => simp [eq] at hlen
    | cons x xs =>
      cases xs with
      | nil => simp [eq] at hlen
      | cons y ys =>
        have hn : ys = [] := by simpa [eq] using hlen
        subst ys
        have hx1 := Piece.valid_den (fitPiece b r) rv x.start (by simp [Piece.values,fitPiece,eq])
        have hx2 := Piece.valid_den (fitPiece b r) rv x.size (by simp [Piece.values,fitPiece,eq])
        have hy1 := Piece.valid_den (fitPiece b r) rv y.start (by simp [Piece.values,fitPiece,eq])
        have hy2 := Piece.valid_den (fitPiece b r) rv y.size (by simp [Piece.values,fitPiece,eq])
        simp only [fitPiece,eq,Formula.holds] at goal
        exact ⟨x,y,eq,axisGoal_sound x b.left b.right w h hx1 hx2 bv.1.1.1 bv.1.1.2 goal.1,
          axisGoal_sound y b.top b.bottom w h hy1 hy2 bv.1.2 bv.2 goal.2⟩

noncomputable def mix (u a b : ℝ) : ℝ := (1-u)*a+u*b

theorem fits_mix (u x sx y sy lo hi : ℝ)
    (h0 : 0 ≤ u) (h1 : u ≤ 1)
    (a : fits x sx lo hi) (b : fits y sy lo hi) :
    fits (mix u x y) (mix u sx sy) lo hi := by
  unfold fits at *
  unfold mix
  obtain ⟨al,as,ah⟩ := a
  obtain ⟨bl,bs,bh⟩ := b
  refine ⟨?_,?_,?_⟩
  · nlinarith [mul_nonneg (sub_nonneg.mpr h1) (sub_nonneg.mpr al),
      mul_nonneg h0 (sub_nonneg.mpr bl)]
  · exact add_nonneg (mul_nonneg (sub_nonneg.mpr h1) as) (mul_nonneg h0 bs)
  · nlinarith [mul_nonneg (sub_nonneg.mpr h1) (sub_nonneg.mpr ah),
      mul_nonneg h0 (sub_nonneg.mpr bh)]

structure Certificate where
  before : VerifiedCertificate
  after : VerifiedCertificate
  deriving FromJson,ToJson

structure Model where
  trace : Time.Trace
  bounds : Bounds
  before : Problem
  after : Problem

def Model.check (m : Model) (c : Certificate) : Bool :=
  m.trace.check && m.before.domain == m.after.domain &&
  endpointCheck m.bounds m.before c.before && endpointCheck m.bounds m.after c.after

def duringFits (b : Bounds) (r s : Piece) (w h u : ℝ) : Prop :=
  ∃ x y x' y', r.axes = [x,y] ∧ s.axes = [x',y'] ∧
    fits (mix u (x.start.eval w h) (x'.start.eval w h))
      (mix u (x.size.eval w h) (x'.size.eval w h))
      (b.left.eval w h) (b.right.eval w h) ∧
    fits (mix u (y.start.eval w h) (y'.start.eval w h))
      (mix u (y.size.eval w h) (y'.size.eval w h))
      (b.top.eval w h) (b.bottom.eval w h)

theorem Model.continuous_fit (m : Model) (c : Certificate)
    (ok : m.check c = true) (w h time : ℝ)
    (hd : Holds m.before.domain w h) (h0 : 0 ≤ time) (h1 : time ≤ m.trace.duration)
    (k : Time.Knot) (ks : List Time.Knot) (hk : m.trace.knots = k::ks) :
    (∃ u, Time.At k time u ks) ∧
    (∃ r ∈ m.before.pieces, Holds r.guard w h) ∧
    (∃ s ∈ m.after.pieces, Holds s.guard w h) ∧
    ∀ u, Time.At k time u ks →
      ∀ r ∈ m.before.pieces, Holds r.guard w h →
      ∀ s ∈ m.after.pieces, Holds s.guard w h →
        duringFits m.bounds r s w h u := by
  simp only [Model.check,Bool.and_eq_true,beq_iff_eq] at ok
  have hd' : Holds m.after.domain w h := ok.1.1.2 ▸ hd
  obtain ⟨cb,fb⟩ := endpoint_sound m.bounds m.before c.before ok.1.2 w h hd
  obtain ⟨ca,fa⟩ := endpoint_sound m.bounds m.after c.after ok.2 w h hd'
  have tr := m.trace.continuous_domain_safe k ks hk ok.1.1.1 time h0 h1 0 1 0 1
    (by norm_num) (by norm_num) (by norm_num) (by norm_num)
  refine ⟨tr.1,cb,ca,?_⟩
  intro u hu r hr hg s hs hg'
  have ub : 0 ≤ u ∧ u ≤ 1 := by simpa using tr.2 u hu
  obtain ⟨x,y,eq,fx,fy⟩ := fb r hr hg
  obtain ⟨x',y',eq',fx',fy'⟩ := fa s hs hg'
  exact ⟨x,y,x',y',eq,eq',fits_mix u _ _ _ _ _ _ ub.1 ub.2 fx fx',
    fits_mix u _ _ _ _ _ _ ub.1 ub.2 fy fy'⟩

-- The explicit case key must belong to the original regenerated obligation.
-- The motion check adds a viewport-fit claim; it does not assert that the
-- original contract (e.g. stable) or CSS animation itself is satisfied.
structure Request where
  obligation : Json
  key : State.CaseKey
  target : String
  trace : Time.Trace
  deriving FromJson

def readRequest (j : Json) : Except String Request := do
  shape j ["obligation","key","target","trace"]
  shape (← j.getObjVal? "key") ["contract","profile","from","event","to"]
  let tr ← j.getObjVal? "trace"
  shape tr ["duration","knots"]
  for k in ← items tr "knots" do
    shape k ["time","num","den"]
  fromJson? j

def Request.model (req : Request) : Except String Model := do
  let input ← stateInput req.obligation
  require (input.required.contains req.key && req.key.event.isSome) "Not a reachable event case"
  let some dest := req.key.«to» | throw "Missing transition destination"
  let report ← input.source.getObjVal? "report"
  let raw ← selectOne (← items (← report.getObjVal? "environment") "profiles")
    (fun j => matchesId j "id" req.key.profile)
  let p ← getProfile raw
  let before ← CSS.sourceProblem input.source req.key.«from» req.key.profile req.target
  let after ← CSS.sourceProblem input.source dest req.key.profile req.target
  require (req.trace.check && endpointShape before && endpointShape after) "Unsupported motion model"
  return ⟨req.trace,Bounds.ofProfile p,before,after⟩

def Model.plan (m : Model) : Json :=
  Json.mkObj [("before",planJson (fitProblem m.bounds m.before)),
    ("after",planJson (fitProblem m.bounds m.after))]

end VerissLean.Motion
