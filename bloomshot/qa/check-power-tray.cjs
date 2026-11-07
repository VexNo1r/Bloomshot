'use strict';
// Real app navigation and rendered hit areas, without modifying game state or normal saves.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'../../../outputs/bloomshot-power-tray'));
const files=fs.readdirSync(root).filter(f=>/\.(js|css|html)$/.test(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const sourceHashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],errors=[];let browser;
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+1;
async function geometry(page,label,rush){
 const g=await page.evaluate(()=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const visible=el=>el&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).display!=='none';
  return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,board:rect(document.getElementById('game-canvas')),hint:rect(document.getElementById('game-hint')),powers:[...document.querySelectorAll('.power-chip')].filter(visible).map(el=>({id:el.dataset.power,label:el.getAttribute('aria-label'),...rect(el)})),controls:[...document.querySelectorAll('#rotate-btn,#split-btn,#restart-btn')].filter(visible).map(el=>({id:el.id,...rect(el)})),tutorial:document.body.dataset.tutorial==='on'};
 });
 const inside=r=>r.x>=0&&r.y>=0&&r.x+r.width<=g.width+.5&&r.y+r.height<=g.height+.5;
 assert.equal(g.scroll,g.width,label+' no sideways scrolling');assert(Math.abs(g.board.width/g.board.height-.75)<.001,label+' accurate board scaling');
 if(rush){
  assert.equal(g.powers.length,4,label+' all four powers');const split=g.controls.find(c=>c.id==='split-btn');assert(split,label+' Split visible');
  for(const p of g.powers){assert(inside(p)&&p.width>=44&&p.height>=44&&p.label,label+' reachable '+p.id);assert(p.y+p.height+4<=split.y,label+' power/count above Split');assert(!overlap(p,g.board)&&!overlap(p,g.hint),label+' clear board and hint');}
  assert(g.powers.every(p=>Math.abs(p.y-g.powers[0].y)<.5),label+' one row');
  for(let i=0;i<g.powers.length;i++)for(let j=i+1;j<g.powers.length;j++)assert(!overlap(g.powers[i],g.powers[j]),label+' separate targets');
 }else if(!g.tutorial) assert.equal(g.powers.length,0,label+' puzzle hides unused powers');
 else for(const p of g.powers) assert(inside(p)&&p.width>=44&&p.height>=44,label+' tutorial power target fits');
 for(const c of g.controls)assert(inside(c)&&!overlap(c,g.board),label+' visible separate '+c.id);
 rows.push({label,...g});
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:820,height:1180}]){
  const key=viewport.width+'x'+viewport.height,context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());assert.equal(u.origin,'http://localhost','no external traffic');const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404});const ext=path.extname(f),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};return route.fulfill({contentType:mime[ext]||'application/octet-stream',body:fs.readFileSync(f)});});
  await page.clock.install({time:new Date('2026-10-15T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-15T12:00:05Z'));await page.goto('http://localhost/?alllevels',{waitUntil:'networkidle'});await page.clock.runFor(400);
  assert(await page.locator('#tutorial-skip').isVisible(),key+' fresh tutorial');await geometry(page,key+' tutorial',false);await page.locator('#tutorial-skip').click();await page.clock.runFor(400);
  for(let level=1;level<=10;level++){
   await page.locator('[data-depth="'+level+'"]').click();await page.clock.runFor(400);assert.equal((await page.evaluate(()=>window.bloomshotState)).level,level);await geometry(page,key+' level '+level,true);
   if(level===3){
    const shot=page.locator('[data-power="sunburst"]');
    // The armed button pulses. Tap its observed center with a real touch, without waiting for an
    // intentionally animated target to become stationary while the virtual clock is paused.
    const press=async()=>{const b=await shot.boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await page.clock.runFor(40);};
    await press();assert.equal(await shot.getAttribute('aria-pressed'),'true',key+' real bottom tap arms Sunburst');await press();assert.equal(await shot.getAttribute('aria-pressed'),'false',key+' second tap returns unspent');
    await page.screenshot({path:path.join(out,key+'-level-three.png')});
   }
   await page.locator('#back-btn').click();await page.clock.runFor(100);
  }
  for(const world of ['moon','koi']){
   await page.locator('#worlds-btn').click();await page.clock.runFor(100);await page.locator('[data-world="'+world+'"]').click();await page.clock.runFor(100);await page.locator('#world-preview-btn').click();await page.clock.runFor(400);await geometry(page,key+' '+world,false);await page.locator('#back-btn').click();await page.clock.runFor(100);
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('bloomshot.save.v1')),null,key+' normal save untouched');await context.close();console.log('PASS '+key);
 }
 assert.deepEqual(errors,[]);const sourceStable=files.every(f=>sourceHashes[f]===sha(f));assert(sourceStable,'frozen source');fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify({generatedAt:new Date().toISOString(),passed:rows.length,failed:0,sourceStable,sourceHashes,scope:'Desktop Chromium viewport/touch emulation; real app controls, no state hooks. Not a physical iPhone or Safari test.',rows,errors},null,2)+'\n');await browser.close();console.log(JSON.stringify({passed:rows.length,failed:0,sourceStable}));
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
