'use strict';
// Browser-rendered audio QA: runs the actual sound graph through OfflineAudioContext, without
// real-time autoplay/device dependencies. The WAV is a listening aid, never an imported game asset.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
const output = path.resolve(process.argv[2] || path.join(__dirname, '../../../..', 'outputs'));
const cues = ['sunny', 'root', 'puff', 'crystal', 'lotus', 'fossil', 'ember', 'geode', 'briar', 'core'].map(kind => ({ type: 'bossWarning', kind }));
cues.push({ type: 'bossGuard', kind: 'fossil' }, { type: 'bossCritical', kind: 'lotus' }, { type: 'bossBurn', kind: 'ember' });
let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.BLOOMSHOT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const rendered = await page.evaluate(async ({ source, cues }) => {
    const rate = 48000, seconds = 2.2, make = new Function('globalThis', source + '\nreturn globalThis.BloomSound;');
    const results = [];
    for (const cue of [...cues, { type: 'bossWarning', kind: 'core', muted: true }]) {
      const context = new OfflineAudioContext(2, rate * seconds, rate);
      // The real-time code requires a running context before it schedules a cue. Offline rendering
      // schedules first and renders afterward; this adapter changes only the readiness query.
      Object.defineProperty(context, 'state', { get: () => 'running' });
      const sound = make({ AudioContext: function () { return context; } });
      sound.wake(); if (cue.muted) sound.setEnabled(false); sound.play(cue.type, { ...cue, x: 210, at: 4, until: 5.2, damage: 3 });
      const buffer = await context.startRendering(), pcm = new Int16Array(buffer.length * 2);
      let peak = 0, energy = 0, tail = 0, onset = Infinity;
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let frame = 0; frame < data.length; frame++) {
          const value = data[frame]; if (!Number.isFinite(value)) throw new Error('Rendered boss audio contains a nonfinite sample.');
          peak = Math.max(peak, Math.abs(value)); energy += value * value;
          if (Math.abs(value) > .0001) onset = Math.min(onset, frame / rate);
          if (frame > rate * 2) tail += value * value;
          pcm[frame * 2 + channel] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
        }
      }
      const bytes = new Uint8Array(pcm.buffer); let encoded = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      results.push({ ...cue, rate, channels: 2, seconds, peak, rms: Math.sqrt(energy / (buffer.length * 2)), tailRms: Math.sqrt(tail / (rate * .2 * 2)), audibleOnsetSeconds: Number.isFinite(onset) ? onset : null, pcmBase64: btoa(encoded) });
    }
    return results;
  }, { source, cues });
  for (const cue of rendered) {
    if (cue.peak >= .69 || cue.tailRms > .0001) throw new Error(`Unbounded rendered cue: ${cue.type}/${cue.kind}`);
    if (cue.muted ? cue.peak !== 0 : cue.rms < .00005 || cue.audibleOnsetSeconds > .03) throw new Error(`Silent or delayed cue: ${cue.type}/${cue.kind}`);
  }
  const parts = rendered.filter(cue => !cue.muted).map(cue => Buffer.from(cue.pcmBase64, 'base64')), pcm = Buffer.concat(parts);
  const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(output, { recursive: true }); const file = path.join(output, 'bloomshot-boss-cues.wav'); fs.writeFileSync(file, Buffer.concat([header, pcm]));
  const report = { passed: rendered.length, failed: 0, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), browser: await browser.version(), renderedAt: new Date().toISOString(), method: 'Production Web Audio graph rendered in Chrome OfflineAudioContext at stereo 48 kHz. Readiness is adapted for schedule-before-render; cue synthesis, buses, compressor, reverb and ceiling remain unchanged. Measures finite samples, audible onset, peak/tail bounds and mute. WAV plays ten guardian warnings then guard, weakspot and burn, each 2.2 seconds including decay. This is not phone-speaker listening or actual-device latency evidence.', file: path.basename(file), cues: rendered.map(({ pcmBase64, ...cue }, index) => ({ ...cue, listeningOffsetSeconds: cue.muted ? null : index * 2.2 })) };
  fs.writeFileSync(path.join(__dirname, 'boss-audio-test-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ file, passed: report.passed, maxPeak: Math.max(...rendered.map(cue => cue.peak)), maxTailRms: Math.max(...rendered.map(cue => cue.tailRms)), maxAudibleOnsetSeconds: Math.max(...rendered.map(cue => cue.audibleOnsetSeconds || 0)) }, null, 2));
  await browser.close();
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
