#!/usr/bin/env python3
"""Local app server for Semantic Model Viewer.

Serves the viewer page and reads model folders on its behalf, so the browser never has
to ask for folder permission. Python 3 standard library only.

    python3 serve.py                 # http://localhost:8931, prints the URL
    python3 serve.py --open          # ...and opens it in the default browser
    python3 serve.py --idle-exit 180 # stop when the page has been closed for 3 minutes

Safety: listens on 127.0.0.1 only, is read-only (GET, no writes), serves only .tmdl/.bim/.json
model files, and refuses requests coming from other websites open in the browser.
"""
import argparse
import json
import os
import string
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1"
VIEWER_DIR = Path(__file__).resolve().parent.parent
MODEL_SUFFIX = ".semanticmodel"
MODEL_FILE_EXT = {".tmdl", ".bim", ".json"}
SKIP_DIRS = {"node_modules"}
MAX_DEPTH = 6


def _hidden(name):
    return name.startswith(".") or name.startswith("$")


def _is_model_dir(name):
    return name.lower().endswith(MODEL_SUFFIX)


def _folder(path):
    p = Path(path).expanduser() if path else Path.home()
    p = p.resolve()
    if not p.is_dir():
        raise FileNotFoundError("Not a folder: %s" % p)
    return p


def roots():
    out = [{"name": "Home", "path": str(Path.home())}]
    if os.name == "nt":
        for letter in string.ascii_uppercase:
            drive = letter + ":\\"
            if os.path.exists(drive):
                out.append({"name": drive, "path": drive})
    else:
        out.append({"name": "/", "path": "/"})
        for extra in ("/Volumes", "/mnt", "/media"):
            if os.path.isdir(extra):
                out.append({"name": extra, "path": extra})
    return out


def browse(path):
    p = _folder(path)
    dirs = []
    with os.scandir(p) as it:
        for e in it:
            if _hidden(e.name):
                continue
            try:
                if not e.is_dir():
                    continue
            except OSError:
                continue
            dirs.append({"name": e.name, "path": str(p / e.name), "model": _is_model_dir(e.name)})
    dirs.sort(key=lambda d: (not d["model"], d["name"].lower()))
    parent = str(p.parent) if p.parent != p else None
    return {"path": str(p), "name": p.name or str(p), "parent": parent,
            "model": _is_model_dir(p.name), "dirs": dirs, "roots": roots()}


def find_models(path):
    """Every *.SemanticModel folder under `path` (or `path` itself). `path` in each result is
    relative to the chosen folder with '/' separators, matching the browser-side scan, so a
    model keeps the same id however the repo was connected."""
    root = _folder(path)
    found = []
    if _is_model_dir(root.name):
        return [{"name": root.name[:-len(MODEL_SUFFIX)], "path": root.name, "dir": str(root)}]

    def walk(d, rel, depth):
        if depth > MAX_DEPTH:
            return
        try:
            entries = sorted(os.scandir(d), key=lambda e: e.name.lower())
        except OSError:
            return
        for e in entries:
            if _hidden(e.name) or e.name in SKIP_DIRS:
                continue
            try:
                if not e.is_dir():
                    continue
            except OSError:
                continue
            if _is_model_dir(e.name):
                found.append({"name": e.name[:-len(MODEL_SUFFIX)], "path": rel + e.name, "dir": str(d / e.name)})
            else:
                walk(d / e.name, rel + e.name + "/", depth + 1)

    walk(root, "", 0)
    return found


def read_model(path):
    root = _folder(path)
    files = []

    def walk(d, rel):
        try:
            entries = sorted(os.scandir(d), key=lambda e: e.name.lower())
        except OSError:
            return
        for e in entries:
            if _hidden(e.name):
                continue
            try:
                if e.is_dir():
                    walk(d / e.name, rel + e.name + "/")
                    continue
                if not e.is_file():
                    continue
            except OSError:
                continue
            if os.path.splitext(e.name)[1].lower() in MODEL_FILE_EXT:
                text = (d / e.name).read_text(encoding="utf-8-sig", errors="replace")
                files.append({"name": e.name, "path": rel + e.name, "text": text})

    walk(root, "")
    return files


