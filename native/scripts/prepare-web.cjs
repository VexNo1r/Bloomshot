'use strict';
// Builds ./www (the native app's web content) from the authoritative game in ../bloomshot.
// The file list comes from the game's own sw.js ASSETS, so a new game file ships once it is listed there.
// Browser-only files are dropped and index.html is stripped of the install UI. If the HTML no longer
// matches what is expected, this script fails instead of silently shipping broken install controls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
// The game lives either at the repo root (native/ inside it) or in a sibling ../bloomshot folder.
const source = [path.resolve(root, '..'), path.resolve(root, '../bloomshot')].find(dir => fs.existsSync(path.join(dir, 'sw.js')) && fs.existsSync(path.join(dir, 'engine.js')));
if (!source) throw new Error('Could not find the game (sw.js and engine.js) next to or above this folder');
const www = path.join(root, 'www');
const EXCLUDED = ['sw.js', 'pwa.js', 'manifest.webmanifest'];
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

function assetList() {
  const sw = fs.readFileSync(path.join(source, 'sw.js'), 'utf8');
  const match = sw.match(/const ASSETS = \[([^\]]+)\]/);
  if (!match) throw new Error('Could not find the ASSETS list in sw.js');
  const files = [...match[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(f => f && f !== 'index.html');
  return ['index.html', ...files].filter(f => !EXCLUDED.includes(f));
}

function nativeHtml(html) {
  let out = html;
  const steps = [
    [/[ \t]*<link rel="manifest"[^>]*>\r?\n/, 'manifest link'],
    [/[ \t]*<script src="pwa\.js" defer><\/script>\r?\n/, 'pwa.js script'],
    [/[ \t]*<section class="install-section" aria-labelledby="install-title">[\s\S]*?<\/section>\r?\n/, 'install section'],
  ];
  for (const [pattern, label] of steps) {
    if (!pattern.test(out)) throw new Error(`index.html no longer contains the ${label}; update scripts/prepare-web.cjs`);
    out = out.replace(pattern, '');
  }
  if (/pwa-status|install-btn|update-app-btn|offline-note|install-help/.test(out)) throw new Error('index.html still references browser installation UI');
  return out;
}

fs.rmSync(www, { recursive: true, force: true });
const files = assetList();
const inventory = [];
for (const file of files) {
  const from = path.join(source, file);
  if (!fs.existsSync(from)) throw new Error(`Listed in sw.js ASSETS but missing: ${file}`);
  const original = fs.readFileSync(from);
  const body = file === 'index.html' ? Buffer.from(nativeHtml(original.toString('utf8'))) : original;
  const to = path.join(www, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, body);
  inventory.push({ file, sourceSha256: sha(original), nativeSha256: sha(body), bytes: body.length });
}
fs.writeFileSync(path.join(root, 'web-inventory.json'), JSON.stringify({ source: path.relative(root, source).split(path.sep).join('/'), allowlist: 'sw.js ASSETS', excluded: EXCLUDED, files: inventory }, null, 2) + '\n');
console.log(`prepared ${inventory.length} runtime assets in www`);
