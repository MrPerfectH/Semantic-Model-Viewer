# Own synthetic acceptance asset server; avoids tiny default connection backlog.
import http.server,sys
from functools import partial
class Server(http.server.ThreadingHTTPServer):
    request_queue_size=128
Server(("127.0.0.1",int(sys.argv[1])),partial(http.server.SimpleHTTPRequestHandler,directory=sys.argv[2])).serve_forever()
