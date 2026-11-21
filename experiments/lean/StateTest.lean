import VerissLeanStateProof
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

def closeKey : CaseKey := ⟨"close","desktop","b",some "close",some "a"⟩
def pathAB : List Edge := [⟨"a","open","b",none⟩]
example : g.checkPath closeKey pathAB = true := by decide
example : g.checkPath closeKey [] = false := by decide
example : g.checkPath closeKey [⟨"a","open","c",some ["mobile"]⟩] = false := by decide
example : g.checkPath ({closeKey with «to» := some "c"}) pathAB = false := by decide
example : g.checkPath ⟨"self","desktop","b",some "stay",some "b"⟩ pathAB = true := by decide
example : g.checkPath ⟨"open","mobile","a",some "open",some "c"⟩ [] = true := by decide
example : g.checkPath ⟨"open","desktop","a",some "open",some "c"⟩ [] = false := by decide
example : g.checkPath ⟨"static","mobile","c",none,none⟩ [⟨"a","open","c",some ["mobile"]⟩] = true := by decide
example : g.checkPath ⟨"static","desktop","c",none,none⟩ [⟨"a","open","c",some ["mobile"]⟩] = false := by decide
#print axioms Graph.walk_sound
#print axioms Graph.checkPath_sound
#print axioms Graph.checkPath_edge

#print axioms StateInput.aggregate_verified
#print axioms StateInput.aggregate_violated
#print axioms StateInput.all_reachable_verified
#print axioms StateInput.reachable_violation

#print axioms VerissLean.Relation.combineRows_sound
#print axioms VerissLean.Relation.combineRows_covers
