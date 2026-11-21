#!/usr/bin/env node
'use strict';
// A labelled art QA atlas and silent motion study. These are not store uploads or gameplay previews.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..'), gameRoot = path.join(root, 'bloomshot'), output = path.resolve(process.argv[2] || path.join(root, '..', '..', 'outputs'));
const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const sourceHashes = Object.fromEntries(['art.js', 'scenery.js'].map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, name))).digest('hex')]));
let browser;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__scene-life-review__') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><link rel="stylesheet" href="/styles.css"><body><script src="/depths.js"></script><script src="/scenery.js"></script><script src="/art.js"></script>' }); return; }
    const file = path.resolve(gameRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(gameRoot + path.sep) || !fs.existsSync(file)) { await route.fulfill({ status: 404, body: '' }); return; }
    await route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto('http://localhost/__scene-life-review__', { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.load('600 20px Fredoka'); await document.fonts.load('600 14px Nunito'); });
  const result = await page.evaluate(() => {
    const themes = BloomScenery.themes, records = [], timings = [], backgrounds = [];
    const atlas = document.createElement('canvas'); atlas.width = 1000; atlas.height = 2360;
    const a = atlas.getContext('2d'); a.fillStyle = '#fff9ee'; a.fillRect(0, 0, atlas.width, atlas.height);
    a.fillStyle = '#365646'; a.font = '600 28px Fredoka'; a.fillText('Bloomshot · Scene life review', 22, 38);
    a.font = '600 14px Nunito'; a.fillStyle = '#786f60'; a.fillText('Production Canvas scenery and visitors. Insets enlarge actual edge pixels. Review labels are not store art.', 22, 65);
    const overlay = document.createElement('canvas'); overlay.width = 432; overlay.height = 768;
    const o = overlay.getContext('2d');
    const frame = document.createElement('canvas'); frame.width = 432; frame.height = 768;
    const f = frame.getContext('2d');
    themes.forEach((theme, index) => {
      const background = document.createElement('canvas'); background.width = 432; background.height = 768;
      BloomArt.drawGarden(background.getContext('2d'), 432, 768, theme, { mode: 'rush', frame: false }); backgrounds.push(background);
      const first = new Map();
      for (let i = 0; i < 6000; i++) for (const visitor of BloomScenery.lifePlan(theme, i / 100, false)) {
        const prior = first.get(visitor.kind); if (!prior || visitor.opacity > prior.opacity) first.set(visitor.kind, { ...visitor, time: i / 100 });
      }
      const visitors = [...first.values()]; records.push({ level: index + 1, theme, visitors });
      const x = 14 + index % 2 * 496, y = 90 + Math.floor(index / 2) * 452;
      a.fillStyle = '#f1eadc'; a.beginPath(); a.roundRect(x, y, 480, 436, 17); a.fill();
      a.fillStyle = '#3e584a'; a.font = '600 20px Fredoka'; a.fillText(`${index + 1}. ${BloomDepths.level(index + 1).name}`, x + 13, y + 29);
      BloomArt.drawSceneLife(o, 432, 768, theme, visitors[0].time, false); f.drawImage(background, 0, 0); f.drawImage(overlay, 0, 0);
      a.save(); a.beginPath(); a.roundRect(x + 12, y + 48, 190, 338, 11); a.clip(); a.drawImage(frame, x + 12, y + 48, 190, 338); a.restore();
      visitors.forEach((visitor, v) => {
        const yy = y + 48 + v * 181;
        a.font = '600 16px Fredoka'; a.fillStyle = '#5e6554'; a.fillText(visitor.kind.replace('-', ' '), x + 218, yy + 17);
        // Capture two phases from the same scheduled visit so the inset also reveals its bounded movement.
        for (let sample = 0; sample < 2; sample++) {
          const time = visitor.time + sample * .52, plan = BloomScenery.lifePlan(theme, time, false).find(item => item.kind === visitor.kind) || visitor;
          BloomArt.drawSceneLife(o, 432, 768, theme, time, false); f.drawImage(background, 0, 0); f.drawImage(overlay, 0, 0);
          const crop = 42, sx = Math.max(0, Math.min(432 - crop, plan.x * 432 - crop / 2)), sy = Math.max(0, Math.min(768 - crop, plan.y * 768 - crop / 2));
          a.save(); a.beginPath(); a.roundRect(x + 218 + sample * 123, yy + 31, 112, 112, 9); a.clip(); a.drawImage(frame, sx, sy, crop, crop, x + 218 + sample * 123, yy + 31, 112, 112); a.restore();
        }
        a.font = '600 12px Nunito'; a.fillStyle = '#8d8170'; a.fillText('Two real frames · 2.7× detail', x + 218, yy + 162);
      });
      for (let n = 0; n < 600; n++) BloomArt.drawSceneLife(o, 432, 768, theme, n / 10, false);
      const work = [];
      for (let n = 0; n < 400; n++) { const before = performance.now(); BloomArt.drawSceneLife(o, 432, 768, theme, visitors[n % 2].time + n % 8 / 30, false); work.push(performance.now() - before); }
      work.sort((v, w) => v - w); timings.push({ level: index + 1, viewport: [432, 768], samples: work.length, medianMilliseconds: work[200], p95Milliseconds: work[380], maxMilliseconds: work.at(-1) });
    });
    // A decoded-pixel check makes accessibility evidence stronger than a command-only check.
    BloomArt.drawSceneLife(o, 432, 768, 'depth-meadow', records[0].visitors[0].time, false);
    const activePixels = [...o.getImageData(0, 0, 432, 768).data].filter((value, i) => i % 4 === 3 && value > 0).length;
    BloomArt.drawSceneLife(o, 432, 768, 'depth-meadow', records[0].visitors[0].time, true);
    const reducedMotionPixels = [...o.getImageData(0, 0, 432, 768).data].filter((value, i) => i % 4 === 3 && value > 0).length;
    window.__lifeReview = { themes, records, backgrounds };
    return { data: atlas.toDataURL('image/png'), records, timings, activePixels, reducedMotionPixels };
  });
  if (!(result.activePixels > 0) || result.reducedMotionPixels !== 0) throw new Error('Reduced motion did not clear the visitor layer.');
  const image = path.join(output, 'bloomshot-scene-life-review.png'); fs.writeFileSync(image, Buffer.from(result.data.split(',')[1], 'base64'));
  const movie = await page.evaluate(async () => {
    const { themes, records, backgrounds } = __lifeReview;
    const canvas = document.createElement('canvas'); canvas.width = 864; canvas.height = 768;
    const ctx = canvas.getContext('2d', { alpha: false });
    const overlay = document.createElement('canvas'); overlay.width = 432; overlay.height = 768;
    const o = overlay.getContext('2d');
    const type = ['video/mp4;codecs=avc1.42001E', 'video/mp4', 'video/webm;codecs=vp9'].find(item => MediaRecorder.isTypeSupported(item));
    const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3800000 }), chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    let count = 0, animation, start = performance.now();
    const paint = () => {
      const elapsed = (performance.now() - start) / 1000, level = Math.min(9, Math.floor(elapsed / 2.4)), local = elapsed % 2.4;
      for (let visitor = 0; visitor < 2; visitor++) {
        ctx.drawImage(backgrounds[level], visitor * 432, 0);
        const mid = records[level].visitors[visitor].time;
        BloomArt.drawSceneLife(o, 432, 768, themes[level], Math.max(0, mid - .35 + local), false);
        ctx.drawImage(overlay, visitor * 432, 0);
      }
      count++; animation = requestAnimationFrame(paint);
    };
    paint(); recorder.start(500); await new Promise(resolve => setTimeout(resolve, 24000)); cancelAnimationFrame(animation);
    await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); }); stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type }), data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    const video = document.createElement('video'); video.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const decoded = document.createElement('canvas'); decoded.width = 864; decoded.height = 768;
    const dc = decoded.getContext('2d'), samples = [];
    for (let level = 0; level < 10; level++) {
      const seconds = level * 2.4 + .8;
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = seconds; });
      dc.drawImage(video, 0, 0); const pixels = dc.getImageData(0, 0, 864, 768).data;
      let lo = 255, hi = 0;
      for (let i = 0; i < pixels.length; i += 4) { lo = Math.min(lo, pixels[i]); hi = Math.max(hi, pixels[i]); }
      if (hi - lo < 25) throw new Error('Decoded motion study contains a blank frame.');
      samples.push({ level: level + 1, seconds, data: decoded.toDataURL('image/png') });
    }
    return { type, data, bytes: blob.size, renderedFrames: count, duration: video.duration, width: video.videoWidth, height: video.videoHeight, samples };
  });
  const videoFile = path.join(output, 'bloomshot-scene-life-review.' + (movie.type.startsWith('video/mp4') ? 'mp4' : 'webm'));
  fs.writeFileSync(videoFile, Buffer.from(movie.data.slice(movie.data.lastIndexOf(',') + 1), 'base64'));
  if (fs.statSync(videoFile).size !== movie.bytes || movie.duration < 23 || movie.duration > 25 || movie.width !== 864 || movie.height !== 768 || errors.length) throw new Error('Motion study validation failed.');
  for (const [name, hash] of Object.entries(sourceHashes)) if (crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, name))).digest('hex') !== hash) throw new Error('Art source changed during review.');
  const decodedFrames = movie.samples.map(({ data, ...sample }) => ({ ...sample, sha256: crypto.createHash('sha256').update(Buffer.from(data.split(',')[1], 'base64')).digest('hex') }));
  if (new Set(decodedFrames.map(sample => sample.sha256)).size !== 10) throw new Error('The motion study does not decode ten different scenes.');
  const manifest = { sourceCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes, capturedAt: new Date().toISOString(), browser: await browser.version(), method: 'Labelled QA atlas and silent 24-second Canvas motion study. Every scene/visitor uses the production drawGarden and drawSceneLife APIs at 432×768. Paired video panels show the two scheduled visitors of each level, one level every 2.4 seconds. No added gameplay or fabricated screenshot art. Not a store screenshot, actual-device performance result or game preview.', image: path.basename(image), video: { file: path.basename(videoFile), mime: movie.type, bytes: movie.bytes, renderedFrames: movie.renderedFrames, decodedDurationSeconds: movie.duration, decodedWidth: movie.width, decodedHeight: movie.height, decodedFrames }, activePixels: result.activePixels, reducedMotionPixels: result.reducedMotionPixels, records: result.records, timings: result.timings, errors };
  fs.writeFileSync(path.join(output, 'bloomshot-scene-life-review.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ image, videoFile, duration: movie.duration, maxWarmedP95Ms: Math.max(...result.timings.map(item => item.p95Milliseconds)), activePixels: result.activePixels, reducedMotionPixels: result.reducedMotionPixels, errors }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
