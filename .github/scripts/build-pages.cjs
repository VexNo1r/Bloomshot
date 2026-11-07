'use strict';
// Builds _site/, the public web copy of the game for GitHub Pages, from ../../bloomshot.
// The file list comes from the game's own sw.js ASSETS, so a new game file ships once it is listed there.
// The service worker's cache version is replaced with a hash of what is shipped, so every deploy that
// changes a file also changes the cache name and returning players get the update.
// The web build sells nothing: store.js only goes live inside the native app (or on localhost in test mode).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const game = path.join(root, 'bloomshot');
const out = path.join(root, '_site');
require('./build-privacy.cjs').writePolicy();
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

const sw = fs.readFileSync(path.join(game, 'sw.js'), 'utf8');
const list = sw.match(/const ASSETS = \[([^\]]+)\]/);
if (!list) throw new Error('Could not find the ASSETS list in sw.js');
const files = [...list[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
if (!files.includes('index.html')) throw new Error('sw.js ASSETS no longer lists index.html');

const versionPattern = /const VERSION = '[^']*';/g;
if ((sw.match(versionPattern) || []).length !== 1) throw new Error('Expected exactly one VERSION line in sw.js');

fs.rmSync(out, { recursive: true, force: true });
const hash = crypto.createHash('sha256');
hash.update(sw.replace(versionPattern, "const VERSION = '';"));
for (const file of [...files].sort()) {
  const from = path.join(game, file);
  if (!fs.existsSync(from)) throw new Error(`Listed in sw.js ASSETS but missing: ${file}`);
  const body = fs.readFileSync(from);
  hash.update(file + '\0').update(body);
  const to = path.join(out, file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, body);
}
const version = hash.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(out, 'sw.js'), sw.replace(versionPattern, `const VERSION = '${version}';`));
console.log(`site: ${files.length} assets plus sw.js, cache version ${version}`);

// The public policy and the offline in-app policy use the same rendered source.
fs.mkdirSync(path.join(out, 'privacy'), { recursive: true });
fs.copyFileSync(path.join(out, 'privacy.html'), path.join(out, 'privacy', 'index.html'));
console.log('privacy page: prepared at /privacy/');
