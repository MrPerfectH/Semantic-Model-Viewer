#!/usr/bin/env python3
"""Refresh documentation in an existing public pre-release without changing runtime files."""
import gzip
import io
import json
from pathlib import Path
import re
import sys
import urllib.request
from zipfile import ZipFile
import xml.etree.ElementTree as ET

base, target = sys.argv[1:]
assert re.fullmatch(r"0\.5\.\d+", base) and re.fullmatch(r"0\.5\.\d+", target)
assert int(target.split(".")[-1]) > int(base.split(".")[-1])
url = f"https://marketplace.visualstudio.com/_apis/public/gallery/publishers/MrPerfectH/vsextensions/semantic-model-viewer/{base}/vspackage"
with urllib.request.urlopen(url, timeout=60) as response:
    data = response.read()
if data[:2] == b"\x1f\x8b":
    data = gzip.decompress(data)
with ZipFile(io.BytesIO(data)) as source:
    files = {name: source.read(name) for name in source.namelist()}
package = json.loads(files["extension/package.json"])
assert package["version"] == base
assert package["publisher"].lower() == "mrperfecth"
assert package["name"] == "semantic-model-viewer"
package["version"] = target
manifest = ET.fromstring(files["extension.vsixmanifest"])
ns = {"v": "http://schemas.microsoft.com/developer/vsx-schema/2011"}
identity = manifest.find("v:Metadata/v:Identity", ns)
assert identity is not None and identity.attrib["Version"] == base
assert any(p.attrib.get("Id") == "Microsoft.VisualStudio.Code.PreRelease" and p.attrib.get("Value") == "true" for p in manifest.findall(".//v:Property", ns))
identity.set("Version", target)
ET.register_namespace("", ns["v"])
readme_name = next(n for n in files if n.lower() == "extension/readme.md")
changelog_name = next(n for n in files if n.lower() == "extension/changelog.md")
readme = Path("vscode-extension/README.md").read_bytes()
assert readme.count(b".gif)") == 6 and readme.count(b".mp4)") == 3
changes = {
    "extension/package.json": (json.dumps(package, ensure_ascii=False, indent=2) + "\n").encode(),
    "extension.vsixmanifest": ET.tostring(manifest, encoding="utf-8", xml_declaration=True),
    readme_name: readme,
    changelog_name: (f"# {target}\n\nDocumentation only: add workflow GIFs, video links, and the illustrated guide. Runtime is identical to pre-release {base}.\n\n").encode() + files[changelog_name],
}
output = Path(f"semantic-model-viewer-{target}.vsix")
with ZipFile(io.BytesIO(data)) as source, ZipFile(output, "w") as dest:
    for info in source.infolist():
        dest.writestr(info, changes.get(info.filename, files[info.filename]))
with ZipFile(output) as result:
    assert set(result.namelist()) == set(files)
    for name, original in files.items():
        if name not in changes:
            assert result.read(name) == original, name
print(f"Prepared {output}; all {len(files) - len(changes)} non-documentation/version entries byte-identical to public {base}.")
