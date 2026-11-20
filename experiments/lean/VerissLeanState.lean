import VerissLeanReport

namespace VerissLean.State

structure Edge where
  «from» : String
  event : String
  «to» : String
  profiles : Option (List String) := none
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

structure Graph where
  initial : String
  states : List String
  profiles : List String
  edges : List Edge
  deriving Repr, Lean.FromJson, Lean.ToJson

def validId (s : String) : Bool := !s.isEmpty && s.length ≤ 128

def unique [DecidableEq α] : List α → Bool
  | [] => true
  | a :: as => decide (a ∉ as) && unique as

def selection (ids : List String) (v : Option (List String)) : Bool :=
  match v with
  | none => true
  | some xs => !xs.isEmpty && unique xs && xs.all (fun x => decide (x ∈ ids))

def Edge.enabled (e : Edge) (p : String) : Bool :=
  e.profiles.isNone || (e.profiles.getD []).contains p

def Graph.valid (g : Graph) : Bool :=
  g.states.length ≤ 64 && g.profiles.length ≤ 16 && !g.profiles.isEmpty &&
  g.edges.length ≤ 256 && g.states.all validId && g.profiles.all validId &&
  unique g.states && unique g.profiles && g.states.contains g.initial &&
  unique (g.edges.map fun e => (e.from,e.event,e.to)) &&
  g.edges.all (fun e => g.states.contains e.from && g.states.contains e.to &&
    validId e.event && selection g.profiles e.profiles)

inductive Reach (g : Graph) (p : String) : String → Prop
  | initial : Reach g p g.initial
  | step (e : Edge) : e ∈ g.edges → e.enabled p = true →
      Reach g p e.from → Reach g p e.to

def Graph.expand (g : Graph) (p : String) (seen : List String) : List String :=
  g.states.filter fun s => decide (s ∈ seen) ||
    g.edges.any (fun e => e.enabled p && decide (e.from ∈ seen) && decide (e.to = s))

def Graph.run (g : Graph) (p : String) : Nat → List String
  | 0 => [g.initial]
  | n+1 => g.expand p (g.run p n)

def Graph.closed (g : Graph) (p : String) (seen : List String) : Bool :=
  decide (g.initial ∈ seen) && g.edges.all (fun e =>
    !(e.enabled p && decide (e.from ∈ seen)) || decide (e.to ∈ seen))

def Graph.checkedReach (g : Graph) (p : String) : Option (List String) :=
  let seen := g.run p g.states.length
  if g.valid && g.profiles.contains p && g.closed p seen then some seen else none

theorem Graph.expand_sound (g : Graph) (p : String) (seen : List String)
    (hs : ∀ s ∈ seen, Reach g p s) (s : String) (hm : s ∈ g.expand p seen) :
    Reach g p s := by
  have hh := (List.mem_filter.mp hm).2
  simp only [Bool.or_eq_true, decide_eq_true_eq, List.any_eq_true] at hh
  rcases hh with h | ⟨e, he, h⟩
  · exact hs s h
  · simp only [Bool.and_eq_true, decide_eq_true_eq] at h
    have hr := Reach.step e he h.1.1 (hs e.from h.1.2)
    rw [h.2] at hr
    exact hr

theorem Graph.run_sound (g : Graph) (p : String) (n : Nat) :
    ∀ s ∈ g.run p n, Reach g p s := by
  induction n with
  | zero =>
    intro s hm
    simp [Graph.run] at hm
    subst s
    exact Reach.initial
  | succ n ih =>
    intro s hm
    exact g.expand_sound p (g.run p n) ih s hm

theorem Graph.closed_complete (g : Graph) (p : String) (seen : List String)
    (hc : g.closed p seen = true) (s : String) (hr : Reach g p s) :
    s ∈ seen := by
  simp only [Graph.closed, Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true] at hc
  induction hr with
  | initial => exact hc.1
  | step e he hen _ ih =>
    have hh := hc.2 e he
    simp [hen, ih] at hh
    exact hh

