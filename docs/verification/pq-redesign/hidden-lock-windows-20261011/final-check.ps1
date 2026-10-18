$ErrorActionPreference='Stop'
$t='C:\Users\PrzemekHarazny\pq-r10-windows'
Set-Location ($t+'\worktree')
$env:PATH=$t+'\node-v22.23.3-win-x64;'+$env:PATH
@'
import pathlib,subprocess,json
root=pathlib.Path.cwd(); changed=[]
for builder in ['build.cjs','filters-v2/build.cjs']:
 script="console.log(JSON.stringify(Object.keys(require('./tests/acceptance-fixtures/pq-redesign/"+builder+"').artifacts())))"
 names=json.loads(subprocess.check_output(['node','-e',script],text=True))
 folder=pathlib.Path('tests/acceptance-fixtures/pq-redesign')/pathlib.Path(builder).parent
 for name in names:
  p=folder/name;b=subprocess.check_output(['git','show','HEAD:'+p.as_posix()]);old=p.read_bytes()
  if old!=b:
   assert old.replace(b'\r\n',b'\n')==b.replace(b'\r\n',b'\n'),str(p)
   p.write_bytes(b);changed.append(str(p))
print(json.dumps({'checkoutOnlyGitByteRestores':changed},indent=2))
'@ | python - > ($t+'\repair-logs\fixture-git-byte-restore.log')
if($LASTEXITCODE -ne 0){throw 'fixture restore failed'}
cmd.exe /c 'npm.cmd test --prefix vscode-extension' > ($t+'\repair-logs\full-suite-02.log') 2>&1
$status=$LASTEXITCODE
[IO.File]::WriteAllText(($t+'\repair-logs\full-suite-02.status'),[string]$status)
# A historical round9 test writes its receipt. Preserve the new output externally, then restore HEAD bytes.
@'
import pathlib,subprocess
p=pathlib.Path('docs/verification/pq-redesign/round9-963638a/analysis-graph.json')
if p.exists():
 b=subprocess.check_output(['git','show','HEAD:'+p.as_posix()])
 if p.read_bytes()!=b:
  pathlib.Path(r'C:\Users\PrzemekHarazny\pq-r10-windows\repair-logs\round9-full-suite-02-output.json').write_bytes(p.read_bytes());p.write_bytes(b)
'@ | python -
git diff --stat > ($t+'\repair-logs\final-check-diff.txt')
