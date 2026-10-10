'use strict';
// Dependency-free behavior tests. This file never registers a real worker or writes the app checkout.
// Usage: node qa/test-pwa.cjs [absolute-or-relative-path-to-sw.js]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const swPath = path.resolve(process.argv[2] || path.join(__dirname, '../sw.js'));
const PREFIX = 'bloomshot-shell-';
const ASSETS = ['./', './index.html', './styles.css', './store-config.js', './store.js', './levels.js', './moon.js', './koi.js', './keepsakes.js', './garden.js', './goals.js', './depths.js', './powers.js', './engine.js', './rush.js',
  './scenery.js', './art.js', './meadow.js', './sound.js', './native.js', './app.js', './store-ui.js', './pwa.js', './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './assets/fonts/fredoka.woff2', './assets/fonts/nunito.woff2', './assets/ui/lock.svg'];
const results = [];

function mime(url) {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.webmanifest')) return 'application/manifest+json';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  return 'text/html; charset=utf-8';
}
function decorate(response, options) {
  for (const [key, value] of Object.entries(options)) Object.defineProperty(response, key, { value, configurable: true });
  const nativeClone = response.clone.bind(response);
  response.clone = () => decorate(nativeClone(), options);
  return response;
}
function response(body, url, options = {}) {
  return decorate(new Response(body, { status: options.status || 200,
    headers: { 'Content-Type': options.contentType || mime(url) } }),
  { url: options.responseUrl || url, type: options.type || 'basic', redirected: !!options.redirected });
}

function harness(source, scope) {
  const scopeURL = new URL(scope), workerURL = new URL('sw.js', scopeURL);
  const listeners = new Map(), stores = new Map();
  const expectedURLs = ASSETS.map(asset => new URL(asset, scopeURL).href);
  const overrides = new Map();
  const state = { offline: false, revision: 'release-A', requests: [], deletedCaches: [],
    skipWaiting: 0, claims: 0, listenerCounts: {}, expectedURLs, stores, overrides };
  function urlOf(input, ignoreSearch = false) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, workerURL);
    if (ignoreSearch) url.search = '';
    return url.href;
  }
  class WorkerRequest {
    constructor(input, init = {}) {
      const base = input && typeof input === 'object' ? input : {};
      this.url = urlOf(input); this.method = (init.method || base.method || 'GET').toUpperCase();
      this.mode = init.mode || base.mode || 'same-origin';
      this.destination = init.destination || base.destination || '';
      this.cache = init.cache || base.cache || 'default';
      this.credentials = init.credentials || base.credentials || 'same-origin';
      this.redirect = init.redirect || base.redirect || 'follow';
      this.headers = new Headers(init.headers || base.headers || {});
    }
    clone() { return new WorkerRequest(this); }
  }
  async function fakeFetch(input, init = {}) {
    const request = new WorkerRequest(input, init);
    state.requests.push({ url: request.url, method: request.method, cache: request.cache, credentials: request.credentials });
    if (state.offline) throw new TypeError('Simulated offline network');
    const override = overrides.get(request.url) || {};
    if (override.throw) throw new TypeError('Simulated network failure');
    const rel = ASSETS[expectedURLs.indexOf(request.url)] || new URL(request.url).pathname;
    return response(state.revision + ':' + rel, request.url, override);
  }
  function cacheFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async match(input, options = {}) {
        if (input && input.method && input.method !== 'GET' && !options.ignoreMethod) return undefined;
        const desired = urlOf(input, options.ignoreSearch);
        for (const [url, stored] of entries) if (urlOf(url, options.ignoreSearch) === desired) return stored.clone();
        return undefined;
      },
      async put(input, value) {
        if (input && input.method && input.method !== 'GET') throw new TypeError('Cache.put only accepts GET');
        if (!value || typeof value.clone !== 'function') throw new TypeError('Cache.put needs a Response');
        entries.set(urlOf(input), value.clone());
      },
      async delete(input, options = {}) {
        const desired = urlOf(input, options.ignoreSearch);
        for (const key of entries.keys()) if (urlOf(key, options.ignoreSearch) === desired) return entries.delete(key);
        return false;
      },
      async keys() { return [...entries.keys()].map(url => new WorkerRequest(url)); },
      async addAll(inputs) {
        const fetched = await Promise.all(inputs.map(async input => {
          const value = await fakeFetch(input);
          if (!value.ok || value.type === 'opaque') throw new TypeError('Cache.addAll rejected a failed response');
          return [input, value];
        }));
        for (const [input, value] of fetched) entries.set(urlOf(input), value.clone());
      }
    };
  }
  const caches = {
    async open(name) { return cacheFor(name); },
    async keys() { return [...stores.keys()]; },
    async has(name) { return stores.has(name); },
    async delete(name) { state.deletedCaches.push(name); return stores.delete(name); },
    async match(input, options = {}) {
      const names = options.cacheName ? [options.cacheName] : [...stores.keys()];
      for (const name of names) {
        if (!stores.has(name)) continue;
        const matched = await cacheFor(name).match(input, options);
        if (matched) return matched;
      }
      return undefined;
    }
  };
  const client = { id: 'game-client', type: 'window', url: new URL('index.html', scopeURL).href, postMessage() {} };
  const clients = { async claim() { state.claims++; }, async get(id) { return id === client.id ? client : undefined; }, async matchAll() { return [client]; } };
  const self = { location: workerURL, registration: { scope: scopeURL.href }, clients, caches,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener); state.listenerCounts[type] = listeners.get(type).length;
    },
    async skipWaiting() { state.skipWaiting++; }
  };
  const context = vm.createContext({ self, location: workerURL, caches, clients, fetch: fakeFetch,
    URL, Request: WorkerRequest, Response, Headers, console, Promise, AbortController, setTimeout, clearTimeout });
  vm.runInContext(source, context, { filename: swPath, timeout: 2000 });
  async function dispatch(type, payload = {}) {
    const waits = []; let responsePromise, intercepted = false;
    const event = { ...payload,
      waitUntil(promise) { waits.push(Promise.resolve(promise)); },
      respondWith(promise) {
        assert.equal(intercepted, false, 'respondWith may be called only once');
        intercepted = true; responsePromise = Promise.resolve(promise);
      }
    };
    for (const listener of listeners.get(type) || []) listener(event);
    const value = responsePromise ? await responsePromise : undefined;
    let consumed = 0;
    while (consumed < waits.length) { const batch = waits.slice(consumed); consumed = waits.length; await Promise.all(batch); }
    return { intercepted, response: value, waitCount: waits.length };
  }
  return { ...state, state, scopeURL, workerURL, client, caches, WorkerRequest, dispatch,
    async request(relative, init = {}) {
      return dispatch('fetch', { request: new WorkerRequest(new URL(relative, scopeURL).href, init) });
    },
    async seed(name, relative, body) { const url = new URL(relative, scopeURL).href; await (await caches.open(name)).put(url, response(body, url)); },
    async install() {
      const result = await dispatch('install');
      assert(result.waitCount > 0, 'Install must await its precache work');
      const current = (await caches.keys()).filter(name => name.startsWith(PREFIX) && name !== PREFIX + 'previous');
      assert.equal(current.length, 1, 'One versioned current cache should exist after installation');
      return current[0];
    }
  };
}

