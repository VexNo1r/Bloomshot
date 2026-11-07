#!/usr/bin/env node
'use strict';

// Captures the shipping game in a fresh, disposable browser profile. No game files are changed.
// Dependencies: playwright, sharp; Chromium (BLOOMSHOT_CHROME or installed Google Chrome).
// NODE_PATH may point at the Codex bundled node_modules directory.
// Run from any directory: node docs/store/graphics/capture-google-play.cjs [target] [draft-output-root]
// Targets: google-play (default), apple-iphone-1290, apple-iphone-large, apple-iphone-medium,
// apple-ipad-13. The 1290 target is the requested ten-level set; Play contains eight images.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../../..');
const gameRoot = path.join(root, 'bloomshot');
const target = process.argv[2] || 'google-play';
const draftOutputRoot = process.argv[3] ? path.resolve(process.argv[3]) : null;
const profiles = {
  'google-play': { output: 'google-play', width: 432, height: 768, dpr: 2.5, pixels: [1080, 1920] },
  'apple-iphone-1290': { output: 'apple/iphone-1290', width: 430, height: 932, dpr: 3, pixels: [1290, 2796] },
  'apple-iphone-large': { output: 'apple/iphone-large', width: 440, height: 956, dpr: 3, pixels: [1320, 2868] },
  'apple-iphone-medium': { output: 'apple/iphone-medium', width: 402, height: 874, dpr: 3, pixels: [1206, 2622] },
  'apple-ipad-13': { output: 'apple/ipad-13', width: 1032, height: 1376, dpr: 2, pixels: [2064, 2752] }
};
const profile = profiles[target];
if (!profile) throw new Error(`Unknown capture target: ${target}`);
const output = path.join(draftOutputRoot || __dirname, profile.output);
const chrome = process.env.BLOOMSHOT_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const sourceCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (process.env.BLOOMSHOT_SOURCE_COMMIT && sourceCommit !== process.env.BLOOMSHOT_SOURCE_COMMIT) throw new Error('The requested frozen source commit is not checked out.');
const gameSourceMatchesCommit = cp.spawnSync('git', ['diff', '--quiet', sourceCommit, '--', 'bloomshot'], { cwd: root }).status === 0;
if (draftOutputRoot && !gameSourceMatchesCommit) throw new Error('Draft captures require the game files to match the recorded source commit.');
const source = fs.readFileSync(path.join(gameRoot, 'app.js'), 'utf8');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes = Object.fromEntries(fs.readdirSync(gameRoot).filter(name => /\.(?:js|html|css)$/.test(name)).map(name => [name, sha256(path.join(gameRoot, name))]));
const levelScenes = [
  { level: 1, wave: 1, slug: 'sunny-meadow', name: 'Sunny Meadow' },
  { level: 2, wave: 4, slug: 'root-tunnels', name: 'Root Tunnels' },
  { level: 3, wave: 6, slug: 'mushroom-grotto', name: 'Mushroom Grotto' },
  { level: 4, wave: 3, slug: 'crystal-caves', name: 'Crystal Caves' },
  { level: 5, wave: 4, slug: 'glowworm-lake', name: 'Glowworm Lake' },
  { level: 6, wave: 10, slug: 'fossil-beds', name: 'Fossil Beds' },
  { level: 7, wave: 8, slug: 'ember-hollows', name: 'Ember Hollows' },
  { level: 8, wave: 6, slug: 'geode-mine', name: 'Geode Mine' },
  { level: 9, wave: 7, slug: 'briar-vault', name: 'Briar Vault' },
  { level: 10, wave: 10, slug: 'starseed-core', name: 'Starseed Core', power: 'dandelion' }
];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let browser;

