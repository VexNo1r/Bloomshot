'use strict';
// Build with node .github/scripts/build-pages.cjs, then run this checker with Playwright/Chrome available.
// Disposable localhost profile only: real installation, offline reload, saved data and explicit update.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../_site'),out=path.resolve(__dirname,'../../../../outputs/bloomshot-offline');
const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8'),version=worker.match(/const VERSION = '([^']+)'/)[1];
let updating=false,browser,server;const errors=[],rows=[];
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 server=http.createServer((req,res)=>{
  const target=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const body=target===path.join(root,'sw.js')&&updating?worker.replace(`const VERSION = '${version}'`,`const VERSION = '${version}-update-check'`):fs.readFileSync(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(body)}catch{res.writeHead(404).end()}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/?alllevels&bosses`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('bloomshot.qa.v1'))localStorage.setItem('bloomshot.qa.v1',JSON.stringify({version:1,tutorial:true,garden:{seeds:37},settings:{sound:false,music:false,motion:false}}));});
 await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const initial=await page.evaluate(async()=>({keys:await caches.keys(),seeds:JSON.parse(localStorage.getItem('bloomshot.qa.v1')).garden.seeds}));assert(initial.keys.some(k=>k.endsWith(version)));assert.equal(initial.seeds,37);rows.push('real service worker installed all shipped assets');
 await context.setOffline(true);await page.reload();await page.locator('[data-depth="10"]').click();await page.waitForFunction(()=>window.bloomshotState?.wave===10);
 assert.equal(await page.evaluate(()=>window.bloomshotState.level),10);rows.push('offline reload starts actual Starseed encounter');
 const policy=await page.evaluate(()=>fetch('./privacy.html').then(r=>r.text()));assert(policy.includes('October 14, 2026')&&policy.includes('hello@harborlineleadrecovery.com'));rows.push('offline policy retains approved date and contact');await page.screenshot({path:path.join(out,'offline-starseed.png')});
 await context.setOffline(false);updating=true;await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update()});await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 const active=await page.evaluate(async()=>{const keys=await caches.keys();return keys});assert(active.some(k=>k.endsWith(version)));rows.push('new version waits for explicit restart');
 await page.locator('#settings-btn').click();await page.locator('#update-app-btn').waitFor({state:'visible'});
 await Promise.all([page.waitForEvent('load'),page.locator('#update-app-btn').click()]);
 await page.waitForFunction(async()=>{const keys=await caches.keys();return keys.some(k=>k.endsWith('-update-check'))&&keys.length===1});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bloomshot.qa.v1')).garden.seeds),37);assert.deepEqual(errors,[]);rows.push('explicit update reloads and preserves saved seeds');
 fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify({generatedAt:new Date().toISOString(),version,passed:rows.length,failed:0,rows,scope:'Installed desktop Chromium service worker, actual shipped bytes, offline reload and explicit update in a disposable profile; no physical iPhone or private-host installation test.'},null,2)+'\n');console.log(JSON.stringify({passed:rows.length,version,errors}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve))});