class Handler(SimpleHTTPRequestHandler):
    server_version = "SemanticModelViewer/" + VERSION
    quiet = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(VIEWER_DIR), **kwargs)

    def log_message(self, fmt, *args):
        if not self.quiet:
            super().log_message(fmt, *args)

    def do_GET(self):
        self.server.touch()
        url = urllib.parse.urlsplit(self.path)
        if url.path.startswith("/api/"):
            self.api(url)
        else:
            super().do_GET()

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # Only the viewer page itself may call the API. A page from another site that tries to
    # read local folders through this server sends an Origin / Sec-Fetch-Site header that
    # does not match, and is refused.
    def same_origin(self):
        origin = self.headers.get("Origin")
        if origin and origin != "http://" + self.headers.get("Host", ""):
            return False
        site = self.headers.get("Sec-Fetch-Site")
        return site in (None, "same-origin", "none")

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api(self, url):
        if not self.same_origin():
            self.send_json(403, {"error": "Only the viewer page may use this server."})
            return
        q = dict(urllib.parse.parse_qsl(url.query))
        try:
            if url.path == "/api/ping":
                data = {"ok": True, "version": VERSION, "home": str(Path.home()), "sep": os.sep, "viewer": str(VIEWER_DIR)}
            elif url.path == "/api/browse":
                data = browse(q.get("path", ""))
            elif url.path == "/api/find":
                data = {"models": find_models(q.get("path", ""))}
            elif url.path == "/api/model":
                data = {"files": read_model(q.get("path", ""))}
            else:
                self.send_json(404, {"error": "Unknown request."})
                return
        except (FileNotFoundError, NotADirectoryError, PermissionError, OSError) as e:
            self.send_json(400, {"error": str(e)})
            return
        self.send_json(200, data)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # Windows lets a second process share a port with SO_REUSEADDR, so only enable it elsewhere.
    # Without it macOS refuses to bind for ~1 minute after the app closes (TIME_WAIT).
    allow_reuse_address = os.name != "nt"

    def __init__(self, address, idle_exit):
        super().__init__(address, Handler)
        self.idle_exit = idle_exit
        self.last = time.time()

    def touch(self):
        self.last = time.time()

    def watch_idle(self):
        # The page pings every 30 s while open; once it has been closed for idle_exit seconds
        # there is nothing left to serve, so stop rather than linger in the background.
        while True:
            time.sleep(5)
            if time.time() - self.last > self.idle_exit:
                print("No viewer window for %d s - stopping." % self.idle_exit, flush=True)
                threading.Thread(target=self.shutdown, daemon=True).start()
                return


def ping(host, port):
    try:
        with urllib.request.urlopen("http://%s:%d/api/ping" % (host, port), timeout=1) as r:
            data = json.loads(r.read().decode("utf-8"))
            return bool(data.get("ok")), data.get("viewer")
    except Exception:
        return False, None


def main(argv=None):
    ap = argparse.ArgumentParser(description="Local app server for Semantic Model Viewer.")
    ap.add_argument("--port", type=int, default=8931, help="port on 127.0.0.1 (default 8931; 0 = any free port)")
    ap.add_argument("--open", action="store_true", help="open the viewer in the default browser")
    ap.add_argument("--idle-exit", type=int, default=0, metavar="SECONDS",
                    help="stop after the viewer window has been closed for this long (0 = run until stopped)")
    ap.add_argument("--verbose", action="store_true", help="log every request")
    args = ap.parse_args(argv)
    host = "127.0.0.1"
    Handler.quiet = not args.verbose

    try:
        server = Server((host, args.port), args.idle_exit)
    except OSError as e:
        ok, viewer = ping(host, args.port)
        if ok and viewer == str(VIEWER_DIR):
            url = "http://localhost:%d" % args.port
            print("Already running: %s" % url, flush=True)
            if args.open:
                webbrowser.open(url, new=1)
            return 0
        print("Port %d is in use by %s. Stop it or choose another port with --port." %
              (args.port, "another viewer checkout" if ok else "another program"), file=sys.stderr)
        print(str(e), file=sys.stderr)
        return 1

    port = server.server_address[1]
    url = "http://localhost:%d" % port
    print("Semantic Model Viewer: %s  (viewer files: %s)" % (url, VIEWER_DIR), flush=True)
    if args.idle_exit:
        threading.Thread(target=server.watch_idle, daemon=True).start()
    if args.open:
        threading.Timer(0.3, webbrowser.open, (url, 1)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
