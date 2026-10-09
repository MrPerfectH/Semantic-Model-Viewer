"""Reviewed single-file TMDL saves for the local application."""
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path


class SourceEdits:
    def __init__(self):
        self.key = secrets.token_urlsafe(32)
        self.pending = {}
        self.lock = threading.Lock()

    def capture(self, directory):
        lexical = Path(directory).expanduser().absolute()
        root = lexical.resolve(strict=True)
        if not root.is_dir():
            raise ValueError('Model folder is unavailable.')
        files, identities = [], {}
        def fail(error):
            raise error
        for folder, dirs, names in os.walk(root, followlinks=False, onerror=fail):
            dirs[:] = sorted(d for d in dirs if not d.startswith(('.', '$')))
            for d in dirs:
                if (Path(folder) / d).is_symlink():
                    raise ValueError('Linked model folders cannot be edited.')
            for name in sorted(names):
                p = Path(folder) / name
                if name.startswith(('.', '$')) or p.suffix.lower() not in ('.tmdl', '.bim', '.json'):
                    continue
                st = p.lstat()
                if p.is_symlink() or not p.is_file() or st.st_nlink != 1:
                    raise ValueError('Linked model source cannot be edited.')
                raw = p.read_bytes()
                rel = p.relative_to(root).as_posix()
                files.append({'name': name, 'path': rel, 'text': raw.decode('utf-8')})
                identities[rel] = (st.st_dev, st.st_ino, raw)
        return lexical, root, files, identities

    def read(self, directory):
        return {'files': self.capture(directory)[2]}

    def prepare(self, data):
        with self.lock:
            lexical, root, files, identities = self.capture(data['dir'])
            expected = sorted((f['path'], f['text']) for f in data['files'])
            if expected != sorted((f['path'], f['text']) for f in files):
                raise ValueError('The source changed externally. Refresh and review again.')
            rel = data['path']
            parts = rel.split('/')
            if not rel or any(p in ('', '.', '..') for p in parts) or '\\' in rel or not rel.lower().endswith('.tmdl'):
                raise ValueError('Invalid TMDL source path.')
            target = root.joinpath(*parts)
            if target.parent.resolve(strict=True) != target.parent:
                raise ValueError('Linked source path cannot be edited.')
            if rel not in identities and rel != 'definition/relationships.tmdl':
                raise ValueError('Only the canonical relationship file may be created.')
            if rel not in identities and target.exists():
                raise ValueError('Relationship target already exists.')
            next_bytes = data['text'].encode('utf-8')
            now = time.monotonic()
            self.pending = {t: e for t, e in self.pending.items() if now - e['at'] < 900}
            if len(self.pending) >= 128:
                raise ValueError('Too many pending reviews. Reopen the app.')
            token = secrets.token_urlsafe(32)
            self.pending[token] = dict(lexical=lexical, root=root, identities=identities, path=rel,
                                       text=next_bytes, at=now)
            return {'token': token}

    def cancel(self, token):
        with self.lock:
            self.pending.pop(token, None)
        return {'cancelled': True}

    def save(self, token):
        with self.lock:
            edit = self.pending.pop(token, None)
            if not edit or time.monotonic() - edit['at'] >= 900:
                raise ValueError('The edit is stale. Review it again.')
            def check():
                _, root, _, identities = self.capture(edit['lexical'])
                if root != edit['root'] or identities != edit['identities']:
                    raise ValueError('The source changed externally. Refresh and review again.')
                target = root / edit['path']
                if target.parent.resolve(strict=True) != target.parent:
                    raise ValueError('Linked source path cannot be edited.')
                return target
            target = check()
            fd, temporary = tempfile.mkstemp(prefix='.smv-edit-', dir=target.parent)
            committed = False
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(edit['text'])
                    stream.flush()
                    os.fsync(stream.fileno())
                if edit['path'] in edit['identities']:
                    os.chmod(temporary, target.stat().st_mode & 0o777)
                check()
                if edit['path'] in edit['identities']:
                    os.replace(temporary, target)
                else:
                    os.link(temporary, target)  # exclusive first-file creation
                committed = True
                return {'saved': True}
            finally:
                if os.path.exists(temporary):
                    try:
                        os.unlink(temporary)
                    except OSError:
                        if not committed:
                            raise
