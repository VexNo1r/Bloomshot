(function (root, factory) {
  'use strict';
  var native = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = native;
  else root.BloomNative = native;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // Glue between the game and the phone it runs on. In a normal browser everything here is a no-op or
  // falls back to the web behaviour, so the website is unchanged.
  //   haptic(kind): real haptics in the native app (iPhone ignores navigator.vibrate); vibrate() on the web.
  //   mirror / restore: the player's save is copied to the app's native preferences so that the OS clearing
  //   the WebView's storage cannot wipe a garden.
  //
  // Which copy wins. localStorage is the source of truth once this install has checked it against the backup
  // (a marker, SYNC_KEY, is stored beside the save to say so). Until then the local save is unverified: it may
  // be the game's own empty starting save on a freshly wiped or freshly installed WebView. Unverified launches
  // read the backup first: a usable backup is restored over the local save, and only a missing or damaged
  // backup lets the local save become the backup. A backup that cannot be read is never overwritten that
  // session. The marker lives in the same storage as the save, so a wipe removes both together.
  var SAVE_KEY = 'bloomshot.save.v1';
  var SYNC_KEY = 'bloomshot.native.synced.v1';
  var VIBRATION = { tick: 8, tap: 12, surge: [12, 35, 18], warn: [18, 25, 18] };
  var MIRROR_DELAY = 400;

  function create(env) {
    env = env || {};
    var Capacitor = env.Capacitor || null;
    var storage = env.storage || null;
    var nav = env.navigator || null;
    var later = env.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    var native = Boolean(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());

    // The native WebView injects plugins as Capacitor.Plugins.<Name>; Capacitor.registerPlugin only exists when
    // the @capacitor/core script is bundled into the page, which this app does not do. Try both.
    function plugin(name) {
      try {
        var found = Capacitor.Plugins && Capacitor.Plugins[name];
        if (found) return found;
        if (typeof Capacitor.registerPlugin === 'function') return Capacitor.registerPlugin(name) || null;
      } catch (_) { /* not installed in this build */ }
      return null;
    }
    var haptics = native ? plugin('Haptics') : null;
    var prefs = native ? plugin('Preferences') : null;

    // The mirror stays closed until restore() has looked at the backup, so the game's starting save can never
    // overwrite a backup that has not been read yet. A backup that cannot be read keeps it closed for the session.
    var mirrorOpen = false, pending = null, timer = null, reloading = false;

    function swallow(result) { if (result && typeof result.catch === 'function') result.catch(function () {}); }

    function haptic(kind) {
      var name = Object.prototype.hasOwnProperty.call(VIBRATION, kind) ? kind : 'tap';
      if (haptics) {
        try {
          if (name === 'warn') swallow(haptics.notification({ type: 'WARNING' }));
          else swallow(haptics.impact({ style: name === 'tick' ? 'LIGHT' : 'MEDIUM' }));
        } catch (_) { /* haptics are never worth an error */ }
        return;
      }
      if (nav && typeof nav.vibrate === 'function') { try { nav.vibrate(VIBRATION[name]); } catch (_) { /* ignore */ } }
    }

    function flush() {
      timer = null;
      var value = pending; pending = null;
      if (value === null || !prefs || !mirrorOpen || reloading) return;
      try { swallow(prefs.set({ key: SAVE_KEY, value: value })); } catch (_) { /* the local save is still intact */ }
    }

    // json is always the game's own serialized save, whether or not it could also be written to localStorage.
    function mirror(key, json) {
      if (!prefs || key !== SAVE_KEY || typeof json !== 'string' || reloading) return;
      pending = json;
      if (!mirrorOpen || timer || !later) return;
      timer = later(flush, MIRROR_DELAY);
    }

    function openMirror() {
      mirrorOpen = true;
      if (pending === null) { try { var current = storage && storage.getItem(SAVE_KEY); if (current) pending = current; } catch (_) { /* nothing to mirror yet */ } }
      if (pending !== null && !timer && later) timer = later(flush, MIRROR_DELAY);
    }

    function markSynced() { try { storage.setItem(SYNC_KEY, '1'); } catch (_) { /* the next launch just checks the backup again */ } }

    // 'usable': a version 1 save. 'foreign': a save from another version of the game, which must not be touched.
    // 'unusable': empty, not JSON, or not a save at all, which is safe to replace.
    function judge(value) {
      if (typeof value !== 'string' || !value) return 'unusable';
      var parsed;
      try { parsed = JSON.parse(value); } catch (_) { return 'unusable'; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.version !== 'number') return 'unusable';
      return parsed.version === 1 ? 'usable' : 'foreign';
    }

    // Resolves true when a backup was written back into storage; the caller should then reload once so the game
    // starts from it, and must stop saving until then (see `reloading`). Resolves false otherwise.
    async function restore(key) {
      if (!prefs || !storage || key !== SAVE_KEY) return false;
      var verified = false;
      try { verified = storage.getItem(SYNC_KEY) === '1'; } catch (_) { verified = false; }
      if (verified) { openMirror(); return false; }
      var value;
      try { value = (await prefs.get({ key: SAVE_KEY })).value; } catch (_) { return false; } // unreadable: leave the backup alone
      var verdict = judge(value);
      if (verdict === 'usable') {
        try { storage.setItem(SAVE_KEY, value); } catch (_) { return false; }
        markSynced();
        reloading = true; pending = null;
        return true;
      }
      if (verdict === 'foreign') return false; // a newer or older game wrote this; do not overwrite it
      markSynced();
      openMirror(); // nothing usable to restore (a fresh install, or a damaged backup): the game's own save becomes the backup
      return false;
    }

    return {
      isNative: native,
      haptic: haptic,
      mirror: mirror,
      restore: restore,
      // True once a restore has rewritten storage and a reload is on its way: the page must not save again.
      get reloading() { return reloading; },
      flush: function () { if (timer && env.clearTimeout) env.clearTimeout(timer); flush(); }
    };
  }

  function defaultEnv() {
    var env = { Capacitor: root.Capacitor, navigator: root.navigator };
    try { env.storage = root.localStorage; } catch (_) { env.storage = null; }
    if (typeof root.setTimeout === 'function') env.setTimeout = root.setTimeout.bind(root);
    if (typeof root.clearTimeout === 'function') env.clearTimeout = root.clearTimeout.bind(root);
    return env;
  }

  var api = create(defaultEnv());
  api.create = create;
  // Leaving the app is the moment a pending mirror write must not wait for its timer.
  try {
    if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'hidden') api.flush(); });
  } catch (_) { /* no document: nothing to listen to */ }
  return api;
});
