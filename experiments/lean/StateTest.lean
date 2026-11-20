import VerissLeanState
open VerissLean.State
def g : Graph := ⟨"a", ["a","b","c","dead"], ["desktop","mobile"],
  [⟨"a","open","b",none⟩, ⟨"b","close","a",none⟩,
   ⟨"a","open","c",some ["mobile"]⟩, ⟨"b","stay","b",none⟩]⟩
example : g.valid = true := by decide
example : g.checkedReach "desktop" = some ["a","b"] := by decide
example : g.checkedReach "mobile" = some ["a","b","c"] := by decide
example : g.closed "mobile" ["a","b"] = false := by decide
example : ({g with initial := "missing"}).checkedReach "mobile" = none := by decide
example : g.checkedReach "unknown" = none := by decide
example : ({g with edges := g.edges ++ [ (⟨"a","open","b",none⟩ : Edge) ]}).valid = false := by decide
example : ({g with edges := [⟨"dead","back","a",none⟩]}).checkedReach "desktop" = some ["a"] := by decide
example : ({g with states := ["a"], edges := [⟨"a","stay","a",none⟩]}).checkedReach "desktop" = some ["a"] := by decide
example : ({g with edges := [⟨"a","open","b",some ["alien"]⟩]} : Graph).valid = false := by decide
#print axioms Graph.checkedReach_spec

def scopes : List Scope := [⟨"static",none,none,none⟩, ⟨"event",none,none,some "open"⟩]
def cases : List CaseKey := [
  ⟨"static","desktop","a",none,none⟩, ⟨"static","desktop","b",none,none⟩,
  ⟨"static","mobile","a",none,none⟩, ⟨"static","mobile","b",none,none⟩,
  ⟨"static","mobile","c",none,none⟩,
  ⟨"event","desktop","a",some "open",some "b"⟩,
  ⟨"event","mobile","a",some "open",some "b"⟩,
  ⟨"event","mobile","a",some "open",some "c"⟩]
example : g.checkCases scopes cases = true := by decide
example : g.checkCases scopes cases.reverse = true := by decide
example : g.checkCases scopes cases.tail = false := by decide
example : g.checkCases scopes (cases ++ cases) = false := by decide
example : g.checkCases scopes (cases ++ [⟨"event","desktop","a",some "open",some "c"⟩]) = false := by decide
example : g.required [⟨"dead",some ["dead"],none,none⟩] = none := by decide
example : g.required [⟨"missing",none,none,some "no-event"⟩] = none := by decide
example : g.required [⟨"wrong",none,some ["alien"],none⟩] = none := by decide
#print axioms Scope.cases_spec
#print axioms checkKeys_spec

#print axioms Graph.required_spec
#print axioms Graph.checkCases_spec

def chain (n : Nat) : Graph :=
  ⟨"0",(List.range n).map toString,["p"],
    (List.range (n-1)).map fun i => ⟨toString i,"next",toString (i+1),none⟩⟩
set_option maxRecDepth 100000 in
set_option maxHeartbeats 5000000 in
example : ((chain 64).checkedReach "p").map List.length = some 64 := by decide
example : (chain 65).valid = false := by decide
