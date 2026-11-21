#!/usr/bin/env python3
"""Bind each generated certificate to an original report; never count skipped rows."""
from pathlib import Path
import sys,json,subprocess,hashlib,time
if len(sys.argv)!=4:
    raise SystemExit("usage: replay.py CHECKER REPORT_DIRECTORY CERTIFICATE_DIRECTORY")
checker, reports, certificates = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
summary={"verified":0,"unknown":0,"skipped":0,"rows":0,"emptyReports":0}
start=time.monotonic()
def unknown(message):
    print("Unknown: "+message, file=sys.stderr)
    raise SystemExit(2)
manifests=sorted(certificates.glob("*-manifest.json"))
if not manifests:
    unknown("missing manifests")
for manifest in manifests:
    m=json.loads(manifest.read_text())
    report=reports/m["input"]
    raw=report.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=m["sha256"]:
        unknown("report digest mismatch")
    original=json.JSONDecoder().raw_decode(raw.decode())[0]["evidence"]
    identity=lambda e:(e["state"],e["profile"],e["target"])
    expected=sorted(map(identity,original))
    supplied=sorted(map(identity,m["records"]))
    if expected!=supplied or len(expected)!=len(set(expected)):
        unknown("incomplete or ambiguous manifest")
    if not expected:summary["emptyReports"]+=1
    for r in m["records"]:
        entry=(r["state"],r["profile"],r["target"])
        if r["status"]!="certificate-generated":
            summary["skipped" if r["status"]=="skipped" else "unknown"]+=1
            print(report.name,*entry,r["status"],r.get("reason"),flush=True)
            continue
        path=certificates/r["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest()!=r["sha256"]:
            unknown("certificate digest mismatch")
        result=subprocess.run([checker,"report",str(report),*entry,str(path)],capture_output=True,text=True,timeout=60)
        print(report.name,*entry,result.returncode,result.stdout.strip() or result.stderr.strip(),flush=True)
        if result.returncode not in (0,2):unknown("checker failed")
        summary["verified" if result.returncode==0 else "unknown"]+=1
        if result.returncode==0:summary["rows"]+=r["rows"]
summary["seconds"]=round(time.monotonic()-start,2)
print(json.dumps(summary),flush=True)
if summary["unknown"] or summary["skipped"] or summary["emptyReports"] or not summary["verified"]:sys.exit(2)
