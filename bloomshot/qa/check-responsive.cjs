'use strict';
// Real Chromium layout/input QA in disposable contexts. No player data, store calls or service workers.
// Requires Playwright and Chrome; NODE_PATH can point at the bundled Codex dependencies.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), Tutorial = require('../tutorial.js');
const chapters = [require('../moon.js'), require('../koi.js')];
const previewOnly = process.argv.includes('--previews');
const output = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || path.join(root, '../../..', 'outputs/bloomshot-responsive'));
const sizeFilter = process.argv.find(arg => arg.startsWith('--size='))?.slice(7);
const sizes = [
  { width: 360, height: 800, top: 0, bottom: 0 },
  { width: 390, height: 844, top: 44, bottom: 34 },
  { width: 820, height: 1180, top: 24, bottom: 20 },
  { width: 360, height: 640, top: 24, bottom: 24 },
  // iPads: held sideways (Air, mini, Pro 12.9) the menus fill the screen like they do upright.
  { width: 1180, height: 820, top: 24, bottom: 20 },
  { width: 1133, height: 744, top: 24, bottom: 20 },
  { width: 1366, height: 1024, top: 24, bottom: 20 },
  { width: 1024, height: 1366, top: 24, bottom: 20 },
  // A desktop browser with a mouse keeps the phone-sized shell with the notes beside it.
  { width: 1440, height: 900, top: 0, bottom: 0, desktop: true }
].filter(size => !sizeFilter || `${size.width}x${size.height}` === sizeFilter);
assert(sizes.length, 'requested size is part of the responsive matrix');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const hook = 'window.__layoutQA = { startDepth, startLevel, startTutorial };\n})();';
assert(/\}\)\(\);\s*$/.test(source), 'the QA-only module hook matches the actual source');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const sourceFiles = fs.readdirSync(root).filter(file => /\.(js|css|html)$/.test(file)), startHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(file)]));
const rows = [], errors = []; let browser;
// In the page: each visible button in `selector` takes a tap 21.5 px from its centre on every side (its 44 px hit ring),
// unless that spot is nearer another button's face (two close buttons share the gap between them), and its own centre
// is never taken by a neighbour's ring.
function hitRings(selector) {
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2, owner = (x, y) => document.elementFromPoint(x, y)?.closest('button');
    if (owner(cx, cy) !== el) out.push(`${el.id}: centre taken by ${owner(cx, cy)?.id}`);
    for (const [dx, dy] of [[-21.5, 0], [21.5, 0], [0, -21.5], [0, 21.5]]) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const hit = owner(x, y);
      const gap = rect => Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom));
      if (hit !== el && !(hit && gap(hit.getBoundingClientRect()) <= gap(r))) out.push(`${el.id}: ${dx},${dy} goes to ${hit?.id || document.elementFromPoint(x, y)?.className || 'nothing'}`);
    }
    if (r.width > 44.5 || r.height > 44.5) out.push(`${el.id}: drawn larger than before (${r.width}x${r.height})`);
  }
  return out;
}
// In the page: the small white-on-colour labels read at 4.5:1 or better. Probes are built from the real classes.
function labelContrast() {
  const lum = rgb => { const c = rgb.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.append(box);
  const probes = ['<span class="help-number">1</span>', '<span class="power-chip"><span class="power-count">3</span></span>', '<span class="power-chip empty"><span class="power-count">0</span></span>',
    ...['', 'green', 'gold', 'sky', 'meadow', 'moon', 'koi'].map(tone => `<span class="card-tag ${tone}">Tag</span>`)];
  box.innerHTML = probes.join('');
  const rows = [...box.children].map(el => { const t = el.matches('.power-chip') ? el.firstElementChild : el, css = getComputedStyle(t); return { label: t.className + (el !== t ? ` in ${el.className}` : ''), ratio: ratio(css.color, css.backgroundColor) }; });
  box.remove();
  // The 'Level N · Wave X/10' tag in every level's theme (and Rush's, the Moon's and the Koi pond's).
  const tag = document.getElementById('level-label'), theme = document.body.dataset.theme;
  for (const look of ['', 'meadow', 'depth-meadow', 'moon', 'koi', 'depth-roots', 'depth-grotto', 'depth-crystal', 'depth-lake', 'depth-fossil', 'depth-ember', 'depth-geode', 'depth-briar', 'depth-core']) {
    if (look) document.body.dataset.theme = look; else delete document.body.dataset.theme;
    const css = getComputedStyle(tag); rows.push({ label: `level-tag in ${look || 'the meadow'}`, ratio: ratio(css.color, css.backgroundColor) });
  }
  if (theme === undefined) delete document.body.dataset.theme; else document.body.dataset.theme = theme;
  return rows.filter(row => !(row.ratio >= 4.5)).map(row => `${row.label} ${row.ratio.toFixed(2)}`);
}
function intersect(a, b) { return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1 && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1; }
async function main() {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  for (const size of sizes) {
    const key = `${size.width}x${size.height}`, context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: !size.desktop, hasTouch: !size.desktop, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ size: key, error: error.message }));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') { await route.abort(); return; }
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404, body: 'Missing asset' }); return; }
      let body = file === path.join(root, 'app.js') ? source.replace(/\}\)\(\);\s*$/, hook) : fs.readFileSync(file);
      if (file.endsWith('styles.css')) body = body.toString().replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, (_, edge) => `${size[edge] || 0}px`);
      await route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    });
    await page.addInitScript(() => {
      // The Guardian Hall pass reloads with three guardians beaten (one with a gold ribbon) and the rest still locked.
      const hall = sessionStorage.getItem('qa-hall') ? { depths: { 1: { stars: 3, best: 3000, wave: 10 }, 2: { stars: 2, best: 2000, wave: 10 }, 3: { stars: 1, best: 1000, wave: 10 } }, hall: { 1: { wins: 2, bestTime: 18.4, ribbon: 'gold' } } } : {};
      localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, tutorial: true, powersMet: true, podMet: true, settings: { sound: false, music: false, haptics: false, motion: true }, ...hall }));
    });
    await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-13T12:00:05Z'));
    await page.goto('http://localhost/?qa&alllevels', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = async label => {
      const state = await page.evaluate(() => {
        const visible = el => el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        const ids = ['game-canvas', 'scene-canvas', 'back-btn', 'pause-btn', 'sound-btn', 'help-btn', 'settings-btn', 'game-hint', 'rotate-btn', 'split-btn', 'restart-btn', 'tutorial-card'];
        const rects = Object.fromEntries(ids.map(id => { const el = document.getElementById(id), r = el?.getBoundingClientRect(); return [id, visible(el) && r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null]; }));
        const powerRects = [...document.querySelectorAll('.power-chip')].filter(visible).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        return { rects, powerRects, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, route: document.body.dataset.view, tutorial: document.body.dataset.tutorial, mode: document.body.dataset.mode };
      });
      assert.equal(state.scrollWidth, size.width, `${key} ${label}: no horizontal overflow`);
      for (const [id, r] of Object.entries(state.rects)) {
        if (!r || !r.width || !r.height) continue;
        assert(r.x >= -.6 && r.y >= -.6 && r.x + r.width <= size.width + .6 && r.y + r.height <= size.height + .6, `${key} ${label}: ${id} stays on screen ${JSON.stringify(r)}`);
      }
      const board = state.rects['game-canvas'], scene = state.rects['scene-canvas'];
      assert(board && Math.abs(board.width / board.height - .75) < .001, `${key} ${label}: uniform playfield scale`);
      assert(scene && scene.width === size.width && scene.height === size.height && scene.x === 0 && scene.y === 0, `${key} ${label}: scene fills viewport`);
      if (state.tutorial !== 'on') {
        assert(state.rects['back-btn'], `${key} ${label}: visible exit control`);
        assert.deepEqual(await page.evaluate(hitRings, '.app-header .icon-button'), [], `${key} ${label}: 44px header tap targets`);
        // The levels show a round 44 px pause button in the header, clear of the other header buttons; the puzzle boards have none.
        const pause = state.rects['pause-btn'];
        if (state.mode === 'rush') { assert(pause && pause.width >= 44 && pause.height >= 44, `${key} ${label}: 44px pause button`); for (const id of ['back-btn', 'sound-btn', 'help-btn', 'settings-btn']) if (state.rects[id]) assert(!intersect(pause, state.rects[id]), `${key} ${label}: pause clear of ${id}`); }
        else assert(!pause, `${key} ${label}: no pause button on a puzzle board`);
        for (const id of ['rotate-btn', 'split-btn', 'restart-btn']) if (state.rects[id]) assert(!intersect(board, state.rects[id]), `${key} ${label}: ${id} clear of the board`);
        for (const r of state.powerRects) { assert(r.width >= 44 && r.height >= 44, `${key} ${label}: 44px power target`); assert(!intersect(board, r), `${key} ${label}: power target clear of board`); }
      } else {
        const card = state.rects['tutorial-card']; assert(card, `${key} ${label}: tutorial card visible`);
        assert(!state.rects['pause-btn'], `${key} ${label}: the tutorial hides the pause button`);
        for (const r of state.powerRects) if (label.includes('power:')) assert(!intersect(card, r), `${key} ${label}: lesson leaves power target exposed`);
      }
      rows.push({ size: key, safeTop: size.top, safeBottom: size.bottom, label, ...state });
    };
    // The longest toast (a meadow goal finished by saying hi) reads in two lines at most, whole and on screen.
    const longToast = async label => {
      const t = await page.evaluate(() => {
        // Measured at rest: the page clock is paused, so a slide from the last toast would still be under way.
        const el = document.getElementById('toast'), was = el.textContent; el.style.transition = 'none'; el.textContent = 'Goal done! Grow, build or say hi in your meadow. +4 seeds.'; el.classList.add('visible');
        const r = el.getBoundingClientRect(), css = getComputedStyle(el), lines = Math.round((el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)) / parseFloat(css.lineHeight));
        el.classList.remove('visible'); el.textContent = was; void el.offsetWidth; el.style.transition = '';
        return { x: r.x, right: r.right, width: r.width, height: r.height, lines };
      });
      assert(t.lines <= 2, `${key} ${label}: a long toast wraps to ${t.lines} lines ${JSON.stringify(t)}`);
      assert(t.x >= 11.5 && t.right <= size.width - 11.5, `${key} ${label}: the toast stays on screen ${JSON.stringify(t)}`);
    };
    if (!previewOnly) {
    // The Levels map opens with the slim Today strip, and the first level still sits whole above the bottom bar.
    const map = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { route: document.body.dataset.view, today: box(document.getElementById('today-strip')), goals: [...document.querySelectorAll('.today-goal')].map(box),
        clipped: [...document.querySelectorAll('.today-name')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent),
        first: box(document.querySelector('.depth-card')), nav: box(document.querySelector('.bottom-nav')), scrollWidth: document.documentElement.scrollWidth,
        shell: box(document.querySelector('.app-shell')), cards: [...document.querySelectorAll('.depth-card')].map(box), coarse: matchMedia('(pointer:coarse)').matches,
        notes: [...document.querySelectorAll('.desktop-note')].map(el => getComputedStyle(el).display !== 'none') };
    });
    assert.equal(map.route, 'levels', `${key}: the game opens on the Levels map`);
    assert.equal(map.scrollWidth, size.width, `${key} Levels map: no horizontal overflow`);
    assert(map.today.height > 0 && map.today.height <= 60, `${key}: slim Today strip ${JSON.stringify(map.today)}`);
    assert.equal(map.goals.length, 3, `${key}: three goals on the Today strip`);
    for (const r of map.goals) assert(r.height >= 44 && r.width >= 44, `${key}: 44px Today goal target ${JSON.stringify(r)}`);
    assert.deepEqual(map.clipped, [], `${key}: Today goal names fit`);
    // Every goal's short label (the longest is "★★★ puzzle") fits whole in any slot, at this size and on the common
    // phone widths the matrix skips (320, 375, 393, 412).
    for (const width of size.width < 700 ? [size.width, 320, 375, 393, 412] : [size.width]) {
      if (width !== size.width) { await page.setViewportSize({ width, height: size.height }); await page.clock.runFor(200); }
      const cut = await page.evaluate(() => {
        const out = [], stars = text => text.replace(/★+/g, s => `<span class="goal-stars">${s}</span>`);
        for (const el of document.querySelectorAll('.today-name')) {
          const was = el.innerHTML, slot = el.parentElement, cs = getComputedStyle(slot);
          const room = slot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          for (const goal of BloomGoals.catalog) {
            el.innerHTML = stars(goal.short); const range = document.createRange(); range.selectNodeContents(el);
            const need = range.getBoundingClientRect().width;
            if (el.scrollWidth > el.clientWidth + .5 || need > room + .5) out.push(`${goal.short} ${need.toFixed(1)}/${room.toFixed(1)}`);
          }
          el.innerHTML = was;
        }
        return out;
      });
      assert.deepEqual(cut, [], `${width}x${size.height}: every Today goal label fits whole`);
    }
    if (size.width < 700) { await page.setViewportSize({ width: size.width, height: size.height }); await page.clock.runFor(200); }
    assert(map.first.y + map.first.height <= map.nav.y + .6, `${key}: first level sits above the bottom bar ${JSON.stringify(map)}`);
    // One ladder going down, each level under the last; a touch screen fills the screen, a desktop mouse keeps the 440 px shell.
    assert(map.cards.length >= 10 && map.cards.every((r, i) => Math.abs(r.x - map.cards[0].x) < .6 && (!i || r.y > map.cards[i - 1].y + map.cards[i - 1].height)), `${key}: single descending ladder`);
    assert.equal(map.coarse, !size.desktop, `${key}: pointer matches the device`);
    if (size.desktop) { assert.equal(map.shell.width, 440, `${key}: desktop keeps the phone-sized shell`); assert.deepEqual(map.notes, [true, true], `${key}: desktop notes beside it`); }
    else { assert.equal(map.shell.width, size.width, `${key}: the menus fill the screen`); assert.deepEqual(map.notes, [false, false], `${key}: no desktop notes on a touch screen`); }
    rows.push({ size: key, safeTop: size.top, safeBottom: size.bottom, label: 'Levels map', ...map });
    await longToast('Levels map');
    // Header icons answer a 44 px tap without being drawn bigger, and the small labels read clearly.
    assert.deepEqual(await page.evaluate(hitRings, '.header-actions .icon-button'), [], `${key} Levels map: 44px header tap targets`);
    assert.deepEqual(await page.evaluate(labelContrast), [], `${key}: small labels read at 4.5:1`);
    // How to play's Who's who, every entry shown (the review link): all 34 cards and pictures fit the dialog with no
    // sideways scroll and no clipped text, in two columns where the dialog is wide enough and one on phones.
    // Each guide picture's pixels just before the board drawing, so what it drew can be told from a backing under it.
    await page.evaluate(() => {
      const draw = window.BloomArt.draw;
      window.BloomArt.draw = function (ctx, ...rest) {
        if (ctx.canvas && ctx.canvas.className === 'guide-canvas') ctx.canvas.qaBefore = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
        return draw.call(this, ctx, ...rest);
      };
    });
    await page.evaluate(() => { document.getElementById('help-btn').click(); document.getElementById('levels-help').open = false; document.getElementById('guide-help').open = true; });
    await page.clock.runFor(2000);
    // Every picture's piece fills a fair share of its round frame: a pixel is the piece's when the drawing changed it
    // (over the card's cream) by 60 or more in all. Today the least is 25% (Fibcap, Moon Jelly; Ember Rose has 48%); before
    // the framing pass Wishing Stars had 10%, Crystal Heart 13%, Glowworm 15%, The Starseed 16%, Peekaboo Mole 18%.
    const covers = await page.evaluate(() => [...document.querySelectorAll('#guide-list .guide-entry')].map(item => {
      const canvas = item.querySelector('.guide-canvas'), w = canvas.width, h = canvas.height, after = canvas.getContext('2d').getImageData(0, 0, w, h).data, before = canvas.qaBefore;
      const over = (data, i, c) => data[i + c] * data[i + 3] / 255 + [255, 253, 246][c] * (1 - data[i + 3] / 255);
      let inside = 0, piece = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.hypot(x + .5 - w / 2, y + .5 - h / 2) > w / 2) continue;
        const i = (y * w + x) * 4; inside++;
        if (before && Math.abs(over(after, i, 0) - over(before, i, 0)) + Math.abs(over(after, i, 1) - over(before, i, 1)) + Math.abs(over(after, i, 2) - over(before, i, 2)) >= 60) piece++;
      }
      return { id: item.dataset.guide, cover: Math.round(piece / inside * 1000) / 1000 };
    }));
    const thin = covers.filter(row => !(row.cover >= .2));
    assert.deepEqual(thin, [], `${key} Who's who: every picture's piece covers at least 20% of its frame`);
    const guide = await page.evaluate(() => {
      const dialog = document.getElementById('help-dialog'), r = dialog.getBoundingClientRect(), items = [...document.querySelectorAll('#guide-list .guide-entry')];
      return { dialog: { x: r.x, right: r.right, width: r.width }, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth, page: document.documentElement.scrollWidth,
        entries: items.length, pictures: document.querySelectorAll('#guide-list .guide-canvas').length, count: document.getElementById('guide-count').textContent,
        outside: items.filter(el => { const b = el.getBoundingClientRect(); return b.left < r.x - .5 || b.right > r.right + .5; }).map(el => el.dataset.guide),
        clipped: [...document.querySelectorAll('#guide-list .guide-name, #guide-list .guide-line, #guide-list .guide-does')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent),
        columns: new Set(items.map(el => Math.round(el.getBoundingClientRect().x))).size,
        // Each level ends on a full row: its last card (the guardian) reaches the grid's right edge.
        endsShort: [...document.querySelectorAll('#guide-list .guide-grid')].filter(grid => grid.lastElementChild.getBoundingClientRect().right < grid.getBoundingClientRect().right - 1).map(grid => grid.lastElementChild.dataset.guide) };
    });
    assert.equal(guide.scrollWidth, guide.clientWidth, `${key} Who's who: no sideways scroll in the dialog`);
    assert.equal(guide.page, size.width, `${key} Who's who: no horizontal overflow`);
    assert(guide.dialog.x >= 0 && guide.dialog.right <= size.width + .6, `${key} Who's who: the dialog stays on screen ${JSON.stringify(guide.dialog)}`);
    assert.equal(guide.entries, 34, `${key} Who's who: every entry`); assert.equal(guide.pictures, 34, `${key} Who's who: every picture painted`);
    assert.equal(guide.count, '34 of 34 met', `${key} Who's who: the count`);
    assert.deepEqual(guide.outside, [], `${key} Who's who: cards inside the dialog`); assert.deepEqual(guide.clipped, [], `${key} Who's who: no clipped names or lines`);
    assert.equal(guide.columns, size.width >= 700 ? 2 : 1, `${key} Who's who: two columns where there is room`);
    assert.deepEqual(guide.endsShort, [], `${key} Who's who: no guardian sits alone beside an empty space`);
    rows.push({ size: key, label: "Who's who", ...guide, covers: Object.fromEntries(covers.map(row => [row.id, row.cover])) });
    await page.locator('#help-dialog').screenshot({ path: path.join(output, `${key}-guide.png`) });
    // A phone narrower than any in the matrix (a folding phone's cover screen, 280 px): the open guide still fits.
    if (size.width < 700) {
      await page.setViewportSize({ width: 280, height: size.height }); await page.clock.runFor(500);
      const narrow = await page.evaluate(() => {
        const dialog = document.getElementById('help-dialog'), r = dialog.getBoundingClientRect();
        return { scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth, right: r.right, page: document.documentElement.scrollWidth,
          outside: [...document.querySelectorAll('#guide-list .guide-entry')].filter(el => { const b = el.getBoundingClientRect(); return b.left < r.x - .5 || b.right > r.right + .5; }).map(el => el.dataset.guide),
          clipped: [...document.querySelectorAll('#guide-list .guide-name, #guide-list .guide-line, #guide-list .guide-does')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent) };
      });
      assert.equal(narrow.scrollWidth, narrow.clientWidth, `280x${size.height} Who's who: no sideways scroll in the dialog`);
      assert.equal(narrow.page, 280, `280x${size.height} Who's who: no horizontal overflow`); assert(narrow.right <= 280.6, `280x${size.height} Who's who: the dialog stays on screen`);
      assert.deepEqual(narrow.outside, [], `280x${size.height} Who's who: cards inside the dialog`); assert.deepEqual(narrow.clipped, [], `280x${size.height} Who's who: no clipped names or lines`);
      rows.push({ size: `280x${size.height}`, label: "Who's who, narrow", ...narrow });
      await page.locator('#help-dialog').screenshot({ path: path.join(output, `${key}-guide-280.png`) });
      await page.setViewportSize({ width: size.width, height: size.height }); await page.clock.runFor(500);
    }
    // Scrolled to the very bottom of the guide, the x is still at the top of the card (phones have no Escape key).
    const stuck = await page.evaluate(() => {
      const d = document.getElementById('help-dialog'); d.scrollTop = d.scrollHeight;
      const r = d.getBoundingClientRect(), c = document.getElementById('close-help').getBoundingClientRect();
      return { scrolled: d.scrollTop, dialog: { x: r.x, y: r.y, right: r.right }, close: { x: c.x, y: c.y, right: c.right, bottom: c.bottom } };
    });
    assert.deepEqual(await page.evaluate(hitRings, '#close-help'), [], `${key} Who's who: 44px close tap target`);
    assert(stuck.scrolled > 0 && stuck.close.y >= stuck.dialog.y - .5 && stuck.close.bottom <= stuck.dialog.y + 80 && stuck.close.right <= stuck.dialog.right + .5,
      `${key} Who's who: the close button stays in reach at the bottom of the guide ${JSON.stringify(stuck)}`);
    await page.evaluate(() => { document.getElementById('guide-help').open = false; document.getElementById('levels-help').open = true; document.getElementById('help-dialog').close(); });
    for (let level = 1; level <= 10; level++) for (const wave of [1, 10]) {
      await page.evaluate(({ level, wave }) => window.__layoutQA.startDepth(level, false, wave), { level, wave });
      await page.clock.runFor(2200); await geometry(`Level ${level}, wave ${wave}`);
      if (level === 1 && wave === 1) { await page.screenshot({ path: path.join(output, `${key}-sunny.png`) }); await longToast('Level 1 in play'); }
      if (level === 10 && wave === 10) await page.screenshot({ path: path.join(output, `${key}-starseed.png`) });
      // The Paused card's Who's who opens the guide at this level's group over the card; closing it leaves the card up.
      if (level === 7 && wave === 1) {
        await page.evaluate(() => document.getElementById('pause-btn').click()); await page.clock.runFor(400);
        const card = await page.evaluate(() => {
          const d = document.getElementById('pause-dialog'), r = d.getBoundingClientRect(), b = document.getElementById('pause-guide').getBoundingClientRect();
          return { open: d.open, hidden: document.getElementById('pause-guide').hidden, dialog: { x: r.x, y: r.y, right: r.right, bottom: r.bottom }, button: { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom } };
        });
        assert(card.open && !card.hidden, `${key} Paused: the card offers Who's who`);
        assert(card.button.width >= 44 && card.button.height >= 44, `${key} Paused: 44px Who's who button ${JSON.stringify(card.button)}`);
        assert(card.button.x >= card.dialog.x && card.button.right <= card.dialog.right + .5 && card.button.bottom <= card.dialog.bottom + .5, `${key} Paused: Who's who sits on the card`);
        assert(card.dialog.y >= 0 && card.dialog.bottom <= size.height + .5, `${key} Paused: the card fits the screen ${JSON.stringify(card.dialog)}`);
        await page.locator('#pause-dialog').screenshot({ path: path.join(output, `${key}-paused.png`) });
        await page.evaluate(() => document.getElementById('pause-guide').click()); await page.clock.runFor(2000);
        const opened = await page.evaluate(() => {
          const d = document.getElementById('help-dialog'), r = d.getBoundingClientRect(), group = document.querySelector('#guide-list .guide-level[data-level="7"]').getBoundingClientRect();
          const c = document.getElementById('close-help').getBoundingClientRect();
          return { help: d.open, pause: document.getElementById('pause-dialog').open, guide: document.getElementById('guide-help').open, dialog: { x: r.x, y: r.y, right: r.right, bottom: r.bottom }, group: { y: group.y, bottom: group.bottom },
            close: { x: c.x, y: c.y, right: c.right, bottom: c.bottom }, scrolled: d.scrollTop, end: d.scrollTop >= d.scrollHeight - d.clientHeight - 1, title: document.getElementById('help-title').textContent,
            shown: [...d.querySelectorAll(':scope > details')].filter(el => el.getClientRects().length).map(el => el.id),
            scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, page: document.documentElement.scrollWidth,
            clipped: [...document.querySelectorAll('#guide-list .guide-name, #guide-list .guide-line, #guide-list .guide-does')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent) };
        });
        assert(opened.help && opened.pause && opened.guide, `${key} Paused: Who's who opens over the Paused card`);
        // On a tall screen the guide ends before Level 7 can reach the top: then it is scrolled to the end with Level 7 in full view.
        assert(opened.group.y >= opened.dialog.y - .5 && (opened.group.y <= opened.dialog.y + 160 || (opened.end && opened.group.bottom <= opened.dialog.bottom)), `${key} Paused: the guide starts at Level 7 ${JSON.stringify(opened)}`);
        assert.equal(opened.scrollWidth, opened.clientWidth, `${key} Paused: no sideways scroll in the guide`); assert.equal(opened.page, size.width, `${key} Paused: no horizontal overflow`);
        assert(opened.dialog.x >= 0 && opened.dialog.right <= size.width + .6, `${key} Paused: the guide stays on screen`);
        assert.deepEqual(opened.clipped, [], `${key} Paused: no clipped guide text`);
        assert.deepEqual(opened.shown, ['guide-help'], `${key} Paused: only Who's who is listed`); assert.equal(opened.title, "Who's who", `${key} Paused: titled Who's who`);
        assert(opened.scrolled > 0 && opened.close.y >= opened.dialog.y - .5 && opened.close.bottom <= opened.dialog.y + 80 && opened.close.x >= opened.dialog.x && opened.close.right <= opened.dialog.right + .5,
          `${key} Paused: the close button stays at the top of the scrolled guide ${JSON.stringify(opened.close)}`);
        await page.locator('#help-dialog').screenshot({ path: path.join(output, `${key}-paused-guide.png`) });
        // A real tap on the x where it is drawn (not a script click), so an off-screen button fails here.
        await page.mouse.click((opened.close.x + opened.close.right) / 2, (opened.close.y + opened.close.bottom) / 2); await page.clock.runFor(400);
        const back = await page.evaluate(() => ({ help: document.getElementById('help-dialog').open, pause: document.getElementById('pause-dialog').open, count: !document.getElementById('resume-count').hidden }));
        assert.deepEqual(back, { help: false, pause: true, count: false }, `${key} Paused: closing the guide goes back to the Paused card, still paused`);
        rows.push({ size: key, label: "Paused card and its Who's who", card, opened });
        await page.evaluate(() => document.getElementById('pause-levels').click()); await page.clock.runFor(400);
      }
    }
    for (const chapter of chapters) for (const level of chapter.levels) {
      await page.evaluate(level => window.__layoutQA.startLevel(level), level);
      await page.clock.runFor(300); await geometry(level.name);
      if (level === chapter.levels[0]) await longToast(level.name);
    }
    await page.evaluate(() => window.__layoutQA.startTutorial());
    let elapsed = 0, shown = '', reacted = false, since = 0; const screens = new Set();
    while (elapsed < 65) {
      await page.clock.runFor(100); elapsed += .1;
      const lesson = await page.locator('#tutorial').evaluate(el => ({ phase: el.dataset.phase, number: parseInt(document.getElementById('tutorial-step').textContent), text: document.getElementById('tutorial-text').textContent }));
      if (lesson.phase === 'end') { await geometry('Tutorial end'); break; }
      const lessonKey = `${lesson.number}:${lesson.text}:${lesson.phase}`;
      if (lessonKey !== shown) { shown = lessonKey; since = 0; reacted = false; } else since += .1;
      if (lesson.phase !== 'prompt' || reacted || since < .8) continue;
      const prompt = Tutorial.steps[lesson.number - 1].prompts.find(p => p.text === lesson.text); assert(prompt, 'current tutorial prompt is authored');
      const action = prompt.allow[0]; await geometry(`Tutorial ${lesson.number} ${action}`); screens.add(lesson.number);
      if (action === 'fire') {
        const bounds = await page.locator('#game-canvas').boundingBox(), [x, y] = prompt.finger;
        await page.mouse.move(bounds.x + x / 420 * bounds.width, bounds.y + y / 560 * bounds.height);
        await page.mouse.down(); await page.clock.runFor(250); await page.mouse.up();
      } else await page.locator(action === 'rotate' ? '#rotate-btn' : action === 'split' ? '#split-btn' : `[data-power="${action.slice(6)}"]`).click();
      reacted = true;
    }
    assert.equal(screens.size, 7, `${key}: all seven lessons reached with actual controls`);
    assert(elapsed < 65, `${key}: tutorial completed`);
    await page.screenshot({ path: path.join(output, `${key}-tutorial-end.png`) });
    // The Guardian Hall: its card on the map, the ten guardian cards (beaten ones with 44 px Rematch buttons, locked ones as
    // silhouettes), nothing clipped or off screen, readable labels, here and on a 320 x 568 phone; then a rematch's board
    // and its Paused card's way back to the Hall.
    await page.evaluate(() => sessionStorage.setItem('qa-hall', '1'));
    await page.goto('http://localhost/?qa&alllevels', { waitUntil: 'networkidle' }); await page.evaluate(() => document.fonts.ready);
    const entry = await page.evaluate(() => { const el = document.getElementById('hall-btn'), r = el.getBoundingClientRect(); return { hidden: el.hidden, height: r.height, width: r.width, x: r.x, label: el.getAttribute('aria-label'),
      // It sits above the ladder, where a player who has just beaten a guardian sees it without scrolling past ten levels.
      bottom: r.bottom + scrollY, ladder: document.querySelector('.depth-card').getBoundingClientRect().top + scrollY, view: innerHeight }; });
    assert(entry.bottom <= entry.ladder && entry.bottom <= entry.view, `${key}: the Guardian Hall card is above the levels, in the first screen ${JSON.stringify(entry)}`);
    assert(!entry.hidden && entry.height >= 44 && entry.x >= 0 && entry.x + entry.width <= size.width + .6, `${key}: the Guardian Hall card shows on the map ${JSON.stringify(entry)}`);
    await page.locator('#hall-btn').scrollIntoViewIfNeeded(); await page.locator('#hall-btn').click(); await page.clock.runFor(1500);
    const hallLayout = () => page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; };
      const lum = rgb => { const c = rgb.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
      const bg = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !c.endsWith(', 0)') && c !== 'transparent') return c; } return 'rgb(255,255,255)'; };
      const ratio = el => { const a = lum(getComputedStyle(el).color), b = lum(bg(el)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
      const texts = [...document.querySelectorAll('#hall-view .hall-level, #hall-view .hall-name, #hall-view .hall-stats, #hall-view .hall-note, #hall-summary, .hall-footnote')];
      return { route: document.body.dataset.view, scrollWidth: document.documentElement.scrollWidth, cards: [...document.querySelectorAll('.hall-card')].map(el => el.getAttribute('aria-label')),
        cardBoxes: [...document.querySelectorAll('.hall-card')].map(box), buttons: [...document.querySelectorAll('.hall-go')].map(el => ({ id: el.dataset.hall, label: el.getAttribute('aria-label'), ...box(el) })),
        back: box(document.getElementById('hall-back')), locked: document.querySelectorAll('.hall-card.locked').length, canvases: document.querySelectorAll('.hall-canvas').length,
        clipped: texts.filter(el => el.scrollWidth > el.clientWidth + .5 || el.getBoundingClientRect().right > innerWidth + .5).map(el => el.textContent),
        lowContrast: texts.filter(el => ratio(el) < 4.5).map(el => `${el.className || el.id} ${ratio(el).toFixed(2)}`) };
    });
    const checkHall = (h, at) => {
      assert.equal(h.route, 'hall', `${at}: the Hall opens`); assert.equal(h.scrollWidth, at.startsWith(key) ? size.width : 320, `${at} Hall: no horizontal overflow`);
      assert.equal(h.cards.length, 10, `${at}: ten guardian cards`);
      assert(h.cards.slice(0, 3).every((label, i) => label.includes(`level ${i + 1},`)) && h.cards.slice(3).every((label, i) => label.startsWith(`Level ${i + 4} ·`)), `${at}: guardians in level order ${JSON.stringify(h.cards)}`);
      assert.equal(h.locked, 7, `${at}: seven locked silhouettes`); assert.deepEqual(h.buttons.map(b => b.id), ['1', '2', '3'], `${at}: Rematch only for beaten guardians`);
      for (const b of h.buttons) assert(b.width >= 44 && b.height >= 44 && b.x >= 0 && b.right <= (at.startsWith(key) ? size.width : 320) + .6, `${at}: 44px Rematch button on screen ${JSON.stringify(b)}`);
      assert(h.back.height >= 44 && h.back.width >= 44, `${at}: 44px Levels button`);
      assert.deepEqual(h.clipped, [], `${at}: no clipped Hall text`); assert.deepEqual(h.lowContrast, [], `${at}: Hall text reads at 4.5:1`);
      assert(h.cardBoxes.every((r, i) => !i || r.y >= h.cardBoxes[i - 1].y), `${at}: cards run down the page`);
    };
    let hallState = await hallLayout(); checkHall(hallState, `${key}`);
    assert.equal(hallState.canvases, 10, `${key}: every guardian card has its drawn portrait`);
    rows.push({ size: key, label: 'Guardian Hall', ...hallState });
    await page.screenshot({ path: path.join(output, `${key}-guardian-hall.png`) });
    if (size.width < 700) {
      await page.setViewportSize({ width: 320, height: 568 }); await page.clock.runFor(300);
      hallState = await hallLayout(); checkHall(hallState, '320x568');
      rows.push({ size: '320x568', label: 'Guardian Hall', ...hallState });
      await page.setViewportSize({ width: size.width, height: size.height }); await page.clock.runFor(300);
    }
    await page.locator('[data-hall="2"]').click(); await page.clock.runFor(1800);
    assert.equal(await page.evaluate(() => window.bloomshotState.hallRun && window.bloomshotState.wave), 10, `${key}: Rematch starts the guardian's wave`);
    await geometry('Guardian Hall rematch');
    await page.evaluate(() => document.getElementById('pause-btn').click()); await page.clock.runFor(400);
    assert.equal(await page.locator('#pause-levels').innerText(), 'Hall', `${key}: the Paused card offers the Hall`);
    await page.evaluate(() => document.getElementById('pause-levels').click()); await page.clock.runFor(400);
    assert.equal(await page.evaluate(() => document.body.dataset.view), 'hall', `${key}: and goes back to it`);
    // A lost rematch's only way back besides Rematch is the result card's text link, so it reads at 4.5:1 there.
    const linkRatio = await page.evaluate(() => {
      const lum = rgb => { const c = rgb.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
      const a = lum(getComputedStyle(document.getElementById('result-garden-btn')).color), b = lum(getComputedStyle(document.getElementById('result-dialog')).backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    assert(linkRatio >= 4.5, `${key}: the result card's Hall link reads at 4.5:1 (${linkRatio.toFixed(2)})`);
    await page.evaluate(() => sessionStorage.removeItem('qa-hall'));
    }
    await page.goto('http://localhost/?qa', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#depth-unlock').scrollIntoViewIfNeeded();
    const previews = await page.locator('#depth-unlock .depth-preview').count();
    assert.equal(previews, 6, `${key}: all six actual paid-level scenes are previewed`);
    assert.equal(await page.locator('#depth-unlock .depth-preview img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 100).length), 6, `${key}: all previews loaded`);
    const offer = await page.locator('#depth-unlock').boundingBox();
    assert(offer.width <= size.width && offer.x >= 0 && offer.x + offer.width <= size.width, `${key}: offer fits without horizontal overflow`);
    rows.push({ size: key, label: 'Six actual deeper-level previews', previews, offer });
    await page.locator('#depth-unlock').screenshot({ path: path.join(output, `${key}-deeper-preview.png`) });
    console.log(`Checked ${key}: ${previewOnly ? '' : 'campaign, Moon, Koi, tutorial and '}six-scene preview`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  const endHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(file)]));
  assert.deepEqual(endHashes, startHashes, 'tested source stayed unchanged');
  fs.writeFileSync(path.join(output, previewOnly ? 'PREVIEW-RESULTS.json' : sizeFilter ? `RESULTS-${sizeFilter}.json` : 'RESULTS.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: rows.length, failed: 0, sourceHashes: startHashes, scope: previewOnly ? 'Real Chromium; six actual deeper-level scene previews at selected widths. No real phone or purchase test.' : 'Real Chromium; all ten campaign levels at waves 1/10, every authored Moon/Koi board, seven tutorial lessons via actual controls, six actual deeper-level previews; selected sizes with synthetic safe areas. No real phone or purchase test.', rows }, null, 2) + '\n');
  console.log(`PASS: ${rows.length} real-browser layout checks at ${sizes.map(s => s.width + 'x' + s.height).join(', ')}`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
