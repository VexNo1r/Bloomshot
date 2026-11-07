#!/usr/bin/env node
'use strict';

// Records about 28 seconds of the real game board, with the game's synthesized music and effects.
// Dependencies: playwright and installed Chromium. NODE_PATH can use Codex's bundled modules.
// Usage: node docs/store/graphics/capture-preview.cjs <output-directory>
// Native MediaRecorder is used, so no ffmpeg, external music, or generated artwork is needed.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..'), gameRoot = path.join(root, 'bloomshot');
const output = path.resolve(process.argv[2] || path.join(root, '..', '..', 'outputs'));
const chrome = process.env.BLOOMSHOT_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const sourceCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const bot = require(path.join(gameRoot, 'qa/depths-bot.cjs'));
const tracer = bot.trace.toString(), prepare = bot.prepareTrace.toString(), score = bot.value.toString();
const files = fs.readdirSync(gameRoot).filter(name => /\.(?:js|html|css)$/.test(name));
const sourceHashes = Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, name))).digest('hex')]));
sourceHashes['qa/depths-bot.cjs'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, 'qa/depths-bot.cjs'))).digest('hex');
let browser;
async function main() {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://localhost') { await route.abort(); return; }
    const file = path.resolve(gameRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404, body: 'Not found' }); return; }
    let body = fs.readFileSync(file);
    if (path.basename(file) === 'app.js') body = body.toString().replace(/\}\)\(\);\s*$/, 'window.__storeCapture = { startDepth, state: () => game, shot: (x, y) => { aimAt({x, y}); launch(true); } };\n})();');
    if (path.basename(file) === 'sound.js') body = body.toString().replace('ceiling.connect(context.destination);', 'ceiling.connect(context.destination); root.__storeAudio = {context, destination: context.createMediaStreamDestination()}; ceiling.connect(root.__storeAudio.destination);');
    await route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body });
  });
  await page.addInitScript(() => {
    let seed = 0x42b10;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const depths = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { stars: 3, best: 0, wave: 10 }]));
    localStorage.setItem('bloomshot.qa.v1', JSON.stringify({ version: 1, depths, tutorial: true, powersMet: true, podMet: true, settings: { sound: true, music: true, haptics: false, motion: true } }));
    localStorage.setItem('bloomshot.mockstore.v1', JSON.stringify({ v: 1, owned: ['levels_full'], bought: ['bloomshot.levels.full'], txs: [] }));
  });
  await page.goto('http://localhost/?qa&mockstore', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { window.__storeCapture.startDepth(1, false, 3); BloomSound.wake(); });
  await page.evaluate(async () => { if (__storeAudio.context.state !== 'running') await __storeAudio.context.resume(); });
  await page.waitForTimeout(2500);
  const recorderInfo = await page.evaluate(({ tracer, prepare, score }) => {
    const Engine = BloomEngine, Bosses = BloomBosses, bossMotion = BloomRush.bossMotion, TRACE_STEPS = 90, TRACE_DT = 1 / 60;
    const prepareTrace = eval('(' + prepare + ')'), follow = eval('(' + tracer + ')'), shotValue = eval('(' + score + ')');
    // The same shot tracer used in the campaign QA chooses reachable flowers. The app's aim/fire handlers
    // launch each shot and process its sounds, particles, score and other effects normally.
    window.__previewAutoShot = () => {
      const game = __storeCapture.state();
      if (!game.canFire || game.over) return;
      let best = null; const prepared = prepareTrace(game);
      for (let deg = -165; deg <= -15; deg += 3) {
        const angle = deg * Math.PI / 180, hit = follow(game, angle, 3, prepared);
        if (!hit) continue;
        const value = shotValue(game, hit, .1, prepared);
        if (value < 0) continue;
        if (!best || value > best.value) best = { angle, value };
      }
      const angle = best ? best.angle : -Math.PI / 2;
      __storeCapture.shot(210 + Math.cos(angle) * 350, 498 + Math.sin(angle) * 350);
      if (game.splitReady) document.getElementById('split-btn').click();
    };
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1440;
    const ctx = canvas.getContext('2d', { alpha: false }), gameCanvas = document.getElementById('game-canvas'), sceneCanvas = document.getElementById('scene-canvas'), lifeCanvas = document.getElementById('life-canvas');
    const audioSource = __storeAudio.context.createMediaStreamSource(__storeAudio.destination.stream), analyser = __storeAudio.context.createAnalyser();
    audioSource.connect(analyser); analyser.fftSize = 2048;
    const samples = new Float32Array(analyser.fftSize);
    let frames = 0, audioPeak = 0, audioSquareSum = 0, audioSampleCount = 0;
    const paint = () => {
      for (const layer of [sceneCanvas, lifeCanvas]) if (layer && layer.width > 0) {
        const gameRect = gameCanvas.getBoundingClientRect(), layerRect = layer.getBoundingClientRect();
        if (layerRect.width && layerRect.height) ctx.drawImage(layer, (gameRect.x - layerRect.x) / layerRect.width * layer.width, (gameRect.y - layerRect.y) / layerRect.height * layer.height, gameRect.width / layerRect.width * layer.width, gameRect.height / layerRect.height * layer.height, 0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(gameCanvas, 0, 0, canvas.width, canvas.height); frames++;
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) { audioPeak = Math.max(audioPeak, Math.abs(sample)); audioSquareSum += sample * sample; audioSampleCount++; }
      window.__previewPaint = requestAnimationFrame(paint);
    }; paint();
    const stream = canvas.captureStream(30);
    for (const track of __storeAudio.destination.stream.getAudioTracks()) stream.addTrack(track);
    const type = ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'].find(type => MediaRecorder.isTypeSupported(type));
    if (!type) throw new Error('No supported MediaRecorder video/audio codec.');
    const chunks = [], recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    window.__previewRecording = { recorder, type, chunks, deadline: performance.now() + 28000, frames: () => frames, audio: () => ({ peak: audioPeak, rms: Math.sqrt(audioSquareSum / Math.max(1, audioSampleCount)) }) };
    recorder.start(1000);
    window.__previewShotTimer = setInterval(__previewAutoShot, 460);
    return { type, width: canvas.width, height: canvas.height, fps: 30, audioTracks: stream.getAudioTracks().length, music: BloomSound.music.frame({ route: 'game', groove: 'meadow' }) };
  }, { tracer, prepare, score });
  const segments = [];
  for (const [index, scene] of [{ level: 1, wave: 3 }, { level: 4, wave: 6 }, { level: 7, wave: 8 }, { level: 10, wave: 10 }].entries()) {
    if (index) await page.evaluate(({ level, wave }) => { window.__storeCapture.startDepth(level, false, wave); }, scene);
    if (scene.level === 10) await page.locator('[data-power="dandelion"]').click();
    const before = await page.evaluate(() => window.bloomshotState);
    // The final segment uses the recording deadline so UI action/IPC time does not push the clip past
    // thirty seconds. Other segments are approximately seven seconds of uninterrupted real play.
    const holdMs = index === 3 ? await page.evaluate(() => Math.max(0, __previewRecording.deadline - performance.now())) : 7000;
    await page.waitForTimeout(holdMs);
    segments.push({ ...scene, seconds: holdMs / 1000, before, after: await page.evaluate(() => window.bloomshotState) });
    console.log(`Recorded ${index + 1}/4: level ${scene.level}`);
  }
  const result = await page.evaluate(async () => {
    clearInterval(__previewShotTimer); cancelAnimationFrame(__previewPaint);
    const recording = __previewRecording;
    await new Promise(resolve => { recording.recorder.onstop = resolve; recording.recorder.stop(); });
    const blob = new Blob(recording.chunks, { type: recording.type });
    const data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    return { data, frames: recording.frames(), bytes: blob.size, audio: recording.audio() };
  });
  const extension = recorderInfo.type.startsWith('video/mp4') ? 'mp4' : 'webm', file = path.join(output, `bloomshot-preview.${extension}`);
  // MediaRecorder MIME strings contain a comma between codecs. FileReader preserves it in the
  // data-URL header, so the payload starts after the LAST comma, not the first one.
  fs.writeFileSync(file, Buffer.from(result.data.slice(result.data.lastIndexOf(',') + 1), 'base64'));
  if (fs.statSync(file).size !== result.bytes) throw new Error('Video payload was truncated during transfer.');
  const decoded = await page.evaluate(async data => {
    const video = document.createElement('video'); video.muted = true;
    const bytes = Uint8Array.from(atob(data.slice(data.lastIndexOf(',') + 1)), char => char.charCodeAt(0));
    video.src = URL.createObjectURL(new Blob([bytes], {type: __previewRecording.type.split(';')[0]}));
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Recorded video cannot be decoded.')); });
    const duration = video.duration, width = video.videoWidth, height = video.videoHeight, samples = [];
    const canvas = document.createElement('canvas'); canvas.width = 540; canvas.height = 720;
    for (const seconds of [2, 10, 18, 24]) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = () => reject(new Error('Recorded video frame cannot be decoded.')); video.currentTime = seconds; });
      canvas.getContext('2d').drawImage(video, 0, 0, 540, 720); samples.push({ seconds, data: canvas.toDataURL('image/png') });
    }
    const decodedAudio = await __storeAudio.context.decodeAudioData(bytes.buffer.slice(0));
    let squareSum = 0, count = 0, peak = 0;
    for (let channel = 0; channel < decodedAudio.numberOfChannels; channel++) for (const sample of decodedAudio.getChannelData(channel)) { peak = Math.max(peak, Math.abs(sample)); squareSum += sample * sample; count++; }
    const audio = { channels: decodedAudio.numberOfChannels, sampleRate: decodedAudio.sampleRate, duration: decodedAudio.duration, peak, rms: Math.sqrt(squareSum / Math.max(1, count)) };
    return { duration, width, height, samples, audio };
  }, result.data);
  if (decoded.duration < 27.5 || decoded.duration > 30 || decoded.width !== 1080 || decoded.height !== 1440 || result.audio.rms < .0001 || decoded.audio.rms < .0001) throw new Error('Preview duration, size, or audio validation failed.');
  const qaRoot = path.join(root, '..', 'store-capture-qa'); fs.mkdirSync(qaRoot, { recursive: true });
  for (const sample of decoded.samples) fs.writeFileSync(path.join(qaRoot, `preview-${sample.seconds}s.png`), Buffer.from(sample.data.split(',')[1], 'base64'));
  const validation = { decodedDurationSeconds: decoded.duration, decodedWidth: decoded.width, decodedHeight: decoded.height, audio: decoded.audio, capturedAudio: result.audio, decodedFrameSeconds: decoded.samples.map(sample => sample.seconds) };
  for (const [name, hash] of Object.entries(sourceHashes)) if (crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, name))).digest('hex') !== hash) throw new Error(`Game source changed during capture; rerun after edits finish: ${name}`);
  const manifest = { sourceCommit, sourceHashes, capturedAt: new Date().toISOString(), browser: await browser.version(), file: path.basename(file), ...recorderInfo, frames: result.frames, bytes: result.bytes, expectedDurationSeconds: 28, validation, method: 'Real production game board, driven by QA shot tracer and app aim/fire handlers. Capture-only hooks expose state, starting wave and the original audio output; no game source is changed. Native browser recording, 1080×1440, original synthesized game music and sound effects; no narration or added captions. The canvas-only video is a Play/YouTube preview asset; an Apple app preview still requires Apple device-size capture and console validation.', sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), errors, segments };
  fs.writeFileSync(path.join(output, 'bloomshot-preview-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (errors.length) throw new Error(`Capture browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ file, ...recorderInfo, frames: result.frames, bytes: result.bytes, errors }, null, 2));
  await browser.close();
}
main().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
