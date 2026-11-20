import VerissLeanSource
open Lean VerissLean

def readJson (file : String) : IO (Except String Json) := do
  let raw ← IO.FS.readFile file
  if raw.length > 20000000 then return .error "Input limit"
  return Json.parse ((raw.splitOn "\nQA supervisor").head!)

def fail (msg : String) : IO UInt32 := do
  IO.eprintln s!"Unknown: {msg}"
  return 2

def checkFile (file : String) (source : Option (String × String × String × String)) : IO UInt32 := do
  match (← readJson file) >>= fromJson? (α := Certificate) with
  | .error msg => fail msg
  | .ok c =>
    if let some (reportFile,state,profile,target) := source then
      match (← readJson reportFile) >>= fromJson? (α := RawReport) >>= fun raw => bindReport raw state profile target c with
      | .ok true => pure ()
      | .ok false => return ← fail "Certificate does not match original evidence"
      | .error msg => return ← fail msg
    if c.check then
      IO.println (if source.isSome then "Verified: source-bound affine inline model certificate" else "Verified: affine inline model certificate")
      return 0
    else fail "Invalid or insufficient certificate"

def main (args : List String) : IO UInt32 := do
  match args with
  | [file] => checkFile file none
  | ["report",report,state,profile,target,file] => checkFile file (some (report,state,profile,target))
  | _ => fail "usage: veriss-check [report REPORT.json STATE PROFILE TARGET] CERTIFICATE.json"
