'use strict';
// Actual Chromium controls in disposable profiles: no QA start hooks, store mock or player data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.resolve(__dirname, '../../../../outputs/bloomshot-user-flows');
const files = fs.readdirSync(root).filter(name => /\.(js|html|css)$/.test(name));
const hashes = () => Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
const before = hashes(), rows = [], errors = [], external = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let browser;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage(), key = `${viewport.width}x${viewport.height}`;
    page.on('pageerror', error => errors.push({ size: key, message: error.message }));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') { external.push(url.origin); await route.abort(); return; }
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404 }); return; }
      await route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem('bloomshot.qa.v1')) localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, tutorial: true, settings: { sound: false, music: false, motion: true, haptics: false } }));
      localStorage.setItem('bloomshot.save.v1', 'normal-player-save-is-untouched');
    });
    await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-14T12:00:05Z'));
    const advance = ms => page.clock.runFor(ms);
    const click = async selector => { await page.locator(selector).click(); await advance(400); };
    const state = () => page.evaluate(() => window.bloomshotState);
    const check = (label, condition) => { assert(condition, `${key}: ${label}`); rows.push({ size: key, label }); };
    await page.goto('http://localhost/?qa', { waitUntil: 'networkidle' }); await advance(1500);
    check('fresh map opens', (await state()).route === 'levels');
    await click('[data-depth="2"]'); check('locked level does not start', (await state()).route === 'levels');
    await click('[data-depth="1"]'); await advance(1800);
    check('actual level button starts level one', (await state()).level === 1 && (await state()).route === 'game');
    await page.locator('#game-canvas').focus(); await page.keyboard.press('Space'); await advance(250);
    check('keyboard launches a seed', (await state()).started && (await state()).balls > 0);
    const board = await page.locator('#game-canvas').boundingBox();
    await page.mouse.move(board.x + board.width * .3, board.y + board.height * .35);
    await page.mouse.down(); await advance(100); await page.mouse.up(); await advance(150);
    check('touch-style aim/release keeps play active', (await state()).status === 'flying');
    await click('#settings-btn'); const stopped = await state(); await advance(2500);
    check('settings pauses falling flowers', (await state()).elapsed === stopped.elapsed && JSON.stringify((await state()).buds) === JSON.stringify(stopped.buds));
    await click('#privacy-btn');
    check('privacy opens inside app', await page.locator('#privacy-dialog').evaluate(el => el.open));
    const policy = await page.frameLocator('#privacy-dialog iframe').locator('body').innerText();
    check('policy has owner-confirmed email and date', policy.includes('hello@harborlineleadrecovery.com') && policy.includes('October 14, 2026'));
    await click('#close-privacy'); await click('#toggle-motion'); await click('#close-settings'); await advance(500);
    check('animation preference persists', await page.evaluate(() => JSON.parse(localStorage.getItem('bloomshot.qa.v1')).settings.motion === false));
    const pixels = await page.locator('#life-canvas').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; for (let i = 3; i < data.length; i += 4) if (data[i]) return true; return false; });
    check('animation-off removes scene visitors', !pixels);
    check('closing settings resumes play', (await state()).elapsed > stopped.elapsed);
    await click('#help-btn'); check('help opens during play', await page.locator('#help-dialog').evaluate(el => el.open));
    await page.keyboard.press('Escape'); await advance(250);
    check('Escape dismisses help', !await page.locator('#help-dialog').evaluate(el => el.open));
    await click('#back-btn'); check('exit returns to map', (await state()).route === 'levels');
    await click('#resume-btn'); check('resume restores the active level', (await state()).route === 'game' && (await state()).level === 1);
    await click('#back-btn'); await click('#garden-btn'); check('garden navigation works', (await state()).route === 'garden');
    await click('#puzzle-section summary'); await click('[data-level="1"]'); check('garden puzzle starts from its card', (await state()).route === 'game' && (await state()).level === 1);
    await click('#back-btn'); await click('#collection-btn'); check('collection opens', (await state()).route === 'collection');
    for (const world of ['moon', 'koi']) {
      await click('#worlds-btn'); await click(`[data-world="${world}"]`);
      check(`${world} details open`, await page.locator('#world-dialog').evaluate(el => el.open));
      await click('#world-preview-btn'); await advance(500);
      check(`${world} free board starts`, (await state()).route === 'game' && String((await state()).level).startsWith(world + '-'));
      await click('#back-btn');
    }
    await click('#rush-btn'); await click('#levels-rush-btn'); await advance(1500);
    check('endless Rush starts', (await state()).route === 'game' && (await state()).level === 'rush');
    const rushBoard = await page.locator('#game-canvas').boundingBox(), target = (await state()).buds.find(bud => !bud.bloomed && !bud.gift);
    await page.mouse.click(rushBoard.x + target.x / 420 * rushBoard.width, rushBoard.y + target.y / 560 * rushBoard.height); await advance(2000);
    check('an aimed shot earns real progress', (await state()).score > 0);
    await click('#restart-btn'); check('restart asks before discarding a run', await page.locator('body').getAttribute('data-restart') === 'armed');
    await click('#restart-btn'); check('confirmed restart resets the run', !(await state()).started && (await state()).wave === 1);
    await page.goto('http://localhost/?qa&alllevels', { waitUntil: 'networkidle' }); await advance(300);
    await click('[data-depth="10"]'); check('review link opens final level', (await state()).level === 10 && (await state()).reviewAll);
    await page.screenshot({ path: path.join(output, `${key}-final-level.png`) });
    await page.goto('http://localhost/?qa&alllevels&bosses', { waitUntil: 'networkidle' }); await advance(300);
    await click('[data-depth="1"]'); check('boss-review link starts a real guardian encounter', (await state()).wave === 10 && (await state()).bossReached && (await state()).reviewBosses);
    await page.goto('http://localhost/?qa', { waitUntil: 'networkidle' }); await advance(300);
    check('reload keeps animation preference', await page.evaluate(() => document.body.classList.contains('reduce-motion')));
    check('review and QA never overwrite normal progress', await page.evaluate(() => localStorage.getItem('bloomshot.save.v1') === 'normal-player-save-is-untouched'));
    check('all screens fit without horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    await context.close(); console.log(`Checked real controls at ${key}`);
  }
  assert.deepEqual(errors, [], 'no browser runtime exceptions'); assert.deepEqual(external, [], 'no external service or tracking requests');
  assert.deepEqual(hashes(), before, 'verified sources stayed unchanged');
  fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify({ passed: rows.length, failed: 0, sourceHashes: before, scope: 'Real Chromium controls at phone/tablet size in disposable profiles; no physical iPhone or native-store test.', rows }, null, 2) + '\n');
  console.log(`PASS: ${rows.length} real-control checks`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
