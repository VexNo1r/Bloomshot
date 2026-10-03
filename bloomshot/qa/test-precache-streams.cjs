'use strict';

// Regression for precache installers that hold unread response bodies while
// awaiting every response header. Run: node qa/test-precache-streams.cjs
// Uses real HTTP streams and shipped asset bytes; never touches browser storage.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(__dirname, 'precache-stream-test-results.json');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const round = value => Math.round(value * 100) / 100;
const installDeadlineMs = 15000;
const resources = new Map();
const sockets = new Set();
const transports = [];
const workerTimers = new Set();
const stores = new Map();
const events = new Map();
const progress = [];
const report = { passed: false, testedAt: new Date().toISOString(), node: process.version, workerSha256: digest(source), maxConnections: 3 };
let server;

function within(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]).finally(() => clearTimeout(timer));
}

function transport() {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 3 });
  const requests = new Set();
  const stats = { headers: 0, consumed: 0, bytes: 0, peakConnections: 0 };
  const activeSockets = new Set();
  const api = {
    stats,
    fetch(request) {
      const url = typeof request === 'string' ? request : request.url;
      return new Promise((resolve, reject) => {
        const req = http.get(url, { agent, signal: request.signal }, response => {
          stats.headers++;
          response.once('end', () => stats.consumed++);
          // A timed-out negative control deliberately tears down unread bodies.
          response.on('error', () => {});
          // Do not resume here. Cache.put must pull the response body.
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            type: 'basic', redirected: false, url,
            headers: { get(name) { return String(response.headers[name.toLowerCase()] || ''); } },
            async drain() {
              const chunks = [];
              for await (const chunk of response) { chunks.push(chunk); stats.bytes += chunk.length; }
              return Buffer.concat(chunks);
            }
          });
        });
        requests.add(req);
        req.once('close', () => requests.delete(req));
        req.once('error', reject);
        req.once('socket', socket => {
          activeSockets.add(socket);
          stats.peakConnections = Math.max(stats.peakConnections, activeSockets.size);
          socket.once('close', () => activeSockets.delete(socket));
        });
      });
    },
    close() { for (const req of requests) req.destroy(); agent.destroy(); }
  };
  transports.push(api);
  return api;
}

