'use strict';
// Release packaging replaces this tag with the hash of the shipped assets.
const CACHE_PREFIX = 'bloomshot-shell-';
const VERSION = 'dd9f6269858015fa';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const ASSETS = ['./', './index.html', './styles.css', './levels.js', './moon.js', './garden.js', './engine.js', './rush.js', './art.js', './meadow.js', './sound.js', './app.js', './pwa.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './assets/botanical-header.png', './assets/split-leaf.png'];
const BASE = new URL(self.registration.scope);
const URLS = ASSETS.map(path => new URL(path, BASE).href);
const INDEX = new URL('index.html', BASE).href;
const ALLOWED = new Set(URLS);

async function downloadStatus(completed, failed = false) {
  if (!self.clients.matchAll) return;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) if (client.url.startsWith(BASE.href)) client.postMessage({ type: 'BLOOMSHOT_DOWNLOAD', completed, total: URLS.length, failed });
}

function validAsset(response, url) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  // A sign-in page must never replace a game asset in the offline shell.
  if (response.redirected || (response.url && new URL(response.url).origin !== BASE.origin)) return false;
  const path = new URL(url).pathname;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (path.endsWith('.js')) return /javascript|ecmascript/.test(type);
  if (path.endsWith('.css')) return type.includes('text/css');
  if (path.endsWith('.png')) return type.includes('image/png');
  if (path.endsWith('.svg')) return type.includes('image/svg+xml');
  if (path.endsWith('.webmanifest')) return /json|manifest/.test(type);
  return type.includes('text/html');
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existed = await caches.has(CACHE_NAME);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 60000);
    let completed = 0;
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(URLS.map(async url => {
        const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin', signal: controller.signal }));
        if (!validAsset(response, url)) throw new Error('Incomplete game download');
        // Drain each body immediately: waiting for all headers first can exhaust
        // a browser's connection slots while large image streams remain unread.
        await cache.put(url, response);
        downloadStatus(++completed).catch(() => {});
      }));
    } catch (error) {
      controller.abort();
      if (!existed) await caches.delete(CACHE_NAME);
      downloadStatus(completed, true).catch(() => {});
      throw error;
    } finally {
      clearTimeout(deadline);
    }
    // A running game keeps its current version until the player chooses Update.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'SKIP_WAITING' || !event.source?.url) return;
  const source = new URL(event.source.url);
  if (source.origin === BASE.origin && source.pathname.startsWith(BASE.pathname)) event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin) return;
  const isHome = url.pathname === BASE.pathname || url.pathname === new URL(INDEX).pathname;
  const key = isHome ? INDEX : url.origin + url.pathname;
  if (!ALLOWED.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(request);
    if (validAsset(response, key)) await cache.put(key, response.clone());
    return response;
  })());
});
