#!/usr/bin/env node
'use strict';
// A labelled illustration QA atlas, never a store screenshot. Both columns per boss come from the
// real wave-10 engine state: waiting and six seconds after one actual launched seed.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..'), gameRoot = path.join(root, 'bloomshot');
const out = path.resolve(process.argv[2] || path.join(root, '..', '..', 'outputs'));
const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__art-review__') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/styles.css"><body>' + ['engine', 'bosses', 'rush', 'depths', 'scenery', 'art'].map(name => `<script src="/${name}.js"></script>`).join('') }); return;
    }
    const file = path.resolve(gameRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404, body: '' }); return; }
    await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto('http://localhost/__art-review__', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.load('600 18px Fredoka'); await document.fonts.load('600 13px Nunito'); });
  const result = await page.evaluate(() => {
    const atlas = document.createElement('canvas'); atlas.width = 1400; atlas.height = 1820;
    const c = atlas.getContext('2d'); c.fillStyle = '#fff9ed'; c.fillRect(0, 0, atlas.width, atlas.height);
    c.font = '600 27px Fredoka'; c.fillStyle = '#395544'; c.fillText('Bloomshot · Boss illustration review', 24, 39);
    c.font = '600 14px Nunito'; c.fillStyle = '#7c7564'; c.fillText('Actual authored encounters: waiting / six seconds after a launched seed. Review labels are not store art.', 25, 66);
    const states = [], timings = [];
    for (let level = 1; level <= 10; level++) for (let frame = 0; frame < 2; frame++) {
      const info = BloomDepths.level(level), plan = { id: level, name: info.name, waves: 10, wave: n => BloomDepths.wave(level, n) };
      const game = new BloomRush.RushGame({ plan, startWave: 10 }); game.particles = []; game.floaters = [];
      if (frame) { game.fire(0, -1); for (let n = 0; n < 744 && !game.over; n++) { game.step(1 / 120); game.drainEvents(); } }
      const board = document.createElement('canvas'); board.width = 1260; board.height = 1680;
      const b = board.getContext('2d'); b.scale(3, 3);
      // Keep the actual encounter's parts and hazards; omit unrelated escorts only in this labelled art QA view.
      const visual = { ...game, buds: game.buds.filter(bud => bud.boss || bud.bossPart || bud.bossSummon) };
      BloomArt.draw(b, visual, game.time, { theme: 'depth-' + info.key, showAim: false, reducedMotion: false, quality: 2 });
      const s = game.bossState, main = s.boss;
      const live = visual.buds.filter(bud => !bud.bloomed || bud.boss), x0 = Math.min(...live.map(bud => bud.x - (bud.boss ? bud.r * 2 : bud.r * 1.5))), x1 = Math.max(...live.map(bud => bud.x + (bud.boss ? bud.r * 2 : bud.r * 1.5)));
      const cx = s.kind === 'root' && s.mode === 'burrow' ? s.station : (x0 + x1) / 2;
      const cy = main.y + 14, cropW = 185, cropH = 182;
      const column = (level - 1) % 5, row = Math.floor((level - 1) / 5) * 2 + frame, x = 12 + column * 278, y = 96 + row * 429;
      c.save(); c.beginPath(); c.roundRect(x, y, 266, 347, 17); c.clip(); c.drawImage(board, (cx - cropW / 2) * 3, Math.max(0, cy - cropH / 2) * 3, cropW * 3, cropH * 3, x, y, 266, 347); c.restore();
      c.font = '600 17px Fredoka'; c.fillStyle = '#4a4d40'; c.fillText(`${level}. ${main.name}`, x + 3, y + 373);
      c.font = '600 13px Nunito'; c.fillStyle = '#847864'; c.fillText(`${frame ? 'After launch' : 'Waiting'} · ${s.mode} · ${main.hp}/${main.maxHp} health`, x + 3, y + 395);
      const sample = document.createElement('canvas'); sample.width = 420; sample.height = 560;
      const brush = sample.getContext('2d'); const work = [];
      for (let n = 0; n < 12; n++) { const before = performance.now(); BloomArt.draw(brush, visual, game.time + n / 60, { theme: 'depth-' + info.key, showAim: false, reducedMotion: true, quality: 2 }); work.push(performance.now() - before); }
      work.sort((a, b) => a - b); timings.push({ level, mode: s.mode, medianMilliseconds: work[6], maxMilliseconds: work.at(-1) });
      states.push({ level, mode: s.mode, bodyVisible: main.visible, health: main.hp, maxHealth: main.maxHp, parts: s.parts.map(part => ({ role: part.bossPart, x: part.x, y: part.y, r: part.r, visible: part.visible, bloomed: part.bloomed, lit: part.lit, real: part.real })) });
    }
    return { data: atlas.toDataURL('image/png'), states, timings };
  });
  fs.mkdirSync(out, { recursive: true }); const file = path.join(out, 'bloomshot-boss-art-review.png');
  fs.writeFileSync(file, Buffer.from(result.data.split(',')[1], 'base64'));
  const sourceHashes = Object.fromEntries(['art.js', 'bosses.js', 'rush.js', 'depths.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, name))).digest('hex')]));
  fs.writeFileSync(path.join(out, 'bloomshot-boss-art-review.json'), JSON.stringify({ sourceCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes, capturedAt: new Date().toISOString(), browser: await browser.version(), method: 'Annotated art QA fixture: genuine engine encounter and real parts/hazards, unrelated escorts omitted for silhouette review. Not a store screenshot or device test.', errors, states: result.states, timings: result.timings }, null, 2) + '\n');
  console.log(JSON.stringify({ file, errors, maxWarmedMedianMs: Math.max(...result.timings.map(item => item.medianMilliseconds)) }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
