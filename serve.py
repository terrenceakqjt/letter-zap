"""Local dev server for Letter Zap!  Run:  python3 serve.py  then open http://localhost:8000

Same as `python3 -m http.server`, but tells the browser not to cache files,
so a normal refresh always picks up the latest HTML/CSS/JS.
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Letter Zap! running at http://localhost:{PORT}  (Ctrl+C to stop)")
http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
