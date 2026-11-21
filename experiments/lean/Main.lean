import VerissLeanStateProof
import VerissLeanTime
import VerissLeanCSS
import VerissLeanComposition
import VerissLeanFinite
import VerissLeanMotion
import VerissLeanCascade
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

def cssInput (style report state profile target : String) : IO (Except String (CSS.AnchoredStyle × Relation.Problem)) := do
  let a ← readJson style
  let b ← readJson report
  return do
    let s ← a >>= CSS.readStyle
    let p ← b >>= fun raw => CSS.sourceProblem raw state profile target
    return (s,p)

def fragmentInput (source report state profile : String) : IO (Except String (CSS.SourceFragment × Relation.Problem)) := do
  let a ← readJson source
  let b ← readJson report
  return do
    let s ← a >>= CSS.readFragment
    let p ← b >>= fun raw => CSS.sourceProblem raw state profile s.target
    return (s,p)

def cascadeInput (source report state profile : String) : IO (Except String (Cascade.Source × Relation.Problem)) := do
  let a ← readJson source
  let b ← readJson report
  return do
    let s ← a >>= Cascade.readSource
    let p ← b >>= fun raw => CSS.sourceProblem raw state profile s.target
    return (s,p)

def main (args : List String) : IO UInt32 := do
  match args with
  | ["cascade-plan",source,report,state,profile] =>
    match ← cascadeInput source report state profile with
    | .error msg => fail msg
    | .ok (s,p) =>
      IO.println (s.plan p).compress
      return 0
  | ["cascade-check",source,report,state,profile,cert] =>
    match (← cascadeInput source report state profile),
      ((← readJson cert) >>= fromJson? (α := Cascade.Certificate)) with
    | .ok (s,p), .ok c =>
      if s.check p c then
        IO.println "Verified: canonical CSS cascade fragment and piecewise formal geometry"
        return 0
      else fail "Invalid cascade certificate or geometry mismatch"
    | .error msg, _ | _, .error msg => fail msg
  | ["motion-plan",file] =>
    match (← readJson file) >>= Motion.readRequest >>= Motion.Request.model with
    | .error msg => fail msg
    | .ok m =>
      IO.println m.plan.compress
      return 0
  | ["motion-check",file,cert] =>
    match ((← readJson file) >>= Motion.readRequest >>= Motion.Request.model),
      ((← readJson cert) >>= fromJson? (α := Motion.Certificate)) with
    | .ok m, .ok c =>
      if m.check c then
        IO.println "Verified: viewport fit for the declared shared-progress motion model"
        return 0
      else fail "Invalid motion or endpoint certificate"
    | .error msg, _ | _, .error msg => fail msg
  | ["finite-check",file] =>
    match (← readJson file) >>= Finite.readInput with
    | .error msg => fail msg
    | .ok i =>
      if i.check then
        IO.println "Verified: declared finite dispatch machine refines state graph (not JS source)"
        return 0
      else fail "Invalid finite machine, render mapping or transitions"
  | ["composition-plan",file] =>
    match (← readJson file) >>= fromJson? (α := Composition.CompositionInput) with
    | .error msg => fail msg
    | .ok i =>
      if !i.valid then return ← fail "Unsupported composition shape"
      IO.println i.plan.compress
      return 0
  | ["composition-check",file,cert] =>
    match ((← readJson file) >>= fromJson? (α := Composition.CompositionInput)),
      ((← readJson cert) >>= fromJson? (α := Composition.CompositionCertificate)) with
    | .ok i, .ok c =>
      if i.check c then
        IO.println "Verified: normalized one-rectangle affine composition (not CSS source)"
        return 0
      else fail "Invalid composition certificate or geometry correspondence"
    | .error msg, _ | _, .error msg => fail msg
  | ["css-source-plan",source,report,state,profile] =>
    match ← fragmentInput source report state profile with
    | .error msg => fail msg
    | .ok (s,p) =>
      IO.println (CSS.extractionPlan s.style p).compress
      return 0
  | ["css-source-check",source,report,state,profile,cert] =>
    match (← fragmentInput source report state profile),
      ((← readJson cert) >>= fromJson? (α := CSS.ExtractionCertificate)) with
    | .ok (s,p), .ok c =>
      if s.check p c then
        IO.println "Verified: canonical HTML/CSS fragment and its exact formal geometry"
        return 0
      else fail "Invalid source extraction certificate"
    | .error msg, _ | _, .error msg => fail msg
  | ["css-plan",style,report,state,profile,target] =>
    match ← cssInput style report state profile target with
    | .error msg => fail msg
    | .ok (s,p) =>
      IO.println (CSS.extractionPlan s p).compress
      return 0
  | ["css-check",style,report,state,profile,target,cert] =>
    match (← cssInput style report state profile target),
      ((← readJson cert) >>= fromJson? (α := CSS.ExtractionCertificate)) with
    | .ok (s,p), .ok c =>
      if s.check p c then
        IO.println "Verified: declared viewport-anchored computed style matches evidence (not raw CSS)"
        return 0
      else fail "Invalid extraction certificate or mismatched geometry"
    | .error msg, _ | _, .error msg => fail msg
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
  | _ => fail "usage: cascade-plan|cascade-check SOURCE REPORT STATE PROFILE [CERTIFICATE], css-source-plan|css-source-check SOURCE REPORT STATE PROFILE [CERTIFICATE], motion-plan|motion-check INPUT [CERTIFICATE], finite-check INPUT, composition-plan|composition-check INPUT [CERTIFICATE], css-plan|css-check STYLE REPORT STATE PROFILE TARGET [CERTIFICATE], time-domain TRACE.json, state-cases OBLIGATION.json, state-plan OBLIGATION.json, state-proofs OBLIGATION.json CERTIFICATES.json, plan|verify|violate REPORT STATE PROFILE CONTRACT [CERTIFICATE], batch REQUESTS.json, or legacy [report REPORT STATE PROFILE TARGET] CERTIFICATE"