async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

async function main() {
  if (!fs.existsSync(swPath)) throw new Error('Service worker does not exist yet: ' + swPath);
  const source = fs.readFileSync(swPath, 'utf8');
  for (const scope of ['https://game.example.test/', 'https://game.example.test/arcade/bloomshot/']) {
    const label = new URL(scope).pathname;
    await test(label + ' installs the complete same-origin shell using reload and never forces activation', async () => {
      const h = harness(source, scope);
      await h.seed(PREFIX + 'previous', './index.html', 'OLD-SHELL');
      const current = await h.install();
      assert(current.startsWith(PREFIX));
      assert.deepEqual([...new Set(h.state.requests.map(r => r.url))].sort(), [...h.expectedURLs].sort());
      assert(h.state.requests.every(r => r.method === 'GET' && r.cache === 'reload' && r.credentials === 'same-origin'));
      assert.equal((await h.caches.open(current)).keys ? (await (await h.caches.open(current)).keys()).length : 0, ASSETS.length);
      assert.equal(h.state.skipWaiting, 0); assert.equal(h.state.claims, 0);
      assert(await h.caches.has(PREFIX + 'previous'));
    });

    await test(label + ' serves the cached app entry and version-coherent static assets offline, including query URLs', async () => {
      const h = harness(source, scope);
      await h.seed(PREFIX + 'previous', './index.html', 'OLD-SHELL');
      await h.install(); h.state.offline = true;
      for (const entry of ['./', './?from=homescreen', './index.html', './index.html?mode=rush']) {
        const result = await h.request(entry, { mode: 'navigate', destination: 'document' });
        assert(result.intercepted); assert(result.response instanceof Response);
        assert.equal(await result.response.text(), 'release-A:./index.html');
      }
      for (const asset of ASSETS.filter(asset => asset !== './' && asset !== './index.html')) {
        const result = await h.request(asset + '?build=uncached-query');
        assert(result.intercepted); assert.equal(await result.response.text(), 'release-A:' + asset);
      }
      h.state.offline = false; h.state.revision = 'release-B';
      const requestCount = h.state.requests.length;
      assert.equal(await (await h.request('./engine.js')).response.text(), 'release-A:./engine.js');
      assert.equal(h.state.requests.length, requestCount, 'Cached shell must not silently mix release-B assets into release-A');
    });

    await test(label + ' leaves non-GET, foreign-origin, API, authentication, and unknown routes untouched', async () => {
      const h = harness(source, scope); await h.install();
      const requestCount = h.state.requests.length;
      const cases = [
        ['./app.js', { method: 'POST' }], ['./index.html', { method: 'HEAD' }],
        ['https://other.example.test/app.js', {}], ['./api/payments', {}], ['./auth/callback', {}],
        ['./unknown.js', {}], ['./sw.js', {}], ['./nested/engine.js', {}],
        ['./auth/callback?code=private', { mode: 'navigate', destination: 'document' }],
        ['./unknown-route', { mode: 'navigate', destination: 'document' }],
        ['https://game.example.test/outside-scope/app.js', {}]
      ];
      for (const [url, init] of cases) {
        const result = await h.request(url, init);
        assert.equal(result.intercepted, false, 'Unexpected interception: ' + url + ' ' + (init.method || 'GET'));
      }
      assert.equal(h.state.requests.length, requestCount, 'Skipped requests belong to the browser, not this worker');
    });

    for (const invalid of [
      { name: 'missing asset', asset: './rush.js', options: { status: 404 } },
      { name: 'network failure', asset: './sound.js', options: { throw: true } },
      { name: 'HTML disguised as JavaScript', asset: './engine.js', options: { contentType: 'text/html' } },
      { name: 'HTML disguised as a font', asset: './assets/fonts/fredoka.woff2', options: { contentType: 'text/html' } },
      { name: 'opaque response', asset: './icons/icon-192.png', options: { type: 'opaque' } },
      { name: 'cross-origin redirect', asset: './app.js', options: { redirected: true, responseUrl: 'https://login.example.test/app.js' } }
    ]) {
      await test(label + ' rejects ' + invalid.name + ' without deleting the previous release or foreign caches', async () => {
        const h = harness(source, scope);
        await h.seed(PREFIX + 'previous', './index.html', 'OLD-SHELL');
        await h.seed('another-app-cache-v9', './another-app.js', 'FOREIGN-ASSET');
        h.overrides.set(new URL(invalid.asset, scope).href, invalid.options);
        await assert.rejects(h.dispatch('install'));
        assert.deepEqual((await h.caches.keys()).sort(), [PREFIX + 'previous', 'another-app-cache-v9'].sort());
        assert.equal(await (await (await h.caches.open(PREFIX + 'previous')).match(new URL('./index.html', scope).href)).text(), 'OLD-SHELL');
        assert.equal(h.state.skipWaiting, 0); assert.equal(h.state.claims, 0);
        assert(h.state.deletedCaches.every(name => name.startsWith(PREFIX) && name !== PREFIX + 'previous'));
      });
    }

    await test(label + ' forces takeover only for the explicit message from a same-origin client', async () => {
      const h = harness(source, scope); await h.install();
      const same = { source: h.client, origin: new URL(scope).origin };
      for (const data of [undefined, null, {}, { type: 'ACTIVATE' }, { type: 'SKIP_WAITING_typo' }]) await h.dispatch('message', { ...same, data });
      await h.dispatch('message', { data: { type: 'SKIP_WAITING' }, source: null, origin: new URL(scope).origin });
      await h.dispatch('message', { data: { type: 'SKIP_WAITING' }, source: { id: 'foreign-client', type: 'window', url: 'https://other.example.test/' }, origin: 'https://other.example.test' });
      assert.equal(h.state.skipWaiting, 0);
      await h.dispatch('message', { ...same, data: { type: 'SKIP_WAITING' } });
      assert.equal(h.state.skipWaiting, 1);
    });

    await test(label + ' activation removes only older shell caches and claims clients after cleanup', async () => {
      const h = harness(source, scope);
      await h.seed(PREFIX + 'previous', './index.html', 'OLD-SHELL');
      await h.seed(PREFIX + 'another-old-release', './engine.js', 'OLD-ENGINE');
      await h.seed('another-app-cache-v9', './another-app.js', 'FOREIGN-ASSET');
      await h.seed('bloomshot-player-data-v1', './player-data', 'KEEP-PROGRESS-CACHE');
      // This test intentionally seeds a second older shell cache; infer the current name from new keys.
      await h.dispatch('install');
      const current = (await h.caches.keys()).find(name => name.startsWith(PREFIX) && name !== PREFIX + 'previous' && name !== PREFIX + 'another-old-release');
      assert(current);
      await h.dispatch('activate');
      assert.deepEqual((await h.caches.keys()).sort(), [current, 'another-app-cache-v9', 'bloomshot-player-data-v1'].sort());
      assert.equal(h.state.claims, 1); assert.equal(h.state.skipWaiting, 0);
      assert(h.state.deletedCaches.every(name => name.startsWith(PREFIX) && name !== current));
    });
  }
  const report = { worker: swPath, passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    scope: 'VM behavior tests at origin-root and nested deployment paths; no network or hosting writes.',
    limits: 'Mocks exercise worker routing, precache, MIME rejection, update messages, and cache ownership. They do not prove browser registration, manifest installability, actual iOS/Android installation, storage persistence, multi-tab UI consent, or payments.',
    results };
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
