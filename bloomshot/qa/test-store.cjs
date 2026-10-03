'use strict';
// Purchase layer tests. Uses a fake RevenueCat plugin and fake storage; no network, no real store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../store.js');
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
    getProducts: async opts => { calls.push(['getProducts', opts]); return { products: opts.productIdentifiers.map(id => ({ identifier: id, priceString: '€4,99' })) }; },
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
function nativeEnv(plugin, extra = {}) {
  return { config: CONFIG, storage: memoryStorage(), ...extra, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', registerPlugin: name => { assert.equal(name, 'Purchases'); return plugin; } } };
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

  await test('the shipped catalog is consistent: unique ids, bundles only grant entitlements that single products sell, and a bundle is cheaper than its parts', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../store-config.js'), 'utf8'), context);
    const store = Store.create({ config: context.BloomStoreConfig });
    const products = store.products();
    assert.ok(products.length >= 3);
    assert.equal(new Set(products.map(p => p.id)).size, products.length);
    const price = p => Number(String(p.price).replace(/[^0-9.]/g, ''));
    const singles = products.filter(p => p.entitlements.length === 1);
    const sold = new Set(singles.map(p => p.entitlement));
    assert.equal(sold.size, singles.length, 'each single product has its own entitlement');
    for (const p of products) {
      assert.ok(p.entitlements.length > 0, p.id);
      assert.match(p.id, /^bloomshot\.[a-z0-9]+\.[a-z0-9]+$/, p.id);
      if (p.entitlements.length < 2) continue;
      assert.equal(p.kind, 'bundle', p.id);
      const parts = p.entitlements.map(e => singles.find(s => s.entitlement === e));
      assert.ok(parts.every(Boolean), `${p.id} grants an entitlement no single product sells`);
      assert.ok(price(p) < parts.reduce((sum, s) => sum + price(s), 0), `${p.id} must cost less than its items together`);
    }
    // The content that uses a product must name the same ids the catalog sells.
    const Koi = require('../koi.js'); const koi = products.find(p => p.id === Koi.product);
    assert.ok(koi && koi.entitlement === Koi.entitlement, 'koi.js and store-config.js disagree');
  });

  const failed = results.filter(r => !r.passed);
  const report = { passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(__dirname, 'store-test-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
