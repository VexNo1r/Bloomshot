'use strict';
// Verifies upload-image dimensions, capture/source hashes, ten-level coverage and opaque RGB.
// Contact sheets are review evidence outside the repository, never extra store uploads.
// Usage: node validate-store-media.cjs [review-output-directory] [draft-capture-root]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../../..'), gameRoot = path.join(root, 'bloomshot');
const output = path.resolve(process.argv[2] || path.join(root, '../../outputs/bloomshot-store-final'));
const captureRoot = path.resolve(process.argv[3] || __dirname);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const targets = [
    { directory: 'google-play', count: 8, width: 1080, height: 1920, columns: 4, thumb: 270 },
    { directory: 'apple/iphone-1290', count: 10, width: 1290, height: 2796, columns: 5, thumb: 240 }
  ], results = [];
  for (const target of [
    { directory: 'apple/iphone-medium', count: 3, width: 1206, height: 2622, columns: 3, thumb: 240, levels: [1, 4, 10] },
    { directory: 'apple/ipad-13', count: 3, width: 2064, height: 2752, columns: 3, thumb: 300, levels: [1, 4, 10] }
  ]) if (captureRoot !== __dirname && fs.existsSync(path.join(captureRoot, target.directory, 'CAPTURE-MANIFEST.json'))) targets.push(target);
  for (const target of targets) {
    const directory = path.join(captureRoot, target.directory), manifest = JSON.parse(fs.readFileSync(path.join(directory, 'CAPTURE-MANIFEST.json'), 'utf8'));
    if (captureRoot !== __dirname) {
      assert.equal(manifest.status, 'draft', target.directory + ' local draft classification');
      assert.equal(manifest.actualDeviceTested, false, target.directory + ' no native-device claim');
      assert.equal(manifest.purchaseVerified, false, target.directory + ' no purchase claim');
      assert.equal(manifest.gameSourceMatchesCommit, true, target.directory + ' committed game source');
      if (process.env.BLOOMSHOT_SOURCE_COMMIT) assert.equal(manifest.sourceCommit, process.env.BLOOMSHOT_SOURCE_COMMIT, target.directory + ' requested source commit');
    }
    assert.equal(manifest.captures.length, target.count);
    for (const [file, hash] of Object.entries(manifest.sourceHashes)) assert.equal(sha(path.join(gameRoot, file)), hash, `${target.directory}: source ${file}`);
    const levels = new Set(), files = [], composite = [], margin = 12, label = 26, height = Math.round(target.thumb * target.height / target.width);
    for (const [index, capture] of manifest.captures.entries()) {
      const file = path.resolve(directory, capture.file); assert(file.startsWith(directory + path.sep));
      assert.equal(sha(file), capture.sha256, capture.file + ' hash');
      const metadata = await sharp(file).metadata();
      assert.equal(metadata.width, target.width, capture.file + ' width'); assert.equal(metadata.height, target.height, capture.file + ' height');
      assert.equal(metadata.channels, 3, capture.file + ' channels'); assert.equal(metadata.hasAlpha, false, capture.file + ' opacity');
      if (capture.sources) {
        for (const source of capture.sources) {
          const sourceFile = path.resolve(directory, source.file); assert(sourceFile.startsWith(directory + path.sep));
          assert.equal(sha(sourceFile), source.sha256, source.file + ' hash');
          assert.equal(source.state.started, true); assert.equal(source.state.route, 'game'); levels.add(source.state.level);
        }
      } else { assert.equal(capture.state.started, true); assert.equal(capture.state.route, 'game'); levels.add(capture.state.level); }
      const x = margin + index % target.columns * (target.thumb + margin), y = margin + Math.floor(index / target.columns) * (height + label + margin);
      composite.push({ input: await sharp(file).resize(target.thumb, height).png().toBuffer(), left: x, top: y });
      composite.push({ input: Buffer.from(`<svg width="${target.thumb}" height="${label}"><text x="5" y="18" font-family="sans-serif" font-size="13" fill="#204b40">${index + 1}. ${path.basename(capture.file, '.png').replace(/^(?:phone|iphone)-\d+-/, '')}</text></svg>`), left: x, top: y + height });
      files.push({ file: capture.file, sha256: capture.sha256, width: metadata.width, height: metadata.height });
    }
    assert.deepEqual([...levels].sort((a, b) => a - b), target.levels || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], target.directory + ' level coverage');
    const actualUploads = fs.readdirSync(directory).filter(file => /^(?:phone|iphone)-\d+-.*\.png$/.test(file)).sort();
    assert.deepEqual(actualUploads, manifest.captures.map(capture => capture.file).sort(), 'no stale screenshot names');
    const sheet = target.directory.replaceAll('/', '-') + '-contact-sheet.png';
    await sharp({ create: { width: margin + target.columns * (target.thumb + margin), height: margin + Math.ceil(target.count / target.columns) * (height + label + margin), channels: 3, background: '#fff9ed' } }).composite(composite).png().toFile(path.join(output, sheet));
    if (manifest.feature) {
      for (const file of ['feature-graphic.png', 'feature-graphic-for-video.png']) {
        const name = path.join(directory, file), meta = await sharp(name).metadata();
        assert.equal(meta.width, 1024); assert.equal(meta.height, 500); assert.equal(meta.channels, 3); assert.equal(meta.hasAlpha, false); assert.equal(sha(name), manifest.feature.sha256);
      }
      const icon = path.join(directory, 'icon-512.png'), iconMeta = await sharp(icon).metadata();
      assert.equal(sha(icon), manifest.iconSha256); assert.equal(iconMeta.width, 512); assert.equal(iconMeta.height, 512);
    }
    results.push({ directory: target.directory, status: manifest.status || 'unclassified', count: files.length, levels: [...levels].sort((a, b) => a - b), capturedAt: manifest.capturedAt, sourceCommit: manifest.sourceCommit, sourceHashes: manifest.sourceHashes, contactSheet: sheet, files });
  }
  const report = { verifiedAt: new Date().toISOString(), browserCapturesOnly: true, actualDeviceTested: false, results };
  fs.writeFileSync(path.join(output, 'STORE-MEDIA-RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, targets: results.map(({ directory, count, levels, contactSheet }) => ({ directory, count, levels, contactSheet })) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
