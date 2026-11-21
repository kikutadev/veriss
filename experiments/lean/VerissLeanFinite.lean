import VerissLeanState

namespace VerissLean.Finite
open Lean State

-- Normalized, closed dispatch fragment, matching the adapters' boolean
-- assignment semantics. Source-to-normalized AST and DOM inventory are
-- external premises, not inferred by this checker.
structure Expr where
  «variable» : Option Nat := none
  negate : Bool := false
  value : Option Bool := none
  deriving Repr,FromJson,ToJson

def Expr.valid (e : Expr) (n : Nat) : Bool :=
  match e.variable,e.value with
  | none,some _ => !e.negate
  | some i,none => i < n
  | _,_ => false

def Expr.eval (e : Expr) (values : List Bool) : Option Bool :=
  match e.variable,e.value with
  | none,some v => some v
  | some i,none => (values[i]?).map fun v => v != e.negate
  | _,_ => none

structure Handler where
  target : String
  «variable» : Nat
  expression : Expr
  deriving Repr,FromJson,ToJson

structure Render where
  id : String
  -- Partial boolean choices and all attached click targets.
  choices : List (Nat × Bool)
  buttons : List String
  deriving Repr,FromJson,ToJson

def Render.matches (r : Render) (values : List Bool) : Bool :=
  r.choices.all fun (i,b) => values[i]? == some b

structure Variant where
  id : String
  values : List Bool
  render : String
  deriving Repr,DecidableEq,FromJson,ToJson

structure Machine where
  «variables» : List String
  initial : List Bool
  handlers : List Handler
  renders : List Render
  deriving Repr,FromJson,ToJson

def event (h : Handler) : String := "click:" ++ h.target

def Machine.render (m : Machine) (values : List Bool) : Option Render :=
  match m.renders.filter (·.matches values) with
  | [r] => some r
  | _ => none

def Machine.dispatch (m : Machine) (values : List Bool) (ev : String) : Option (List Bool) := do
  let r ← m.render values
  let h ← (m.handlers.filter fun h => event h == ev).head?
  if !(r.buttons.contains h.target) then none else
  let value ← h.expression.eval values
  return values.set h.variable value

def Machine.valid (m : Machine) : Bool :=
  !m.variables.isEmpty && m.variables.length ≤ 6 &&
  unique m.variables && m.variables.all validId &&
  m.initial.length == m.variables.length &&
  m.handlers.length ≤ 128 && unique (m.handlers.map (·.target)) &&
  m.handlers.all (fun h => validId h.target && h.variable < m.variables.length &&
    h.expression.valid m.variables.length) &&
  !m.renders.isEmpty && m.renders.length ≤ 64 && unique (m.renders.map (·.id)) &&
  m.renders.all (fun r => validId r.id && r.choices.length ≤ 6 &&
    unique (r.choices.map Prod.fst) && r.choices.all (fun c => c.1 < m.variables.length) &&
    unique r.buttons && r.buttons.all (fun b => m.handlers.any (fun h => h.target == b)))

def Machine.variantValid (m : Machine) (v : Variant) : Bool :=
  v.values.length == m.variables.length &&
  (m.render v.values).map (·.id) == some v.render

-- Forward inclusion: every enabled dispatch has a mapped destination and
-- a corresponding graph edge. Reverse inclusion excludes invented edges.
def Machine.checkDispatch (m : Machine) (g : Graph) (vs : List Variant)
    (v : Variant) (ev : String) : Bool :=
  match m.dispatch v.values ev with
  | none => true
  | some dest => vs.any fun u => u.values == dest &&
      g.edges.any fun e => e.«from» == v.id && e.event == ev && e.«to» == u.id && e.profiles.isNone

def Machine.checkEdge (m : Machine) (vs : List Variant) (e : Edge) : Bool :=
  e.profiles.isNone && vs.any (fun v => v.id == e.«from» &&
    vs.any (fun u => u.id == e.«to» && m.dispatch v.values e.event == some u.values))

def Machine.check (m : Machine) (g : Graph) (vs : List Variant) : Bool :=
  m.valid && g.valid && vs.length ≤ 64 && unique (vs.map (·.id)) &&
  unique (vs.map (·.values)) &&
  vs.all (fun v => g.states.contains v.id && m.variantValid v &&
    (m.handlers.all fun h => m.checkDispatch g vs v (event h))) &&
  g.states.all (fun s => vs.any fun v => v.id == s) &&
  vs.any (fun v => v.id == g.initial && v.values == m.initial) &&
  g.edges.all (m.checkEdge vs)

