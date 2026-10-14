"""Private long-lived Rename helper. Only the native helper may hold reviewed source patches."""
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import uuid

MAX_MESSAGE_BYTES = 64 * 1024 * 1024


class RenameBridge:
    def __init__(self, command=None):
        self.command = command
        self.process = None
        self.pending = {}
        self.lock = threading.Lock()
        self.write_lock = threading.Lock()

    def _start(self):
        with self.lock:
            if self.process and self.process.poll() is None:
                return self.process
            node = shutil.which('node')
            helper = Path(__file__).resolve().parents[4] / 'tools' / 'rename' / 'bridge.cjs'
            if not self.command and (not node or not helper.is_file()):
                raise RuntimeError('Rename connection requires the packaged Node.js helper. Local model viewing remains available.')
            command = self.command or [node, str(helper)]
            proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True, encoding='utf-8', bufsize=1)
            self.process = proc
            threading.Thread(target=self._read, args=(proc,), daemon=True).start()
            return proc

    def _read(self, proc):
        try:
            while True:
                line = proc.stdout.readline(MAX_MESSAGE_BYTES + 1)
                if not line:
                    break
                if len(line.encode('utf-8')) > MAX_MESSAGE_BYTES or not line.endswith('\n'):
                    proc.kill()
                    break
                try:
                    reply = json.loads(line)
                    request_id = reply.get('id')
                    if not isinstance(request_id, str):
                        continue
                    with self.lock:
                        item = self.pending.pop(request_id, None)
                    if item and item[0] is proc:
                        item[1].put(reply)
                except (ValueError, TypeError, AttributeError):
                    proc.kill()
                    break
        finally:
            with self.lock:
                for request_id, (owner, inbox) in list(self.pending.items()):
                    if owner is proc:
                        self.pending.pop(request_id, None)
                        inbox.put({'error': 'Rename helper stopped. Reconnect and try again.'})

    def request(self, payload, timeout=330):
        proc = self._start()
        request_id = uuid.uuid4().hex
        inbox = queue.Queue(maxsize=1)
        with self.lock:
            self.pending[request_id] = (proc, inbox)
        try:
            with self.write_lock:
                proc.stdin.write(json.dumps({'id': request_id, 'payload': payload}) + '\n')
                proc.stdin.flush()
            reply = inbox.get(timeout=timeout)
            if reply.get('error'):
                raise RuntimeError(str(reply['error'])[:1000])
            if not isinstance(reply.get('result'), dict):
                raise RuntimeError('Invalid Rename helper response.')
            return reply['result']
        except queue.Empty:
            self.close()
            raise RuntimeError('Rename connection timed out. Reconnect and try again.') from None
        except (BrokenPipeError, OSError):
            raise RuntimeError('Rename helper stopped. Reconnect and try again.') from None
        finally:
            with self.lock:
                self.pending.pop(request_id, None)

    def close(self):
        with self.lock:
            proc, self.process = self.process, None
        if proc:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
            for pipe in (proc.stdin, proc.stdout):
                if pipe:
                    try:
                        pipe.close()
                    except OSError:
                        pass
