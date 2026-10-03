(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('pwa-status'), installButton = $('install-btn'), updateButton = $('update-app-btn');
  const help = $('install-help'), downloadNote = $('offline-note');
  let installPrompt = null, registration = null, reloading = false, offlineReady = false, offlineIssue = '';
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function showStatus() {
    installButton.hidden = standalone();
    installButton.textContent = installPrompt ? 'Install Bloomshot' : 'Add to home screen';
    const updateReady = Boolean(registration?.waiting);
    updateButton.hidden = !updateReady;
    downloadNote.hidden = !updateReady;
    status.textContent = updateReady ? 'A fresh version is ready.' : offlineReady ? navigator.onLine ? 'Ready to play offline on this device.' : 'You’re offline. Bloomshot is ready to play.' : offlineIssue || (navigator.onLine ? 'Preparing offline play…' : 'Connect once to download the game for offline play.');
  }
  function instructions() {
    help.hidden = false;
    help.textContent = appleMobile ? 'In Safari, open Share, then Add to Home Screen. If it isn’t listed, open this page in Safari first.' : 'Open your browser menu and choose Install app or Add to Home screen. The option depends on your browser.';
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; showStatus(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; help.hidden = true; showStatus(); });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) { instructions(); return; }
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch (_) { instructions(); }
    showStatus();
  });
  updateButton.addEventListener('click', () => {
    if (!registration?.waiting) { showStatus(); return; }
    updateButton.disabled = true; updateButton.textContent = 'Updating…'; reloading = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });
  $('settings-btn').addEventListener('click', async () => {
    if (!registration) return;
    try { await registration.update(); } catch (_) {}
    showStatus();
  });
  window.addEventListener('online', showStatus); window.addEventListener('offline', showStatus);
  showStatus();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    offlineIssue = 'Play here in your browser. Offline installation needs a supported browser and a secure connection.'; showStatus();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) { location.reload(); return; }
    offlineReady = Boolean(navigator.serviceWorker.controller); showStatus();
  });
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type !== 'BLOOMSHOT_DOWNLOAD' || event.source?.scriptURL !== new URL('./sw.js', document.baseURI).href || offlineReady) return;
    if (event.data.failed) { offlineIssue = 'Offline download didn’t finish. Keep playing online, then reload to try again.'; showStatus(); }
    else {
      const percent = Math.min(100, Math.round(event.data.completed / event.data.total * 100));
      status.textContent = percent === 100 ? 'Saving the game for offline play…' : `Downloading for offline play… ${percent}%`;
    }
  });
  async function prepareOffline() {
    status.textContent = 'Downloading the game for offline play…';
    const timeout = setTimeout(() => {
      if (!offlineReady && !registration?.waiting) { offlineIssue = 'Offline setup is taking longer than expected. You can keep playing here.'; showStatus(); }
    }, 15000);
    function watch(worker) {
      if (!worker) return;
      const changed = () => {
        status.dataset.workerState = worker.state;
        if (worker.state === 'activated') { offlineReady = true; offlineIssue = ''; clearTimeout(timeout); showStatus(); }
        else if (worker.state === 'installed') { showStatus(); }
        else if (worker.state === 'redundant' && !registration?.active) {
          clearTimeout(timeout);
          offlineIssue = 'Offline download didn’t finish. Keep playing online, then reload to try again.'; showStatus();
        }
      };
      worker.addEventListener('statechange', changed);
      changed();
    }
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      offlineReady = Boolean(registration.active); showStatus();
      status.dataset.registrationState = registration.active ? 'active' : registration.waiting ? 'waiting' : registration.installing ? 'installing' : 'empty';
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      navigator.serviceWorker.ready.then(() => { offlineReady = true; offlineIssue = ''; clearTimeout(timeout); showStatus(); });
    } catch (_) {
      clearTimeout(timeout);
      offlineIssue = 'Playing online. Offline saving isn’t available in this browser right now.'; showStatus();
    }
  }
  prepareOffline();
})();
