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
  { width: 360, height: 640, top: 24, bottom: 24 }
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
    const key = `${size.width}x${size.height}`, context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
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
        const ids = ['game-canvas', 'scene-canvas', 'back-btn', 'sound-btn', 'help-btn', 'settings-btn', 'game-hint', 'rotate-btn', 'split-btn', 'restart-btn', 'tutorial-card'];
        const rects = Object.fromEntries(ids.map(id => { const el = document.getElementById(id), r = el?.getBoundingClientRect(); return [id, visible(el) && r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null]; }));
        const powerRects = [...document.querySelectorAll('.power-chip')].filter(visible).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        return { rects, powerRects, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, route: document.body.dataset.view, tutorial: document.body.dataset.tutorial };
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
        for (const id of ['rotate-btn', 'split-btn', 'restart-btn']) if (state.rects[id]) assert(!intersect(board, state.rects[id]), `${key} ${label}: ${id} clear of the board`);
        for (const r of state.powerRects) { assert(r.width >= 44 && r.height >= 44, `${key} ${label}: 44px power target`); assert(!intersect(board, r), `${key} ${label}: power target clear of board`); }
      } else {
        const card = state.rects['tutorial-card']; assert(card, `${key} ${label}: tutorial card visible`);
        for (const r of state.powerRects) if (label.includes('power:')) assert(!intersect(card, r), `${key} ${label}: lesson leaves power target exposed`);
      }
      rows.push({ size: key, safeTop: size.top, safeBottom: size.bottom, label, ...state });
    };
    if (!previewOnly) {
    for (let level = 1; level <= 10; level++) for (const wave of [1, 10]) {
      await page.evaluate(({ level, wave }) => window.__layoutQA.startDepth(level, false, wave), { level, wave });
      await page.clock.runFor(2200); await geometry(`Level ${level}, wave ${wave}`);
      if (level === 1 && wave === 1) await page.screenshot({ path: path.join(output, `${key}-sunny.png`) });
      if (level === 10 && wave === 10) await page.screenshot({ path: path.join(output, `${key}-starseed.png`) });
    }
    for (const chapter of chapters) for (const level of chapter.levels) {
      await page.evaluate(level => window.__layoutQA.startLevel(level), level);
      await page.clock.runFor(300); await geometry(level.name);
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
