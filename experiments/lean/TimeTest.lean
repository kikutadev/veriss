import VerissLeanTime
open VerissLean.Time
def validTrace : Trace := ⟨1000,[⟨0,0,1⟩,⟨250,1,5⟩,⟨750,4,5⟩,⟨1000,1,1⟩]⟩
example : validTrace.check = true := by decide
example : ({validTrace with duration := 999}).check = false := by decide
example : ({validTrace with knots := [⟨0,0,1⟩,⟨500,2,1⟩,⟨1000,1,1⟩]}).check = false := by decide
example : ({validTrace with knots := [⟨0,0,1⟩,⟨500,1,0⟩,⟨1000,1,1⟩]}).check = false := by decide
example : ({validTrace with knots := [⟨0,0,1⟩,⟨0,1,2⟩,⟨1000,1,1⟩]}).check = false := by decide
example : ({validTrace with knots := [⟨1,0,1⟩,⟨1000,1,1⟩]}).check = false := by decide
example : ({validTrace with knots := [⟨0,0,1⟩,⟨1000,1,2⟩]}).check = false := by decide
example : ({validTrace with knots := []}).check = false := by decide
#print axioms Trace.continuous_domain_safe
