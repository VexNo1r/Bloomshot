'use strict';
// Purchase layer tests. Uses a fake RevenueCat plugin and fake storage; no network, no real store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../store.js');
const Powers = require('../powers.js');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
function memoryStorage(seed = {}) {
  const data = { ...seed };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}
const CONFIG = {
  revenueCatKeys: { ios: 'appl_test', android: 'goog_test' },
  products: [
    { id: 'p.live', entitlement: 'e_live', kind: 'world', title: 'Live World', priceHint: '$4.99', available: true },
    { id: 'p.unbuilt', entitlement: 'e_unbuilt', kind: 'world', title: 'Unbuilt', priceHint: '$4.99', available: false }
  ]
};
function fakePlugin(options = {}) {
  const calls = [];
  const state = { active: options.active || [], configured: false };
  const info = () => ({ entitlements: { active: Object.fromEntries(state.active.map(id => [id, { identifier: id, isActive: true }])) } });
  const plugin = {
    calls,
    isConfigured: async () => ({ isConfigured: state.configured }),
    configure: async cfg => { calls.push(['configure', cfg]); state.configured = true; },
    getCustomerInfo: async () => { calls.push(['getCustomerInfo']); if (options.offline) throw new Error('offline'); return { customerInfo: info() }; },
    getProducts: async opts => { calls.push(['getProducts', opts]); return { products: opts.productIdentifiers.map(id => ({ identifier: id, priceString: '€4,99', price: options.noNumber ? undefined : 4.99, currencyCode: options.noNumber ? undefined : 'EUR' })) }; },
    purchaseStoreProduct: async ({ product }) => {
      calls.push(['purchase', product.identifier]);
      if (options.cancel) { const e = new Error('cancelled'); e.userCancelled = true; throw e; }
      if (options.fail) throw new Error('billing unavailable');
      if (options.slow) await new Promise(r => setTimeout(r, 30));
      if (options.noGrant) return { customerInfo: info() };
      const grant = options.grants ? options.grants[product.identifier] : ['e_live'];
      state.active = state.active.concat(grant.filter(id => !state.active.includes(id)));
      return { customerInfo: info() };
    },
    restorePurchases: async () => { calls.push(['restore']); state.active = options.restoreTo || state.active; return { customerInfo: info() }; },
    setActive: ids => { state.active = ids; }
  };
  return plugin;
}
// The shape the native WebView really injects: a Plugins map and no registerPlugin (that needs @capacitor/core bundled in).
function nativeEnv(plugin, extra = {}) {
  return { config: CONFIG, storage: memoryStorage(), ...extra, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { Purchases: plugin } } };
}
const BUNDLE = {
  revenueCatKeys: CONFIG.revenueCatKeys,
  products: [
    { id: 'p.a', entitlement: 'e_a', kind: 'world', title: 'World A', priceHint: '$4.99', available: true },
    { id: 'p.b', entitlement: 'e_b', kind: 'style', title: 'Style B', priceHint: '$1.99', available: true },
    { id: 'p.both', entitlements: ['e_a', 'e_b'], kind: 'bundle', title: 'Both', priceHint: '$5.99', available: true }
  ]
};
const GRANTS = { 'p.a': ['e_a'], 'p.b': ['e_b'], 'p.both': ['e_a', 'e_b'] };
const bundleEnv = (plugin, extra = {}) => nativeEnv(plugin, { config: BUNDLE, ...extra });
const find = (store, id) => store.products().find(p => p.id === id);

// Powerups: consumable products. The fake account keeps RevenueCat's nonSubscriptionTransactions list.
const POWER = {
  revenueCatKeys: CONFIG.revenueCatKeys,
  products: [
    { id: 'p.live', entitlement: 'e_live', kind: 'world', title: 'Live World', priceHint: '$4.99', available: true },
    { id: 'p.bomb', consumable: true, power: 'bomb', count: 1, kind: 'power', title: 'Seed Bomb', priceHint: '$0.25', available: true },
    { id: 'p.rain', consumable: true, power: 'rain', count: 3, kind: 'power', title: 'Rain', priceHint: '$0.25', available: true }
  ]
};
function powerPlugin(options = {}) {
  const calls = [];
  const state = { txs: (options.txs || []).slice(), configured: false, offline: Boolean(options.offline), next: 1, mode: options.mode || 'ok' };
  const info = () => ({ entitlements: { active: {} }, nonSubscriptionTransactions: state.txs.slice() });
  const charge = id => { const tx = { transactionIdentifier: 'GPA.' + (state.next++), productIdentifier: id, purchaseDate: '2026-10-09T23:00:00Z' }; state.txs.push(tx); return tx; };
  return {
    calls, state, charge,
    isConfigured: async () => ({ isConfigured: state.configured }),
    configure: async () => { state.configured = true; },
    getCustomerInfo: async () => { calls.push(['getCustomerInfo']); if (state.offline) throw new Error('offline'); return { customerInfo: info() }; },
    getProducts: async opts => ({ products: opts.productIdentifiers.map(id => ({ identifier: id, priceString: '$0.25', price: 0.25, currencyCode: 'USD' })) }),
    purchaseStoreProduct: async ({ product }) => {
      calls.push(['purchase', product.identifier]);
      const mode = state.mode;
      if (mode === 'cancel') { const e = new Error('cancelled'); e.userCancelled = true; throw e; }
      if (mode === 'pending') { const e = new Error('The payment is pending.'); e.code = '20'; throw e; }
      if (mode === 'hang') { charge(product.identifier); return new Promise(() => {}); } // charged, then the app is killed
      if (mode === 'replay') return { customerInfo: info(), transaction: state.txs[state.txs.length - 1] }; // the store hands back an old transaction
      const tx = charge(product.identifier);
      if (mode === 'slow') await new Promise(r => setTimeout(r, 30));
      return mode === 'noTransaction' ? { customerInfo: info() } : { customerInfo: info(), transaction: tx };
    },
    restorePurchases: async () => { calls.push(['restore']); return { customerInfo: info() }; }
  };
}
const powerEnv = (plugin, extra = {}) => nativeEnv(plugin, { config: POWER, ...extra });
const take = store => { const got = []; store.deliver(g => { got.push(g); return true; }); return got; };
const ledgerOf = storage => JSON.parse(storage.data['bloomshot.grants.v1']);

