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
function intersect(a, b) { return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1 && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1; }
async function main() {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
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
      localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, tutorial: true, powersMet: true, podMet: true, settings: { sound: false, music: false, haptics: false, motion: true } }));
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
    assert(map.first.y + map.first.height <= map.nav.y + .6, `${key}: first level sits above the bottom bar ${JSON.stringify(map)}`);
    // One ladder going down, each level under the last; a touch screen fills the screen, a desktop mouse keeps the 440 px shell.
    assert(map.cards.length >= 10 && map.cards.every((r, i) => Math.abs(r.x - map.cards[0].x) < .6 && (!i || r.y > map.cards[i - 1].y + map.cards[i - 1].height)), `${key}: single descending ladder`);
    assert.equal(map.coarse, !size.desktop, `${key}: pointer matches the device`);
    if (size.desktop) { assert.equal(map.shell.width, 440, `${key}: desktop keeps the phone-sized shell`); assert.deepEqual(map.notes, [true, true], `${key}: desktop notes beside it`); }
    else { assert.equal(map.shell.width, size.width, `${key}: the menus fill the screen`); assert.deepEqual(map.notes, [false, false], `${key}: no desktop notes on a touch screen`); }
    rows.push({ size: key, safeTop: size.top, safeBottom: size.bottom, label: 'Levels map', ...map });
    await longToast('Levels map');
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
        clipped: [...document.querySelectorAll('#guide-list .guide-name, #guide-list .guide-line')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent),
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
          clipped: [...document.querySelectorAll('#guide-list .guide-name, #guide-list .guide-line')].filter(el => el.scrollWidth > el.clientWidth + .5).map(el => el.textContent) };
      });
      assert.equal(narrow.scrollWidth, narrow.clientWidth, `280x${size.height} Who's who: no sideways scroll in the dialog`);
      assert.equal(narrow.page, 280, `280x${size.height} Who's who: no horizontal overflow`); assert(narrow.right <= 280.6, `280x${size.height} Who's who: the dialog stays on screen`);
      assert.deepEqual(narrow.outside, [], `280x${size.height} Who's who: cards inside the dialog`); assert.deepEqual(narrow.clipped, [], `280x${size.height} Who's who: no clipped names or lines`);
      rows.push({ size: `280x${size.height}`, label: "Who's who, narrow", ...narrow });
      await page.locator('#help-dialog').screenshot({ path: path.join(output, `${key}-guide-280.png`) });
      await page.setViewportSize({ width: size.width, height: size.height }); await page.clock.runFor(500);
    }
    await page.evaluate(() => { document.getElementById('guide-help').open = false; document.getElementById('levels-help').open = true; document.getElementById('help-dialog').close(); });
    for (let level = 1; level <= 10; level++) for (const wave of [1, 10]) {
      await page.evaluate(({ level, wave }) => window.__layoutQA.startDepth(level, false, wave), { level, wave });
      await page.clock.runFor(2200); await geometry(`Level ${level}, wave ${wave}`);
      if (level === 1 && wave === 1) { await page.screenshot({ path: path.join(output, `${key}-sunny.png`) }); await longToast('Level 1 in play'); }
      if (level === 10 && wave === 10) await page.screenshot({ path: path.join(output, `${key}-starseed.png`) });
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
