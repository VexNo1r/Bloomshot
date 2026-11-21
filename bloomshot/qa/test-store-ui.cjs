'use strict';
// Executes the actual Settings store UI with a tiny DOM fixture. No purchases, native SDK or network.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../store-ui.js'), 'utf8'), results = [];
async function test(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
const answer = extra => ({ ok: true, restored: [], names: [], total: 0, consumables: { confirmed: 0, delivered: 0, pending: 0 }, confirmationPending: 0, ...extra });
async function fixture(result, live = true) {
  const ids = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.textContent = ''; this.disabled = false; this.hidden = false; this.events = {}; }
    setAttribute(name, value) { if (name === 'id') ids.set(value, this); if (name === 'hidden') this.hidden = true; this[name] = value; }
    appendChild(child) { this.children.push(child); return child; }
    insertBefore(child) { this.children.push(child); }
    addEventListener(name, callback) { this.events[name] = callback; }
    querySelector() { return anchor; }
    async click() { if (!this.disabled) return this.events.click?.(); }
  }
  const dialog = new Element('dialog'), anchor = new Element('p'); ids.set('settings-dialog', dialog);
  const document = { createElement: tag => new Element(tag), getElementById: id => ids.get(id) || null };
  let calls = 0;
  const store = { mode: 'native', isLive: () => live, products: () => [], init: async () => {}, subscribe: () => {}, restore: async () => { calls++; return typeof result === 'function' ? result() : result; } };
  vm.runInNewContext(source, { window: { BloomStore: store }, document }); await Promise.resolve();
  return { status: ids.get('store-status'), button: ids.get('restore-btn'), section: ids.get('store-section'), calls: () => calls };
}
(async () => {
  await test('Restore names newly recovered permanent content using the actual Settings handler', async () => {
    const f = await fixture(answer({ restored: ['world_koi', 'levels_full'], names: ['Koi Conservatory', 'Levels 5 to 10'], total: 2 })); await f.button.click();
    assert.equal(f.status.textContent, 'Restored Koi Conservatory and Levels 5 to 10.'); assert.equal(f.button.disabled, false);
  });
  await test('Already-owned unlocks are acknowledged instead of falsely claiming no earlier purchases', async () => {
    const f = await fixture(answer({ total: 3 })); await f.button.click();
    assert.equal(f.status.textContent, 'Your purchased unlocks are already restored.'); assert(!f.status.textContent.includes('No earlier'));
  });
  await test('A recovered consumable is reported even when there are no permanent entitlements', async () => {
    const f = await fixture(answer({ consumables: { confirmed: 1, delivered: 1, pending: 0 } })); await f.button.click();
    assert.equal(f.status.textContent, 'Recovered one powerup purchase.'); assert(!f.status.textContent.includes('No purchases'));
  });
  await test('Confirmed grants still owed to the save are not described as delivered', async () => {
    const f = await fixture(answer({ consumables: { confirmed: 2, delivered: 0, pending: 2 } })); await f.button.click();
    assert.match(f.status.textContent, /2 powerup purchases are waiting to be saved/); assert.match(f.status.textContent, /Make room/); assert(!f.status.textContent.includes('Recovered'));
  });
  await test('An unresolved store payment remains a confirmation state, not a saved powerup or empty restore', async () => {
    const f = await fixture(answer({ confirmationPending: 1 })); await f.button.click();
    assert.match(f.status.textContent, /still being confirmed/); assert(!/Recovered|No purchases|Nothing was charged/.test(f.status.textContent));
  });
  await test('Mixed ownership, recovered grants and waiting confirmation remain visible together', async () => {
    const f = await fixture(answer({ total: 3, consumables: { confirmed: 2, delivered: 2, pending: 1 }, confirmationPending: 1 })); await f.button.click();
    assert.match(f.status.textContent, /already restored/); assert.match(f.status.textContent, /Recovered 2 powerup purchases/); assert.match(f.status.textContent, /One powerup purchase is waiting/); assert.match(f.status.textContent, /still being confirmed/);
  });
  await test('A genuinely empty restore explains the limited restore scope', async () => {
    const f = await fixture(answer()); await f.button.click(); assert.equal(f.status.textContent, 'No purchases are available to restore. Powerups and local progress are not restored.');
  });
  await test('A failed restore can be retried and does not make a purchase-history claim', async () => {
    const f = await fixture({ ok: false, reason: 'error' }); await f.button.click(); assert.equal(f.button.disabled, false);
    assert.equal(f.status.textContent, 'Could not reach the store. Check your connection and try again.'); assert(!f.status.textContent.includes('No purchases'));
  });
  await test('The native restore button stays disabled while the actual handler awaits its response', async () => {
    let resolve; const f = await fixture(() => new Promise(r => { resolve = r; })), pending = f.button.click();
    assert.equal(f.button.disabled, true); assert.equal(f.status.textContent, 'Checking with the store…'); await f.button.click(); assert.equal(f.calls(), 1);
    resolve(answer({ total: 1 })); await pending; assert.equal(f.button.disabled, false); assert.match(f.status.textContent, /already restored/);
  });
  await test('The purchases section remains hidden when billing is unavailable', async () => { const f = await fixture(answer(), false); assert.equal(f.section.hidden, true); });
  const report = { passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
  fs.writeFileSync(path.join(__dirname, 'store-ui-test-results.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
})();
