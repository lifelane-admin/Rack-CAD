#!/usr/bin/env python3
"""
RackSlicer Offline Server (Python 3)
Zero external dependencies — runs directly with Python's standard library.
"""

import os
import sys
import socket
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get('PORT', 8080))
ROOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.hdr': 'application/octet-stream',
    '.wasm': 'application/wasm',
}

class RackSlicerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        return super().guess_type(path)

    def do_GET(self):
        # Resolve requested file path
        clean_path = self.path.split('?')[0].split('#')[0].lstrip('/')
        local_path = os.path.join(ROOT_DIR, clean_path)

        # If it's a directory, look for index.html
        if os.path.isdir(local_path):
            local_path = os.path.join(local_path, 'index.html')

        # SPA fallback: if file doesn't exist and has no extension, serve index.html
        if not os.path.exists(local_path):
            ext = os.path.splitext(clean_path)[1]
            if not ext:
                self.path = '/index.html'

        return super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def main():
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, RackSlicerHandler)
    lan_ip = get_lan_ip()

    print('\n========================================================')
    print('   RackSlicer Offline Enterprise CAD Server Active')
    print('========================================================\n')
    print(f' > Local Machine:     http://localhost:{PORT}')
    print(f' > Localhost IP:      http://127.0.0.1:{PORT}')
    if lan_ip != '127.0.0.1':
        print(f' > LAN / WiFi IP:     http://{lan_ip}:{PORT}')
    print('\n- No internet connection required.')
    print('- Any laptop, tablet, or phone on this network can open the LAN URL.')
    print('- Press Ctrl + C to stop the server.\n')

    webbrowser.open(f'http://localhost:{PORT}')

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down RackSlicer server.')
        httpd.server_close()

if __name__ == '__main__':
    main()
