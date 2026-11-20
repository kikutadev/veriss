#!/usr/bin/env python3
"""Bind each generated certificate to an original report; never count skipped rows."""
from pathlib import Path
import sys,json,subprocess,hashlib,time
if len(sys.argv)!=4:
    raise SystemExit("usage: replay.py CHECKER REPORT_DIRECTORY CERTIFICATE_DIRECTORY")
checker, reports, certificates = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
summary={"verified":0,"unknown":0,"skipped":0,"rows":0}
start=time.monotonic()
for manifest in sorted(certificates.glob("*-manifest.json")):
    m=json.loads(manifest.read_text())
    report=reports/m["input"]
    assert hashlib.sha256(report.read_bytes()).hexdigest()==m["sha256"],report
    for r in m["records"]:
        identity=(r["state"],r["profile"],r["target"])
        if r["status"]!="certificate-generated":
            summary["skipped" if r["status"]=="skipped" else "unknown"]+=1
            print(report.name,*identity,r["status"],r.get("reason"),flush=True)
            continue
        path=certificates/r["file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest()==r["sha256"],path
        result=subprocess.run([checker,"report",str(report),*identity,str(path)],capture_output=True,text=True,timeout=60)
        print(report.name,*identity,result.returncode,result.stdout.strip() or result.stderr.strip(),flush=True)
        assert result.returncode in (0,2),result
        summary["verified" if result.returncode==0 else "unknown"]+=1
        if result.returncode==0:summary["rows"]+=r["rows"]
summary["seconds"]=round(time.monotonic()-start,2)
print(json.dumps(summary),flush=True)
if summary["unknown"]:sys.exit(2)
