'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Depths = require('../depths.js'), Bosses = require('../bosses.js'), Engine = require('../engine.js');
const { RushGame } = require('../rush.js'), bot = require('./depths-bot.cjs');
const results = []; let serial = 0;
function test(name, fn) { try { fn(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.stack }); } }
function arena(id) {
  const game = new RushGame({ plan: bot.plan(id), startWave: 10 });
  game.started = true; game.status = 'flying'; game.descentSpeed = 0; game.drops = [];
  game.buds = game.buds.filter(b => b.boss || b.bossPart); game.bossState.boss.bossFall = 0; return game;
}
function advance(game, seconds, fps = 120) { for (let n = 0; n < Math.round(seconds * fps); n++) game.step(1 / fps); }
function hit(game, bud, { nx = 0, ny = 1, gateHops = 0, power } = {}) {
  game.striker = { id: ++serial, power, gateHops, bossContact: { nx, ny }, touches: 0, streak: 0, walls: 0, bounces: 0, age: 0, gateAt: -100, petalAt: -100 };
  game.strike(bud); game.striker = null;
}

test('All ten names and real encounter parts follow the reference; late health scales for the faster pod', () => {
  assert.deepEqual(Depths.bosses.map(p => p.name), ['Old Sunny','Rootknot','Mother Morel','Crystal Heart','Lantern Lily','Ammonite Queen','Ember Rose','Geode King','Thornmother','The Starseed']);
  assert(Depths.bosses.every(p => Number.isSafeInteger(p.hp) && p.hp > 0));
  assert.equal(Depths.bosses.at(-1).hp, Math.max(...Depths.bosses.map(p => p.hp)), 'the finale has the largest health reserve');
  for (let id = 1; id <= 10; id++) {
    const g = arena(id),profile=Depths.bosses[id-1]; assert.equal(g.bossState.boss.hp, profile.hp);
    assert.equal(profile.hp,Bosses.health[profile.kind]);assert.equal(Depths.level(id).waves[9].boss.hp,profile.hp);
    assert.equal(Depths.wave(id,10).buds.find(p=>p.boss).hp,profile.hp);assert.equal(profile.telegraph,1.3);
    assert.equal(new Set(g.buds.map(b => b.id)).size, g.buds.length);
    for (const b of g.buds) assert(b.x - b.r >= Engine.BOUNDS.left && b.x + b.r <= Engine.BOUNDS.right && b.y - b.r >= Engine.BOUNDS.top);
  }
});
test('Old Sunny blocks plain seeds asleep; his bubble wakes a six-second double-damage window', () => {
  const g = arena(1), b = g.bossState.boss, hp=b.hp, bubble = g.bossState.parts[0];
  hit(g,b); assert.equal(b.hp,hp); hit(g,bubble); assert.equal(g.bossState.mode,'dizzy');
  hit(g,b); assert.equal(b.hp,hp-2); advance(g,6.1); hit(g,b); assert.equal(b.hp,hp-3);
  advance(g,7.5); assert.equal(g.bossState.mode,'sleeping'); assert(!bubble.bloomed);
});
test('Rootknot warns of walls and holes, has no underground collider, and emerges hittable', () => {
  const g = arena(2), b = g.bossState.boss, hp=b.hp; advance(g,4.1); assert(g.bossWarning && g.bossWarning.targets.some(t=>t.role==='hole'));
  advance(g,1.35); assert.equal(g.bossState.mode,'burrow'); assert(b.hidden && !b.visible); assert.equal(g.bumpers.filter(p=>p.bossWall).length,2);
  assert.equal(Engine.earliest({ buds:[b],bumpers:[],gates:[] },{x:b.x-40,y:b.y},{x:80,y:0}),null);
  hit(g,b); assert.equal(b.hp,hp); advance(g,1.6); assert.equal(g.bossState.mode,'emerging'); assert(!b.hidden && b.visible);
  hit(g,b); assert.equal(b.hp,hp-1);
});
test('Mother Morel guards her bonnet underside; a real nearby puffcap deals two damage', () => {
  const g = arena(3), b = g.bossState.boss, hp=b.hp; advance(g,5.45); assert.equal(g.bossState.mode,'bonnet');
  hit(g,b); assert.equal(b.hp,hp); hit(g,b,{ny:-1}); assert.equal(b.hp,hp-1);
  const puff=g.buds.find(p=>p.puff && !p.bloomed && Math.hypot(p.x-b.x,p.y-b.y)<74); assert(puff);
  hit(g,puff); advance(g,.5); assert.equal(b.hp,hp-3);
});
test('Crystal Heart has three colliders and one beating heart; real hits damage and stun', () => {
  const g=arena(4),s=g.bossState,b=s.boss,hp=b.hp; assert(b.hidden && !b.visible); assert.equal(s.parts.length,3);
  hit(g,s.parts.find(p=>!p.real)); assert.equal(b.hp,hp); hit(g,s.parts.find(p=>p.real)); assert.equal(b.hp,hp-1); assert.equal(s.mode,'stunned');
  const x=b.x,y=b.y; advance(g,.5); assert.equal(b.x,x); assert.equal(b.y,y);
  advance(g,5); assert(s.parts.some(p=>p.shuffleAt!=null)); assert.equal(s.parts.filter(p=>p.real).length,1);
});
test('Lantern Lily crits once through her lantern, gutters it five seconds and forms a whirlpool', () => {
  const g=arena(5),s=g.bossState,b=s.boss,hp=b.hp,lantern=s.parts[0]; hit(g,b); assert.equal(b.hp,hp,'the raised pad guards a plain shot from below');
  hit(g,lantern); assert.equal(b.hp,hp-3); assert(lantern.bloomed);
  hit(g,b); assert.equal(b.hp,hp-4,'guttering the lantern opens the body');
  advance(g,4); assert(lantern.bloomed); advance(g,1.45); assert(!lantern.bloomed); assert.equal(g.currents.filter(p=>p.bossSwirl).length,8);
  const lanes=g.currents.filter(p=>p.bossSwirl);for(const lane of lanes)assert.equal(Engine.laneAt([lane],lane.x,lane.y),lane);
  const lane=lanes[0];g.spawnBall({x:lane.x,y:lane.y,angle:-Math.PI/2,speed:520});const seed=g.balls.at(-1);advance(g,1/60);
  assert(Math.abs(seed.vx)>1,'a real seed bends in the whirlpool');assert(Math.abs(Math.hypot(seed.vx,seed.vy)-520)<1e-6);
});
test('Ammonite Queen needs the mouth click, then a second aligned ring before taking damage', () => {
  const g=arena(6),s=g.bossState,b=s.boss,hp=b.hp; b.shellAngle=Math.PI/2; b.shellSpin=0; s.lockAngle=Math.PI/2;
  hit(g,b); assert.equal(b.hp,hp); assert.equal(s.lockStage,1); assert.equal(s.mode,'lock-plates');
  hit(g,b); assert.equal(b.hp,hp-2); s.lockAngle=-Math.PI/2; hit(g,b); assert.equal(b.hp,hp-2);
  const clickAt=s.age;s.next=0;advance(g,2*Math.PI/s.lockSpin+.1);assert.equal(s.lockStage,1,'the ring gets a full visible turn without a jet erasing the click');
  assert.equal(s.action,0);assert(s.age-clickAt>2*Math.PI/s.lockSpin);advance(g,1.2);assert.equal(s.lockStage,0);
});
test('Ember Rose burns plain seeds, takes tunnel criticals and exposes a warned dive', () => {
  const g=arena(7),s=g.bossState,b=s.boss,hp=b.hp; hit(g,b); assert.equal(b.hp,hp); hit(g,b,{gateHops:1}); assert.equal(b.hp,hp-3);
  advance(g,5.45); assert.equal(s.mode,'dive'); hit(g,b); assert.equal(b.hp,hp-5); advance(g,2.5); assert.equal(s.mode,'flame');
});
test('Ember fire actually consumes a plain seed; tunnel seeds survive and ignition speeds only marked buds', () => {
  const g=arena(7),s=g.bossState,b=s.boss,hp=b.hp;
  g.spawnBall({x:b.x,y:b.y+60,angle:-Math.PI/2});advance(g,.15);
  assert.equal(g.balls.length,0,'flame consumes the plain seed instead of reflecting it');assert.equal(b.hp,hp);
  assert.equal(g.drainEvents().filter(e=>e.type==='bossBurn').length,1);
  g.spawnBall({x:b.x,y:b.y+60,angle:-Math.PI/2});g.balls[0].gateHops=1;advance(g,.15);
  assert.equal(b.hp,hp-3);assert(g.balls.length>0);g.balls=[];
  g.descentSpeed=20;
  for(let n=0;n<7;n++)g.buds.push({id:'ember-escort-'+n,group:'escort-'+n,x:45+n*50,y:260,r:10,hp:1,maxHp:1,fall:1,bloomed:false});
  s.next=s.age;advance(g,.02);const marks=g.bossWarning.targets.filter(t=>t.role==='flame');assert.equal(marks.length,6);
  const target=g.buds.find(p=>p.id===marks[0].id);advance(g,.5);assert.equal(marks[0].y,target.y,'the warning follows its actual target');
  advance(g,.82);assert.equal(s.mode,'dive');const marked=target.y,unmarked=g.buds.at(-1).y;advance(g,1);
  assert(Math.abs(target.y-marked-25)<1e-6);assert(Math.abs(g.buds.at(-1).y-unmarked-20)<1e-6);
  g.lull();const stopped=target.y;advance(g,.5);assert.equal(target.y,stopped);
});
test('Geode King has eight crust HP; a broken plate opens the heart and regrowth is warned', () => {
  const g=arena(8),s=g.bossState,b=s.boss,hp=b.hp,p=s.parts.find(p=>p.slot===1); assert.equal(s.parts.reduce((n,p)=>n+p.hp,0),8);
  hit(g,b); assert.equal(b.hp,hp); hit(g,p); hit(g,p); assert(p.bloomed); hit(g,b); assert.equal(b.hp,hp-2);
  advance(g,5.3); assert(p.bloomed,'cannot regrow before eight seconds'); advance(g,10); assert(!p.bloomed);
});
test('Thornmother patches heal through heart-vines; a complete patch cuts its vine', () => {
  const g=arena(9),s=g.bossState,b=s.boss; advance(g,3.6); assert(s.patches.length);
  b.hp=40; advance(g,4); assert(b.hp>40); const patch=s.patches[0],buds=g.buds.filter(p=>p.group===patch.group);
  for(const p of buds) hit(g,p); advance(g,.2); assert(patch.cut); assert(buds.every(p=>!p.healing));
  const hp=b.hp; advance(g,3); assert.equal(b.hp,hp);
});
test('The Starseed uses five real stars, a three-star dome, replayed moves and supernova', () => {
  const g=arena(10),s=g.bossState,b=s.boss,hp=b.hp; assert.equal(s.parts.length,5); assert.equal(s.parts.filter(p=>p.lit).length,3);
  hit(g,b); assert.equal(b.hp,hp); const p=s.parts.find(p=>p.lit); hit(g,p);hit(g,p);advance(g,.02); assert.equal(s.mode,'exposed');
  hit(g,b); assert.equal(b.hp,hp-1); advance(g,14); assert(g.drainEvents().some(e=>e.type==='bossAbility'&&e.move==='swirl'));
  b.hp=16; s.phase=1; s.next=s.age; advance(g,1.4); assert.equal(s.mode,'supernova'); hit(g,b); assert.equal(b.hp,14);
});
test('The Starseed marks every dark or broken satellite before relighting its second phase', () => {
  const g=arena(10),s=g.bossState;s.boss.hp=Math.ceil(s.boss.maxHp*.59);advance(g,.3);advance(g,.02);
  assert(g.bossWarning && g.bossWarning.move==='satellites');
  const ids=new Set(g.bossWarning.targets.filter(t=>t.role==='satellite').map(t=>t.id));
  for(const p of s.parts.filter(p=>!p.lit))assert(ids.has(p.id));
  advance(g,1.35);assert.equal(s.parts.filter(p=>p.lit).length,5);
});
test('Moves wait at least 1.3 seconds for the audible warning; Lullaby holds them and defeat cancels future attacks', () => {
  for(let id=1;id<=10;id++) { const g=arena(id),s=g.bossState;s.next=0;advance(g,.02);assert(g.bossWarning);const at=g.bossWarning.until;
    assert(g.bossWarning.until-g.bossWarning.at>=1.3-1e-9);advance(g,1.2);assert.equal(s.action,0);g.lull();advance(g,2);assert(g.bossWarning.until>at);assert.equal(s.action,0);
    s.boss.hp=1;g.strike(s.boss,true);assert(g.bossDefeated);assert.equal(g.bossWarning,null);advance(g,3);assert.equal(s.action,0); }
});
test('Last-life bosses give one free Lullaby bubble; boss-only retry earns at most one star', () => {
  const g=arena(5);g.lives=1;advance(g,.02);const gift=g.buds.find(p=>p.freeBossGift);assert(gift && gift.gift==='lullaby');
  g.strike(gift);advance(g,1);assert.equal(g.drainEvents().filter(e=>e.type==='gift'&&e.power==='lullaby').length,1);assert(!g.buds.some(p=>p.freeBossGift));
  const retry=arena(5);retry.status='won';assert.equal(retry.stars,1);
});
test('Paid shot powers retain their exact ring damage and a final multi-hit clears the boss once', () => {
  const g=arena(1),b=g.bossState.boss,hp=b.hp;hit(g,g.bossState.parts[0]);
  g.striker={id:++serial,power:'beeline',gateHops:0,touches:0,streak:0,walls:0,bounces:0,age:0};
  g._beeHit(b);assert.equal(b.hp,hp-3,'Bee Line takes three rings even during a crit window');
  b.hp=8;g.striker.power='sunburst';g._sunburst({x:b.x,y:b.y,power:'sunburst'},b);assert.equal(b.hp,4);
  b.hp=2;g.striker={...g.striker,id:++serial,power:'beeline',powerBosses:[]};g._beeHit(b);g.striker=null;
  assert(b.bloomed && g.bossDefeated);assert.equal(g.drainEvents().filter(e=>e.type==='boss').length,1);
  assert.equal(g.drops.length,0);assert.equal(g.bossWarning,null);advance(g,2);assert.equal(g.status,'won');
});
test('Seeded chains obey visible boss armor; Morel puff damage and paid Sunburst remain exceptions', () => {
  const g=arena(10),b=g.bossState.boss,hp=b.hp;
  g.due={by:++serial,via:'relay',from:{x:b.x,y:b.y+50}};g.strike(b,true);assert.equal(b.hp,hp);
  g.due={by:++serial,via:'puff',from:{x:b.x,y:b.y+50}};g.strike(b,true);assert.equal(b.hp,hp);
  g.due={by:++serial,via:'sun',from:{x:b.x,y:b.y+50}};g.strike(b,true);assert.equal(b.hp,hp-1);g.due=null;
  const morel=arena(3),morelHp=morel.bossState.boss.hp;morel.due={by:++serial,via:'puff'};morel.strike(morel.bossState.boss,true);assert.equal(morel.bossState.boss.hp,morelHp-2);
});
test('Prediction is read-only and encounters agree at 30, 60 and 144 FPS', () => {
  for(let id=1;id<=10;id++){const snapshots=[30,60,144].map(fps=>{const g=arena(id);advance(g,6,fps);const before=g.buds.map(p=>[p.id,p.x,p.y]);Bosses.predictVisible(g,.5);assert.deepEqual(g.buds.map(p=>[p.id,p.x,p.y]),before);return [g.bossState.mode,g.bossState.action,...g.buds.filter(p=>p.boss||p.bossPart).map(p=>[p.id,+p.x.toFixed(5),+p.y.toFixed(5),p.hp,p.bloomed])];});assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);}
});
test('Real reinforcements retain broken Geode/Core parts, which revive as hittable colliders', () => {
  for (const id of [8,10]) {
    const g=new RushGame({plan:bot.plan(id),startWave:10}),s=g.bossState;
    g.started=true;g.status='flying';g.descentSpeed=0;g.buds=g.buds.filter(p=>p.boss||p.bossPart);
    g.time=20;s.age=20;s.next=10000;Bosses.step(g,0);
    const p=s.parts.reduce((a,b)=>a.y<b.y?a:b),bottom=Math.max(...g.drops[0].buds.map(b=>b.y+b.r));
    s.drift+=bottom+23-p.y;Bosses.step(g,0);hit(g,p);hit(g,p);assert(p.bloomed);
    p.bloomAt=g.time-2;const drops=g.drops.length;g._dropIn(20);
    assert.equal(g.drops.length,drops-1,'the real authored reinforcement actually arrives');
    assert(g.buds.includes(p),'the old-bloom pruning retains the permanent guard part');
    g.time+=8.1;s.age+=8.1;if(id===10)s.phase=1;s.next=0;Bosses.step(g,0);
    assert(g.bossWarning.targets.some(t=>t.id===p.id),'the returning guard is telegraphed');
    g.time=g.bossWarning.until;Bosses.step(g,0);assert(!p.bloomed);assert(g.buds.includes(p));
    assert.equal(g.buds.filter(b=>b.id===p.id).length,1);
    const collision=Engine.earliest({buds:[p],gates:[],bumpers:[]},{x:p.x,y:p.y+p.r+20},{x:0,y:-80});
    assert(collision && collision.item===p,'the returned part has a real seed collider');
  }
});
test('Revival reconnects a detached boss part once, preserving its canonical encounter object', () => {
  const g=arena(10),s=g.bossState,p=s.parts[0];p.bloomed=true;p.lit=false;
  g.buds=g.buds.filter(b=>b!==p);s.phase=1;s.next=0;Bosses.step(g,0);g.time=g.bossWarning.until;Bosses.step(g,0);
  assert.equal(g.buds.filter(b=>b.id===p.id).length,1);assert(g.buds.includes(p));assert(!p.bloomed && p.lit);
  g.buds[g.buds.indexOf(p)]={...p};p.bloomed=true;p.lit=false;s.action=0;s.next=0;Bosses.step(g,0);g.time=g.bossWarning.until;Bosses.step(g,0);
  assert.equal(g.buds.filter(b=>b.id===p.id).length,1);assert(g.buds.includes(p));
});
test('Crystal proxy bodies breach and reset every heart immediately; underground Root remains exempt', () => {
  const g=arena(4),s=g.bossState;s.next=Infinity;s.drift=g.dangerY-s.boss.r-s.baseY-.01;advance(g,1/60);
  assert.equal(g.lives,2);assert.equal(g.waveBreaches,1);assert(s.boss.y<200);assert(s.boss.hidden);
  const poses=Bosses.predictVisible(g,0);for(const p of s.parts){assert(p.y<200);assert.equal(p.y,poses.get(p.id).y);assert.equal(p.x,poses.get(p.id).x);}
  const root=arena(2),rs=root.bossState;rs.next=0;advance(root,1.4);assert.equal(rs.mode,'burrow');
  rs.drift=root.dangerY-rs.boss.r-rs.baseY+.1;advance(root,1/60);assert.equal(root.lives,3,'genuinely underground roots do not breach');
  advance(root,1.6);assert.equal(root.lives,2,'emerging beyond the line costs one life and returns the boss');assert(rs.boss.y<200);
});
test('Super Bloom cannot turn two-hit boss armor parts into plain pierced flowers', () => {
  for(const id of[8,10]){const g=arena(id),s=g.bossState,p=s.parts.reduce((a,b)=>a.y>b.y?a:b);g.buds=[p];
    g._startSuper();g.spawnBall({x:p.x,y:p.y+30,angle:-Math.PI/2,speed:520});const seed=g.balls[0];advance(g,.1);
    assert.equal(p.hp,1);assert(!p.bloomed);assert.equal(seed.pierced,0);assert(seed.vy>0,'the seed reflects from a real boss part');}
});
test('Sunburst takes exactly four rings once per whole guardian through bodies or proxies', () => {
  for(let id=1;id<=10;id++){const g=arena(id),s=g.bossState,b=s.boss,hp=b.hp,target=s.parts[0]||b;
    const seed={id:++serial,power:'sunburst',age:0,touches:0,streak:0,walls:0,bounces:0,gateHops:0,x:target.x,y:target.y};
    g.striker=seed;g._sunburst(seed,target);g.striker=null;advance(g,.7);assert.equal(hp-b.hp,4,'L'+id+' one explosion, one four-ring dose');
    if(id===4){assert(s.parts.every(p=>!p.bloomed));assert.equal(s.mode,'stunned');}
    if(id===5){assert(s.parts[0].bloomed);assert.equal(s.mode,'gutter');}
  }
});
test('Bee Line takes three rings once per whole guardian while opening its encountered guard parts', () => {
  for(let id=1;id<=10;id++){const g=arena(id),s=g.bossState,b=s.boss,hp=b.hp;
    g.striker={id:++serial,power:'beeline',age:0,touches:0,streak:0,walls:0,bounces:0,gateHops:0};
    for(const p of [...s.parts,b])if(!p.bloomed)g._beeHit(p);g.striker=null;
    assert.equal(hp-b.hp,3,'L'+id+' proxy/body contacts share one three-ring dose');
    if(id===4){assert(s.parts.every(p=>!p.bloomed));assert.equal(s.mode,'stunned');}
    if(id===5){assert(s.parts[0].bloomed);assert.equal(s.mode,'gutter');}
  }
});
test('Real powered seed paths through Crystal hearts and Lily lantern keep the stated whole-boss damage', () => {
  for(const id of[4,5])for(const power of['sunburst','beeline']){
    const g=arena(id),s=g.bossState,b=s.boss,hp=b.hp,target=s.parts.find(p=>p.real)||s.parts[0];
    g.spawnBall({x:target.x,y:target.y+55,angle:-Math.PI/2,speed:520,power});advance(g,.7);
    assert.equal(hp-b.hp,power==='sunburst'?4:3,'L'+id+' actual '+power+' collision');
    if(id===4)assert.equal(s.mode,'stunned');else {assert(s.parts[0].bloomed);assert.equal(s.mode,'gutter');}
  }
});
const report={passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
fs.writeFileSync(path.join(__dirname,'boss-test-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