inductive Reach (m : Machine) : List Bool → Prop
  | initial : Reach m m.initial
  | step (values dest : List Bool) (h : Handler) : h ∈ m.handlers →
      m.dispatch values (event h) = some dest → Reach m values → Reach m dest

theorem Machine.dispatch_sound (m : Machine) (g : Graph) (vs : List Variant)
    (ok : m.check g vs = true) (p : String) (v : Variant) (hv : v ∈ vs)
    (h : Handler) (hh : h ∈ m.handlers) (dest : List Bool)
    (step : m.dispatch v.values (event h) = some dest) :
    ∃ u ∈ vs, u.values = dest ∧ ∃ e ∈ g.edges,
      e.«from» = v.id ∧ e.event = event h ∧ e.«to» = u.id ∧ e.enabled p = true := by
  simp only [Machine.check,Bool.and_eq_true,List.all_eq_true] at ok
  have all := (ok.1.1.1.2 v hv).2 h hh
  simp only [Machine.checkDispatch,step,List.any_eq_true,Bool.and_eq_true,beq_iff_eq] at all
  obtain ⟨u,hu,hv',e,he,⟨⟨⟨hf,hev⟩,hto⟩,hp⟩⟩ := all
  exact ⟨u,hu,hv',e,he,hf,hev,hto,by simp [Edge.enabled,hp]⟩

theorem Machine.reach_refines (m : Machine) (g : Graph) (vs : List Variant)
    (ok : m.check g vs = true) (p : String) (values : List Bool)
    (hr : Reach m values) :
    ∃ v ∈ vs, v.values = values ∧ State.Reach g p v.id := by
  induction hr with
  | initial =>
    have h := ok
    simp only [Machine.check,Bool.and_eq_true,List.any_eq_true,beq_iff_eq] at h
    obtain ⟨v,hv,hid,hval⟩ := h.1.2
    exact ⟨v,hv,hval,hid.symm ▸ State.Reach.initial⟩
  | step prev dest handler hm hs _ ih =>
    obtain ⟨v,hv,hval,hreach⟩ := ih
    obtain ⟨u,hu,hv',e,he,hf,_,hto,hp⟩ :=
      m.dispatch_sound g vs ok p v hv handler hm dest (hval.symm ▸ hs)
    exact ⟨u,hu,hv',hto ▸ State.Reach.step e he hp (hf.symm ▸ hreach)⟩

-- Each declared edge must also be a genuine normalized dispatch; this
-- is stronger than forward simulation alone.
theorem Machine.edge_sound (m : Machine) (g : Graph) (vs : List Variant)
    (ok : m.check g vs = true) (e : Edge) (he : e ∈ g.edges) :
    ∃ v ∈ vs, ∃ u ∈ vs, v.id = e.«from» ∧ u.id = e.«to» ∧
      m.dispatch v.values e.event = some u.values := by
  simp only [Machine.check,Bool.and_eq_true,List.all_eq_true] at ok
  have h := ok.2 e he
  simp only [Machine.checkEdge,Bool.and_eq_true,List.any_eq_true,beq_iff_eq] at h
  obtain ⟨v,hv,hf,u,hu,ht,hd⟩ := h.2
  exact ⟨v,hv,u,hu,hf,ht,hd⟩

structure Input where
  machine : Machine
  graph : Graph
  variants : List Variant
  deriving FromJson

def Input.check (i : Input) : Bool := i.machine.check i.graph i.variants

def readInput (j : Json) : Except String Input := do
  Relation.shape j ["machine","graph","variants"]
  let m ← j.getObjVal? "machine"
  Relation.shape m ["variables","initial","handlers","renders"]
  for h in ← Relation.items m "handlers" do
    Relation.shape h ["target","variable","expression"]
    Relation.shape (← h.getObjVal? "expression") ["variable","negate","value"]
  for r in ← Relation.items m "renders" do
    Relation.shape r ["id","choices","buttons"]
  let g ← j.getObjVal? "graph"
  Relation.shape g ["initial","states","profiles","edges"]
  for e in ← Relation.items g "edges" do
    Relation.shape e ["from","event","to","profiles"]
  for v in ← Relation.items j "variants" do
    Relation.shape v ["id","values","render"]
  fromJson? j

end VerissLean.Finite
