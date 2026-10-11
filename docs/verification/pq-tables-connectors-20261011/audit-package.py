#!/usr/bin/env python3
"""Audit runtime bytes without reading model/data files.
Usage: python3 docs/verification/pq-tables-connectors-20261011/audit-package.py VSIX [GIT_REV]
GIT_REV defaults to HEAD; before committing, pass --index for staged content.
"""
import hashlib, json, re, subprocess, sys, zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[3]
viewer = root / 'Models/tools/viewer'
media = root / 'vscode-extension/media'
package = Path(sys.argv[1]).resolve()
revision = sys.argv[2] if len(sys.argv) > 2 else 'HEAD'
def sha(data): return hashlib.sha256(data).hexdigest()
def git_bytes(name):
    spec = ':' + name if revision == '--index' else revision + ':' + name
    return subprocess.check_output(['git', 'show', spec], cwd=root)
files = sorted(['index.html'] + [p.name for p in viewer.glob('*.css')] + ['js/' + p.name for p in (viewer/'js').glob('*.js') if p.name != 'host-web.js'])
assert files == sorted(str(p.relative_to(media)) for p in media.rglob('*') if p.is_file())
rows = []
with zipfile.ZipFile(package) as archive:
    entries = sorted(archive.namelist())
    assert len(entries) == len(set(entries)), 'duplicate ZIP entries'
    runtime_entries = sorted(n.removeprefix('extension/media/') for n in entries if n.startswith('extension/media/'))
    assert runtime_entries == files
    for name in entries:
        assert not name.startswith('/') and '..' not in Path(name).parts
        assert (name in ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/readme.md', 'extension/changelog.md', 'extension/LICENSE'] or name.startswith(('extension/media/', 'extension/src/', 'extension/images/'))), name
        assert not re.search(r'(^|/)(tests?|docs|fixtures?|evidence|models|node_modules)(/|$)|\.(tmdl|bim|pbix|pbip|vsix)$|model-data\.json|report-usage\.json', name, re.I), name
    for name in files:
        data = (viewer/name).read_bytes()
        assert data == (media/name).read_bytes() == archive.read('extension/media/'+name) == git_bytes('Models/tools/viewer/'+name), name
        rows.append({'asset':name,'sha256':sha(data),'bytes':len(data)})
    # All non-generated packaged runtime/support files also match their tracked bytes.
    for name in entries:
        if name.startswith('extension/') and not name.startswith('extension/media/'):
            source = 'vscode-extension/' + {'extension/readme.md':'README.md','extension/changelog.md':'CHANGELOG.md'}.get(name, name.removeprefix('extension/'))
            assert archive.read(name) == git_bytes(source), source
html = (viewer/'index.html').read_text()
keys = []
for name, key in re.findall(r'(?:src|href)="\./([^?"#]+)\?v=([^"#]+)', html):
    assert sha((viewer/name).read_bytes()).startswith(key), name
    keys.append({'asset':name,'key':key})
assert html.index('js/canvas.js') < html.index('js/power-query-canvas.js')
assert subprocess.check_output(['git','show','7ba3abe52ad8fa6dedd35de2ee798971d4b4a471:docs/verification/pq-redesign/round9-963638a/independent-analysis-graph.json'],cwd=root) == (root/'docs/verification/pq-redesign/round9-963638a/independent-analysis-graph.json').read_bytes()
print(json.dumps({'boundary':'Static canonical/media/Git/ZIP/cache/exclusion audit; not browser acceptance','gitRevision':revision,'package':str(package),'packageSHA256':sha(package.read_bytes()),'packageBytes':package.stat().st_size,'zipEntries':len(entries),'runtimeManifestSHA256':sha(''.join(r['asset']+'\0'+r['sha256']+'\n' for r in rows).encode()),'runtimeAssets':rows,'cacheKeys':keys,'round9OriginalRestored':True,'excluded':'Tests, docs, evidence, fixtures, source models, report data, node_modules','entries':entries},indent=2))
