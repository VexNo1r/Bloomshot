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
function sunnyAttack() {
  const g=new RushGame({plan:bot.plan(1),startWave:10});
  assert(g.fire(0,-1),'a real opening seed wakes Sunny');
  for(let n=0;n<600&&!g.bossWarning;n++)g.step(1/120);
  assert(g.bossWarning && g.bossWarning.move==='sprouts');return g;
}
test('Sunny warns before an early two-sprout volley; ignoring the whole pair costs exactly one life', () => {
  const g=sunnyAttack(),w=g.bossWarning,b=g.bossState.boss;
  assert(g.time<3,'the introduction does not postpone its attack until the fight is over');
  const marks=w.targets.filter(t=>t.role==='sprout');assert.equal(marks.length,2);assert(marks.every(t=>t.y<g.dangerY-170));
  const until=w.until;advance(g,1.2);assert(!g.buds.some(p=>p.sunnySprout),'no threat before the full tell');
  while(g.time<until+1/120)g.step(1/120);
  const sprouts=g.buds.filter(p=>p.sunnySprout);assert.equal(sprouts.length,2);
  assert.equal(new Set(sprouts.map(p=>p.group)).size,1,'a missed volley is one life, not two');
  for(const p of sprouts){assert.equal(p.hp,1);assert.equal(p.relay,false);const t=w.targets.find(t=>t.x===p.x);assert(t);assert(Math.abs(p.startY-t.y)<1e-9);}
  assert.equal(g.bossState.mode,'dizzy','the volley preserves the earned six-second critical window');
  const spawn=g.time,life=g.lives;while(g.time<spawn+4.7)g.step(1/120);assert.equal(g.lives,life,'the new player has time to change aim');
  while(g.time<spawn+5.2)g.step(1/120);assert.equal(g.lives,life-1);assert(!g.buds.some(p=>p.sunnySprout&&!p.bloomed));
  assert.equal(b.maxHp,14,'the attack is not an HP inflation');
});
test('Two ordinary aimed seeds can stop Sunny’s whole volley before it takes a life', () => {
  const g=sunnyAttack(),until=g.bossWarning.until;while(g.time<until+1/120)g.step(1/120);
  const sprouts=g.buds.filter(p=>p.sunnySprout),life=g.lives;
  for(const target of sprouts){
    let seconds=Math.hypot(target.x-g.launcher.x,target.y-g.launcher.y)/g.speed;
    for(let n=0;n<4;n++)seconds=Math.hypot(target.x-g.launcher.x,target.y+g.descentSpeed*target.fall*seconds-g.launcher.y)/g.speed;
    assert(g.fire(target.x-g.launcher.x,target.y+g.descentSpeed*target.fall*seconds-g.launcher.y));advance(g,.22);
  }
  advance(g,1);assert(sprouts.every(p=>p.bloomed),'the actual launched seeds hit both one-hit targets');
  advance(g,4.5);assert.equal(g.lives,life);assert.equal(g.powersUsed,0,'plain play is sufficient');
});
test('Lullaby freezes Sunny’s launched sprouts and defeat cancels them with the normal finale', () => {
  const g=sunnyAttack(),until=g.bossWarning.until;while(g.time<until+1/120)g.step(1/120);
  const sprouts=g.buds.filter(p=>p.sunnySprout),ys=sprouts.map(p=>p.y);g.lull();advance(g,1);
  assert.deepEqual(sprouts.map(p=>p.y),ys);
  g.bossState.boss.hp=1;g.strike(g.bossState.boss,true);advance(g,2);
  assert(sprouts.every(p=>p.bloomed));assert.equal(g.lives,3);assert.equal(g.status,'won');
});
function flowerEncounter(id) {
  const g=new RushGame({plan:bot.plan(id),startWave:10});g.started=true;g.status='flying';g.bossState.next=0;
  g.step(1/120);const w=g.bossState.flowerWarning;assert(w && w.targets.length,'L'+id+' warns about real ordinary flowers');
  const before=new Map(g.buds.map(p=>[p.id,{r:p.r,hp:p.hp,maxHp:p.maxHp,shell:p.shell,briar:p.briar,relay:p.relay}]));
  advance(g,1.2);assert(!g.buds.some(p=>p.bossFlowerEffect),'no mutation before the full tell');
  while(g.time<w.until+1/120)g.step(1/120);g.bossState.next=Infinity;
  return {g,w,before,affected:g.buds.filter(p=>p.bossFlowerEffect)};
}
test('Every authored boss has a unique ordinary-flower change after its complete visible tell', () => {
  for(let id=1;id<=10;id++){
    const {g,w,before,affected}=flowerEncounter(id),kind=Depths.bosses[id-1].kind;
    assert(w.until-w.at>=1.3-1e-9);assert(affected.length>=1 && affected.length<=3,'L'+id+' bounded observed changes');
    const event=g.drainEvents().find(e=>e.type==='bossWarning'&&e.flowerText);assert(event && event.flowerText===w.text,'the exact effect description reaches the existing warning event');
    assert.equal(g.bossState.flowerWarning,null);
    for(const p of affected){const e=p.bossFlowerEffect;assert.equal(e.kind,kind);assert(e.until>g.time);assert(!p.hidden);assert(p.r>=8);
      assert(!p.boss && !p.bossPart && !p.gift && !p.puff && !p.geode && !p.gem);assert(p.y+p.r<g.dangerY-100);
      if(kind==='sunny')assert.equal(p.r,before.get(p.id).r*1.25);
      if(kind==='root')assert.equal(p.r,Math.max(8,before.get(p.id).r*.7));
      if(kind==='puff')assert.equal(e.opacity,.4);
      if(kind==='fossil'){assert(p.shell);assert.equal(p.shellSpin,.9);}
      if(kind==='ember')assert(p.bossFlameUntil>g.bossState.age);
      if(kind==='geode')assert.equal(p.hp,Math.min(3,before.get(p.id).hp+1));
      if(kind==='briar'){assert(p.briar);assert.equal(p.relay,false);assert(!before.get(p.id).briar);}
      if(kind==='core'){assert(p.bossEcho);assert(p.bossEchoOf);assert(w.targets.some(t=>t.id===p.bossEchoOf&&t.echoX===p.x&&Math.abs(t.echoY-p.startY)<1e-9));}
    }
  }
});
test('Sunny growth and Root shrink change the actual seed collider, with no tiny target', () => {
  for(const id of[1,2]){const {g,before,affected}=flowerEncounter(id),p=affected[0],oldR=before.get(p.id).r;
    const point={x:p.x+Engine.RADIUS+(p.r+oldR)/2,y:p.y+50},d={x:0,y:-100},world={buds:[p],bumpers:[],gates:[]};
    const real=Engine.earliest(world,point,d),old=Engine.earliest({...world,buds:[{...p,r:oldR}]},point,d);
    assert.equal(Boolean(real),id===1);assert.equal(Boolean(old),id===2);assert(p.r>=8);
  }
});
test('Crystal sways real colliders, Lily lifts flowers safely, and Lullaby holds effect phase and deadlines', () => {
  for(const id of[4,5]){const {g,affected}=flowerEncounter(id),p=affected[0],e=p.bossFlowerEffect,y=p.y;
    advance(g,.5);if(id===4){const normal=p.baseX+(p.sway?Math.sin((g.time-g.waveStart)*p.swayW+p.swayPhase)*p.sway:0);assert(Math.abs(p.x-normal)>1);}
    else assert(p.y<y,'the actual flower rises, not only its picture');
    assert(p.x-p.r>=22 && p.x+p.r<=398 && p.y-p.r>=22);
    const phase=g.time-e.at,left=e.until-g.time,until=e.until;g.lull();advance(g,.6);
    assert(Math.abs((g.time-e.at)-phase)<1e-8);assert(Math.abs((e.until-g.time)-left)<1e-8);assert(e.until>until+.59);
  }
  const g=new RushGame({plan:bot.plan(2),startWave:10});g.started=true;g.bossState.next=0;g.step(.01);
  const w=g.bossState.flowerWarning;g.lull();advance(g,.6);assert.equal(w.until,g.bossWarning.until);assert(!g.buds.some(p=>p.bossFlowerEffect));
});
test('Temporary fields restore on expiry, near-line entry, boss breach and defeat without changing saved health damage', () => {
  for(const id of[1,2,3,4,5,6,7,8,9,10])for(const reason of['expiry','breach','defeat']){
    const {g,before,affected}=flowerEncounter(id),refs=affected.slice();
    if(reason==='expiry'){for(const p of affected){p.fall=0;p.bossFlowerEffect.until=g.time+.1;}advance(g,.2);}
    else if(reason==='breach')Bosses.breach(g);else {g.bossState.boss.hp=1;g.strike(g.bossState.boss,true);}
    assert.equal(g.bossState.flowerEffects.size,0,'L'+id+' '+reason);assert(!g.buds.some(p=>p.bossFlowerEffect));
    for(const p of refs){assert(!p.bossFlowerEffect);if(p.bossEcho)assert(!g.buds.includes(p));else {const b=before.get(p.id);assert.equal(p.r,b.r);assert.equal(p.shell,b.shell);assert.equal(p.briar,b.briar);assert.equal(p.relay,b.relay);}}
  }
  const {g,affected,before}=flowerEncounter(8),p=affected.find(p=>before.get(p.id).hp===2);hit(g,p);hit(g,p);assert.equal(p.hp,1);
  p.bossFlowerEffect.until=g.time;Bosses.step(g,0);assert.equal(p.hp,1,'expiry never heals seed damage');assert.equal(p.maxHp,before.get(p.id).maxHp);
  const root=flowerEncounter(2);root.affected[0].y=root.g.dangerY-100-root.affected[0].r;Bosses.step(root.g,0);assert(!root.affected[0].bossFlowerEffect,'no shrinking near the danger line');
});
test('Thornmother converts a whole clean group, regrows it through the engine, then clears temporary timers', () => {
  const {g,affected}=flowerEncounter(9);assert.equal(affected.length,3);assert.equal(new Set(affected.map(p=>p.group)).size,1);
  const p=affected[0];hit(g,p);assert(p.bloomed);assert(g.briarTimers.has(p.group));assert(g.briarTimers.get(p.group)<=g.time+2);advance(g,2.05);assert(!p.bloomed,'the normal Rush regrow path brings the thorn bud back');
  advance(g,3.1);assert(affected.every(p=>!p.briar&&!p.bossFlowerEffect));assert(!g.briarTimers.has(p.group));
  const real=new RushGame({plan:bot.plan(9),startWave:10});real.started=true;real.status='flying';while(!real.bossState.flowerWarning)real.step(1/120);
  const until=real.bossWarning.until;while(real.time<until+1/120)real.step(1/120);real.bossState.next=Infinity;
  const thorn=real.buds.find(p=>p.bossFlowerEffect?.kind==='briar');assert(thorn);hit(real,thorn);advance(real,2.05);assert(!thorn.bloomed && thorn.briar,'the naturally timed first spell regrows before the safe-line cutoff');
});
test('Geode cannot keep adding rings to the same bud, and Core echoes never copy echoes or exceed four total', () => {
  const a=flowerEncounter(8),used=new Set(a.affected.map(p=>p.id));for(const p of a.affected)p.bossFlowerEffect.until=a.g.time;
  Bosses.step(a.g,0);a.g.bossState.next=0;Bosses.step(a.g,0);assert(a.g.bossState.flowerWarning?.targets.every(t=>!used.has(t.id)) ?? true);
  const {g}=flowerEncounter(10);for(let cast=0;cast<5;cast++){
    for(const p of g.buds.filter(p=>p.bossEcho))p.bossFlowerEffect.until=g.time;Bosses.step(g,0);
    g.bossState.next=0;Bosses.step(g,0);const w=g.bossWarning;if(w){for(const t of w.flowerTargets)assert(!g.buds.find(p=>p.id===t.id).bossEcho);g.time=w.until;Bosses.step(g,0);}
    assert(g.bossState.echoesCreated<=4);assert(g.buds.filter(p=>p.bossEcho).length<=2);assert.equal(new Set(g.buds.map(p=>p.id)).size,g.buds.length);
  }
});
test('Modifier selection excludes special pieces and the final reaction margin, and a new wave discards all old effects', () => {
  const g=arena(3);for(const [i,field] of['gift','puff','geode','gem','bossEcho'].entries())g.buds.push({id:'excluded-'+field,group:'excluded-'+field,x:60+i*65,y:210,r:10,hp:1,maxHp:1,bloomed:false,[field]:true});
  g.buds.push({id:'near-line',group:'near-line',x:90,y:g.dangerY-90,r:10,hp:1,maxHp:1,bloomed:false});g.bossState.next=0;advance(g,.02);assert.equal(g.bossState.flowerWarning,null);
  const a=flowerEncounter(2),refs=a.affected.slice();a.g.wave=9;a.g._loadWave();assert(refs.every(p=>!p.bossFlowerEffect));assert(!a.g.buds.some(p=>p.bossFlowerEffect));
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
  s.next=s.age;advance(g,.02);const marks=g.bossWarning.targets.filter(t=>t.role==='flame');assert.equal(marks.length,3);
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