theorem Graph.checkedReach_spec (g : Graph) (p : String) (seen : List String)
    (ok : g.checkedReach p = some seen) (s : String) :
    s ∈ seen ↔ Reach g p s := by
  simp only [Graph.checkedReach] at ok
  split at ok
  next hc =>
    have eq : g.run p g.states.length = seen := Option.some.inj ok
    subst seen
    constructor
    · exact g.run_sound p g.states.length s
    · intro hr
      have h : g.closed p (g.run p g.states.length) = true := (by simp only [Bool.and_eq_true] at hc; exact hc.2)
      exact g.closed_complete p _ h s hr
  next => contradiction

structure Scope where
  id : String
  states : Option (List String) := none
  profiles : Option (List String) := none
  event : Option String := none
  deriving Repr, Lean.FromJson, Lean.ToJson

structure CaseKey where
  contract : String
  profile : String
  «from» : String
  event : Option String := none
  «to» : Option String := none
  deriving Repr, DecidableEq, Lean.FromJson, Lean.ToJson

def Scope.valid (c : Scope) (g : Graph) : Bool :=
  validId c.id && selection g.states c.states &&
    selection g.profiles c.profiles && (c.event.map validId).getD true

def selected (xs : Option (List String)) (s : String) : Bool :=
  xs.isNone || (xs.getD []).contains s

def Scope.cases (c : Scope) (g : Graph) (p : String) (seen : List String) : List CaseKey :=
  if selected c.profiles p then
    match c.event with
    | none => (seen.filter (selected c.states)).map fun s => ⟨c.id,p,s,none,none⟩
    | some event => (g.edges.filter fun e =>
        e.enabled p && decide (e.«from» ∈ seen) && selected c.states e.«from» &&
          decide (e.event = event)).map fun e => ⟨c.id,p,e.«from»,some event,some e.«to»⟩
  else []

def Scope.Applies (c : Scope) (g : Graph) (p : String) (k : CaseKey) : Prop :=
  selected c.profiles p = true ∧
    match c.event with
    | none => ∃ s, Reach g p s ∧ selected c.states s = true ∧ k = ⟨c.id,p,s,none,none⟩
    | some ev => ∃ e ∈ g.edges, e.enabled p = true ∧ Reach g p e.«from» ∧
        selected c.states e.«from» = true ∧ e.event = ev ∧
        k = ⟨c.id,p,e.«from»,some ev,some e.«to»⟩

theorem Scope.cases_spec (c : Scope) (g : Graph) (p : String) (seen : List String)
    (ok : g.checkedReach p = some seen) (k : CaseKey) :
    k ∈ c.cases g p seen ↔ c.Applies g p k := by
  have hs := g.checkedReach_spec p seen ok
  unfold Scope.cases Scope.Applies
  split
  next hp =>
    cases he : c.event <;>
      simp only [he, hp, List.mem_map, List.mem_filter, Bool.and_eq_true, decide_eq_true_eq, hs, true_and] <;> aesop
  next hp => simp [hp]

def Graph.expected (g : Graph) (contracts : List Scope) : List CaseKey :=
  contracts.flatMap fun c => g.profiles.flatMap fun p => c.cases g p (g.run p g.states.length)

def Graph.acceptsScopes (g : Graph) (contracts : List Scope) : Bool :=
  g.valid && !contracts.isEmpty && contracts.length ≤ 128 &&
    unique (contracts.map (·.id)) && contracts.all (·.valid g) &&
    g.profiles.all (fun p => g.closed p (g.run p g.states.length))

def Graph.required (g : Graph) (contracts : List Scope) : Option (List CaseKey) :=
  let cases := g.expected contracts
  if g.acceptsScopes contracts && cases.length ≤ 32768 &&
      contracts.all (fun c => cases.any (fun k => k.contract == c.id))
    then some cases else none

