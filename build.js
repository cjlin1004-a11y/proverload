#!/usr/bin/env node
/* Bundles src/ into:
 *   dist/Proverload.js  — single file to paste into Scriptable (app + widget)
 *   dist/dev.html        — same UI running against a localStorage shim, for
 *                          testing in a desktop browser (see `npm run dev`)
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const inject = (src, token, value) => {
  if (!src.includes(token)) throw new Error('missing placeholder: ' + token);
  return src.split(token).join(value);
};

const core = read('src/core.js');
const css = read('src/ui/styles.css');
const ui = read('src/ui/ui.js');
const devBridge = read('src/ui/dev-bridge.js');

let html = read('src/ui/index.html');
html = inject(html, '/*__CSS__*/', css);
html = inject(html, '/*__CORE__*/', core);
html = inject(html, '/*__UI__*/', ui);

let app = read('src/app.js');
app = inject(app, '//__CORE__', core);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const outApp = path.join(root, 'dist', 'Proverload.js');
fs.writeFileSync(outApp, app);
console.log('built dist/Proverload.js  (' + (fs.statSync(outApp).size / 1024).toFixed(1) + ' KB)');

const devHtml = html.replace('</body>', '<script>' + devBridge + '</script>\n</body>');
const outDev = path.join(root, 'dist', 'dev.html');
fs.writeFileSync(outDev, devHtml);
console.log('built dist/dev.html      (' + (fs.statSync(outDev).size / 1024).toFixed(1) + ' KB)');
