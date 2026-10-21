import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';
const repo = 'https://%s.githack.com/VexNo1r/Bloomshot/%c/bloomshot/index.html?alllevels';
const link = (host, commit) => repo.replace('%s', host).replace('%c', commit);
const NOW = '19abfdd27f21fdf3bfc9f8610fe91ebc021fa856';
// Commits nobody has opened on githack yet, to see a cold first load.
const COLD_DEV = '12bc1c1b03f148e2e32c9f252a971033945a5787';
const COLD_CDN = '9e529fbb67972b6ef623b44305665d1349eb5db3';
const COLD_DEV2 = 'e20e5977bd4c139f7146cbb56b45bfac564a5893';
const COLD_CDN2 = '86f8275eb40604947dabb9f3fd7cd573857811ef';
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const setups = [
  { name: 'laptop', type: chromium, opts: { userAgent: EDGE_UA, viewport: { width: 1536, height: 864 } }, cases: [['dev-now', link('raw', NOW)], ['cdn-now', link('rawcdn', NOW)], ['dev-cold', link('raw', COLD_DEV)], ['cdn-cold', link('rawcdn', COLD_CDN)]] },
  { name: 'iphone', type: webkit, opts: { ...devices['iPhone 13'] }, cases: [['dev-now', link('raw', NOW)], ['cdn-now', link('rawcdn', NOW)], ['dev-cold', link('raw', COLD_DEV2)], ['cdn-cold', link('rawcdn', COLD_CDN2)]] },
];
fs.mkdirSync('out', { recursive: true });
const state = () => ({
  title: document.title, url: location.href,
  font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundImage.slice(0, 40) || getComputedStyle(document.body).backgroundColor,
  sheets: [...document.styleSheets].map(s => { try { return (s.href || 'inline').replace(/.*\//, '') + ':' + s.cssRules.length; } catch (e) { return (s.href || '') + ':blocked'; } }),
  canvas: !!document.getElementById('game-canvas'), app: typeof window.Engine !== 'undefined' || typeof window.Bloomshot !== 'undefined',
  view: document.body?.dataset.view || '', pwa: document.getElementById('pwa-status')?.textContent || '',
  drawingWidth: document.querySelector('.botanical-drawing')?.getBoundingClientRect().width || 0,
});
const results = [];
for (const s of setups) {
  const browser = await s.type.launch();
  for (const [label, url] of s.cases) {
    const context = await browser.newContext(s.opts);
    const page = await context.newPage();
    const log = { setup: s.name, label, url, requests: [], failed: [], console: [], pageErrors: [] };
    page.on('response', r => log.requests.push(`${r.status()} ${(r.headers()['content-type'] || '-').split(';')[0]} ${r.fromServiceWorker() ? 'SW ' : ''}${r.url().replace(/^https:\/\/[^/]+\/VexNo1r\/Bloomshot\/[0-9a-f]+\/bloomshot\//, '')}`));
    page.on('requestfailed', r => log.failed.push(`${r.failure()?.errorText} ${r.url()}`));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
    page.on('pageerror', e => log.pageErrors.push(String(e).slice(0, 300)));
    const t0 = Date.now();
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      log.nav = `${resp?.status()} ${resp?.headers()['content-type']}`;
    } catch (e) { log.gotoError = String(e).slice(0, 300); }
    if (!(await page.$('#game-canvas').catch(() => null))) {
      await page.screenshot({ path: `out/${s.name}-${label}-0-gate.png` }).catch(() => {});
      log.gateText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 800);
      log.gateHtml = (await page.content().catch(() => '')).slice(0, 3000);
      const btn = page.locator('button, a, input[type=submit]').filter({ hasText: /continue|proceed|open|confirm|visit|understand|go to/i }).first();
      if (await btn.count().catch(() => 0)) {
        log.clicked = (await btn.innerText().catch(() => '?')).slice(0, 80);
        await btn.click().catch(e => { log.clickError = String(e).slice(0, 200); });
        await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
      }
    }
    log.loadMs = Date.now() - t0;
    await page.waitForTimeout(10000);
    log.first = await page.evaluate(state).catch(e => ({ error: String(e).slice(0, 200) }));
    await page.screenshot({ path: `out/${s.name}-${label}-1-first.png` }).catch(() => {});
    try { await page.reload({ waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(5000); } catch (e) { log.reloadError = String(e).slice(0, 200); }
    log.reload = await page.evaluate(state).catch(e => ({ error: String(e).slice(0, 200) }));
    await page.screenshot({ path: `out/${s.name}-${label}-2-reload.png` }).catch(() => {});
    results.push(log);
    console.log(`\n=== ${s.name} ${label} ${url}\n` + JSON.stringify({ nav: log.nav, gotoError: log.gotoError, gateText: log.gateText?.slice(0, 300), clicked: log.clicked, loadMs: log.loadMs, first: log.first, reload: log.reload, failed: log.failed, pageErrors: log.pageErrors, console: log.console.slice(0, 8), bad: log.requests.filter(r => !/^(200|204|304) /.test(r)) }, null, 1));
    await context.close();
  }
  await browser.close();
}
fs.writeFileSync('out/results.json', JSON.stringify(results, null, 2));
