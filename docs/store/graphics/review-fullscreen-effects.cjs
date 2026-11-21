'use strict';
// Isolates light layers at one real, paused game state. Never changes the shipping game.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../../..'), gameRoot = path.join(root, 'bloomshot');
const output = path.resolve(process.argv[2] || path.join(root, '../../outputs/bloomshot-fullscreen-effects'));
const baseline = process.argv[3] ? fs.readFileSync(path.resolve(process.argv[3]), 'utf8') : null;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sources = Object.fromEntries(fs.readdirSync(gameRoot).filter(name => /\.(?:js|css|html)$/.test(name)).map(name => [name, fs.readFileSync(path.join(gameRoot, name))]));
const sourceHashes = Object.fromEntries(Object.entries(sources).map(([name, value]) => [name, sha(value)]));
let browser;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') return route.abort();
    const file = path.resolve(gameRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
    let body = fs.readFileSync(file);
    if (path.basename(file) === 'app.js') body = body.toString().replace(/\}\)\(\);\s*$/, 'window.__effectsReview = { startDepth, state: () => game };\n})();');
    if (path.basename(file) === 'art.js') body = body.toString().replace('root.BloomArt = { draw,', 'root.BloomArt = { effectsReview: { drawTempo, drawFeelOverlay, drawAtmosphere }, draw,');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body });
  });
  await page.addInitScript(() => {
    let seed = 0x42b10; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const depths = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { stars: 3, best: 0, wave: 10 }]));
    localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, depths, tutorial: true, powersMet: true, podMet: true, settings: { sound: false, music: false, motion: true } }));
    localStorage.setItem('bloomshot.mockstore.v1', JSON.stringify({ v: 1, owned: ['levels_full'], bought: ['bloomshot.levels.full'], txs: [] }));
  });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-12T12:00:05Z'));
  await page.goto('http://localhost/?qa&mockstore', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { const draw = BloomArt.draw; window.__productionDraw = draw; BloomArt.draw = (ctx, state, time, options) => { window.__lastArt = { ctx, state, time, options: { ...options } }; return draw(ctx, state, time, options); }; });
  await page.clock.runFor(400);
  await page.evaluate(() => __effectsReview.startDepth(7, false, 8)); await page.clock.runFor(2200);
  const point = await page.evaluate(() => { const bud = __effectsReview.state().buds.filter(b => !b.bloomed && !b.boss && !b.gift).sort((a, b) => b.y - a.y)[0]; return { x: bud.x, y: bud.y }; });
  const board = await page.locator('#game-canvas').boundingBox();
  const pointer = async (x, y, down) => { await page.mouse.move(board.x + x / 420 * board.width, board.y + y / 560 * board.height); if (down) await page.mouse.down(); else await page.mouse.up(); };
  await pointer(point.x, point.y, true); await page.clock.runFor(250); await pointer(point.x, point.y, false); await page.clock.runFor(460);
  await pointer(310, 140, true); await page.clock.runFor(250);
  const state = await page.evaluate(() => { const { state, time, options } = __lastArt; window.__reviewArt = BloomArt; return { time, options, tempo: state.tempo, feverTime: state.feverTime, superBloom: state.superBloom, snapshot: bloomshotState }; });
  const captures = [];
  const capture = async name => { const file = path.join(output, name + '.png'); await sharp(await page.screenshot({ scale: 'device' })).flatten({ background: '#fff' }).removeAlpha().png().toFile(file); captures.push({ file: path.basename(file), sha256: sha(fs.readFileSync(file)) }); };
  await capture('01-current');
  for (const variant of ['no-flash', 'no-tempo', 'neither']) {
    await page.evaluate(variant => { const f = __lastArt; f.ctx.clearRect(0, 0, 420, 560); const state = variant === 'no-flash' ? f.state : Object.assign(Object.create(Object.getPrototypeOf(f.state)), f.state); if (variant !== 'no-flash') Object.defineProperty(state, 'tempo', { value: 1 }); __productionDraw(f.ctx, state, f.time, { ...f.options, flash: variant === 'no-tempo' ? f.options.flash : 0 }); }, variant);
    await capture('02-' + variant);
  }
  if (baseline) {
    await page.evaluate(source => { (0, eval)(source); window.__baselineArt = BloomArt; BloomArt = __reviewArt; }, baseline);
    await page.evaluate(() => { const f = __lastArt; f.ctx.clearRect(0, 0, 420, 560); __baselineArt.draw(f.ctx, f.state, f.time, f.options); }); await capture('03-before-same-state');
    await page.evaluate(() => { const f = __lastArt; f.ctx.clearRect(0, 0, 420, 560); __productionDraw(f.ctx, f.state, f.time, f.options); }); await capture('04-after-same-state');
  }
  // Transparent-pixel probes isolate effects from all flowers, colliders and UI.
  const probes = await page.evaluate(() => {
    const results = [], make = () => { const c = document.createElement('canvas'); c.width = 420; c.height = 560; return c; };
    for (const [version, art] of [['current', __reviewArt], ...(window.__baselineArt ? [['before', __baselineArt]] : [])]) {
      for (const effect of ['flash', 'tempo', 'last-life', 'lost-life', 'mint', 'vignette', 'gold', 'fever', 'lullaby']) {
        const canvas = make(), ctx = canvas.getContext('2d'), state = { mode: 'rush', status: 'playing', buds: [], balls: [], particles: [], floaters: [], aim: [], pending: [], bumpers: [], tempo: effect === 'tempo' ? 2 : 1, lives: 3, superBloom: effect === 'gold' ? 3 : 0, feverTime: effect === 'fever' ? 3 : 0, dangerY: 448, launcher: { x: 210, y: 498 } };
        state.lullaby = effect === 'lullaby' ? 3 : 0;
        const options = { backdrop: false, reducedMotion: false, theme: 'depth-ember', showAim: false, flash: effect === 'flash' ? .8 : 0, vignette: effect === 'vignette' ? .8 : 0, danger: { lastLife: effect === 'last-life', redFlash: effect === 'lost-life' ? 1 : 0, mintFlash: effect === 'mint' ? 1 : 0 } };
        art.draw(ctx, state, 5, options);
        const pixels = ctx.getImageData(0, 0, 420, 560).data, points = [[0, 0], [210, 0], [419, 0], [0, 280], [419, 280], [0, 559], [210, 559], [419, 559]];
        results.push({ version, effect, edgeAlpha: points.map(([x, y]) => pixels[(y * 420 + x) * 4 + 3]), centerAlpha: pixels[(280 * 420 + 210) * 4 + 3] });
      }
    }
    return results;
  });
  for (const probe of probes.filter(probe => probe.version === 'current')) if (probe.edgeAlpha.some(alpha => alpha !== 0)) throw new Error(`Fullscreen ${probe.effect} light has a hard edge: ${probe.edgeAlpha}`);
  for (const [name, hash] of Object.entries(sourceHashes)) if (sha(fs.readFileSync(path.join(gameRoot, name))) !== hash) throw new Error('Source changed during review: ' + name);
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { capturedAt: new Date().toISOString(), sourceHashes, baselineSha256: baseline && sha(baseline), browser: await browser.version(), method: 'One actual paused Ember Hollows state. Capture-only hooks replay that exact state, time and options while isolating flash and tempo. Pixel probes use empty diagnostic boards, never store uploads or device evidence.', board, state, probes, captures, errors };
  fs.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, state: { time: state.time, flash: state.options.flash, tempo: state.tempo }, probes, captures: captures.length, errors }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