async function main() {
  server = http.createServer((request, response) => {
    const item = resources.get(new URL(request.url, 'http://localhost').pathname);
    if (!item) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': item.type, 'Content-Length': item.bytes, 'Cache-Control': 'no-store' });
    const stream = fs.createReadStream(item.file, { highWaterMark: 16 * 1024 });
    stream.on('error', error => response.destroy(error));
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const scope = `http://127.0.0.1:${server.address().port}/`;
  const live = transport();

  const context = vm.createContext({
    URL, Request, AbortController, console,
    setTimeout(callback, ms) {
      const timer = setTimeout(() => { workerTimers.delete(timer); callback(); }, ms);
      workerTimers.add(timer); return timer;
    },
    clearTimeout(timer) { workerTimers.delete(timer); clearTimeout(timer); },
    fetch: request => live.fetch(request),
    self: {
      registration: { scope },
      addEventListener(name, callback) { events.set(name, callback); },
      clients: {
        async matchAll() { return [{ url: `${scope}?qa=1`, postMessage(message) { progress.push({ ...message, cached: Array.from(stores.values()).reduce((n, store) => n + store.size, 0) }); } }]; },
        async claim() {}
      },
      async skipWaiting() {}
    },
    caches: {
      async has(name) { return stores.has(name); },
      async keys() { return Array.from(stores.keys()); },
      async delete(name) { return stores.delete(name); },
      async open(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        const entries = stores.get(name);
        return {
          async put(key, response) {
            const url = typeof key === 'string' ? key : key.url;
            const expected = resources.get(new URL(url).pathname);
            assert(expected, `Unexpected cache key ${url}`);
            const body = await response.drain();
            assert.equal(body.length, expected.bytes, `Incomplete body for ${url}`);
            const hash = digest(body);
            assert.equal(hash, expected.sha256, `Corrupt body for ${url}`);
            entries.set(url, { bytes: body.length, sha256: hash, type: response.headers.get('content-type') });
          },
          async match(key) { return entries.get(typeof key === 'string' ? key : key.url); }
        };
      }
    }
  });
  vm.runInContext(source, context, { filename: 'sw.js', timeout: 1000 });
  const metadata = vm.runInContext('({ assets: [...ASSETS], urls: [...URLS], cacheName: CACHE_NAME, version: VERSION })', context);
  for (const asset of metadata.assets) {
    const url = new URL(asset, scope);
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    assert(file.startsWith(root + path.sep), `Asset escaped project: ${asset}`);
    const bytes = fs.readFileSync(file);
    resources.set(url.pathname, { file, type: types[path.extname(file)] || 'application/octet-stream', bytes: bytes.length, sha256: digest(bytes) });
  }
  assert(metadata.urls.length > 3, 'Fixture must exceed the connection pool.');
  assert(Math.max(...Array.from(resources.values(), item => item.bytes)) > 256 * 1024, 'Fixture requires a substantial real image body.');
  report.workerVersion = metadata.version;
  report.assetCount = metadata.urls.length;
  report.imageCount = metadata.urls.filter(url => /\.(png|svg)$/.test(url)).length;

  // Control proves the harness cannot accidentally pass by buffering/draining
  // bodies before Cache.put. This intentionally stalls without modifying sw.js.
  const blocked = transport();
  const controlStart = performance.now();
  const deferredBatch = Promise.all(metadata.urls.map(url => blocked.fetch(url))).then(responses => Promise.all(responses.map(response => response.drain())));
  deferredBatch.catch(() => {});
  await within((async () => { while (blocked.stats.headers < 3) await new Promise(resolve => setTimeout(resolve, 10)); })(), 4000, 'Negative control headers');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(blocked.stats.headers, 3, 'Deferred consumption should exhaust the three connections.');
  assert.equal(blocked.stats.consumed, 0, 'No body should finish before consumption begins.');
  report.negativeControl = { stalledAsExpected: true, ...blocked.stats, elapsedMs: round(performance.now() - controlStart) };
  blocked.close();

  // Invoke the registered install listener from the actual shipped SW source.
  const install = events.get('install');
  assert.equal(typeof install, 'function', 'SW must register an install listener.');
  let installPromise;
  const start = performance.now();
  install({ waitUntil(promise) { assert(!installPromise, 'Expected one install lifetime promise.'); installPromise = Promise.resolve(promise); } });
  assert(installPromise, 'Install did not provide event.waitUntil.');
  await within(installPromise, installDeadlineMs, 'Actual SW streaming precache');
  const entries = stores.get(metadata.cacheName);
  assert(entries, 'Worker did not create its declared cache.');
  assert.equal(entries.size, metadata.urls.length, 'Every declared URL must be cached.');
  for (const url of metadata.urls) assert(entries.has(url), `Uncached asset: ${url}`);
  assert.equal(live.stats.consumed, metadata.urls.length, 'All HTTP bodies must be consumed.');
  assert(live.stats.peakConnections <= 3, 'HTTP pool exceeded three connections.');
  assert(progress.some(item => item.completed === metadata.urls.length && !item.failed), 'Full precache completion was not reported.');
  for (const item of progress.filter(item => !item.failed)) assert(item.completed <= item.cached, 'Download progress was reported before cache writes finished.');
  report.actualInstall = { ...live.stats, cached: entries.size, elapsedMs: round(performance.now() - start), deadlineMs: installDeadlineMs, allBodyHashesMatch: true };
  report.assets = metadata.urls.map(url => ({ path: new URL(url).pathname, ...entries.get(url) }));
  report.progress = progress;
  report.passed = true;
}

(async () => {
  try { await main(); }
  catch (error) { report.error = error.stack || String(error); process.exitCode = 1; }
  finally {
    for (const timer of workerTimers) clearTimeout(timer);
    for (const client of transports) client.close();
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: report.passed, workerVersion: report.workerVersion, assets: report.assetCount, images: report.imageCount, negativeControl: report.negativeControl, actualInstall: report.actualInstall, error: report.error, report: path.relative(root, reportPath) }, null, 2));
  }
})();
