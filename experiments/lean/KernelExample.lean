import VerissLeanSource

open VerissLean

def exampleCertificate : Certificate := {
  version := 1
  profile := ⟨320,1920,320,1080,0,0⟩
  scale := 1
  rows := [⟨[],⟨0,0,0⟩,⟨1,0,0⟩⟩]
  coverage := .row []
  safety := [[0,0,0,0,1],[1,0,0,0,1],[0,0,0,0,1]]
  agreement := [[0,0,0,0,1],[0,0,0,0,1],[0,0,0,0,1],[0,0,0,0,1]]
}

-- This is kernel reduction, not native_decide or a trusted external solver.
theorem exampleChecked : exampleCertificate.check = true := by decide
#print axioms exampleChecked
#print axioms Certificate.verified_inline
#print axioms Certificate.total_unique_fit

#print axioms Certificate.sound
#print axioms LiteralAffine.matches_sound
#print axioms LiteralAffine.guard_sound
#print axioms interpolation_within
