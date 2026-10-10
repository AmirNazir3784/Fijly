#!/usr/bin/env python3
"""Local dev server for the FIJLY site.

Python's http.server ignores .htaccess, so clean URLs would 404 locally. This
mirrors the rewrite rules in site/.htaccess closely enough to click through the
site the way it behaves on Hostinger:

    /                -> index.html
    /signup          -> login.html   (served, not redirected)
    /name            -> name.html    when that file exists
    /name.html       -> 301 to /name (GET only, never for css/ js/ assets/)
    /index.html      -> 301 to /
    anything else    -> 404.html with status 404

Standard library only. Usage: python scripts/devserver.py [port]
"""

import os
import sys
import posixpath
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'site')
ROOT = os.path.abspath(ROOT)

# Requests under these keep their extensions and are never redirected.
ASSET_DIRS = ('/css/', '/js/', '/assets/')


class CleanURLHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # -- helpers --------------------------------------------------------
    def _file_for(self, path):
        """Absolute path on disk for a URL path, or None if it escapes ROOT."""
        rel = posixpath.normpath(path.lstrip('/'))
        if rel in ('.', ''):
            rel = ''
        if rel.startswith('..'):
            return None
        full = os.path.join(ROOT, rel.replace('/', os.sep))
        return full if os.path.abspath(full).startswith(ROOT) else None

    def _redirect(self, location):
        self.send_response(301)
        self.send_header('Location', location)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _serve_404(self):
        page = os.path.join(ROOT, '404.html')
        body = b''
        if os.path.isfile(page):
            with open(page, 'rb') as fh:
                body = fh.read()
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    # -- routing --------------------------------------------------------
    def send_head(self):
        parts = urlsplit(self.path)
        path = parts.path

        if not path.startswith(ASSET_DIRS):
            # /index.html and /index -> /
            if path in ('/index.html', '/index'):
                self._redirect(urlunsplit(('', '', '/', parts.query, parts.fragment)))
                return None
            # /name.html -> /name
            if path.endswith('.html'):
                self._redirect(urlunsplit(('', '', path[:-5], parts.query, parts.fragment)))
                return None

        # /signup is the create-account tab of login.html
        if path.rstrip('/') == '/signup':
            self.path = urlunsplit(('', '', '/login.html', parts.query, parts.fragment))
            return super().send_head()

        target = self._file_for(path)
        if target is None:
            self._serve_404()
            return None

        # Directories fall back to their index.html
        if path.endswith('/'):
            if os.path.isfile(os.path.join(target, 'index.html')):
                return super().send_head()
            self._serve_404()
            return None

        if os.path.isfile(target):
            return super().send_head()

        # Extensionless: serve name.html when it exists
        if os.path.isfile(target + '.html'):
            self.path = urlunsplit(('', '', path + '.html', parts.query, parts.fragment))
            return super().send_head()

        if os.path.isdir(target) and os.path.isfile(os.path.join(target, 'index.html')):
            self._redirect(path + '/')
            return None

        self._serve_404()
        return None

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


def main():
    if not os.path.isdir(ROOT):
        sys.exit('site/ not found at %s' % ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), CleanURLHandler)
    print('FIJLY dev server (clean URLs) serving %s' % ROOT)
    print('  http://localhost:%d/        home' % PORT)
    print('  http://localhost:%d/login   sign in' % PORT)
    print('  http://localhost:%d/signup  create account' % PORT)
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
        server.server_close()


if __name__ == '__main__':
    main()
