"""Build a portable standalone preview from an explicit runtime allowlist.

The recipient needs Python 3 and Node.js 22+; MSAL and self-contained XMLA
helpers are bundled. Does not include source models, credentials or test evidence.
"""
from pathlib import Path
import argparse
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ('win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64')


def build(output):
    fabric = ROOT / 'tools/fabric'
    if not (fabric / 'node_modules/@azure/msal-node/package.json').is_file():
        raise RuntimeError('Run npm ci --omit=dev --prefix tools/fabric first.')
    for target in TARGETS:
        folder = fabric / 'xmla/publish' / target
        executable = 'Smv.Fabric.Xmla.exe' if target.startswith('win32') else 'Smv.Fabric.Xmla'
        for name in (executable, 'notices/AMO-EULA.rtf', 'notices/ADOMD-EULA.rtf',
                     'notices/DOTNET-LICENSE.txt', 'notices/DOTNET-THIRD-PARTY-NOTICES.txt'):
            if not (folder / name).is_file():
                raise RuntimeError('Missing preview helper asset: ' + target + '/' + name)
    viewer = ROOT / 'Models/tools/viewer'
    files = [ROOT / 'LICENSE', fabric / 'PREVIEW.md', viewer / 'index.html',
             viewer / 'manifest.webmanifest', viewer / 'sw.js']
    files += list(viewer.glob('*.css'))
    for directory in ('js', 'icons', 'scripts'):
        files += [p for p in (viewer / directory).rglob('*') if p.is_file()
                  and '__pycache__' not in p.parts and p.suffix != '.pyc']
    files += list(fabric.glob('*.cjs'))
    for directory in ('node_modules', 'xmla/publish'):
        files += [p for p in (fabric / directory).rglob('*') if p.is_file()
                  and p.suffix != '.pdb' and '.cache' not in p.parts]
    output = Path(output).resolve()
    if output in files:
        raise RuntimeError('Output must be outside runtime inputs.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(set(files)):
            relative = 'README.md' if file == fabric / 'PREVIEW.md' else file.relative_to(ROOT).as_posix()
            archive.write(file, 'semantic-model-viewer/' + relative)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    print(build(parser.parse_args().out))