async function main() {
  fs.mkdirSync(output, { recursive: true });
  if (draftOutputRoot && target === 'google-play') fs.copyFileSync(path.join(__dirname, 'google-play/icon-512.png'), path.join(output, 'icon-512.png'));
  const origin = 'http://localhost';
  browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.dpr, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Expose the existing start function and live state only to this capture browser. Wave layouts, art,
  // physics, effects and UI are the production code. The served file and the repo remain unchanged.
  // Fulfill all localhost requests from repository bytes: this also works in sandboxes without local
  // TCP access, keeps captures offline, and prevents loading a stale service-worker copy.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    const file = path.resolve(gameRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404, body: 'Not found' }); return; }
    const body = file === path.join(gameRoot, 'app.js') ? source.replace(/\}\)\(\);\s*$/, 'window.__storeCapture = { startDepth, state: () => game };\n})();') : fs.readFileSync(file);
    await route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body });
  });
  await page.addInitScript(() => {
    let seed = 0x42b10;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const depths = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { stars: 3, best: 0, wave: 10 }]));
    localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, depths, tutorial: true, powersMet: true, podMet: true, settings: { sound: true, music: true, haptics: false, motion: true } }));
    localStorage.setItem('bloomshot.mockstore.v1', JSON.stringify({ v: 1, owned: ['levels_full'], bought: ['bloomshot.levels.full'], txs: [] }));
  });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-12T12:00:05Z'));
  await page.goto(`${origin}/?qa&mockstore`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const captures = [], extras = [];
  const capture = async (name, description, list = captures) => {
    const state = await page.evaluate(() => window.bloomshotState);
    if (!name.includes('level-map') && (!state.started || state.route !== 'game')) throw new Error(`Gameplay capture did not launch a real shot: ${name}`);
    const file = path.join(output, name), png = await page.screenshot({ animations: 'allow', scale: 'device' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp(png).flatten({ background: '#fff' }).removeAlpha().png().toFile(file);
    const metadata = await sharp(file).metadata();
    if (metadata.width !== profile.pixels[0] || metadata.height !== profile.pixels[1] || metadata.channels !== 3 || metadata.hasAlpha) throw new Error(`Wrong PNG format: ${name}`);
    list.push({ file: name, description, width: metadata.width, height: metadata.height, channels: metadata.channels, sha256: sha256(file), state });
  };
  await page.clock.runFor(400);
  if (!draftOutputRoot && target === 'google-play') await capture('extras/level-map.png', 'Optional campaign map, going from Sunny Meadow underground. QA profile has prior clears.', extras);
  else if (!draftOutputRoot && target !== 'apple-iphone-1290') await capture('phone-1-level-map.png', 'Campaign map, going from Sunny Meadow underground. QA profile has prior clears.');
  const start = async (level, wave = 1) => { await page.evaluate(({ level, wave }) => window.__storeCapture.startDepth(level, false, wave), { level, wave }); await page.clock.runFor(2200); };
  const pointer = async (x, y, down) => {
    const bounds = await page.locator('#game-canvas').boundingBox();
    await page.mouse.move(bounds.x + x / 420 * bounds.width, bounds.y + y / 560 * bounds.height);
    if (down) await page.mouse.down(); else await page.mouse.up();
  };
  const shoot = async (x, y, after) => { await pointer(x, y, true); await page.clock.runFor(250); await pointer(x, y, false); await page.clock.runFor(after); };
  const renderScene = async scene => {
    await start(scene.level, scene.wave);
    if (scene.power) await page.locator(`[data-power="${scene.power}"]`).click();
    const targetBud = await page.evaluate(() => window.__storeCapture.state().buds.filter(bud => !bud.bloomed && !bud.boss && !bud.gift).sort((a, b) => b.y - a.y)[0]);
    await shoot(targetBud ? targetBud.x : 210, targetBud ? targetBud.y : 130, scene.power ? 330 : 460);
    await pointer(scene.level % 2 ? 310 : 105, 140, true);
    await page.clock.runFor(250);
  };
  const capturePair = async (name, pairedScenes) => {
    const sources = [];
    for (const scene of pairedScenes) {
      await renderScene(scene);
      const state = await page.evaluate(() => window.bloomshotState);
      if (!state.started || state.route !== 'game') throw new Error(`Composite source did not launch a shot: ${scene.name}`);
      const sourceName = `source-captures/level-${String(scene.level).padStart(2, '0')}-${scene.slug}.png`, sourceFile = path.join(output, sourceName);
      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
      await sharp(await page.screenshot({ scale: 'device' })).flatten({ background: '#fff' }).removeAlpha().png().toFile(sourceFile);
      // Element screenshots are composited browser pixels, including the true full-viewport scene behind
      // the transparent foreground canvas. This is a crop of actual play, never a reconstructed board.
      const board = await page.locator('#game-canvas').screenshot({ scale: 'device' });
      sources.push({ file: sourceName, sha256: sha256(sourceFile), level: scene.level, wave: scene.wave, name: scene.name, state, boardData: 'data:image/png;base64,' + board.toString('base64') });
      await page.mouse.up();
    }
    const data = await page.evaluate(async sources => {
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
      const c = canvas.getContext('2d', { alpha: false }); c.fillStyle = '#fff9ed'; c.fillRect(0, 0, 1080, 1920);
      for (let index = 0; index < sources.length; index++) {
        const image = new Image(); image.src = sources[index].boardData; await image.decode();
        const x = 210, y = index ? 1015 : 82, w = 660, h = 880;
        c.font = '600 42px Fredoka'; c.textAlign = 'center'; c.fillStyle = '#3f5749'; c.fillText(sources[index].name, 540, y - 24, 990);
        c.save(); c.shadowColor = '#73522a26'; c.shadowBlur = 18; c.shadowOffsetY = 8;
        c.beginPath(); c.roundRect(x - 7, y - 7, w + 14, h + 14, 27); c.fillStyle = '#eadcbc'; c.fill(); c.restore();
        c.save(); c.beginPath(); c.roundRect(x, y, w, h, 21); c.clip(); c.drawImage(image, x, y, w, h); c.restore();
      }
      return canvas.toDataURL('image/png');
    }, sources);
    const file = path.join(output, name);
    await sharp(Buffer.from(data.split(',')[1], 'base64')).removeAlpha().png().toFile(file);
    const meta = await sharp(file).metadata();
    if (meta.width !== 1080 || meta.height !== 1920 || meta.channels !== 3 || meta.hasAlpha) throw new Error(`Wrong composite PNG format: ${name}`);
    captures.push({ file: name, kind: 'marketing-composite', description: `Two clearly framed actual gameplay crops: ${sources.map(source => source.name).join(' and ')}. Only real level names added, in the game's Fredoka font. No prices, fabricated UI or changed mechanics.`, width: meta.width, height: meta.height, channels: meta.channels, sha256: sha256(file), sources: sources.map(({ boardData, ...source }) => source) });
    console.log(`Captured ${target}: ${sources.map(source => source.name).join(' + ')}`);
  };
  if (target === 'google-play') {
    const slots = [
      { name: 'phone-1-sunny-meadow.png', levels: [1] },
      { name: 'phone-2-roots-and-grotto.png', levels: [2, 3] },
      { name: 'phone-3-crystal-caves.png', levels: [4] },
      { name: 'phone-4-glowworm-lake.png', levels: [5] },
      { name: 'phone-5-fossils-and-geodes.png', levels: [6, 8] },
      { name: 'phone-6-ember-hollows.png', levels: [7] },
      { name: 'phone-7-briar-vault.png', levels: [9] },
      { name: 'phone-8-starseed-core.png', levels: [10] }
    ];
    for (const slot of slots) {
      const scenes = slot.levels.map(level => levelScenes[level - 1]);
      if (scenes.length === 2) await capturePair(slot.name, scenes);
      else { const scene = scenes[0]; await renderScene(scene); await capture(slot.name, `${scene.name}, level ${scene.level} wave ${scene.wave}: actual gameplay with a launched seed and next-shot aim.`); await page.mouse.up(); console.log(`Captured ${target}: ${scene.name}`); }
    }
  } else {
  const scenes = target === 'apple-iphone-1290' ? levelScenes : levelScenes.filter(scene => [1, 4, 10].includes(scene.level));
  for (const [index, scene] of scenes.entries()) {
    await renderScene(scene);
    const name = target === 'apple-iphone-1290' ? `iphone-${String(scene.level).padStart(2, '0')}-${scene.slug}.png` : `phone-${index + (draftOutputRoot ? 1 : 2)}-${scene.slug}.png`;
    await capture(name, `${scene.name}, level ${scene.level} wave ${scene.wave}: an actual launched seed and next-shot aim.${scene.power ? ' Dandelion powerup used against the final boss.' : ''} Authored wave selected in a disposable QA profile.`);
    await page.mouse.up();
    console.log(`Captured ${target}: ${scene.name}`);
  }
  }

  let featureInfo = null;
  if (target === 'google-play') {
  // The feature graphic is a wide crop of a high-resolution frame rendered by the current game renderer.
  // No lettering, prices, new art, or illustrative game objects are added.
  await start(1);
  await shoot(105, 120, 600);
  const featureData = await page.evaluate(() => {
    const game = window.__storeCapture.state(), canvas = document.createElement('canvas');
    canvas.width = 1260; canvas.height = 1680;
    const brush = canvas.getContext('2d'); brush.scale(3, 3);
    BloomArt.drawGarden(brush, 420, 560, 'depth-meadow', { mode: game.mode, frame: false });
    BloomArt.draw(brush, game, game.time, { theme: 'depth-meadow', backdrop: false, reducedMotion: false, quality: 2, realTime: performance.now() / 1000 });
    return canvas.toDataURL('image/png');
  });
  const frame = Buffer.from(featureData.split(',')[1], 'base64');
  const feature = path.join(output, 'feature-graphic.png');
  await sharp(frame).extract({ left: 0, top: 130, width: 1260, height: 615 }).resize(1024, 500).flatten({ background: '#fff' }).removeAlpha().png().toFile(feature);
  // No logo overlay was used, so the same authentic scene is suitable behind YouTube's play affordance.
  fs.copyFileSync(feature, path.join(output, 'feature-graphic-for-video.png'));
  const featureMeta = await sharp(feature).metadata();
  if (featureMeta.width !== 1024 || featureMeta.height !== 500 || featureMeta.channels !== 3 || featureMeta.hasAlpha) throw new Error('Wrong feature graphic PNG format.');
  featureInfo = { file: 'feature-graphic.png', width: 1024, height: 500, channels: 3, sha256: sha256(feature), source: 'High-resolution BloomArt.draw frame from Sunny Meadow, cropped to upper playfield.' };
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('\n')}`);
  const manifest = {
    target, status: 'draft', ownerApproved: false, actualDeviceTested: false, purchaseVerified: false,
    capturedAt: new Date().toISOString(), sourceCommit, gameSourceMatchesCommit, sourceHashes, appJsSha256: sourceHashes['app.js'],
    captureScriptSha256: sha256(__filename), browser: await browser.version(),
    viewport: { width: profile.width, height: profile.height, deviceScaleFactor: profile.dpr },
    method: 'Local draft of the actual current game in headless Chromium. Fresh localhost QA/mockstore profile, seeded randomness, virtual clock and a capture-only startDepth/state export. Each target is rerendered at its own viewport and DPR. No shipping code edits, fabricated art, added prices or changed mechanics. Play contains six direct captures and two clearly framed marketing composites of actual gameplay crops labelled only with real level names; Apple captures have no added labels. Mock ownership only opens authored scenes; these images do not demonstrate purchases. These are browser captures of the app UI, not iOS simulator/native/device screenshots. Owner iPhone approval and native safe-area verification remain required.',
    specifications: target.startsWith('apple-') ? {
      url: 'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/', verifiedOn: '2026-10-15',
      sizeClass: ['apple-iphone-large', 'apple-iphone-1290'].includes(target) ? 'iPhone with Dynamic Island (large display)' : target === 'apple-iphone-medium' ? 'iPhone with Dynamic Island (medium display)' : 'iPad 13-inch display',
      requiredClass: ['apple-iphone-medium', 'apple-ipad-13'].includes(target)
    } : null,
    feature: featureInfo, iconSha256: target === 'google-play' ? sha256(path.join(output, 'icon-512.png')) : null, captures, extras
  };
  for (const [name, hash] of Object.entries(sourceHashes)) if (sha256(path.join(gameRoot, name)) !== hash) throw new Error(`Game source changed during capture; rerun after edits finish: ${name}`);
  fs.writeFileSync(path.join(output, 'CAPTURE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  const currentNames = new Set(captures.map(capture => capture.file));
  const obsolete = fs.readdirSync(output).filter(name => /^(?:phone|iphone)-\d+-.*\.png$/.test(name) && !currentNames.has(name));
  for (const name of obsolete) { const file = path.join(output, name); if (fs.existsSync(file)) fs.unlinkSync(file); }
  console.log(JSON.stringify({ target, sourceCommit, browser: manifest.browser, captures: captures.map(item => item.file), feature: featureInfo && featureInfo.file, errors }, null, 2));
  await browser.close();
}
main().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
