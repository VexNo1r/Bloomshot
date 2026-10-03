'use strict';
// Native bridge tests: haptics and the save backup. Uses fake Capacitor plugins and fake storage; no device.
// The fake Capacitor has the same shape the native WebView really injects: isNativePlatform and a Plugins map,
// and NO registerPlugin (that only exists when @capacitor/core is bundled into the page, which this app does not do).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Native = require('../native.js');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
}
const SAVE = 'bloomshot.save.v1';
const SYNC = 'bloomshot.native.synced.v1';
const GOOD = JSON.stringify({ version: 1, rush: { best: 900 } });
const FRESH = JSON.stringify({ version: 1, rush: { best: 0 } });

function memoryStorage(seed = {}) {
  const data = { ...seed };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}
// A manual timer so debouncing is deterministic.
function timers() {
  const queue = [];
  return { setTimeout: fn => { queue.push(fn); return queue.length; }, clearTimeout: id => { queue[id - 1] = null; },
    run: () => { for (const fn of queue.splice(0)) if (fn) fn(); }, count: () => queue.filter(Boolean).length };
}
// options.backup: what the Preferences store holds. getFails / getHangs: the read rejects or never answers.
// registerOnly: expose the plugins only through Capacitor.registerPlugin, the way a bundled @capacitor/core would.
function fakePlugins(options = {}) {
  const log = { impact: [], notification: [], set: [], get: 0 };
  const store = { ...(options.backup === undefined ? {} : { [SAVE]: options.backup }) };
  const plugins = {
    Haptics: {
      impact: async arg => { log.impact.push(arg.style); if (options.hapticsFail) throw new Error('no haptics'); },
      notification: async arg => { log.notification.push(arg.type); if (options.hapticsFail) throw new Error('no haptics'); }
    },
    Preferences: {
      get: ({ key }) => {
        log.get += 1;
        if (options.getHangs) return new Promise(() => {});
        if (options.getFails) return Promise.reject(new Error('read failed'));
        return Promise.resolve({ value: key in store ? store[key] : null });
      },
      set: async ({ key, value }) => { log.set.push({ key, value }); store[key] = value; }
    }
  };
  const Capacitor = { isNativePlatform: () => options.web !== true, getPlatform: () => 'ios' };
  if (options.registerOnly) Capacitor.registerPlugin = name => plugins[name];
  else Capacitor.Plugins = plugins;
  return { Capacitor, log, store, plugins };
}
function make({ storage, plugins = fakePlugins(), navigator, timer = timers() } = {}) {
  const api = Native.create({ Capacitor: plugins.Capacitor, storage, navigator, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout });
  return { api, plugins, timer, storage };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  await test('Web: haptics fall back to navigator.vibrate with the original patterns, and nothing else happens', async () => {
    const buzzes = []; const { api } = make({ plugins: { Capacitor: null, log: {} }, navigator: { vibrate: p => buzzes.push(p) } });
    assert.equal(api.isNative, false);
    for (const kind of ['tick', 'tap', 'surge', 'warn', 'nonsense']) api.haptic(kind);
    assert.deepEqual(buzzes, [8, 12, [12, 35, 18], [18, 25, 18], 12]);
    assert.equal(await api.restore(SAVE), false); api.mirror(SAVE, GOOD); api.flush();
    assert.equal(api.reloading, false);
    assert.doesNotThrow(() => make({ plugins: { Capacitor: null, log: {} } }).api.haptic('tick'));
  });

  await test('Native: haptics use the real Haptics plugin from Capacitor.Plugins, not vibrate, and a failing plugin never throws', async () => {
    const plugins = fakePlugins(); const buzzes = [];
    assert.equal(plugins.Capacitor.registerPlugin, undefined); // the shape of the injected native bridge
    const { api } = make({ plugins, navigator: { vibrate: p => buzzes.push(p) } });
    assert.equal(api.isNative, true);
    for (const kind of ['tick', 'tap', 'surge', 'warn']) api.haptic(kind);
    assert.deepEqual(plugins.log.impact, ['LIGHT', 'MEDIUM', 'MEDIUM']); assert.deepEqual(plugins.log.notification, ['WARNING']);
    assert.deepEqual(buzzes, []);
    const broken = fakePlugins({ hapticsFail: true }); const second = make({ plugins: broken }).api;
    for (const kind of ['tick', 'warn']) assert.doesNotThrow(() => second.haptic(kind));
    await tick(); // an unhandled rejection would crash the process here
  });

  await test('Native: plugins are also found through Capacitor.registerPlugin when @capacitor/core is bundled in', async () => {
    const plugins = fakePlugins({ registerOnly: true });
    const { api } = make({ plugins });
    assert.equal(api.isNative, true); api.haptic('warn'); assert.deepEqual(plugins.log.notification, ['WARNING']);
  });

  await test('Native with neither plugin available: haptics fall back to vibrate, save mirroring stays off, nothing throws', async () => {
    const plugins = fakePlugins(); plugins.Capacitor.Plugins = {}; const buzzes = [];
    const { api } = make({ storage: memoryStorage(), plugins, navigator: { vibrate: p => buzzes.push(p) } });
    api.haptic('tick'); assert.deepEqual(buzzes, [8]);
    assert.equal(await api.restore(SAVE), false); assert.doesNotThrow(() => { api.mirror(SAVE, GOOD); api.flush(); });
    const noPrefs = fakePlugins(); delete noPrefs.Capacitor.Plugins.Preferences; const second = make({ storage: memoryStorage(), plugins: noPrefs }).api;
    second.haptic('tick'); assert.deepEqual(noPrefs.log.impact, ['LIGHT']);
    assert.equal(await second.restore(SAVE), false); assert.doesNotThrow(() => { second.mirror(SAVE, GOOD); second.flush(); });
  });

  await test('Restore: wiped storage with a backup writes the backup back, marks the install checked, and nothing the page saves afterwards can overwrite it', async () => {
    const storage = memoryStorage(); const plugins = fakePlugins({ backup: GOOD });
    const { api, timer } = make({ storage, plugins });
    // The game starts, writes its own empty save, and asks the bridge to mirror it before restore has answered.
    storage.setItem(SAVE, FRESH); api.mirror(SAVE, FRESH);
    assert.equal(timer.count(), 0); // mirror is closed until the backup has been read
    assert.equal(await api.restore(SAVE), true);
    assert.equal(storage.data[SAVE], GOOD); assert.equal(storage.data[SYNC], '1'); assert.equal(api.reloading, true);
    // The old page is still alive until the reload lands. A tap now must not reach either store.
    api.mirror(SAVE, FRESH); timer.run(); api.flush(); await tick();
    assert.deepEqual(plugins.log.set, []); assert.equal(plugins.store[SAVE], GOOD);
  });

  await test('Restore: wiped storage and no backup (a fresh install), so the game keeps its own save and starts mirroring it', async () => {
    const storage = memoryStorage(); const plugins = fakePlugins();
    const { api, timer } = make({ storage, plugins });
    storage.setItem(SAVE, FRESH); api.mirror(SAVE, FRESH);
    assert.equal(await api.restore(SAVE), false); assert.equal(api.reloading, false);
    assert.equal(storage.data[SYNC], '1');
    timer.run(); await tick();
    assert.deepEqual(plugins.log.set, [{ key: SAVE, value: FRESH }]); assert.equal(storage.data[SAVE], FRESH);
  });

  await test('Restore: a returning player keeps the local save, the backup is not even read, and mirroring works', async () => {
    const storage = memoryStorage({ [SAVE]: GOOD, [SYNC]: '1' }); const plugins = fakePlugins({ backup: FRESH });
    const { api, timer } = make({ storage, plugins });
    api.mirror(SAVE, GOOD); assert.equal(await api.restore(SAVE), false);
    assert.equal(plugins.log.get, 0); assert.equal(storage.data[SAVE], GOOD);
    timer.run(); await tick(); assert.deepEqual(plugins.log.set, [{ key: SAVE, value: GOOD }]);
  });

  await test('Restore: an interrupted first restore (read fails, or never answers) cannot make the next launch overwrite the real backup', async () => {
    for (const trouble of [{ getFails: true }, { getHangs: true }]) {
      const storage = memoryStorage(); const plugins = fakePlugins({ backup: GOOD, ...trouble });
      // Launch 1: the WebView was wiped, the game writes its empty save, and the backup cannot be read.
      const first = make({ storage, plugins });
      storage.setItem(SAVE, FRESH); first.api.mirror(SAVE, FRESH);
      const answer = first.api.restore(SAVE);
      if (trouble.getFails) assert.equal(await answer, false); else await tick();
      first.api.mirror(SAVE, FRESH); first.timer.run(); first.api.flush(); await tick();
      assert.deepEqual(plugins.log.set, [], JSON.stringify(trouble)); assert.equal(plugins.store[SAVE], GOOD);
      assert.equal(storage.data[SYNC], undefined); // not checked, so the next launch checks again
      // Launch 2: same storage (it now holds the empty save), the backup can be read.
      const healthy = fakePlugins({ backup: GOOD });
      const second = make({ storage, plugins: healthy });
      assert.equal(await second.api.restore(SAVE), true, JSON.stringify(trouble));
      assert.equal(storage.data[SAVE], GOOD); second.timer.run(); await tick();
      assert.deepEqual(healthy.log.set, []); assert.equal(healthy.store[SAVE], GOOD);
    }
  });

  await test('Restore: storage that accepts a write but loses it never causes a reload loop', async () => {
    const storage = memoryStorage(); const plugins = fakePlugins({ backup: GOOD });
    const lossy = { getItem: storage.getItem, setItem: () => {}, data: storage.data }; // swallows every write without throwing
    const { api, timer } = make({ storage: lossy, plugins });
    assert.equal(await api.restore(SAVE), false); assert.equal(api.reloading, false);
    assert.equal(storage.data[SAVE], undefined); assert.equal(storage.data[SYNC], undefined);
    api.mirror(SAVE, FRESH); timer.run(); api.flush(); await tick();
    assert.deepEqual(plugins.log.set, []); assert.equal(plugins.store[SAVE], GOOD);
  });

  await test('Restore: a damaged backup (not JSON, empty, not a save) is replaced by the game\'s own save, but another version\'s backup is left alone', async () => {
    for (const backup of ['{not json', '', JSON.stringify([1]), JSON.stringify({}), JSON.stringify(null)]) {
      const storage = memoryStorage(); const plugins = fakePlugins({ backup }); const { api, timer } = make({ storage, plugins });
      storage.setItem(SAVE, FRESH);
      assert.equal(await api.restore(SAVE), false, JSON.stringify(backup));
      assert.equal(storage.data[SAVE], FRESH); assert.equal(storage.data[SYNC], '1');
      timer.run(); await tick(); assert.deepEqual(plugins.log.set, [{ key: SAVE, value: FRESH }], JSON.stringify(backup));
    }
    const foreign = JSON.stringify({ version: 2, rush: { best: 5 } });
    const storage = memoryStorage(); const plugins = fakePlugins({ backup: foreign }); const { api, timer } = make({ storage, plugins });
    storage.setItem(SAVE, FRESH); api.mirror(SAVE, FRESH);
    assert.equal(await api.restore(SAVE), false);
    api.mirror(SAVE, FRESH); timer.run(); api.flush(); await tick();
    assert.equal(storage.data[SAVE], FRESH); assert.deepEqual(plugins.log.set, []); assert.equal(plugins.store[SAVE], foreign); assert.equal(storage.data[SYNC], undefined);
  });

  await test('Mirror: rapid saves collapse into one write of the latest save, and leaving the app flushes at once', async () => {
    const storage = memoryStorage({ [SAVE]: GOOD, [SYNC]: '1' }); const plugins = fakePlugins();
    const { api, timer } = make({ storage, plugins });
    await api.restore(SAVE);
    api.mirror(SAVE, '{"version":1,"n":1}'); api.mirror(SAVE, '{"version":1,"n":2}'); api.mirror(SAVE, '{"version":1,"n":3}');
    assert.equal(timer.count(), 1);
    timer.run(); await tick();
    assert.deepEqual(plugins.log.set.map(call => call.value), ['{"version":1,"n":3}']);
    api.mirror(SAVE, '{"version":1,"n":4}'); api.flush(); await tick();
    assert.equal(plugins.log.set.at(-1).value, '{"version":1,"n":4}'); assert.equal(plugins.log.set.length, 2);
    timer.run(); await tick(); assert.equal(plugins.log.set.length, 2); // the cancelled timer does not write again
  });

  await test('Mirror: only the real save key is mirrored, never the QA namespace or other keys', async () => {
    const storage = memoryStorage({ [SAVE]: GOOD, [SYNC]: '1' }); const plugins = fakePlugins();
    const { api, timer } = make({ storage, plugins });
    await api.restore(SAVE); timer.run(); await tick();
    assert.deepEqual(plugins.log.set, [{ key: SAVE, value: GOOD }]); // the existing local save seeds the backup once
    api.mirror('bloomshot.qa.v1', GOOD); api.mirror('other', GOOD); api.mirror(SAVE, 42);
    timer.run(); await tick(); assert.equal(plugins.log.set.length, 1);
    assert.equal(await api.restore('bloomshot.qa.v1'), false);
  });

  await test('Mirror: a save the game could not keep in web storage still reaches the backup once the mirror is open', async () => {
    const storage = memoryStorage({ [SAVE]: GOOD, [SYNC]: '1' }); const plugins = fakePlugins();
    const { api, timer } = make({ storage, plugins });
    await api.restore(SAVE); timer.run(); await tick();
    api.mirror(SAVE, '{"version":1,"later":true}'); timer.run(); await tick(); // the game calls mirror even when its own localStorage write threw
    assert.equal(plugins.store[SAVE], '{"version":1,"later":true}');
  });

  const failed = results.filter(r => !r.passed);
  const report = { generatedBy: 'qa/test-native.cjs', passed: results.length - failed.length, total: results.length,
    methodology: 'Fake Capacitor shaped like the injected native bridge (Capacitor.Plugins, no registerPlugin), fake storage and a manual timer. No device, no real preferences store.',
    limitations: ['Plugin names (Haptics, Preferences) and call shapes follow the Capacitor 8 plugin sources and the injected bridge scripts and have not run on a real phone.',
      'A save the OS rolls back in web storage but not in preferences (or the reverse) is not detected: once an install has checked its backup, the local save wins.'], results };
  fs.writeFileSync(path.join(__dirname, 'native-test-results.json'), JSON.stringify(report, null, 2) + '\n');
  for (const r of results) console.log(`${r.passed ? 'ok  ' : 'FAIL'} ${r.name}${r.passed ? '' : '\n' + r.error}`);
  console.log(`${report.passed}/${report.total} passed`);
  if (failed.length) process.exit(1);
})();
