"""Smoke-test the actual standalone archive without Microsoft credentials."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import signal
import subprocess
import sys
import tempfile
import urllib.request
import zipfile


def verify(filename):
    host = {'Linux': 'linux', 'Darwin': 'darwin', 'Windows': 'win32'}[platform.system()]
    arch = 'arm64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x64'
    target = host + '-' + arch
    with tempfile.TemporaryDirectory(prefix='smv-portable-') as directory:
        with zipfile.ZipFile(filename) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise RuntimeError('Duplicate archive paths.')
            for name in names:
                path = PurePosixPath(name)
                if path.is_absolute() or '..' in path.parts or path.parts[0] != 'semantic-model-viewer':
                    raise RuntimeError('Unsafe archive path.')
                if path.name in ('model.bim', 'model-data.json', 'report-usage.json'):
                    raise RuntimeError('Unexpected model payload in standalone archive.')
                # Extract the viewer, JS dependencies and this host's native helper.
                if '/xmla/publish/' in name and '/xmla/publish/' + target + '/' not in name:
                    continue
                archive.extract(name, directory)
        root = Path(directory) / 'semantic-model-viewer'
        helper = root / 'tools/fabric/xmla/publish' / target / ('Smv.Fabric.Xmla.exe' if host == 'win32' else 'Smv.Fabric.Xmla')
        if host != 'win32':
            helper.chmod(helper.stat().st_mode | 0o111)
        native = subprocess.run([str(helper)], input='{"accessToken":"synthetic-secret","workspaceId":"invalid"}',
                                text=True, capture_output=True, timeout=15)
        assert native.returncode == 1 and 'synthetic-secret' not in native.stdout
        assert json.loads(native.stdout)['error']['code'] == 'XmlaUnavailable'
        server = subprocess.Popen([sys.executable, str(root / 'Models/tools/viewer/scripts/serve.py'), '--port', '0'],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            line = server.stdout.readline()
            match = re.search(r'http://localhost:\d+', line)
            if not match:
                raise RuntimeError('Packaged server did not start.')
            base = match.group()
            with urllib.request.urlopen(base + '/api/ping', timeout=10) as response:
                ping = json.load(response)
            for route in ('/', '/js/fabric.js', '/manifest.webmanifest'):
                with urllib.request.urlopen(base + route, timeout=10) as response:
                    assert response.status == 200
            request = urllib.request.Request(base + '/api/fabric', data=b'{"action":"status"}',
                                             headers={'Content-Type': 'application/json', 'X-SMV-Fabric-Session': ping['fabricSession']})
            with urllib.request.urlopen(request, timeout=15) as response:
                status = json.load(response)
            assert status['available'] and not status['account']
            return {'platform': target, 'nativeHelper': True, 'serverAssets': True, 'bundledMsal': True,
                    'signedOut': True, 'sourceModelsPackaged': False}
        finally:
            server.send_signal(signal.SIGINT) if os.name != 'nt' else server.terminate()
            server.communicate(timeout=10)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    print(json.dumps(verify(parser.parse_args().archive)))
