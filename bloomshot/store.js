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
    // A product grants one or more entitlements: `entitlement: 'x'` for a single item, or
    // `entitlements: ['x', 'y']` for a bundle (one store product attached to several RevenueCat entitlements).
    // `entitlement` is always the first of them. A product that grants nothing can never be sold.
    var catalog = (config.products || []).map(function (p) {
      var list = Array.isArray(p.entitlements) ? p.entitlements : p.entitlement != null ? [p.entitlement] : [];
      var granted = list.map(String).filter(function (id, i, all) { return id && all.indexOf(id) === i; });
      return { id: String(p.id), entitlements: granted, entitlement: granted[0] || '', kind: p.kind || 'item', title: String(p.title || p.id), priceHint: p.priceHint || '', available: p.available === true && granted.length > 0 };
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
    var mockBought = []; // mock mode only: the products the simulated store account has bought, so restore() can grant them again

    // The native WebView injects plugins as Capacitor.Plugins.<Name>. Capacitor.registerPlugin only exists when the
    // @capacitor/core script is bundled into the page, which this app does not do, so look there second.
    function findPlugin(name) {
      try {
        var found = Capacitor.Plugins && Capacitor.Plugins[name];
        if (found) return found;
        if (typeof Capacitor.registerPlugin === 'function') return Capacitor.registerPlugin(name) || null;
      } catch (_) { /* not installed in this build */ }
      return null;
    }
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
      if (mode === 'mock') write(MOCK_KEY, { v: 1, owned: ids, bought: mockBought });
      if (changed) emit('entitlements');
      return changed;
    }
    function union(a, b) { return a.concat(b.filter(function (id) { return a.indexOf(id) < 0; })); }
    function heldOf(p) { return p.entitlements.filter(function (id) { return state.owned[id]; }); }
    // The title the player knows an entitlement by: the single-item product that grants it.
    function nameOf(entitlement) {
      var single = catalog.filter(function (p) { return p.entitlements.length === 1 && p.entitlements[0] === entitlement; })[0];
      return single ? single.title : entitlement;
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
      plugin = findPlugin('Purchases');
      if (!plugin) return; // the purchase plugin is missing from this build: stay unconfigured, sell nothing
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
      if (saved && Array.isArray(saved.bought)) mockBought = saved.bought.filter(function (id) { return byId[id]; });
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
        var held = heldOf(p).length;
        // owned: everything this product grants is already the player's. partial: some of it is, which means
        // buying it would charge for something they have (a bundle after one of its items), so it is refused.
        return { id: p.id, entitlement: p.entitlement, entitlements: p.entitlements.slice(), kind: p.kind, title: p.title, available: p.available,
          owned: p.entitlements.length > 0 && held === p.entitlements.length, partial: held > 0 && held < p.entitlements.length,
          price: state.prices[p.id] || p.priceHint };
      });
    }

    async function purchase(productId) {
      var p = byId[productId];
      if (!p) return { ok: false, reason: 'unknown-product' };
      if (!p.available) return { ok: false, reason: 'unavailable-product' };
      await init();
      if (!live()) return { ok: false, reason: 'unavailable' };
      var held = heldOf(p);
      if (held.length === p.entitlements.length) return { ok: true, alreadyOwned: true, entitlement: p.entitlement, entitlements: p.entitlements.slice() };
      if (held.length) return { ok: false, reason: 'partly-owned', owned: held }; // never charge for part of a bundle the player already has
      if (state.busy) return { ok: false, reason: 'busy' };
      state.busy = true; emit('busy');
      try {
        if (mode === 'mock') {
          await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
          var outcome = mockNext; mockNext = 'success';
          if (outcome === 'cancel') return { ok: false, cancelled: true, reason: 'cancelled' };
          if (outcome === 'fail') return { ok: false, reason: 'error', message: 'Simulated store failure' };
          mockBought = union(mockBought, [p.id]);
          setOwned(union(ownedIds(), p.entitlements));
          return { ok: true, entitlement: p.entitlement, entitlements: p.entitlements.slice() };
        }
        var product = state.storeProducts[p.id];
        if (!product) return { ok: false, reason: 'product-not-found' }; // not live in the store yet
        var result = await plugin.purchaseStoreProduct({ product: product });
        setOwned(activeFrom(result.customerInfo));
        // A bundle must grant every entitlement it lists. If the store product is not attached to all of them in
        // RevenueCat, say so instead of pretending the player got everything.
        var missing = p.entitlements.filter(function (id) { return !state.owned[id]; });
        return missing.length ? { ok: false, reason: 'not-granted', missing: missing } : { ok: true, entitlement: p.entitlement, entitlements: p.entitlements.slice() };
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
        else {
          await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
          // The simulated account remembers its purchases, like the real one: restoring grants everything they include.
          setOwned(mockBought.reduce(function (all, id) { return byId[id] ? union(all, byId[id].entitlements) : all; }, ownedIds()));
        }
      } catch (error) { return classify(error); }
      var after = ownedIds();
      var restored = after.filter(function (id) { return before.indexOf(id) < 0; });
      return { ok: true, restored: restored, names: restored.map(nameOf), total: after.length };
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
        // reset: a brand new store account. forgetLocal: a reinstall, where the account still has its purchases but the
        // device has lost them, so only Restore purchases brings them back.
        reset: function () { state.owned = {}; mockBought = []; write(MOCK_KEY, { v: 1, owned: [], bought: [] }); emit('entitlements'); },
        forgetLocal: function () { state.owned = {}; write(MOCK_KEY, { v: 1, owned: [], bought: mockBought }); emit('entitlements'); }
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
