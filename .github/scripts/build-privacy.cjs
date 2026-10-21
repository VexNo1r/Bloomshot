'use strict';
// One policy source, bundled for offline reading and also hosted at /privacy/.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function renderPolicy() {
  const text = fs.readFileSync(path.join(root, 'docs/store/PRIVACY-POLICY.md'), 'utf8').replace(/\r\n/g, '\n');
  const cut = text.indexOf('\n---\n');
  const body = cut === -1 ? text : text.slice(cut + 5);
  if (/\*\*\[[^\]]+\]\*\*/.test(body)) throw new Error('Privacy policy still has owner-to-fill-in blanks');
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = s => escape(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const html = []; let list = false, para = [];
  const flush = () => { if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  for (const line of body.split('\n')) {
    const heading = line.match(/^(#{1,3}) (.*)$/), item = line.match(/^- (.*)$/);
    if (!item && list) { html.push('</ul>'); list = false; }
    if (heading) { flush(); const level = Math.max(1, heading[1].length - 1); html.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
    else if (item) { flush(); if (!list) { html.push('<ul>'); list = true; } html.push(`<li>${inline(item[1])}</li>`); }
    else if (!line.trim()) flush(); else para.push(line.trim());
  }
  flush(); if (list) html.push('</ul>');
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Bloomshot privacy policy</title>\n<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem 1rem 3rem;color:#17332f;background:#f6fcf9}h1,h2,h3{line-height:1.25}a{color:#167f76;overflow-wrap:anywhere}code{background:#e3f3ee;padding:0 .25em;border-radius:3px}</style>\n</head>\n<body>\n${html.join('\n')}\n</body>\n</html>\n`;
}
function writePolicy() {
  const html = renderPolicy();
  fs.writeFileSync(path.join(root, 'bloomshot/privacy.html'), html);
  return html;
}
module.exports = { renderPolicy, writePolicy };
if (require.main === module) { writePolicy(); console.log('Privacy policy bundled in bloomshot/privacy.html'); }
