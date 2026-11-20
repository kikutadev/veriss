import VerissLeanStateProof
import VerissLeanTime
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

structure RelationRequest where
  mode : String
  report : String
  state : String
  profile : String
  contract : String
  certificate : Option String := none
  deriving FromJson

def unknown (msg : String) : Nat × Json := (2,toJson ("Unknown: " ++ msg))

def relationalResult (req : RelationRequest) : IO (Nat × Json) := do
  match (← readJson req.report) >>= fun raw => Relation.getProblem raw req.state req.profile req.contract with
  | .error msg => return unknown msg
  | .ok problem =>
    if req.mode == "plan" then return (0,Relation.planJson problem)
    let some path := req.certificate | return unknown "Missing certificate"
    let data ← readJson path
    if req.mode == "verify" then
      match data >>= fromJson? (α := Relation.VerifiedCertificate) with
      | .error msg => return unknown msg
      | .ok c =>
        if problem.checkVerified c then
          return (0,toJson "Verified: source-derived relational model")
        else return unknown "Invalid or insufficient relational certificate"
    else if req.mode == "violate" then
      match data >>= fromJson? (α := Relation.ViolationCertificate) with
      | .error msg => return unknown msg
      | .ok c =>
        if problem.checkViolated c then
          return (1,toJson "Violated: exact source-derived relational counterexample")
        else return unknown "Invalid or insufficient counterexample certificate"
    else return unknown "Unsupported request mode"

def runRequest (req : RelationRequest) : IO (Nat × Json) := do
  try relationalResult req catch e => return unknown (toString e)

def relational (mode report state profile contract : String) (certPath : Option String) : IO UInt32 := do
  let (code,data) ← runRequest ⟨mode,report,state,profile,contract,certPath⟩
  let msg := data.getStr?.toOption.getD data.compress
  if code == 2 then IO.eprintln msg else IO.println msg
  return code.toUInt32

def batch (file : String) : IO UInt32 := do
  match (← readJson file) >>= fromJson? (α := List RelationRequest) with
  | .error msg => fail msg
  | .ok reqs =>
    if reqs.isEmpty || reqs.length > 128 then return ← fail "Batch size limit"
    let results ← reqs.mapM runRequest
    IO.println (toJson (results.map fun (code,data) =>
      Json.mkObj [("code",toJson code),("result",data)])).compress
    return (if results.any (·.1 == 2) then 2 else if results.any (·.1 == 1) then 1 else 0)

def main (args : List String) : IO UInt32 := do
  match args with
  | ["time-domain",file] =>
    match (← readJson file) >>= fromJson? (α := Time.Trace) with
    | .error msg => fail msg
    | .ok tr =>
      if tr.check then
        IO.println "Checked: normalized shared linear progress covers the declared real-time domain"
        return 0
      else fail "Invalid or incomplete time domain"
  | ["state-plan",file] =>
    match (← readJson file) >>= stateInput with
    | .error msg => fail msg
    | .ok input =>
      let plans := statePlan input
      IO.println (toJson plans).compress
      return if plans.any (fun j => j.getObjValD "code" == toJson (2 : Nat)) then 2 else 0
  | ["state-proofs",file,certs] =>
    match (← readJson file), ((← readJson certs) >>= fromJson? (α := List StateProofEntry)) with
    | .ok raw, .ok entries =>
      match checkStateProofs raw entries with
      | .ok 0 =>
        IO.println "Verified: all required declared static and transition relational model cases"
        return 0
      | .ok 1 =>
        IO.println "Violated: exact relational counterexample on a reachable declared case"
        return 1
      | .ok _ => fail "Missing, unsupported or invalid case proof"
      | .error msg => fail msg
    | .error msg, _ | _, .error msg => fail msg
  | ["state-cases",file] =>
    match (← readJson file) >>= State.decodeObligation with
    | .error msg => fail msg
    | .ok (g,cs,ks) =>
      if g.checkCases cs ks then
        IO.println "Checked: declared graph reachable case keys only (not geometry or contract truth)"
        return 0
      else fail "Invalid graph, missing, duplicate, extra or empty required case"
  | ["batch",file] => batch file
  | ["plan",report,state,profile,contract] => relational "plan" report state profile contract none
  | ["verify",report,state,profile,contract,file] => relational "verify" report state profile contract (some file)
  | ["violate",report,state,profile,contract,file] => relational "violate" report state profile contract (some file)
  | [file] => checkFile file none
  | ["report",report,state,profile,target,file] => checkFile file (some (report,state,profile,target))
  | _ => fail "usage: time-domain TRACE.json, state-cases OBLIGATION.json, state-plan OBLIGATION.json, state-proofs OBLIGATION.json CERTIFICATES.json, plan|verify|violate REPORT STATE PROFILE CONTRACT [CERTIFICATE], batch REQUESTS.json, or legacy [report REPORT STATE PROFILE TARGET] CERTIFICATE"
