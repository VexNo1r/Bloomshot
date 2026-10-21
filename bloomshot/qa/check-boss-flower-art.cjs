'use strict';
// Labelled art QA from real authored encounters, not store media or a phone test.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const gameRoot = path.resolve(__dirname, '..'), output = path.resolve(process.argv[2] || path.join(gameRoot, '../../../outputs/bloomshot-boss-flower-review'));
const files = ['engine.js', 'foes.js', 'bosses.js', 'rush.js', 'depths.js', 'scenery.js', 'art.js', 'foe-art.js', 'styles.css'];
const sources = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(gameRoot, name))]));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, sha(bytes)]));
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') return route.abort();
    if (url.pathname === '/review') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/styles.css">' + files.filter(name => name.endsWith('.js')).map(name => `<script src="/${name}"></script>`).join('') });
    const name = decodeURIComponent(url.pathname).slice(1), file = path.resolve(gameRoot, name);
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', body: sources[name] || fs.readFileSync(file) });
  });
  await page.goto('http://localhost/review', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.load('600 20px Fredoka'); await document.fonts.load('600 13px Nunito'); });
  const result = await page.evaluate(() => {
    const atlas = document.createElement('canvas'); atlas.width = 1420; atlas.height = 1320;
    const c = atlas.getContext('2d'); c.fillStyle = '#fff9ed'; c.fillRect(0, 0, atlas.width, atlas.height);
    c.fillStyle = '#315648'; c.font = '600 27px Fredoka'; c.fillText('Bloomshot · Boss flower effects', 22, 38);
    c.font = '600 14px Nunito'; c.fillStyle = '#766d60'; c.fillText('Target details from real wave-10 controllers: warning / active. No fake flowers; this is QA evidence, not store media.', 22, 65);
    const states = [], boards = [];
    function paint(game, level, phase, focus) {
      const info = BloomDepths.level(level), canvas = document.createElement('canvas'); canvas.width = 1260; canvas.height = 1680;
      const ctx = canvas.getContext('2d'); ctx.scale(3, 3);
      const before = JSON.stringify(game.buds);
      BloomArt.drawGarden(ctx, 420, 560, 'depth-' + info.key, { mode: 'rush', frame: false });
      BloomArt.draw(ctx, game, game.time, { theme: 'depth-' + info.key, backdrop: false, showAim: false, reducedMotion: false, quality: 2 });
      if (JSON.stringify(game.buds) !== before) throw new Error('Art mutated real colliders in ' + info.name);
      const x = 12 + (level - 1) % 5 * 282, row = Math.floor((level - 1) / 5) * 2 + (phase === 'active' ? 1 : 0), y = 92 + row * 303;
      const width = 140, height = 126, left = Math.max(0, Math.min(420 - width, focus.x - width / 2)), top = Math.max(0, Math.min(560 - height, focus.y - height / 2));
      c.save(); c.beginPath(); c.roundRect(x, y, 270, 243, 13); c.clip(); c.drawImage(canvas, left * 3, top * 3, width * 3, height * 3, x, y, 270, 243); c.restore();
      c.font = '600 16px Fredoka'; c.fillStyle = '#315648'; c.fillText(`${level}. ${game.bossState.boss.name} · ${phase}`, x + 2, y + 263);
      const effects = game.buds.filter(bud => bud.bossFlowerEffect && !bud.bloomed);
      c.font = '600 13px Nunito'; c.fillStyle = '#776e63'; c.fillText(phase === 'warning' ? game.bossState.flowerWarning.text : `${effects.length} real affected flowers · ${focus.r.toFixed(1)} px radius`, x + 2, y + 284, 266);
      const state = { level, phase, time: game.time, mode: game.bossState.mode, focus: { id: focus.id, x: focus.x, y: focus.y, r: focus.r }, warning: game.bossState.flowerWarning && JSON.parse(JSON.stringify(game.bossState.flowerWarning)), effects: effects.map(bud => ({ id: bud.id, x: bud.x, y: bud.y, r: bud.r, hp: bud.hp, maxHp: bud.maxHp, shell: Boolean(bud.shell), briar: Boolean(bud.briar), bossEcho: Boolean(bud.bossEcho), effect: { ...bud.bossFlowerEffect } })) };
      states.push(state); boards.push({ file: `level-${String(level).padStart(2, '0')}-${phase}.png`, data: canvas.toDataURL('image/png') });
      const still = document.createElement('canvas'); still.width = 420; still.height = 560;
      BloomArt.draw(still.getContext('2d'), game, game.time, { theme: 'depth-' + info.key, backdrop: false, showAim: false, reducedMotion: true });
    }
    for (let level = 1; level <= 10; level++) {
      const info = BloomDepths.level(level), game = new BloomRush.RushGame({ plan: { id: level, name: info.name, waves: 10, wave: n => BloomDepths.wave(level, n) }, startWave: 10 });
      // Open diagonally so the Fossil Queen's mouth-click latch does not postpone the first spell.
      game.fire(-.6, -1); let warned = false, active = false;
      for (let step = 0; step < 3600 && !game.over && !active; step++) {
        game.step(1 / 120); game.drainEvents();
        const warning = game.bossState.flowerWarning;
        if (!warned && warning && warning.targets.length && game.time > warning.at + .55) {
          const focus = game.buds.find(bud => bud.id === warning.targets[0].id);
          if (!focus || focus.bloomed) continue;
          paint(game, level, 'warning', focus); warned = true;
        }
        const affected = game.buds.find(bud => bud.bossFlowerEffect && !bud.bloomed && game.time > bud.bossFlowerEffect.at + .5);
        if (warned && affected) { paint(game, level, 'active', affected); active = true; }
      }
      if (!warned || !active) throw new Error(`Level ${level} did not show an actual warning and active ordinary-flower effect.`);
    }
    return { atlas: atlas.toDataURL('image/png'), states, boards };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  for (const [name, hash] of Object.entries(sourceHashes)) if (sha(fs.readFileSync(path.join(gameRoot, name))) !== hash) throw new Error('Source changed during capture: ' + name);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'boss-flower-effects.png'), Buffer.from(result.atlas.split(',')[1], 'base64'));
  for (const board of result.boards) fs.writeFileSync(path.join(output, board.file), Buffer.from(board.data.split(',')[1], 'base64'));
  const report = { sourceHashes, browser: await browser.version(), method: 'Actual authored wave-10 controllers advanced after one real opening seed. Target-detail atlas plus full board renders capture both the real 1.3-second warning and active effects. Reduced-motion rendering and nonmutation checked. QA evidence, not store screenshots or a physical-phone test.', actualPhoneTested: false, errors, states: result.states };
  fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, capturedStates: report.states.length, levels: report.states.filter(state => state.phase === 'active').map(state => ({ level: state.level, effects: state.effects.length, kind: state.effects[0].effect.kind })), errors }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
