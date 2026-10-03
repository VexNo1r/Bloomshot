(function () {
  'use strict';
  // Settings section for purchases. It only appears when a store is live (native app with store keys,
  // or the simulated store during development), so the public website shows nothing new.
  var store = window.BloomStore;
  var dialog = document.getElementById('settings-dialog');
  var anchor = dialog && dialog.querySelector('.dialog-signature');
  if (!store || !anchor) return;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text) node.textContent = text;
    return node;
  }

  var section = el('section', { id: 'store-section', class: 'install-section', 'aria-labelledby': 'store-title', hidden: '' });
  var status = el('p', { id: 'store-status', role: 'status' });
  var restore = el('button', { id: 'restore-btn', class: 'button-secondary', type: 'button' }, 'Restore purchases');
  var list = el('div', { id: 'store-test-list' });
  section.appendChild(el('h3', { id: 'store-title' }, 'Purchases'));
  section.appendChild(status);
  section.appendChild(restore);
  section.appendChild(list);
  dialog.insertBefore(section, anchor);

  function paintList() {
    list.textContent = '';
    if (store.mode !== 'mock') return;
    store.products().forEach(function (product) {
      var button = el('button', { class: 'button-link', type: 'button', 'data-product': product.id }, product.owned ? product.title + ' (owned)' : 'Test buy: ' + product.title + (product.available ? '' : ' (not built yet)'));
      button.disabled = product.owned || !product.available || store.busy;
      button.addEventListener('click', async function () {
        status.dataset.auto = '0';
        status.textContent = 'Simulating purchase…';
        var result = await store.purchase(product.id);
        status.textContent = result.ok ? product.title + ' unlocked in test mode.' : result.cancelled ? 'Purchase cancelled.' : 'That purchase did not go through. Nothing was charged.';
      });
      list.appendChild(button);
    });
  }

  function paint() {
    section.hidden = !store.isLive();
    if (section.hidden) return;
    if (!status.textContent || status.dataset.auto === '1') {
      status.textContent = store.mode === 'mock' ? 'TEST MODE: purchases are simulated and no money is charged.' : 'Bought something on another device or reinstalled? Restore it here.';
      status.dataset.auto = '1';
    }
    paintList();
  }

  restore.addEventListener('click', async function () {
    restore.disabled = true; status.dataset.auto = '0';
    status.textContent = 'Checking with the store…';
    var result = await store.restore();
    restore.disabled = false;
    if (!result.ok) status.textContent = 'Could not reach the store. Check your connection and try again.';
    else status.textContent = result.restored.length ? 'Restored ' + result.restored.length + ' purchase' + (result.restored.length === 1 ? '' : 's') + '.' : 'No earlier purchases were found for this account.';
  });

  store.subscribe(paint);
  store.init().then(paint);
})();
