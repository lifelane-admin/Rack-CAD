#!/usr/bin/env node
/**
 * RackSlicer Offline Server (Node.js)
 * Zero external dependencies — runs directly with built-in Node.js modules.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';
const ROOT_DIR = path.join(__dirname, 'app');

const MIME_TYPES = {
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
  '.otf': 'font/otf',
  '.hdr': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Normalize request URL
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(reqUrl.pathname);

  // Security check: prevent directory traversal
  let safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain');
    res.end('403 Forbidden');
    return;
  }

  // If path is a directory, check for index.html
  if (fs.existsSync(safePath) && fs.statSync(safePath).isDirectory()) {
    safePath = path.join(safePath, 'index.html');
  }

  // SPA fallback: if file not found and has no extension, serve index.html
  if (!fs.existsSync(safePath)) {
    const ext = path.extname(pathname);
    if (!ext) {
      safePath = path.join(ROOT_DIR, 'index.html');
    }
  }

  if (!fs.existsSync(safePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`404 Not Found: ${pathname}`);
    return;
  }

  const ext = path.extname(safePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  const stream = fs.createReadStream(safePath);
  stream.on('error', (err) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`500 Internal Server Error: ${err.message}`);
  });
  stream.pipe(res);
});

// Get local network IPv4 addresses
function getLocalIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

// Open default browser
function openBrowser(url) {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  exec(`${start} ${url}`, () => {});
}

server.listen(PORT, HOST, () => {
  const localIps = getLocalIps();
  console.log('\n========================================================');
  console.log('   RackSlicer Offline Enterprise CAD Server Active');
  console.log('========================================================\n');
  console.log(` > Local Machine:     http://localhost:${PORT}`);
  console.log(` > Localhost IP:      http://127.0.0.1:${PORT}`);
  for (const ip of localIps) {
    console.log(` > LAN / WiFi IP:     http://${ip}:${PORT}`);
  }
  console.log('\n- No internet connection required.');
  console.log('- Any laptop, tablet, or phone on this network can open the LAN URL.');
  console.log('- Press Ctrl + C to stop the server.\n');

  openBrowser(`http://localhost:${PORT}`);
});