(async () => {
  await test('browser and CommonJS expose the same API', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../store.js'), 'utf8'), context);
    assert.deepEqual(Object.keys(context.BloomStore).sort(), Object.keys(Store).sort());
    assert.equal(context.BloomStore.mode, 'web');
  });

  await test('web mode sells nothing and owns nothing, even with a forged cache', async () => {
    const storage = memoryStorage({ 'bloomshot.entitlements.v1': JSON.stringify({ v: 1, owned: ['e_live'] }), 'bloomshot.mockstore.v1': JSON.stringify({ v: 1, owned: ['e_live'] }) });
    const store = Store.create({ config: CONFIG, storage });
    await store.init();
    assert.equal(store.mode, 'web');
    assert.equal(store.owns('e_live'), false);
    assert.equal(store.isLive(), false);
    assert.deepEqual(await store.purchase('p.live'), { ok: false, reason: 'unavailable' });
    assert.deepEqual(await store.restore(), { ok: false, reason: 'unavailable' });
  });

  await test('native without store keys stays unconfigured and sells nothing', async () => {
    const plugin = fakePlugin();
    const store = Store.create(nativeEnv(plugin, { config: { products: CONFIG.products, revenueCatKeys: { ios: '', android: '' } } }));
    await store.init();
    assert.equal(store.isLive(), false);
    assert.equal(plugin.calls.length, 0);
    assert.equal((await store.purchase('p.live')).reason, 'unavailable');
  });

  await test('native finds the purchase plugin where the injected bridge puts it, falls back to registerPlugin, and sells nothing without it', async () => {
    const plugin = fakePlugin();
    const injected = nativeEnv(plugin); assert.equal(injected.Capacitor.registerPlugin, undefined);
    const viaInjected = Store.create(injected); await viaInjected.init();
    assert.equal(viaInjected.isLive(), true);
    const bundled = Store.create({ config: CONFIG, storage: memoryStorage(), Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => { assert.equal(name, 'Purchases'); return plugin; } } });
    await bundled.init(); assert.equal(bundled.isLive(), true);
    assert.deepEqual(plugin.calls.find(c => c[0] === 'configure')[1], { apiKey: 'appl_test' });
    for (const Capacitor of [{ isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} }, { isNativePlatform: () => true, getPlatform: () => 'ios' }]) {
      const missing = Store.create({ config: CONFIG, storage: memoryStorage(), Capacitor }); await missing.init();
      assert.equal(missing.isLive(), false); assert.equal((await missing.purchase('p.live')).reason, 'unavailable');
    }
  });

  await test('native configures once with the platform key and loads prices from the store', async () => {
    const plugin = fakePlugin();
    const store = Store.create(nativeEnv(plugin));
    await store.init(); await store.init();
    assert.equal(plugin.calls.filter(c => c[0] === 'configure').length, 1);
    assert.deepEqual(plugin.calls.find(c => c[0] === 'configure')[1], { apiKey: 'appl_test' });
    const getProducts = plugin.calls.find(c => c[0] === 'getProducts')[1];
    assert.deepEqual(getProducts.productIdentifiers, ['p.live']); // unbuilt content is never requested
    assert.equal(getProducts.type, 'NON_SUBSCRIPTION');
    assert.equal(store.products().find(p => p.id === 'p.live').price, '€4,99');
    assert.equal(store.products().find(p => p.id === 'p.unbuilt').price, '$4.99');
  });

  await test('products report an exact amount and currency: the store\'s once loaded, the USD price hint before that, nothing when it cannot be known', async () => {
    const config = { revenueCatKeys: CONFIG.revenueCatKeys, products: [
      { id: 'p.live', entitlement: 'e_live', title: 'Live', priceHint: '$4.99', available: true },
      { id: 'p.unbuilt', entitlement: 'e_unbuilt', title: 'Unbuilt', priceHint: ' $1.99 ', available: false },
      { id: 'p.euro', entitlement: 'e_euro', title: 'Euro', priceHint: '€4,99', available: false },
      { id: 'p.free', entitlement: 'e_free', title: 'No hint', available: false }
    ] };
    const store = Store.create(nativeEnv(fakePlugin(), { config }));
    const price = id => { const p = find(store, id); return { amount: p.amount, currency: p.currency, price: p.price }; };
    assert.deepEqual(price('p.live'), { amount: 4.99, currency: 'USD', price: '$4.99' }); // before the store has answered
    await store.init();
    assert.deepEqual(price('p.live'), { amount: 4.99, currency: 'EUR', price: '€4,99' }); // from the store product
    assert.deepEqual(price('p.unbuilt'), { amount: 1.99, currency: 'USD', price: ' $1.99 ' });
    assert.deepEqual(price('p.euro'), { amount: null, currency: null, price: '€4,99' });
    assert.deepEqual(price('p.free'), { amount: null, currency: null, price: '' });
    const bad = Store.create(nativeEnv(fakePlugin({ noNumber: true }), { config })); await bad.init();
    const badP = find(bad, 'p.live');
    assert.deepEqual({ amount: badP.amount, currency: badP.currency, price: badP.price }, { amount: null, currency: null, price: '€4,99' }); // the string is the store's, so no USD guess beside it
  });

  await test('native purchase grants the entitlement and persists the first-paint cache', async () => {
    const plugin = fakePlugin();
    const env = nativeEnv(plugin);
    const store = Store.create(env);
    const seen = [];
    store.subscribe(e => seen.push(e.type));
    assert.deepEqual(await store.purchase('p.live'), { ok: true, entitlement: 'e_live', entitlements: ['e_live'] });
    assert.equal(store.owns('e_live'), true);
    assert.ok(seen.includes('entitlements'));
    assert.deepEqual(JSON.parse(env.storage.data['bloomshot.entitlements.v1']).owned, ['e_live']);
    assert.deepEqual(await store.purchase('p.live'), { ok: true, alreadyOwned: true, entitlement: 'e_live', entitlements: ['e_live'] });
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
  });

  await test('unbuilt and unknown products cannot be purchased', async () => {
    const plugin = fakePlugin();
    const store = Store.create(nativeEnv(plugin));
    assert.equal((await store.purchase('p.unbuilt')).reason, 'unavailable-product');
    assert.equal((await store.purchase('nope')).reason, 'unknown-product');
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 0);
  });

  await test('user cancel and store errors are reported without granting anything', async () => {
    const cancel = Store.create(nativeEnv(fakePlugin({ cancel: true })));
    assert.deepEqual(await cancel.purchase('p.live'), { ok: false, cancelled: true, reason: 'cancelled' });
    assert.equal(cancel.owns('e_live'), false);
    const fail = Store.create(nativeEnv(fakePlugin({ fail: true })));
    const result = await fail.purchase('p.live');
    assert.equal(result.ok, false); assert.equal(result.reason, 'error'); assert.equal(fail.owns('e_live'), false);
    const noGrant = Store.create(nativeEnv(fakePlugin({ noGrant: true })));
    assert.equal((await noGrant.purchase('p.live')).reason, 'not-granted');
  });

  await test('a second tap during a purchase is rejected, not double-charged', async () => {
    const plugin = fakePlugin({ slow: true });
    const store = Store.create(nativeEnv(plugin));
    const first = store.purchase('p.live');
    await new Promise(r => setTimeout(r, 5));
    assert.equal((await store.purchase('p.live')).reason, 'busy');
    assert.equal((await first).ok, true);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
    assert.equal(store.busy, false);
  });

  await test('restore reports newly restored entitlements', async () => {
    const plugin = fakePlugin({ restoreTo: ['e_live'] });
    const store = Store.create(nativeEnv(plugin));
    const result = await store.restore();
    assert.deepEqual(result, { ok: true, restored: ['e_live'], names: ['Live World'], total: 1 });
    assert.equal(store.owns('e_live'), true);
    assert.deepEqual(await store.restore(), { ok: true, restored: [], names: [], total: 1 });
  });

  await test('a refund is honored: the store answer replaces the cache on next launch', async () => {
    const storage = memoryStorage({ 'bloomshot.entitlements.v1': JSON.stringify({ v: 1, owned: ['e_live'] }) });
    const store = Store.create(nativeEnv(fakePlugin({ active: [] }), { storage }));
    await store.init();
    assert.equal(store.owns('e_live'), false);
  });

  await test('offline launch keeps the last known entitlements', async () => {
    const storage = memoryStorage({ 'bloomshot.entitlements.v1': JSON.stringify({ v: 1, owned: ['e_live'] }) });
    const store = Store.create(nativeEnv(fakePlugin({ offline: true }), { storage }));
    await store.init();
    assert.equal(store.owns('e_live'), true);
  });

  await test('blocked storage and throwing listeners never break a purchase', async () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const store = Store.create(nativeEnv(fakePlugin(), { storage }));
    store.subscribe(() => { throw new Error('bad listener'); });
    assert.equal((await store.purchase('p.live')).ok, true);
    assert.equal(store.owns('e_live'), true);
  });

  await test('mock mode simulates purchase, cancel, failure, persistence and reset', async () => {
    const storage = memoryStorage();
    const make = () => Store.create({ config: CONFIG, storage, allowMock: true, mockDelay: 0 });
    const store = make();
    assert.equal(store.mode, 'mock');
    store.dev.nextResult('cancel');
    assert.equal((await store.purchase('p.live')).cancelled, true);
    store.dev.nextResult('fail');
    assert.equal((await store.purchase('p.live')).reason, 'error');
    assert.equal(store.owns('e_live'), false);
    assert.equal((await store.purchase('p.live')).ok, true);
    assert.equal(make().owns('e_live'), false); // not yet initialised from storage
    const again = make(); await again.init();
    assert.equal(again.owns('e_live'), true);
    again.dev.reset();
    assert.equal(again.owns('e_live'), false);
  });

  await test('the real store never exposes the mock controls outside mock mode', () => {
    assert.equal(Store.create({ config: CONFIG }).dev, undefined);
    assert.equal(Store.create(nativeEnv(fakePlugin())).dev, undefined);
  });

  await test('bundle: one product lists several entitlements, singles still list one, and a product that grants nothing is never sold', async () => {
    const config = { revenueCatKeys: CONFIG.revenueCatKeys, products: BUNDLE.products.concat([
      { id: 'p.dup', entitlements: ['e_a', 'e_a', '', 'e_b'], title: 'Dup', available: true },
      { id: 'p.none', title: 'Nothing', available: true },
      { id: 'p.empty', entitlements: [], title: 'Empty', available: true }
    ]) };
    const store = Store.create(nativeEnv(fakePlugin({ grants: GRANTS }), { config }));
    assert.deepEqual(find(store, 'p.both').entitlements, ['e_a', 'e_b']);
    assert.equal(find(store, 'p.both').entitlement, 'e_a');
    assert.equal(find(store, 'p.both').kind, 'bundle');
    assert.deepEqual(find(store, 'p.a').entitlements, ['e_a']);
    assert.deepEqual(find(store, 'p.dup').entitlements, ['e_a', 'e_b']);
    for (const id of ['p.none', 'p.empty']) {
      assert.equal(find(store, id).available, false); assert.deepEqual(find(store, id).entitlements, []); assert.equal(find(store, id).owned, false);
      assert.equal((await store.purchase(id)).reason, 'unavailable-product');
    }
  });

  await test('bundle: a native purchase grants every entitlement, is cached for first paint, and shows the singles as owned', async () => {
    const plugin = fakePlugin({ grants: GRANTS }); const env = bundleEnv(plugin);
    const store = Store.create(env);
    assert.deepEqual(await store.purchase('p.both'), { ok: true, entitlement: 'e_a', entitlements: ['e_a', 'e_b'] });
    assert.equal(store.owns('e_a'), true); assert.equal(store.owns('e_b'), true);
    for (const id of ['p.a', 'p.b', 'p.both']) { assert.equal(find(store, id).owned, true, id); assert.equal(find(store, id).partial, false, id); }
    assert.deepEqual(JSON.parse(env.storage.data['bloomshot.entitlements.v1']).owned.sort(), ['e_a', 'e_b']);
    assert.equal((await store.purchase('p.both')).alreadyOwned, true);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
    const relaunch = Store.create(bundleEnv(fakePlugin({ grants: GRANTS, offline: true }), { storage: env.storage })); await relaunch.init(); // offline: the cache keeps both
    assert.equal(relaunch.owns('e_a') && relaunch.owns('e_b'), true);
  });

  await test('bundle: a store product that is attached to only some entitlements is reported, not treated as success', async () => {
    const plugin = fakePlugin({ grants: { 'p.both': ['e_a'] } });
    const store = Store.create(bundleEnv(plugin));
    const result = await store.purchase('p.both');
    assert.deepEqual(result, { ok: false, reason: 'not-granted', missing: ['e_b'] });
    assert.equal(store.owns('e_a'), true); assert.equal(store.owns('e_b'), false);
    assert.equal(find(store, 'p.both').partial, true); assert.equal(find(store, 'p.both').owned, false);
  });

  await test('bundle: a player who already owns one item is never charged for the bundle', async () => {
    const plugin = fakePlugin({ grants: GRANTS, active: ['e_a'] });
    const store = Store.create(bundleEnv(plugin));
    assert.deepEqual(await store.purchase('p.both'), { ok: false, reason: 'partly-owned', owned: ['e_a'] });
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 0);
    assert.equal(find(store, 'p.both').partial, true); assert.equal(find(store, 'p.a').partial, false);
    assert.equal((await store.purchase('p.b')).ok, true); // the rest can still be bought on its own
    assert.equal(find(store, 'p.both').owned, true); // and owning both items is owning the bundle
    assert.equal((await store.purchase('p.both')).alreadyOwned, true);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
  });

  await test('bundle: restore brings back every entitlement of a bundle bought earlier, and names them', async () => {
    const plugin = fakePlugin({ grants: GRANTS, restoreTo: ['e_a', 'e_b'] });
    const store = Store.create(bundleEnv(plugin));
    assert.deepEqual(await store.restore(), { ok: true, restored: ['e_a', 'e_b'], names: ['World A', 'Style B'], total: 2 });
    assert.equal(store.owns('e_a') && store.owns('e_b'), true);
    assert.equal(find(store, 'p.both').owned, true);
  });

  await test('bundle: mock mode grants both entitlements and Restore purchases grants them again after a reinstall', async () => {
    const storage = memoryStorage();
    const make = () => Store.create({ config: BUNDLE, storage, allowMock: true, mockDelay: 0 });
    const store = make(); await store.init();
    assert.deepEqual(await store.purchase('p.both'), { ok: true, entitlement: 'e_a', entitlements: ['e_a', 'e_b'] });
    assert.equal(store.owns('e_a') && store.owns('e_b'), true);
    const saved = JSON.parse(storage.data['bloomshot.mockstore.v1']);
    assert.deepEqual(saved.owned.sort(), ['e_a', 'e_b']); assert.deepEqual(saved.bought, ['p.both']);
    const again = make(); await again.init(); assert.equal(again.owns('e_a') && again.owns('e_b'), true); // survives a relaunch
    again.dev.forgetLocal(); // the device lost its ownership, the account still has the purchase
    assert.equal(again.owns('e_a') || again.owns('e_b'), false);
    const restored = await again.restore();
    assert.deepEqual(restored, { ok: true, restored: ['e_a', 'e_b'], names: ['World A', 'Style B'], total: 2 });
    assert.equal(again.owns('e_a') && again.owns('e_b'), true);
    assert.deepEqual(await again.restore(), { ok: true, restored: [], names: [], total: 2 });
    again.dev.reset(); // a fresh store account has nothing to restore
    assert.deepEqual(await again.restore(), { ok: true, restored: [], names: [], total: 0 });
    assert.equal(again.owns('e_a'), false);
  });

  await test('bundle: mock mode refuses the bundle after one of its items, and loads a mock account saved before bundles existed', async () => {
    const storage = memoryStorage({ 'bloomshot.mockstore.v1': JSON.stringify({ v: 1, owned: ['e_a'] }) }); // no `bought` list: an older save
    const store = Store.create({ config: BUNDLE, storage, allowMock: true, mockDelay: 0 }); await store.init();
    assert.equal(store.owns('e_a'), true);
    assert.deepEqual(await store.purchase('p.both'), { ok: false, reason: 'partly-owned', owned: ['e_a'] });
    assert.equal((await store.restore()).ok, true); assert.equal(store.owns('e_a'), true); assert.equal(store.owns('e_b'), false);
    assert.equal((await store.purchase('p.b')).ok, true);
    assert.equal(find(store, 'p.both').owned, true);
  });


  await test('powerups: a consumable is sold only with a valid grant and no entitlements, and is never owned', async () => {
    const config = { revenueCatKeys: CONFIG.revenueCatKeys, products: POWER.products.concat([
      { id: 'p.nogrant', consumable: true, kind: 'power', title: 'No grant', available: true },
      { id: 'p.zero', consumable: true, power: 'bomb', count: 0, title: 'Zero', available: true },
      { id: 'p.nocount', consumable: true, power: 'bomb', title: 'No count', available: true },
      { id: 'p.both', consumable: true, entitlement: 'e_x', power: 'bomb', count: 1, title: 'Both', available: true }
    ]) };
    const store = Store.create(powerEnv(powerPlugin(), { config }));
    await store.init();
    const bomb = find(store, 'p.bomb');
    assert.equal(bomb.consumable, true); assert.equal(bomb.power, 'bomb'); assert.equal(bomb.count, 1); assert.deepEqual(bomb.entitlements, []);
    assert.equal(bomb.available, true); assert.equal(bomb.owned, false); assert.equal(bomb.partial, false);
    assert.equal(find(store, 'p.live').consumable, false); assert.equal(find(store, 'p.live').power, null); assert.equal(find(store, 'p.live').count, null);
    for (const id of ['p.nogrant', 'p.zero', 'p.nocount', 'p.both']) { assert.equal(find(store, id).available, false, id); assert.equal((await store.purchase(id)).reason, 'unavailable-product'); }
  });

  // A mixed pack: one store product, one transaction, several kinds of powerup.
  const BAG = { revenueCatKeys: CONFIG.revenueCatKeys, products: POWER.products.concat([
    { id: 'p.bag', consumable: true, powers: { bomb: 2, rain: 1 }, kind: 'power', title: 'Bag', priceHint: '$1.99', available: true }
  ]) };

  await test('powerups: a mixed pack is sold only when every item is a positive whole count of a named power', async () => {
    const config = { revenueCatKeys: CONFIG.revenueCatKeys, products: BAG.products.concat([
      { id: 'p.empty', consumable: true, powers: {}, title: 'Empty', available: true },
      { id: 'p.zeroitem', consumable: true, powers: { bomb: 2, rain: 0 }, title: 'Zero item', available: true },
      { id: 'p.half', consumable: true, powers: { bomb: 1.5 }, title: 'Half', available: true },
      { id: 'p.list', consumable: true, powers: ['bomb'], title: 'List', available: true },
      { id: 'p.noname', consumable: true, powers: { '': 1 }, title: 'No name', available: true },
      { id: 'p.mixed', consumable: true, power: 'bomb', count: 1, powers: { rain: 1 }, title: 'Both ways', available: true }
    ]) };
    const store = Store.create(powerEnv(powerPlugin(), { config }));
    await store.init();
    const bag = find(store, 'p.bag');
    assert.equal(bag.available, true); assert.equal(bag.power, null); assert.equal(bag.count, 3);
    assert.deepEqual(bag.items, [{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }]);
    assert.deepEqual(find(store, 'p.rain').items, [{ power: 'rain', count: 3 }]);
    assert.deepEqual(find(store, 'p.live').items, []);
    for (const id of ['p.empty', 'p.zeroitem', 'p.half', 'p.list', 'p.noname', 'p.mixed']) { assert.equal(find(store, id).available, false, id); assert.equal((await store.purchase(id)).reason, 'unavailable-product', id); }
    find(store, 'p.bag').items[0].count = 99; // a copy: changing it changes nothing in the store
    assert.equal(find(store, 'p.bag').items[0].count, 2);
  });

  await test('powerups: a mixed pack is one grant with all its items, delivered whole or not at all, and never again', async () => {
    const plugin = powerPlugin(); const env = powerEnv(plugin, { config: BAG });
    const store = Store.create(env); await store.init();
    const result = await store.purchase('p.bag');
    assert.deepEqual(result, { ok: true, consumable: true, power: null, count: 3, items: [{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }], transaction: 'GPA.1', delivered: false });
    result.items[0].count = 99; // the answer is a copy: changing it changes nothing in the ledger
    assert.equal(store.pendingGrants()[0].items[0].count, 2);
    // The game fails to save: the whole pack stays waiting, and survives a relaunch with its items.
    assert.equal(store.deliver(() => false), 0);
    const relaunch = Store.create(powerEnv(plugin, { config: BAG, storage: env.storage })); await relaunch.init();
    const waiting = relaunch.pendingGrants();
    assert.deepEqual(waiting, [{ transaction: 'GPA.1', productId: 'p.bag', power: null, count: 3, items: [{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }] }]);
    waiting[0].items[0].count = 99; // a copy
    assert.equal(relaunch.pendingGrants()[0].items[0].count, 2);
    assert.deepEqual(take(relaunch).map(g => g.items), [[{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }]]);
    assert.deepEqual(take(relaunch), []);
    await relaunch.restore();
    const again = Store.create(powerEnv(plugin, { config: BAG, storage: env.storage })); await again.init();
    assert.deepEqual(again.pendingGrants(), []);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
  });

  await test('powerups: a waiting grant saved before packs existed still loads as one item; a damaged one is dropped', async () => {
    const storage = memoryStorage({ 'bloomshot.grants.v1': JSON.stringify({ v: 1, baseline: true, seen: ['GPA.1', 'GPA.2', 'GPA.3', 'GPA.4', 'GPA.5', 'GPA.6'], inflight: [], owed: [
      { transaction: 'GPA.1', productId: 'p.rain', power: 'rain', count: 3 },
      { transaction: 'GPA.2', productId: 'p.bag', power: null, count: 3, items: [{ power: 'bomb', count: 2 }, { power: 'rain', count: 0 }] },
      { transaction: 'GPA.3', productId: 'p.bag', items: [] },
      { productId: 'p.bomb', power: 'bomb', count: 1 },
      { transaction: 'GPA.5', productId: 'p.bag', items: [{ power: 'bomb', count: 2 }, { power: 5, count: 1 }] },
      { transaction: 'GPA.6', productId: 'p.bag', items: [{ power: 'bomb', count: 1 }, { power: 'bomb', count: 1 }] },
      { transaction: 'GPA.4', productId: 'p.bag', items: [{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }] }
    ] }) });
    const store = Store.create(powerEnv(powerPlugin(), { config: BAG, storage }));
    await store.init();
    assert.deepEqual(store.pendingGrants(), [
      { transaction: 'GPA.1', productId: 'p.rain', power: 'rain', count: 3, items: [{ power: 'rain', count: 3 }] },
      { transaction: 'GPA.4', productId: 'p.bag', power: null, count: 3, items: [{ power: 'bomb', count: 2 }, { power: 'rain', count: 1 }] }
    ]);
  });

  await test('powerups: each buy charges once and becomes its own grant, delivered once and never again after a relaunch', async () => {
    const plugin = powerPlugin(); const env = powerEnv(plugin);
    const store = Store.create(env); await store.init();
    const seen = []; store.subscribe(e => seen.push(e.type));
    const first = await store.purchase('p.bomb');
    assert.deepEqual(first, { ok: true, consumable: true, power: 'bomb', count: 1, items: [{ power: 'bomb', count: 1 }], transaction: 'GPA.1', delivered: false });
    assert.ok(seen.includes('grants'));
    const second = await store.purchase('p.rain');
    assert.deepEqual([second.power, second.count, second.transaction], ['rain', 3, 'GPA.2']);
    assert.deepEqual(store.pendingGrants()[1], { transaction: 'GPA.2', productId: 'p.rain', power: 'rain', count: 3, items: [{ power: 'rain', count: 3 }] });
    assert.equal(find(store, 'p.bomb').owned, false);
    assert.deepEqual(store.pendingGrants().map(g => g.transaction), ['GPA.1', 'GPA.2']);
    assert.deepEqual(take(store).map(g => [g.power, g.count]), [['bomb', 1], ['rain', 3]]);
    assert.deepEqual(store.pendingGrants(), []); assert.deepEqual(take(store), []);
    const relaunch = Store.create(powerEnv(plugin, { storage: env.storage })); await relaunch.init();
    assert.deepEqual(relaunch.pendingGrants(), []);
    assert.deepEqual(ledgerOf(env.storage).inflight, []);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 2);
  });

  await test('powerups: a grant the game did not save stays owed, across a relaunch, until deliver gets true', async () => {
    const plugin = powerPlugin(); const env = powerEnv(plugin);
    const store = Store.create(env); await store.init();
    await store.purchase('p.bomb');
    assert.equal(store.deliver(() => false), 0);
    assert.equal(store.deliver(() => { throw new Error('save failed'); }), 0);
    assert.equal(store.deliver(() => 'yes'), 0); // only a real true counts
    const relaunch = Store.create(powerEnv(plugin, { storage: env.storage })); await relaunch.init();
    assert.deepEqual(relaunch.pendingGrants().map(g => g.transaction), ['GPA.1']);
    assert.equal(relaunch.deliver(() => true), 1);
    assert.deepEqual(relaunch.pendingGrants(), []);
  });

  await test('powerups: paid but the app was killed before it heard back, the next launch grants it once', async () => {
    const plugin = powerPlugin({ mode: 'hang' }); const env = powerEnv(plugin);
    const store = Store.create(env); await store.init();
    store.purchase('p.bomb'); // never settles: the app is gone
    await new Promise(r => setTimeout(r, 5));
    assert.equal(ledgerOf(env.storage).inflight.length, 1);
    plugin.state.mode = 'ok';
    const relaunch = Store.create(powerEnv(plugin, { storage: env.storage })); await relaunch.init();
    assert.deepEqual(take(relaunch).map(g => g.transaction), ['GPA.1']);
    assert.deepEqual(ledgerOf(env.storage).inflight, []);
    const third = Store.create(powerEnv(plugin, { storage: env.storage })); await third.init();
    assert.deepEqual(third.pendingGrants(), []);
  });

  await test('powerups: a pending payment never claims an earlier purchase of the same powerup', async () => {
    const plugin = powerPlugin(); const store = Store.create(powerEnv(plugin)); await store.init();
    assert.equal((await store.purchase('p.bomb')).ok, true);
    plugin.state.mode = 'pending';
    assert.equal((await store.purchase('p.bomb')).reason, 'pending');
    assert.equal((await store.restore()).ok, true); // GPA.1 is on the account again; it was already granted
    assert.deepEqual(store.pendingGrants().map(g => g.transaction), ['GPA.1']);
    plugin.charge('p.bomb');
    assert.equal((await store.restore()).ok, true);
    assert.deepEqual(store.pendingGrants().map(g => g.transaction), ['GPA.1', 'GPA.2']);
  });

  await test('powerups: a pending payment grants nothing until it clears, then once, by relaunch or by Restore', async () => {
    for (const via of ['relaunch', 'restore']) {
      const plugin = powerPlugin({ mode: 'pending' }); const env = powerEnv(plugin);
      const store = Store.create(env); await store.init();
      assert.deepEqual(await store.purchase('p.bomb'), { ok: false, pending: true, reason: 'pending' });
      assert.deepEqual(store.pendingGrants(), []);
      plugin.charge('p.bomb'); // the payment cleared later
      let after = store;
      if (via === 'relaunch') { after = Store.create(powerEnv(plugin, { storage: env.storage })); await after.init(); }
      else assert.equal((await store.restore()).ok, true);
      assert.deepEqual(after.pendingGrants().map(g => g.power), ['bomb'], via);
      assert.equal(after.deliver(() => true), 1);
      assert.equal((await after.restore()).ok, true);
      assert.deepEqual(after.pendingGrants(), [], via);
    }
  });

  await test('powerups: after a reinstall, old powerups are never paid out again, by launch or by Restore', async () => {
    const plugin = powerPlugin(); plugin.charge('p.bomb'); plugin.charge('p.rain'); plugin.charge('p.bomb');
    const env = powerEnv(plugin); // fresh storage: a new install on the same store account
    const store = Store.create(env); await store.init();
    assert.deepEqual(store.pendingGrants(), []);
    assert.equal((await store.restore()).ok, true);
    assert.deepEqual(store.pendingGrants(), []);
    const bought = await store.purchase('p.bomb');
    assert.equal(bought.transaction, 'GPA.4');
    assert.deepEqual(take(store).map(g => g.transaction), ['GPA.4']);
  });

  await test('powerups: an install that could not reach the store at launch notes the old ones before its first buy', async () => {
    const plugin = powerPlugin({ offline: true }); plugin.charge('p.bomb');
    const store = Store.create(powerEnv(plugin)); await store.init();
    plugin.state.offline = false; // back online, still no baseline; prices came from the store
    const bought = await store.purchase('p.bomb');
    assert.equal(bought.ok, true); assert.equal(bought.transaction, 'GPA.2');
    assert.deepEqual(take(store).map(g => g.transaction), ['GPA.2']);
    const offlineBuy = Store.create(powerEnv(powerPlugin({ offline: true }))); await offlineBuy.init();
    const failed = await offlineBuy.purchase('p.bomb');
    assert.equal(failed.ok, false); assert.equal(failed.reason, 'error');
  });

  await test('powerups: a store answer without a transaction is still matched to the purchase, and only to it', async () => {
    const plugin = powerPlugin({ mode: 'noTransaction' }); const store = Store.create(powerEnv(plugin)); await store.init();
    const bought = await store.purchase('p.rain');
    assert.deepEqual(bought, { ok: true, consumable: true, power: 'rain', count: 3, items: [{ power: 'rain', count: 3 }], transaction: 'GPA.1', delivered: false });
    plugin.charge('p.bomb'); // a bomb bought on another device
    assert.equal((await store.restore()).ok, true);
    assert.deepEqual(store.pendingGrants().map(g => g.transaction), ['GPA.1']);
  });

  await test('powerups: a store answer that repeats an already granted transaction grants nothing new', async () => {
    const plugin = powerPlugin(); const env = powerEnv(plugin); const store = Store.create(env); await store.init();
    assert.equal((await store.purchase('p.bomb')).ok, true);
    plugin.state.mode = 'replay';
    assert.deepEqual(await store.purchase('p.bomb'), { ok: false, reason: 'not-granted' });
    assert.deepEqual(store.pendingGrants().map(g => g.transaction), ['GPA.1']);
    assert.deepEqual(ledgerOf(env.storage).inflight, []);
  });

  await test('powerups: cancel and errors grant nothing and leave nothing waiting', async () => {
    const plugin = powerPlugin({ mode: 'cancel' }); const env = powerEnv(plugin);
    const store = Store.create(env); await store.init();
    assert.deepEqual(await store.purchase('p.bomb'), { ok: false, cancelled: true, reason: 'cancelled' });
    assert.deepEqual(ledgerOf(env.storage).inflight, []);
    plugin.charge('p.bomb'); // something else on the account later
    assert.equal((await store.restore()).ok, true);
    assert.deepEqual(store.pendingGrants(), []);
  });

  await test('powerups: a second tap during a buy is rejected, not double-charged', async () => {
    const plugin = powerPlugin({ mode: 'slow' }); const store = Store.create(powerEnv(plugin)); await store.init();
    const first = store.purchase('p.bomb');
    await new Promise(r => setTimeout(r, 5));
    assert.equal((await store.purchase('p.bomb')).reason, 'busy');
    assert.equal((await first).ok, true);
    assert.equal(plugin.calls.filter(c => c[0] === 'purchase').length, 1);
    assert.equal(store.pendingGrants().length, 1);
  });

  await test('powerups: an unsettled purchase older than a week no longer claims a transaction', async () => {
    let clock = Date.parse('2026-10-01T00:00:00Z');
    const plugin = powerPlugin({ mode: 'hang' }); const env = powerEnv(plugin, { now: () => clock });
    const store = Store.create(env); await store.init();
    store.purchase('p.bomb');
    await new Promise(r => setTimeout(r, 5));
    plugin.state.txs = []; // that payment never went through
    clock += 8 * 24 * 60 * 60 * 1000;
    const later = Store.create(powerEnv(plugin, { storage: env.storage, now: () => clock })); await later.init();
    plugin.charge('p.bomb'); // an old bomb restored from another device
    assert.equal((await later.restore()).ok, true);
    assert.deepEqual(later.pendingGrants(), []);
  });

  await test('powerups: onConsumable takes waiting grants once the store is ready and each new one before purchase() answers', async () => {
    const plugin = powerPlugin({ mode: 'hang' }); const env = powerEnv(plugin);
    const crashed = Store.create(env); await crashed.init();
    crashed.purchase('p.rain'); await new Promise(r => setTimeout(r, 5)); // paid, then the app was killed
    plugin.state.mode = 'ok';
    const store = Store.create(powerEnv(plugin, { storage: env.storage }));
    const got = []; let saving = true;
    const stop = store.onConsumable(g => { got.push(g); return saving; });
    assert.deepEqual(got, []); // not before the store has checked the account
    await store.init();
    assert.deepEqual(got, [{ transaction: 'GPA.1', productId: 'p.rain', power: 'rain', count: 3, items: [{ power: 'rain', count: 3 }] }]);
    const seen = []; store.subscribe(e => { if (e.type === 'grants') seen.push(store.pendingGrants().length); });
    const bomb = await store.purchase('p.bomb');
    assert.equal(bomb.delivered, true); assert.equal(got.length, 2); assert.equal(got[1].power, 'bomb');
    assert.deepEqual(seen, [0]); // listeners hear about it after the handler took it
    saving = false; // the save could not be written
    assert.equal((await store.purchase('p.bomb')).delivered, false);
    assert.equal(store.pendingGrants().length, 1);
    saving = true; store.onConsumable(g => { got.push(g); return true; }); // registering again retries it
    assert.deepEqual(store.pendingGrants(), []);
    assert.deepEqual(got.map(g => g.transaction), ['GPA.1', 'GPA.2', 'GPA.3', 'GPA.3']); // offered twice, taken once
    stop(); // an old handle cannot remove the newer handler
    assert.equal((await store.purchase('p.bomb')).delivered, true);
  });

  await test('powerups: a grant left waiting by an earlier session goes to a handler registered before launch', async () => {
    const plugin = powerPlugin(); const env = powerEnv(plugin);
    const first = Store.create(env); await first.init();
    assert.equal((await first.purchase('p.bomb')).delivered, false); // no handler yet
    const relaunch = Store.create(powerEnv(plugin, { storage: env.storage }));
    const got = []; relaunch.onConsumable(g => { got.push(g.transaction); return true; });
    await relaunch.init();
    assert.deepEqual(got, ['GPA.1']); assert.deepEqual(relaunch.pendingGrants(), []);
  });

  await test('powerups: the website grants nothing, even with a forged ledger', async () => {
    const storage = memoryStorage({ 'bloomshot.grants.v1': JSON.stringify({ v: 1, baseline: true, seen: ['x'], inflight: [], owed: [{ transaction: 'x', productId: 'p.bomb', power: 'bomb', count: 99 }] }) });
    const store = Store.create({ config: POWER, storage }); await store.init();
    assert.deepEqual(store.pendingGrants(), []);
    assert.equal(store.deliver(() => true), 0);
    assert.equal((await store.purchase('p.bomb')).reason, 'unavailable');
  });

  await test('powerups: mock mode buys, survives a crash and a pending payment, and never re-grants after a reinstall', async () => {
    const storage = memoryStorage();
    const make = () => Store.create({ config: POWER, storage, allowMock: true, mockDelay: 0, now: () => 1000 });
    const store = make(); await store.init();
    const bought = await store.purchase('p.bomb');
    assert.equal(bought.ok, true); assert.equal(bought.power, 'bomb');
    store.dev.nextResult('crash'); assert.equal((await store.purchase('p.rain')).ok, false);
    store.dev.nextResult('pending'); assert.equal((await store.purchase('p.bomb')).reason, 'pending');
    store.dev.nextResult('cancel'); assert.equal((await store.purchase('p.bomb')).cancelled, true);
    assert.deepEqual(take(store).map(g => g.power), ['bomb']);
    const relaunch = make(); await relaunch.init(); // the crashed and pending ones arrive now
    assert.deepEqual(take(relaunch).map(g => g.power).sort(), ['bomb', 'rain']);
    relaunch.dev.forgetLocal();
    const reinstall = make(); await reinstall.init();
    assert.equal((await reinstall.restore()).ok, true);
    assert.deepEqual(reinstall.pendingGrants(), []);
    reinstall.dev.reset();
    assert.equal((await reinstall.purchase('p.bomb')).ok, true);
    assert.equal(reinstall.pendingGrants().length, 1);
    assert.equal(JSON.parse(storage.data['bloomshot.mockstore.v1']).txs.length, 1);
    assert.equal(storage.data['bloomshot.grants.v1'], undefined); // the simulated store never touches the real ledger
  });

  await test('the shipped catalog is consistent: unique ids, bundles only grant entitlements that single products sell, and a bundle is cheaper than its parts', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../store-config.js'), 'utf8'), context);
    const store = Store.create({ config: context.BloomStoreConfig });
    const products = store.products();
    assert.ok(products.length >= 3);
    assert.equal(new Set(products.map(p => p.id)).size, products.length);
    const price = p => { assert.ok(Number.isFinite(p.amount) && p.currency === 'USD', `${p.id} needs a USD price hint`); return p.amount; };
    const singles = products.filter(p => p.entitlements.length === 1);
    const sold = new Set(singles.map(p => p.entitlement));
    assert.equal(sold.size, singles.length, 'each single product has its own entitlement');
    for (const p of products) {
      assert.match(p.id, /^bloomshot\.[a-z0-9]+\.[a-z0-9]+$/, p.id);
      if (p.consumable) {
        // A powerup grants items, never an entitlement. Singles are the 25-cent purchase Trevor asked for; a pack
        // costs less per powerup than buying them one at a time.
        assert.equal(p.kind, 'power', p.id); assert.ok(p.items.length > 0 && p.count > 0, p.id); assert.deepEqual(p.entitlements, [], p.id);
        assert.ok(p.items.every(it => Powers.byId[it.power]), `${p.id} grants a powerup the game does not have`);
        if (p.count === 1) assert.ok(price(p) > 0 && price(p) < 1, `${p.id} is a small purchase`);
        else assert.ok(price(p) < p.count * Math.min(...products.filter(s => s.consumable && s.count === 1).map(price)), `${p.id} must cost less than its powerups one by one`);
        assert.ok(price(p) < 2, `${p.id} stays a small purchase`);
        continue;
      }
      assert.ok(p.entitlements.length > 0, p.id);
      if (p.entitlements.length < 2) continue;
      assert.equal(p.kind, 'bundle', p.id);
      const parts = p.entitlements.map(e => singles.find(s => s.entitlement === e));
      assert.ok(parts.every(Boolean), `${p.id} grants an entitlement no single product sells`);
      assert.ok(price(p) < parts.reduce((sum, s) => sum + price(s), 0), `${p.id} must cost less than its items together`);
    }
    // The content that uses a product must name the same ids the catalog sells.
    const Koi = require('../koi.js'); const koi = products.find(p => p.id === Koi.product);
    assert.ok(koi && koi.entitlement === Koi.entitlement, 'koi.js and store-config.js disagree');
    for (const def of Powers.list) assert.deepEqual(products.find(p => p.id === def.product)?.items, [{ power: def.id, count: 1 }], `powers.js and store-config.js disagree on ${def.id}`);
  });

  const failed = results.filter(r => !r.passed);
  const report = { passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(__dirname, 'store-test-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
