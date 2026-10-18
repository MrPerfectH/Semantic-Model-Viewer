"""Pending generic audit. Run on Linux/Windows only after T3 supplies routing.
python3 tests/pq-redesign-independent-round10-portable-audit.py --vsix /copied/artifact.vsix
No model/source-data reads; only the isolated runtime/evidence and explicit VSIX.
"""
import sys
if sys.platform=='darwin':raise SystemExit('Work-off-Mac policy: generic audit requires Linux/Windows')
import pathlib,json,hashlib,zipfile,argparse
p=argparse.ArgumentParser();p.add_argument('--vsix',required=True);a=p.parse_args();root=pathlib.Path(__file__).resolve().parents[1];out=root/'docs/verification/pq-redesign/round10-cc9ca3d';m=json.loads((out/'browser-service-provenance.json').read_text());proof=json.loads((out/'owner-package-runtime-proof.json').read_text());rows=[]
archive=pathlib.Path(a.vsix);h=hashlib.sha256(archive.read_bytes()).hexdigest();assert h==proof['archiveSHA256']
with zipfile.ZipFile(archive)as z:
 names=[n for n in z.namelist()if not n.endswith('/')];assert len(names)==45
 for n in names:assert not any(x in n.lower().split('/')for x in ['models','fixtures','tests','docs','evidence','data']),n
 for r in m['assets']:
  b=(out/'served'/r['asset']).read_bytes();sha=hashlib.sha256(b).hexdigest();blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();assert blob==r['gitBlob'];assert sha==r['ownerReportedSHA256'];assert z.read('extension/media/'+r['asset'])==b;rows.append({'asset':r['asset'],'sha256':sha,'gitBlob':blob})
 assert len(rows)==33
scripts=[]
for old,new in [('round7-auto-framing-strict','round10-auto-framing-strict'),('round8-input-ownership','round10-input-ownership'),('flow-0d964fc-arrange-undo-zoomed','round10-arrange-undo')]:
 names=['pq-redesign-independent-'+s+'.browser.cjs'for s in [old,new]];scripts.append({n:hashlib.sha256((root/'tests'/n).read_bytes()).hexdigest()for n in names})
result={'candidate':m['candidate'],'platform':sys.platform,'VSIXSHA256':h,'runtime33':rows,'originalAndAdaptedScriptHashes':scripts,'semanticAdaptationReview':'See adapter-ledger.md; no hash alone proves semantic equality'};(out/'portable-audit-executed.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
