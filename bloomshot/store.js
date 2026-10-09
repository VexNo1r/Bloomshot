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
  //
  // Consumables (powerups) are bought again and again and are never "owned". A purchase becomes a grant
  // ({ id, productId, item, count }) that waits in a small ledger until the game takes it with deliver(), so a
  // paid powerup survives the app closing mid-purchase and is never handed over twice. The ledger lists every
  // consumable transaction this install has already dealt with. A transaction it has not seen is granted only
  // if this install had started buying that product and not yet settled it; anything else (bought before a
  // reinstall, on another device, or brought back by Restore) is only noted, so old powerups are never paid out again.
  var CACHE_KEY = 'bloomshot.entitlements.v1';
  var MOCK_KEY = 'bloomshot.mockstore.v1';
  var GRANTS_KEY = 'bloomshot.grants.v1';
  var MOCK_GRANTS_KEY = 'bloomshot.mockgrants.v1';
  var INFLIGHT_DAYS = 7; // Google Play lets a slow payment method stay pending for a few days

  function create(env) {
    env = env || {};
    var config = env.config || {};
    var storage = env.storage || null;
    var Capacitor = env.Capacitor || null;
    // A product grants one or more entitlements: `entitlement: 'x'` for a single item, or
    // `entitlements: ['x', 'y']` for a bundle (one store product attached to several RevenueCat entitlements).
    // `entitlement` is always the first of them. A product that grants nothing can never be sold.
    // A consumable grants `grants: { item: 'x', count: n }` instead, and no entitlements at all.
    var catalog = (config.products || []).map(function (p) {
      var list = Array.isArray(p.entitlements) ? p.entitlements : p.entitlement != null ? [p.entitlement] : [];
      var granted = list.map(String).filter(function (id, i, all) { return id && all.indexOf(id) === i; });
      var consumable = p.consumable === true;
      var grants = consumable && p.grants && typeof p.grants.item === 'string' && p.grants.item && Number.isInteger(p.grants.count) && p.grants.count > 0 ? { item: p.grants.item, count: p.grants.count } : null;
      var sellable = consumable ? Boolean(grants) && granted.length === 0 : granted.length > 0;
      return { id: String(p.id), entitlements: consumable ? [] : granted, entitlement: consumable ? '' : granted[0] || '', consumable: consumable, grants: grants, kind: p.kind || 'item', title: String(p.title || p.id), priceHint: p.priceHint || '', available: p.available === true && sellable };
    });
    var byId = {};
    catalog.forEach(function (p) { byId[p.id] = p; });

    var native = Boolean(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
    var mode = native ? 'native' : env.allowMock ? 'mock' : 'web';
    var state = { mode: mode, ready: false, configured: false, owned: {}, storeProducts: {}, prices: {}, amounts: {}, busy: false };
    var listeners = [];
    var initPromise = null;
    var plugin = null;
    var mockNext = 'success';
    var mockBought = []; // mock mode only: the products the simulated store account has bought, so restore() can grant them again
    var mockTxs = []; // mock mode only: the simulated account's consumable transactions, shaped like RevenueCat's
    var now = typeof env.now === 'function' ? env.now : function () { return Date.now(); };
    var grantsKey = mode === 'mock' ? MOCK_GRANTS_KEY : GRANTS_KEY;
    // The powerup ledger. baseline: the account has been checked at least once, so a new purchase cannot be confused
    // with an old one. seen: consumable transaction ids already dealt with. inflight: consumable purchases this install
    // started and has not settled. owed: grants the game has not taken yet.
    var ledger = { baseline: false, seen: [], inflight: [], owed: [] };

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
      if (mode === 'mock') saveMock();
      if (changed) emit('entitlements');
      return changed;
    }
    // The price hint is only ever written in US dollars ("$4.99"); anything else has no usable amount.
    function hintAmount(hint) {
      var match = /^\s*\$\s*(\d+(?:\.\d{1,2})?)\s*$/.exec(String(hint || ''));
      return match ? { amount: Number(match[1]), currency: 'USD' } : { amount: null, currency: null };
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
      // Google Play: the player chose a slow payment method (cash, some carriers). Nothing is charged yet; RevenueCat
      // reports the transaction once it clears, and the next launch or Restore turns it into a grant.
      var data = (error && error.data) || {};
      if (String(error && error.code) === '20' || String(data.code) === '20' || [error && error.readableErrorCode, data.readableErrorCode, data.readable_error_code].indexOf('PAYMENT_PENDING_ERROR') >= 0) return { ok: false, pending: true, reason: 'pending' };
      return { ok: false, reason: 'error', message: String((error && error.message) || error || 'Store error') };
    }

    function loadLedger() {
      var saved = read(grantsKey) || {};
      var oldest = now() - INFLIGHT_DAYS * 24 * 60 * 60 * 1000;
      ledger = {
        baseline: saved.baseline === true,
        seen: Array.isArray(saved.seen) ? saved.seen.filter(function (id) { return typeof id === 'string'; }) : [],
        inflight: Array.isArray(saved.inflight) ? saved.inflight.filter(function (f) { return f && byId[f.product] && byId[f.product].consumable && f.at >= oldest; }) : [],
        owed: Array.isArray(saved.owed) ? saved.owed.filter(function (g) { return g && typeof g.id === 'string' && typeof g.item === 'string' && Number.isInteger(g.count) && g.count > 0; }) : []
      };
    }
    function saveLedger() { write(grantsKey, { v: 1, baseline: ledger.baseline, seen: ledger.seen, inflight: ledger.inflight, owed: ledger.owed }); }
    function startInflight(p) { ledger.inflight.push({ product: p.id, at: now() }); saveLedger(); }
    function endInflight(p) {
      var at = -1;
      ledger.inflight.forEach(function (f, i) { if (f.product === p.id) at = i; }); // the newest one: the purchase that just settled
      if (at >= 0) ledger.inflight.splice(at, 1);
    }
    function owe(id, p) {
      var grant = { id: id, productId: p.id, item: p.grants.item, count: p.grants.count };
      ledger.seen.push(id); ledger.owed.push(grant);
      return grant;
    }
    function consumableTxs(info) {
      var list = info && Array.isArray(info.nonSubscriptionTransactions) ? info.nonSubscriptionTransactions : [];
      return list.filter(function (t) { return t && typeof t.transactionIdentifier === 'string' && t.transactionIdentifier && byId[t.productIdentifier] && byId[t.productIdentifier].consumable; });
    }
    // Settle the account's consumable transactions against the ledger. Returns the grants it added.
    function reconcile(info) {
      var added = [];
      consumableTxs(info).forEach(function (t) {
        var id = t.transactionIdentifier, p = byId[t.productIdentifier];
        if (ledger.seen.indexOf(id) >= 0) return;
        var started = ledger.inflight.some(function (f) { return f.product === p.id; });
        if (!started) { ledger.seen.push(id); return; } // not bought from this install: a Restore or another device
        endInflight(p);
        added.push(owe(id, p));
      });
      ledger.baseline = true;
      saveLedger();
      if (added.length) emit('grants');
      return added;
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
      try {
        var info = (await plugin.getCustomerInfo()).customerInfo;
        setOwned(activeFrom(info));
        reconcile(info); // a powerup paid for while the app was closed or had crashed becomes a grant now
      } catch (_) { /* offline: keep the cached answer */ }
      try {
        var ids = catalog.filter(function (p) { return p.available; }).map(function (p) { return p.id; });
        if (ids.length) {
          var found = (await plugin.getProducts({ productIdentifiers: ids, type: 'NON_SUBSCRIPTION' })).products || [];
          found.forEach(function (sp) {
            state.storeProducts[sp.identifier] = sp; state.prices[sp.identifier] = sp.priceString;
            // The store's own number and currency, so the UI can compare prices exactly instead of parsing a string.
            state.amounts[sp.identifier] = Number.isFinite(sp.price) && typeof sp.currencyCode === 'string' && sp.currencyCode ? { amount: sp.price, currency: sp.currencyCode } : { amount: null, currency: null };
          });
          emit('products');
        }
      } catch (_) { /* prices fall back to the hint */ }
    }

    function initMock() {
      var saved = read(MOCK_KEY);
      if (saved && Array.isArray(saved.owned)) state.owned = Object.fromEntries(saved.owned.map(function (id) { return [id, true]; }));
      if (saved && Array.isArray(saved.bought)) mockBought = saved.bought.filter(function (id) { return byId[id]; });
      if (saved && Array.isArray(saved.txs)) mockTxs = saved.txs.filter(function (t) { return t && byId[t.productIdentifier]; });
      state.configured = true;
      reconcile(mockInfo());
    }
    function mockInfo() { return { nonSubscriptionTransactions: mockTxs.slice() }; }
    function saveMock() { write(MOCK_KEY, { v: 1, owned: ownedIds(), bought: mockBought, txs: mockTxs }); }

    function init() {
      if (!initPromise) {
        initPromise = (async function () {
          if (mode !== 'web') loadLedger();
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
        // A consumable is never owned or partial: it can always be bought again.
        return { id: p.id, entitlement: p.entitlement, entitlements: p.entitlements.slice(), consumable: p.consumable, grants: p.grants ? { item: p.grants.item, count: p.grants.count } : null,
          kind: p.kind, title: p.title, available: p.available,
          owned: p.entitlements.length > 0 && held === p.entitlements.length, partial: held > 0 && held < p.entitlements.length,
          price: state.prices[p.id] || p.priceHint,
          // amount and currency describe the same price as `price`: the store's once it has loaded, else the hint's.
          amount: (state.amounts[p.id] || hintAmount(p.priceHint)).amount, currency: (state.amounts[p.id] || hintAmount(p.priceHint)).currency };
      });
    }

    async function purchase(productId) {
      var p = byId[productId];
      if (!p) return { ok: false, reason: 'unknown-product' };
      if (!p.available) return { ok: false, reason: 'unavailable-product' };
      await init();
      if (!live()) return { ok: false, reason: 'unavailable' };
      if (p.consumable) {
        if (state.busy) return { ok: false, reason: 'busy' };
        state.busy = true; emit('busy');
        try { return await buyConsumable(p); } catch (error) { return classify(error); } finally { state.busy = false; emit('busy'); }
      }
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

    function copyGrant(g) { return { id: g.id, productId: g.productId, item: g.item, count: g.count }; }

    // A successful buy answers { ok: true, grant }. The grant also waits in the ledger until deliver() hands it over.
    async function buyConsumable(p) {
      if (mode === 'mock') {
        await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
        var outcome = mockNext; mockNext = 'success';
        if (outcome === 'cancel') return { ok: false, cancelled: true, reason: 'cancelled' };
        if (outcome === 'fail') return { ok: false, reason: 'error', message: 'Simulated store failure' };
        var tx = { transactionIdentifier: 'mock-' + now() + '-' + (mockTxs.length + 1), productIdentifier: p.id };
        startInflight(p);
        mockTxs.push(tx); saveMock(); // the simulated account has been charged
        // pending: the payment clears later. crash: the app closed before it heard back. Either way the next
        // launch or Restore finds the transaction and grants it.
        if (outcome === 'pending') return { ok: false, pending: true, reason: 'pending' };
        if (outcome === 'crash') return { ok: false, reason: 'error', message: 'Simulated app crash after payment' };
        endInflight(p);
        var mockGrant = owe(tx.transactionIdentifier, p);
        saveLedger(); emit('grants');
        return { ok: true, grant: copyGrant(mockGrant) };
      }
      var product = state.storeProducts[p.id];
      if (!product) return { ok: false, reason: 'product-not-found' }; // not live in the store yet
      // Note the account's earlier transactions before buying, so this purchase is the only new one.
      if (!ledger.baseline) reconcile((await plugin.getCustomerInfo()).customerInfo);
      startInflight(p);
      var result;
      try {
        result = await plugin.purchaseStoreProduct({ product: product });
      } catch (error) {
        var failed = classify(error);
        if (!failed.pending) { endInflight(p); saveLedger(); } // a pending payment keeps its place until it clears
        return failed;
      }
      var info = result && result.customerInfo;
      if (info) setOwned(activeFrom(info));
      var t = result && result.transaction;
      var id = t && typeof t.transactionIdentifier === 'string' ? t.transactionIdentifier : '';
      var grant = null;
      if (id) {
        endInflight(p);
        if (ledger.seen.indexOf(id) < 0) { grant = owe(id, p); emit('grants'); }
        saveLedger();
      }
      // Without a transaction in the answer, the account's list still shows the purchase: the inflight entry claims it.
      var added = reconcile(info);
      if (!grant) grant = added.filter(function (g) { return g.productId === p.id; })[0] || null;
      return grant ? { ok: true, grant: copyGrant(grant) } : { ok: false, reason: 'not-granted' };
    }

    function pendingGrants() { return ledger.owed.map(copyGrant); }
    // fn(grant) must add grant.count of grant.item to the player's save, write the save, and return true. Only then is
    // the grant marked delivered; anything else (false, a throw) leaves it waiting for the next call.
    function deliver(fn) {
      if (typeof fn !== 'function' || mode === 'web') return 0;
      var done = 0;
      ledger.owed.slice().forEach(function (g) {
        var taken = false;
        try { taken = fn(copyGrant(g)) === true; } catch (_) { taken = false; }
        if (!taken) return;
        ledger.owed = ledger.owed.filter(function (x) { return x.id !== g.id; });
        saveLedger();
        done += 1;
      });
      return done;
    }

    async function restore() {
      await init();
      if (!live()) return { ok: false, reason: 'unavailable' };
      var before = ownedIds();
      try {
        if (mode === 'native') {
          var info = (await plugin.restorePurchases()).customerInfo;
          setOwned(activeFrom(info));
          reconcile(info); // settles a pending powerup payment; old powerups are noted, never paid out again
        } else {
          await new Promise(function (resolve) { setTimeout(resolve, env.mockDelay == null ? 350 : env.mockDelay); });
          // The simulated account remembers its purchases, like the real one: restoring grants everything they include.
          setOwned(mockBought.reduce(function (all, id) { return byId[id] ? union(all, byId[id].entitlements) : all; }, ownedIds()));
          reconcile(mockInfo());
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
      pendingGrants: pendingGrants,
      deliver: deliver,
      subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
      create: create
    };
    if (mode === 'mock') {
      api.dev = {
        nextResult: function (outcome) { mockNext = outcome; },
        // reset: a brand new store account. forgetLocal: a reinstall, where the account still has its purchases but the
        // device has lost them, so only Restore purchases brings them back.
        // Powerups are not restored: after forgetLocal the account's old powerup purchases are noted, never granted again.
        reset: function () { state.owned = {}; mockBought = []; mockTxs = []; ledger = { baseline: false, seen: [], inflight: [], owed: [] }; saveLedger(); saveMock(); emit('entitlements'); },
        forgetLocal: function () { state.owned = {}; ledger = { baseline: false, seen: [], inflight: [], owed: [] }; saveLedger(); saveMock(); emit('entitlements'); }
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