theorem Graph.required_spec (g : Graph) (contracts : List Scope) (ks : List CaseKey)
    (ok : g.required contracts = some ks) (k : CaseKey) :
    k ∈ ks ↔ ∃ c ∈ contracts, ∃ p ∈ g.profiles, c.Applies g p k := by
  simp only [Graph.required] at ok
  split at ok
  next hc =>
    have eq : g.expected contracts = ks := Option.some.inj ok
    subst ks
    simp only [Bool.and_eq_true, Graph.acceptsScopes, List.all_eq_true] at hc
    have hs : ∀ p ∈ g.profiles, g.checkedReach p = some (g.run p g.states.length) := by
      intro p hp
      simp [Graph.checkedReach, hc.1.1.1.1.1.1.1, hp, hc.1.1.2 p hp]
    simp only [Graph.expected, List.mem_flatMap]
    constructor
    · rintro ⟨c,hc',p,hp,hk⟩
      exact ⟨c,hc',p,hp,(c.cases_spec g p _ (hs p hp) k).mp hk⟩
    · rintro ⟨c,hc',p,hp,hk⟩
      exact ⟨c,hc',p,hp,(c.cases_spec g p _ (hs p hp) k).mpr hk⟩
  next => contradiction

-- Untrusted case lists are compared against regenerated obligations, not counted.
def checkKeys (expected supplied : List CaseKey) : Bool :=
  unique supplied && expected.all (fun k => decide (k ∈ supplied)) &&
    supplied.all (fun k => decide (k ∈ expected))

theorem checkKeys_spec (expected supplied : List CaseKey)
    (ok : checkKeys expected supplied = true) (k : CaseKey) :
    k ∈ supplied ↔ k ∈ expected := by
  simp only [checkKeys, Bool.and_eq_true, List.all_eq_true, decide_eq_true_eq] at ok
  exact ⟨ok.2 k, ok.1.2 k⟩

def Graph.checkCases (g : Graph) (contracts : List Scope) (supplied : List CaseKey) : Bool :=
  match g.required contracts with
  | none => false
  | some expected => supplied.length ≤ 32768 && checkKeys expected supplied

theorem Graph.checkCases_spec (g : Graph) (contracts : List Scope) (supplied : List CaseKey)
    (ok : g.checkCases contracts supplied = true) (k : CaseKey) :
    k ∈ supplied ↔ ∃ c ∈ contracts, ∃ p ∈ g.profiles, c.Applies g p k := by
  unfold Graph.checkCases at ok
  split at ok
  next => contradiction
  next ks he =>
    simp only [Bool.and_eq_true] at ok
    exact (checkKeys_spec ks supplied ok.2 k).trans (g.required_spec contracts ks he k)

open Lean
open VerissLean.Relation (require str items shape)

def checkTag (j : Json) (kind : String) : Except String Unit := do
  require ((← j.getObjValAs? Nat "version") == 1 && (← str j "kind") == kind)
    "Unsupported IR version or kind"

-- Only decode selectors and graph. Geometry/profile details and target lists
-- deliberately do not participate in this coverage-only claim.
def decodeObligation (j : Json) : Except String (Graph × List Scope × List CaseKey) := do
  checkTag j "obligation"
  require ((← str j "operation") == "relational") "Unsupported operation"
  let i ← j.getObjVal? "implementation"
  let state ← i.getObjVal? "state"
  checkTag state "state"
  shape state ["version","kind","initial","states","transitions"]
  let env ← i.getObjVal? "environment"
  checkTag env "environment"
  let profiles ← (← items env "profiles").mapM fun x => str x "id"
  let edges ← (← items state "transitions").mapM fun e => do
    shape e ["from","event","to","profiles"]
    fromJson? (α := Edge) e
  let g : Graph := ⟨← str state "initial", ← state.getObjValAs? (List String) "states", profiles, edges⟩
  let contract ← j.getObjVal? "contract"
  checkTag contract "contract"
  require ((← str (← contract.getObjVal? "profile") "id") == "relational/1") "Unsupported contract profile"
  let cs ← (← items contract "contracts").mapM fun c => fromJson? (α := Scope) c
  let ks ← (← items j "cases").mapM fun k => do
    let tr ← k.getObjVal? "transition"
    shape tr ["from","event","to","profiles"]
    let event : Option String ← fromJson? (tr.getObjValD "event")
    let dest : Option String ← fromJson? (tr.getObjValD "to")
    return (⟨← str k "contract", ← str k "profile", ← str tr "from", event, dest⟩ : CaseKey)
  return (g,cs,ks)

end VerissLean.State
