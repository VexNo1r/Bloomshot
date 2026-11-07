'use strict';
// Current app, real map controls and one real touch per encounter. No source/state hooks or fake pieces.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.resolve(process.argv[2] || path.join(root, '../../../outputs/bloomshot-boss-ui-feedback'));
const sourceFiles = fs.readdirSync(root).filter(name => /\.(?:js|css|html)$/.test(name));
const sources = Object.fromEntries(sourceFiles.map(name => [name, fs.readFileSync(path.join(root, name))]));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(Object.entries(sources).map(([name, bytes]) => [name, sha(bytes)]));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const rows = [], errors = [], external = [], screenshots = []; let browser;
const intersect = (a, b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1 && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1;
const inside = (r, width, height) => r.x >= -.6 && r.y >= -.6 && r.x + r.width <= width + .6 && r.y + r.height <= height + .6;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 664 }]) {
    const key = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ size: key, error: error.message }));
    page.on('console', message => { if (message.type() === 'error') errors.push({ size: key, error: message.text() }); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://localhost') { external.push(url.origin); return route.abort(); }
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1), file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Missing asset' });
      return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: sources[name] || fs.readFileSync(file) });
    });
    await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-15T12:00:05Z'));
    await page.goto('http://localhost/?alllevels&bosses', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready); await page.clock.runFor(400);
    // A fresh phone sees the normal tutorial. Skip via its real control, with no seeded storage.
    if (await page.locator('#tutorial-skip').isVisible()) { await page.locator('#tutorial-skip').click(); await page.clock.runFor(400); }
    assert.equal((await page.evaluate(() => window.bloomshotState)).route, 'levels', key + ' normal map');
    if (await page.locator('#sound-btn').getAttribute('aria-pressed') === 'true') { await page.locator('#sound-btn').click(); await page.clock.runFor(100); }
    for (let level = 1; level <= 10; level++) {
      await page.locator(`[data-depth="${level}"]`).click(); await page.clock.runFor(2200);
      const initial = await page.evaluate(() => window.bloomshotState);
      assert(initial.reviewAll && initial.reviewBosses && initial.level === level && initial.wave === 10 && !initial.started, `${key} L${level}: real card opens a waiting boss`);
      const bounds = await page.locator('#game-canvas').boundingBox();
      // One diagonal first touch avoids deliberately targeting the Fossil mouth's critical latch.
      await page.touchscreen.tap(bounds.x + 60 / 420 * bounds.width, bounds.y + 248 / 560 * bounds.height);
      await page.clock.runFor(100);
      assert((await page.evaluate(() => window.bloomshotState)).started, `${key} L${level}: first touch starts physics`);
      let current;
      for (let elapsed = 0; elapsed < 30000; elapsed += 100) {
        current = await page.evaluate(() => ({ state: window.bloomshotState, hint: document.getElementById('game-hint').textContent }));
        const warning = current.state.bossWarning;
        if (warning?.flowerText && warning.targets.some(target => target.effect) && current.hint === warning.flowerText) break;
        assert(current.state.status !== 'lost' && current.state.status !== 'won', `${key} L${level}: encounter survives until its first flower tell`);
        await page.clock.runFor(100);
      }
      assert(current.state.bossWarning?.flowerText && current.hint === current.state.bossWarning.flowerText, `${key} L${level}: exact flower effect appears in the hint`);
      const geometry = await page.evaluate(() => {
        const snapshot = window.bloomshotState, warning = snapshot.bossWarning, canvas = document.getElementById('game-canvas'), board = canvas.getBoundingClientRect();
        const rect = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
        const visible = el => el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
        const hint = document.getElementById('game-hint'), range = document.createRange(); range.selectNodeContents(hint);
        const controls = [...document.querySelectorAll('#back-btn,#sound-btn,#help-btn,#settings-btn,#rotate-btn,#split-btn,#restart-btn,.power-chip')].filter(visible).map(el => ({ id: el.id || el.dataset.power, ...rect(el.getBoundingClientRect()) }));
        const map = (x, y, width, height) => ({ x: board.x + x / 420 * board.width, y: board.y + y / 560 * board.height, width: width / 420 * board.width, height: height / 560 * board.height });
        const targets = warning.targets.filter(target => target.effect).map(target => ({ id: target.id, kind: target.effect, live: snapshot.buds.find(bud => bud.id === target.id && !bud.bloomed), box: map(target.x - target.r - 11, target.y - target.r - 11, (target.r + 11) * 2, (target.r + 11) * 2), echo: Number.isFinite(target.echoX) ? map(target.echoX - target.echoR - 2, target.echoY - target.echoR - 2, target.echoR * 2 + 4, target.echoR * 2 + 4) : null }));
        // Locate the existing Canvas warning label, then inspect its actual painted background pixels.
        const ctx = canvas.getContext('2d'); ctx.save(); ctx.font = '600 12px Fredoka';
        const width = Math.min(310, Math.max(130, ctx.measureText(warning.text).width + 28)); ctx.restore();
        const x = Math.max(width / 2 + 10, Math.min(410 - width / 2, warning.x)), y = Math.max(45, Math.min(395, warning.y + 61));
        const sx = canvas.width / 420, sy = canvas.height / 560;
        const pixelBox = { x: Math.max(0, Math.floor((x - width / 2 + 5) * sx)), y: Math.max(0, Math.floor((y - 9) * sy)), width: Math.max(1, Math.floor((width - 10) * sx)), height: Math.max(1, Math.floor(18 * sy)) };
        const pixels = ctx.getImageData(pixelBox.x, pixelBox.y, pixelBox.width, pixelBox.height).data;
        let cream = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 225 && pixels[i + 1] > 200 && pixels[i + 2] > 160 && pixels[i + 3] > 180) cream++;
        const banner = map(x - width / 2, y - 13, width, 26);
        return { hint: { text: hint.textContent, visible: Boolean(visible(hint)), ...rect(hint.getBoundingClientRect()), textRects: [...range.getClientRects()].map(rect), scrollHeight: hint.scrollHeight, clientHeight: hint.clientHeight }, board: rect(board), controls, targets, banner, bannerPaintFraction: cream / (pixels.length / 4), viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth, warningText: warning.text, flowerText: warning.flowerText, warningAt: warning.at, warningUntil: warning.until, ariaAnnouncement: document.getElementById('announcement').textContent };
      });
      assert.equal(geometry.scrollWidth, viewport.width, `${key} L${level}: no horizontal overflow`);
      assert.equal(geometry.hint.visible, false, `${key} L${level}: redundant bottom hint stays hidden`);
      assert.equal(geometry.hint.height, 0, `${key} L${level}: bottom hint reserves no board space`);
      assert(inside(geometry.banner, viewport.width, viewport.height), `${key} L${level}: main warning label inside screen`);
      assert(geometry.bannerPaintFraction > .2, `${key} L${level}: main warning label is actually painted`);
      assert(geometry.targets.length > 0, `${key} L${level}: real affected targets exist`);
      for (const control of geometry.controls) {
        assert(!intersect(geometry.hint, control), `${key} L${level}: hint clear of ${control.id}`);
        assert(!intersect(geometry.banner, control), `${key} L${level}: main banner clear of ${control.id}`);
      }
      for (const target of geometry.targets) {
        assert(target.live && inside(target.box, viewport.width, viewport.height), `${key} L${level}: live ${target.id} warning fits`);
        for (const control of geometry.controls) assert(!intersect(target.box, control), `${key} L${level}: ${target.id} clear of ${control.id}`);
        assert(!intersect(target.box, geometry.hint), `${key} L${level}: target is not covered by hint`);
        if (target.echo) assert(inside(target.echo, viewport.width, viewport.height), `${key} L${level}: Core destination visible`);
      }
      assert(geometry.ariaAnnouncement.includes(geometry.flowerText), `${key} L${level}: accessible announcement includes exact effect`);
      rows.push({ size: key, level, checks: 10, ...geometry });
      if (level === 1 || level === 3) {
        const file = `${key}-level-${level}-flower-warning.png`;
        await page.screenshot({ path: path.join(output, file), scale: 'device' }); screenshots.push(file);
      }
      await page.locator('#back-btn').click(); await page.clock.runFor(250);
      assert.equal((await page.evaluate(() => window.bloomshotState)).route, 'levels');
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('bloomshot.save.v1')), null, key + ' normal progress untouched');
    await context.close(); console.log(`Checked all ten boss effect hints at ${key}`);
  }
  assert.deepEqual(errors, [], 'no browser errors'); assert.deepEqual(external, [], 'no outside service calls');
  for (const [name, hash] of Object.entries(sourceHashes)) assert.equal(sha(fs.readFileSync(path.join(root, name))), hash, 'source stayed frozen: ' + name);
  const report = { passed: rows.length, failed: 0, sourceHashes, browser: await browser.version(), method: 'Actual ?alllevels&bosses navigation from fresh profiles; tutorial skipped with its real button, real level cards and one touchscreen tap per encounter. Virtual time reaches each first flower-effect tell. Main Canvas warning is visibly painted, targets and controls do not overlap, the bottom hint stays hidden, and the accessible announcement includes the flower effect. Existing read-only state only; no source hooks, seeded saves or fabricated pieces. Desktop Chromium viewport checks, not a physical iPhone test.', actualPhoneVerified: false, screenshots, errors, rows };
  fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: rows.length, screenshots, errors }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
