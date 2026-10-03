(function (root, factory) {
  'use strict';
  var store = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = store;
  else root.BloomStore = store;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Purchases and entitlements. Three modes, chosen once at startup:
  //   native: inside the Capacitor app; the store (via RevenueCat) is the only source of truth.
  //   mock:   simulated purchases for development on localhost or an allow-listed host. Never on a public site.
  //   web:    the website sells nothing, so owns() is always false.
  var CACHE_KEY = 'bloomshot.entitlements.v1';
  var MOCK_KEY = 'bloomshot.mockstore.v1';

  function create(env) {
    env = env || {};
    var config = env.config || {};
    var storage = env.storage || null;
    var Capacitor = env.Capacitor || null;
    var catalog = (config.products || []).map(function (p) {
      return { id: String(p.id), entitlement: String(p.entitlement), kind: p.kind || 'item', title: String(p.title || p.id), priceHint: p.priceHint || '', available: p.available === true };
    });
    var byId = {};
    catalog.forEach(function (p) { byId[p.id] = p; });

    var native = Boolean(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
    var mode = native ? 'native' : env.allowMock ? 'mock' : 'web';
    var state = { mode: mode, ready: false, configured: false, owned: {}, storeProducts: {}, prices: {}, busy: false };
    var listeners = [];
    var initPromise = null;
    var plugin = null;
    var mockNext = 'success';

    function read(key) { try { return storage ? JSON.parse(storage.getItem(key) || 'null') : null; } catch (_) { return null; } }
    function write(key, value) { try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage can be blocked; the store stays the source of truth */ } }
    function emit(type) {
      listeners.slice().forEach(function (fn) { try { fn({ type: type }); } catch (_) { /* a broken listener must not break purchases */ } });
    }
    function ownedIds() { return Object.keys(state.owned).filter(function (id) { return state.owned[id]; }); }
    function setOwned(ids) {
      var next = {};
      ids.forEach(function (id) { next[id] = true; });
      var changed = ownedIds().sort().join('|') !== Object.keys(next).sort().join('|');
      state.owned = next;
      if (mode === 'native') write(CACHE_KEY, { v: 1, owned: ids });
      if (mode === 'mock') write(MOCK_KEY, { v: 1, owned: ids });
      if (changed) emit('entitlements');
      return changed;
    }
    function activeFrom(info) {
      var active = info && info.entitlements && info.entitlements.active;
      return active && typeof active === 'object' ? Object.keys(active) : [];
    }
    function classify(error) {
      if (error && (error.userCancelled === true || (error.data && error.data.userCancelled === true))) return { ok: false, cancelled: true, reason: 'cancelled' };
      return { ok: false, reason: 'error', message: String((error && error.message) || error || 'Store error') };
    }

    async function initNative() {
      var key = (config.revenueCatKeys || {})[Capacitor.getPlatform()];
      var cached = read(CACHE_KEY); // first paint only; replaced by the store's answer below
      if (cached && Array.isArray(cached.owned)) state.owned = Object.fromEntries(cached.owned.map(function (id) { return [id, true]; }));
      if (!key) return; // no accounts yet: stay unconfigured, sell nothing
      plugin = Capacitor.registerPlugin('Purchases');
      try {
        var configured = false;
        try { configured = (await plugin.isConfigured()).isConfigured === true; } catch (_) { configured = false; }
        if (!configured) await plugin.configure({ apiKey: key });
        state.configured = true;
      } catch (_) { return; }
      try { setOwned(activeFrom((await plugin.getCustomerInfo()).customerInfo)); } catch (_) { /* offline: keep the cached answer */ }
      try {
        var ids = catalog.filter(function (p) { return p.available; }).map(function (p) { return p.id; });
        if (ids.length) {
          var found = (await plugin.getProducts({ productIdentifiers: ids, type: 'NON_SUBSCRIPTION' })).products || [];
          found.forEach(function (sp) { state.storeProducts[sp.identifier] = sp; state.prices[sp.identifier] = sp.priceString; });
          emit('products');
        }
      } catch (_) { /* prices fall back to the hint */ }
    }

    function initMock() {
      var saved = read(MOCK_KEY);
      if (saved && Array.isArray(saved.owned)) state.owned = Object.fromEntries(saved.owned.map(function (id) { return [id, true]; }));
      state.configured = true;
    }

    function init() {
      if (!initPromise) {
        initPromise = (async function () {
          if (mode === 'native') await initNative();
          else if (mode === 'mock') initMock();
          state.ready = true;
          emit('ready');
          return { mode: mode, configured: state.configured };
        })();
      }
      return initPromise;
    }

    function live() { return state.configured && (mode === 'native' || mode === 'mock'); }

    function products() {
      return catalog.map(function (p) {
        return { id: p.id, entitlement: p.entitlement, kind: p.kind, title: p.title, available: p.available, owned: Boolean(state.owned[p.entitlement]), price: state.prices[p.id] || p.priceHint };
      });
    }

    async function purchase(productId) {
      var p = byId[productId];
      if (!p) return { ok: false, reason: 'unknown-product' };
      if (!p.available) return { ok: false, reason: 'unavailable-product' };
      await init();
      if (!live()) return { ok: false, reason: 'unavailable' };
      if (state.owned[p.entitlement]) return { ok: true, alreadyOwned: true, entitlement: p.entitlement };
      if (state.busy) return { ok: false, reason: 'busy' };
      state.busy = true; emit('busy');
      try {
        if (mode === 'mock') {
          await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
          var outcome = mockNext; mockNext = 'success';
          if (outcome === 'cancel') return { ok: false, cancelled: true, reason: 'cancelled' };
          if (outcome === 'fail') return { ok: false, reason: 'error', message: 'Simulated store failure' };
          setOwned(ownedIds().concat(p.entitlement));
          return { ok: true, entitlement: p.entitlement };
        }
        var product = state.storeProducts[p.id];
        if (!product) return { ok: false, reason: 'product-not-found' }; // not live in the store yet
        var result = await plugin.purchaseStoreProduct({ product: product });
        setOwned(activeFrom(result.customerInfo));
        return state.owned[p.entitlement] ? { ok: true, entitlement: p.entitlement } : { ok: false, reason: 'not-granted' };
      } catch (error) {
        return classify(error);
      } finally {
        state.busy = false; emit('busy');
      }
    }

    async function restore() {
      await init();
      if (!live()) return { ok: false, reason: 'unavailable' };
      var before = ownedIds();
      try {
        if (mode === 'native') setOwned(activeFrom((await plugin.restorePurchases()).customerInfo));
        else await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
      } catch (error) { return classify(error); }
      var after = ownedIds();
      return { ok: true, restored: after.filter(function (id) { return before.indexOf(id) < 0; }), total: after.length };
    }

    var api = {
      get mode() { return mode; },
      get ready() { return state.ready; },
      get busy() { return state.busy; },
      init: init,
      isLive: live,
      products: products,
      owns: function (entitlement) { return mode !== 'web' && Boolean(state.owned[entitlement]); },
      purchase: purchase,
      restore: restore,
      subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
      create: create
    };
    if (mode === 'mock') {
      api.dev = {
        nextResult: function (outcome) { mockNext = outcome; },
        reset: function () { state.owned = {}; write(MOCK_KEY, { v: 1, owned: [] }); emit('entitlements'); }
      };
    }
    return api;
  }

  function defaultEnv() {
    var env = { config: root.BloomStoreConfig, Capacitor: root.Capacitor };
    try { env.storage = root.localStorage; } catch (_) { env.storage = null; }
    try {
      var loc = root.location;
      var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
      var listed = ((env.config && env.config.mockHosts) || []).indexOf(loc.hostname) >= 0;
      env.allowMock = new URLSearchParams(loc.search).has('mockstore') && (local || listed);
    } catch (_) { env.allowMock = false; }
    return env;
  }

  return create(defaultEnv());
});
