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
      state.active = state.active.concat('e_live');
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
    assert.deepEqual(await store.purchase('p.live'), { ok: true, entitlement: 'e_live' });
    assert.equal(store.owns('e_live'), true);
    assert.ok(seen.includes('entitlements'));
    assert.deepEqual(JSON.parse(env.storage.data['bloomshot.entitlements.v1']).owned, ['e_live']);
    assert.deepEqual(await store.purchase('p.live'), { ok: true, alreadyOwned: true, entitlement: 'e_live' });
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
    assert.deepEqual(result, { ok: true, restored: ['e_live'], total: 1 });
    assert.equal(store.owns('e_live'), true);
    assert.deepEqual(await store.restore(), { ok: true, restored: [], total: 1 });
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

  const failed = results.filter(r => !r.passed);
  const report = { passed: results.length - failed.length, failed: failed.length, results };
  fs.writeFileSync(path.join(__dirname, 'store-test-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
