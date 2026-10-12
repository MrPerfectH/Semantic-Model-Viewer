from pathlib import Path
import hashlib,json,zipfile,urllib.request,re,subprocess
root=Path.cwd();viewer=root/'Models/tools/viewer';package=Path('/tmp/pq-round8-0.3.3.vsix')
sha=lambda b:hashlib.sha256(b).hexdigest()
files=['index.html']+[p.name for p in viewer.glob('*.css')]+['js/'+p.name for p in (viewer/'js').glob('*.js') if p.name!='host-web.js']
proof={'candidate':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'node':subprocess.check_output(['/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node','--version']).decode().strip(),'package':str(package),'sha256':sha(package.read_bytes()),'bytes':package.stat().st_size,'assets':[],'cache':[]}
with zipfile.ZipFile(package) as z:
 proof['fileCount']=len(z.namelist());proof['version']=json.loads(z.read('extension/package.json'))['version']
 for f in sorted(files):
  data=(viewer/f).read_bytes();served=urllib.request.urlopen('http://127.0.0.1:8947/Models/tools/viewer/'+f).read();bundled=z.read('extension/media/'+f);derived=(root/'vscode-extension/media'/f).read_bytes();committed=subprocess.check_output(['git','show','HEAD:Models/tools/viewer/'+f])
  assert data==served==bundled==derived==committed,f
  proof['assets'].append({'asset':f,'sha256':sha(data),'bytes':len(data),'sourceGitHttpMediaPackageEqual':True})
for f,h in re.findall(r'(?:src|href)="\./([^"?]+)\?v=([^"&]+)',(viewer/'index.html').read_text()):
 assert sha((viewer/f).read_bytes()).startswith(h),f
 proof['cache'].append({'asset':f,'hash':h,'valid':True})
Path('docs/verification/pq-round8/package-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({k:v for k,v in proof.items() if k not in ['assets','cache']},indent=2));print('assets',len(proof['assets']),'cache keys',len(proof['cache']))
