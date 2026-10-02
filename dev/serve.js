#!/usr/bin/env node
/* Zero-dependency static server for dist/dev.html, so localStorage behaves
 * like a real origin (file:// URLs are flaky for storage APIs in some
 * browsers). Opens the browser automatically. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = req.url === '/' ? '/dev.html' : req.url.split('?')[0];
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT + '/dev.html';
  console.log('Proverload dev server running at ' + url);
  console.log('(data is stored in this browser\'s localStorage — separate from your phone)');
  console.log('Ctrl-C to stop.\n');
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(opener + ' ' + url, () => {});
});
