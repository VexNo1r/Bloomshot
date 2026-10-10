(function (root, factory) {
  'use strict';
  var powers = factory();
  if (typeof module === 'object' && module.exports) module.exports = powers;
  else root.BloomPowers = powers;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Powerups for the levels and Meadow Rush. Three change your next shot; Lullaby stops the flowers falling
  // for a moment. Players start with one of each, catch more as rare gifts in the waves, and can buy any
  // one they choose (one consumable store product each). Buying happens only on the shelf, never mid-run.
  var LIST = [
    { id: 'sunburst', name: 'Sunburst', shot: true, product: 'bloomshot.power.sunburst',
      text: 'Your next shot bursts and blooms the flowers around it.', tip: 'Sunburst ready. Fire into a crowd!' },
    { id: 'dandelion', name: 'Dandelion', shot: true, product: 'bloomshot.power.dandelion',
      text: 'Your next shot splits into three seeds.', tip: 'Dandelion ready. Three seeds at once!' },
    { id: 'beeline', name: 'Bee Line', shot: true, product: 'bloomshot.power.beeline',
      text: 'Your next shot flies through flowers, cups and shells.', tip: 'Bee Line ready. It flies through everything!' },
    { id: 'lullaby', name: 'Lullaby', shot: false, product: 'bloomshot.power.lullaby',
      text: 'The flowers stop falling for 6 seconds.', tip: 'Shh. The flowers are dozing.' }
  ];
  var IDS = LIST.map(function (p) { return p.id; });
  var BY_ID = {}, BY_PRODUCT = {};
  LIST.forEach(function (p) { BY_ID[p.id] = p; BY_PRODUCT[p.product] = p; });
  var MAX = 999, STARTER = 1, KEEP_RECEIPTS = 50;

  // Counts are whole numbers from 0 to 999. A save from before powerups gets the starter set: one of each.
  function normalize(raw) {
    var counts = {};
    var fresh = !raw || typeof raw !== 'object' || Array.isArray(raw);
    IDS.forEach(function (id) {
      var n = fresh ? STARTER : Number(raw[id]);
      counts[id] = Number.isFinite(n) ? Math.max(0, Math.min(MAX, Math.floor(n))) : 0;
    });
    return counts;
  }
  function receipts(raw) {
    return Array.isArray(raw) ? raw.filter(function (r) { return typeof r === 'string' && r.length > 0 && r.length <= 200; }).slice(-KEEP_RECEIPTS) : [];
  }
  // A purchase adds its powerups once: a store transaction that comes back again (a replay after a crash or
  // a restart) is recognized by its id and adds nothing.
  function grant(counts, list, grantInfo) {
    var power = grantInfo && BY_ID[grantInfo.power], amount = Math.floor(Number(grantInfo && grantInfo.count) || 1);
    var id = grantInfo && grantInfo.transaction ? String(grantInfo.transaction) : '';
    var next = normalize(counts), kept = receipts(list);
    if (!power || amount < 1) return { ok: false, counts: next, receipts: kept };
    if (id && kept.indexOf(id) >= 0) return { ok: true, repeat: true, counts: next, receipts: kept };
    next[power.id] = Math.min(MAX, next[power.id] + amount);
    if (id) kept = kept.concat(id).slice(-KEEP_RECEIPTS);
    return { ok: true, counts: next, receipts: kept };
  }
  function add(counts, id, amount) {
    var next = normalize(counts);
    if (BY_ID[id]) next[id] = Math.min(MAX, next[id] + Math.max(0, Math.floor(amount || 1)));
    return next;
  }
  function spend(counts, id) {
    var next = normalize(counts);
    if (!BY_ID[id] || next[id] < 1) return { ok: false, counts: next };
    next[id]--;
    return { ok: true, counts: next };
  }

  return Object.freeze({ list: LIST, ids: IDS, byId: BY_ID, byProduct: BY_PRODUCT, max: MAX, starter: STARTER,
    normalize: normalize, receipts: receipts, grant: grant, add: add, spend: spend });
});
