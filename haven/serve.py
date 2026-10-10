#!/usr/bin/env python3
"""Static server for the Haven clone, with a same-origin proxy for map tiles."""
import http.server
import socketserver
import urllib.error
import urllib.request

UPSTREAM = "https://havenhk.xyz/api/map/tiles"
PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/map/tiles":
            self.proxy()
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path.split("?", 1)[0] == "/api/map/tiles":
            self.proxy(head=True)
            return
        super().do_HEAD()

    def proxy(self, head=False):
        req = urllib.request.Request(UPSTREAM, method="HEAD" if head else "GET")
        if "Range" in self.headers:
            req.add_header("Range", self.headers["Range"])
        req.add_header("User-Agent", "haven-local")
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = b"" if head else resp.read()
                self.send_response(resp.status)
                self._forward(resp.headers)
                self.end_headers()
                if data:
                    self.wfile.write(data)
        except urllib.error.HTTPError as err:
            body = b"" if head else err.read()
            self.send_response(err.code)
            self._forward(err.headers)
            self.end_headers()
            if body:
                self.wfile.write(body)

    def _forward(self, headers):
        skip = {"transfer-encoding", "connection", "content-encoding"}
        for key, value in headers.items():
            if key.lower() in skip:
                continue
            self.send_header(key, value)


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving http://127.0.0.1:{PORT}", flush=True)
        httpd.serve_forever()
