'use strict';
// Packaging checks only: www matches the game, platform copies match www, no remote server, no install UI.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'web-inventory.json'), 'utf8'));
const sourceDir = path.resolve(root, inventory.source);
const problems = [];
const platforms = [
  ['android', path.join(root, 'android/app/src/main/assets/public')],
  ['ios', path.join(root, 'ios/App/App/public')],
].filter(([, dir]) => fs.existsSync(dir));

for (const entry of inventory.files) {
  const source = path.resolve(sourceDir, entry.file);
  if (!fs.existsSync(source)) { problems.push(`source missing: ${entry.file}`); continue; }
  if (sha(source) !== entry.sourceSha256) problems.push(`source changed since prepare:web: ${entry.file} (run npm run sync)`);
  const www = path.join(root, 'www', entry.file);
  if (!fs.existsSync(www) || sha(www) !== entry.nativeSha256) problems.push(`www copy stale: ${entry.file}`);
  for (const [name, dir] of platforms) {
    const copy = path.join(dir, entry.file);
    if (!fs.existsSync(copy) || sha(copy) !== entry.nativeSha256) problems.push(`${name} copy stale: ${entry.file}`);
  }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (config.server && config.server.url) problems.push('capacitor.config.json must not set a remote server url');
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
if (/manifest\.webmanifest|pwa\.js|install-btn/.test(html)) problems.push('www/index.html still has browser installation parts');
for (const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
  if (/^(https?:|data:)/.test(match[1])) { problems.push(`remote resource in index.html: ${match[1]}`); continue; }
  if (!fs.existsSync(path.join(root, 'www', match[1]))) problems.push(`index.html references a missing file: ${match[1]}`);
}
const css = fs.readFileSync(path.join(root, 'www/styles.css'), 'utf8');
for (const match of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
  if (/^(https?:|data:)/.test(match[1])) { problems.push(`remote or inline resource in styles.css: ${match[1].slice(0, 40)}`); continue; }
  if (!fs.existsSync(path.join(root, 'www', match[1]))) problems.push(`styles.css references a missing file: ${match[1]}`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`ok: ${inventory.files.length} assets match in www${platforms.map(([n]) => ' + ' + n).join('')}`);
