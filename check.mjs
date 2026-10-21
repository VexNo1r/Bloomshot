import { chromium, webkit, devices } from 'playwright';
import fs from 'node:fs';
const BUILD = '4076ce257d584b98148b5631d5b7fbdac01b035c';
const link = host => process.env.LOCAL ? `${process.env.LOCAL}?alllevels&h=${host}` : `https://${host}.githack.com/VexNo1r/Bloomshot/${BUILD}/index.html?alllevels`;
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
const setups = [
  { name: 'laptop', type: chromium, opts: { userAgent: EDGE_UA, viewport: { width: 1536, height: 864 } } },
  { name: 'iphone', type: webkit, opts: { ...devices['iPhone 13'] } },
];
fs.mkdirSync('out', { recursive: true });
const state = () => {
  const st = window.bloomshotState || {}, c = document.getElementById('game-canvas');
  let painted = 0;
  try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) painted++; } catch (e) { painted = -1; }
  return {
    title: document.title, font: getComputedStyle(document.body).fontFamily.slice(0, 20),
    fontsReady: document.fonts.check('20px Fredoka') && document.fonts.check('16px Nunito'),
    styled: getComputedStyle(document.body).backgroundImage !== 'none',
    route: st.route || '', view: document.body.dataset.view || '', status: st.status || '', score: st.score ?? null, shots: st.shotsLeft ?? null,
    tutorial: document.body.dataset.tutorial || '', card: (document.querySelector('.tutorial-card, #tutorial-card, [data-tutorial-step]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
    painted, drawingWidth: Math.round(document.querySelector('.botanical-drawing')?.getBoundingClientRect().width || 0),
    pwa: document.getElementById('pwa-status')?.textContent || '',
  };
};
const pause = ms => new Promise(r => setTimeout(r, ms));
let ok = true;
for (const s of setups) {
  const browser = await s.type.launch();
  for (const host of ['raw', 'rawcdn']) {
    for (const visit of ['first', 'again']) {
      const context = await browser.newContext(s.opts);
      const page = await context.newPage();
      const tag = `${s.name}-${host}-${visit}`;
      const log = { tag, requests: [], pageErrors: [], console: [] };
      page.on('response', r => { if (/githack\.com\/VexNo1r/.test(r.url())) log.requests.push(`${r.status()} ${(r.headers()['content-type'] || '-').split(';')[0]} ${r.url().replace(/^https:\/\/[^/]+\/VexNo1r\/Bloomshot\/[0-9a-f]+\//, '')}`); });
      page.on('pageerror', e => log.pageErrors.push(String(e).slice(0, 300)));
      page.on('console', m => { if (m.type() === 'error') log.console.push(m.text().slice(0, 200)); });
      try {
        await page.goto(link(host), { waitUntil: 'load', timeout: 60000 });
        const gate = page.getByText('Open the page', { exact: true });
        if (await gate.count()) { log.gate = true; await gate.click(); await page.waitForLoadState('load', { timeout: 60000 }); }
        await page.waitForSelector('#game-canvas', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(3000);
        log.home = await page.evaluate(state);
        await page.screenshot({ path: `out/${tag}-1-start.png` });
        const box = await page.locator('#game-canvas').boundingBox();
        const lx = box.x + box.width / 2, ly = box.y + box.height * 498 / 560;
        for (const [dx, dy] of [[-40, -220], [60, -220]]) {
          await page.mouse.move(lx, ly); await page.mouse.down(); await page.mouse.move(lx + dx, ly + dy, { steps: 10 }); await page.mouse.up();
          await page.waitForTimeout(2500);
        }
        log.level = await page.evaluate(state);
        await page.screenshot({ path: `out/${tag}-2-play.png` });
      } catch (e) { log.error = String(e).slice(0, 300); await page.screenshot({ path: `out/${tag}-x-error.png` }).catch(() => {}); }
      const pass = !log.error && log.home?.styled && log.home?.fontsReady && log.home?.painted > 0 && log.home?.drawingWidth === 0 && log.level?.route === 'game' && !log.pageErrors.length && log.requests.every(r => /^(200|303|304) /.test(r));
      if (!pass) ok = false;
      console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} ${tag}\n${JSON.stringify(log, null, 1)}`);
      await context.close();
      await pause(8000);
    }
  }
  await browser.close();
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
