import VerissLeanState
open Lean VerissLean

structure StateProofEntry where
  key : State.CaseKey
  certificate : Option Relation.VerifiedCertificate := none
  violation : Option Relation.ViolationCertificate := none
  path : Option (List State.Edge) := none
  deriving FromJson

structure StateInput where
  graph : State.Graph
  scopes : List State.Scope
  required : List State.CaseKey
  required_eq : graph.required scopes = some required
  source : Json
  cases : List (State.CaseKey × Json)

def stateInput (raw : Json) : Except String StateInput := do
  let (g,cs,reported) ← State.decodeObligation raw
  Relation.require (g.checkCases cs reported) "Missing or invalid reachable cases"
  match eq : g.required cs with
  | none => throw "Invalid graph or scope"
  | some required => do
    let i ← raw.getObjVal? "implementation"
    let evidence ← i.getObjVal? "evidence"
    State.checkTag evidence "evidence"
    let source := Json.mkObj [
      ("report", Json.mkObj [("environment", ← i.getObjVal? "environment"),
        ("contract", ← raw.getObjVal? "contract")]),
      ("evidence", ← evidence.getObjVal? "entries")]
    let cases ← (← Relation.items raw "cases").mapM fun j => do
      return (← State.decodeCase j,j)
    return ⟨g,cs,required,eq,source,cases⟩

def StateInput.problem (input : StateInput) (k : State.CaseKey) : Except String Relation.Problem := do
  let some j := input.cases.lookup k | throw "Missing case"
  let targets ← Relation.items j "targets"
  Relation.getProblemFor input.source k.«from» k.profile k.contract k.event k.«to» (some targets)

def statePlan (input : StateInput) : List Json :=
  input.required.map fun k =>
    let (code,result) : Nat × Json := match input.problem k with
      | .ok p => (0,Relation.planJson p)
      | .error e => (2,toJson ("Unknown: " ++ e))
    Json.mkObj [("key",toJson k),("code",toJson code),("result",result)]

def StateInput.checkEntry (input : StateInput) (entry : StateProofEntry) : Nat :=
  match input.problem entry.key with
  | .error _ => 2
  | .ok p =>
    match entry.certificate,entry.violation,entry.path with
    | some c,none,none => if p.checkVerified c then 0 else 2
    | none,some c,some path =>
      if input.graph.checkPath entry.key path && p.checkViolated c then 1 else 2
    | _,_,_ => 2

def StateInput.aggregate (input : StateInput) (certs : List StateProofEntry) : Nat :=
  let supplied := certs.map (·.key)
  if !(certs.length ≤ 32768 && State.unique supplied &&
    supplied.all (fun k => decide (k ∈ input.required))) then 2 else
  let results := certs.map input.checkEntry
  if results.contains 1 then 1 else
  if State.checkKeys input.required supplied && results.all (· == 0) then 0 else 2

theorem StateInput.aggregate_verified (input : StateInput) (certs : List StateProofEntry)
    (ok : input.aggregate certs = 0) (k : State.CaseKey) (hk : k ∈ input.required) :
    ∃ e ∈ certs, e.key = k ∧ input.checkEntry e = 0 := by
  simp only [StateInput.aggregate] at ok
  split at ok
  · contradiction
  split at ok
  · contradiction
  split at ok
  next h =>
    simp only [Bool.and_eq_true, List.all_eq_true, beq_iff_eq] at h
    have hm := (State.checkKeys_spec _ _ h.1 k).mpr hk
    obtain ⟨e,he,hek⟩ := List.mem_map.mp hm
    exact ⟨e,he,hek,h.2 _ (List.mem_map.mpr ⟨e,he,rfl⟩)⟩
  next => contradiction

theorem StateInput.entry_verified (input : StateInput) (e : StateProofEntry)
    (ok : input.checkEntry e = 0) :
    ∃ p c, input.problem e.key = .ok p ∧ e.certificate = some c ∧
      ∀ w h, Holds p.domain w h →
        (∃ r ∈ p.pieces, Holds r.guard w h) ∧
        (∀ r ∈ p.pieces, Holds r.guard w h → r.goal.holds w h) := by
  unfold StateInput.checkEntry at ok
  split at ok
  · contradiction
  next p hp =>
    split at ok
    next c hc _ _ =>
      split at ok
      next h => exact ⟨p,c,hp,hc,fun w height hd => p.verified_sound c h w height hd⟩
      next => contradiction
    next => split at ok <;> contradiction
    next => contradiction

