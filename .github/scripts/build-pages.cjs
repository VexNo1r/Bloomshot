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

// Privacy policy page. The draft in docs/store/PRIVACY-POLICY.md keeps its owner-to-fill-in blanks in
// bold brackets; the page is only published once none are left, so a half-finished policy never goes live.
const policyFile = path.join(root, 'docs', 'store', 'PRIVACY-POLICY.md');
if (fs.existsSync(policyFile)) {
  const text = fs.readFileSync(policyFile, 'utf8').replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n---\n');
  const body = cut === -1 ? text : text.slice(cut + 5);
  if (/\*\*\[[^\]]+\]\*\*/.test(body)) {
    console.log('privacy page: skipped, the policy still has [bracketed] blanks to fill in');
  } else {
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
    const html = [];
    let list = false, para = [];
    const flush = () => { if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
    for (const line of body.split('\n')) {
      const heading = line.match(/^(#{1,3}) (.*)$/);
      const item = line.match(/^- (.*)$/);
      if (!item && list) { html.push('</ul>'); list = false; }
      if (heading) { flush(); const level = Math.max(1, heading[1].length - 1); html.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
      else if (item) { flush(); if (!list) { html.push('<ul>'); list = true; } html.push(`<li>${inline(item[1])}</li>`); }
      else if (!line.trim()) flush();
      else para.push(line.trim());
    }
    flush(); if (list) html.push('</ul>');
    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bloomshot privacy policy</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1.5rem 1rem 4rem;color:#17332f;background:#f6fcf9}h1,h2,h3{line-height:1.25}a{color:#167f76}code{background:#e3f3ee;padding:0 .25em;border-radius:3px}</style>
</head>
<body>
${html.join('\n')}
</body>
</html>
`;
    fs.mkdirSync(path.join(out, 'privacy'), { recursive: true });
    fs.writeFileSync(path.join(out, 'privacy', 'index.html'), page);
    console.log('privacy page: published at /privacy/');
  }
}