theorem StateInput.entry_violated (input : StateInput) (e : StateProofEntry)
    (ok : input.checkEntry e = 1) :
    ∃ p c path, input.problem e.key = .ok p ∧ e.violation = some c ∧
      e.path = some path ∧ State.Reach input.graph e.key.profile e.key.«from» ∧
      Holds p.domain c.point.width c.point.height ∧
      ∃ r ∈ p.pieces, Holds r.guard c.point.width c.point.height ∧
        ¬ r.goal.holds c.point.width c.point.height := by
  unfold StateInput.checkEntry at ok
  split at ok
  · contradiction
  next p hp =>
    split at ok
    next => split at ok <;> contradiction
    next c path _ hc hs =>
      split at ok
      next h =>
        simp only [Bool.and_eq_true] at h
        exact ⟨p,c,path,hp,hc,hs,input.graph.checkPath_sound e.key path h.1,
          p.violated_sound c h.2⟩
      next => contradiction
    next => contradiction

theorem StateInput.aggregate_violated (input : StateInput) (certs : List StateProofEntry)
    (ok : input.aggregate certs = 1) :
    ∃ e ∈ certs, e.key ∈ input.required ∧ input.checkEntry e = 1 := by
  simp only [StateInput.aggregate] at ok
  split at ok
  · contradiction
  next valid =>
    split at ok
    next hv =>
      have hm : 1 ∈ certs.map input.checkEntry := by simpa using hv
      obtain ⟨e,he,hv'⟩ := List.mem_map.mp hm
      simp at valid
      exact ⟨e,he,valid.2 e he,hv'⟩
    next => split at ok <;> contradiction

-- The normalized graph/case completeness theorem composes with the
-- aggregate proof check. Decoder correspondence is a separate boundary.
theorem StateInput.all_reachable_verified (input : StateInput)
    (certs : List StateProofEntry)
    (ok : input.aggregate certs = 0)
    (scope : State.Scope) (hs : scope ∈ input.scopes) (profile : String)
    (hp : profile ∈ input.graph.profiles) (k : State.CaseKey)
    (applies : scope.Applies input.graph profile k) :
    ∃ p, input.problem k = .ok p ∧ ∀ w h, Holds p.domain w h →
      (∃ r ∈ p.pieces, Holds r.guard w h) ∧
      (∀ r ∈ p.pieces, Holds r.guard w h → r.goal.holds w h) := by
  have hk := (input.graph.required_spec input.scopes input.required input.required_eq k).mpr
    ⟨scope,hs,profile,hp,applies⟩
  obtain ⟨e,_,he,checked⟩ := input.aggregate_verified certs ok k hk
  obtain ⟨p,c,hp',_,sound⟩ := input.entry_verified e checked
  exact ⟨p,he ▸ hp',sound⟩

theorem StateInput.reachable_violation (input : StateInput)
    (certs : List StateProofEntry)
    (ok : input.aggregate certs = 1) :
    ∃ (k : State.CaseKey) (p : Relation.Problem) (c : Relation.ViolationCertificate), (∃ scope ∈ input.scopes, ∃ profile ∈ input.graph.profiles,
      scope.Applies input.graph profile k) ∧
      input.problem k = .ok p ∧
      State.Reach input.graph k.profile k.«from» ∧
      Holds p.domain c.point.width c.point.height ∧
      ∃ r ∈ p.pieces, Holds r.guard c.point.width c.point.height ∧
        ¬ r.goal.holds c.point.width c.point.height := by
  obtain ⟨e,_,hk,checked⟩ := input.aggregate_violated certs ok
  obtain ⟨p,c,path,hp,_,_,reach,hd,bad⟩ := input.entry_violated e checked
  exact ⟨e.key,p,c,(input.graph.required_spec input.scopes input.required input.required_eq e.key).mp hk,
    hp,reach,hd,bad⟩

def checkStateProofs (raw : Json) (certs : List StateProofEntry) : Except String Nat := do
  let input ← stateInput raw
  return input.aggregate certs

