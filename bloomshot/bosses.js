(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./foes.js'));
  else root.BloomBosses = factory(root.BloomFoes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Foes) {
  'use strict';
  // Deterministic guardian encounters. All vulnerable parts are real seed colliders, all changes announce
  // their exact landing points, and no encounter changes the seed pod or needs a bought powerup.
  const TAU = Math.PI * 2, TELEGRAPH = 1.3;
  // Later guardians retain their critical windows and armor; their rings scale for the faster four-seed pod.
  const HEALTH = { sunny: 14, root: 16, puff: 22, crystal: 24, lotus: 32, fossil: 18, ember: 96, geode: 64, briar: 52, core: 104 };
  const TEXT = { sunny: 'Old Sunny is nodding off.', root: 'Root walls! Watch the holes.', puff: 'Puffcaps! Pop one beside her.',
    crystal: 'Three hearts. Follow the beating one.', lotus: 'Whirlpool! Watch the lantern.', fossil: 'Two locks. Wait for both gaps.',
    ember: 'Fire dive! Catch her bare.', geode: 'The crust is growing back.', briar: 'Cut the vines! Clear a whole patch.', core: 'The little stars are waking.' };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const FLOWER_TIME = { sunny: 4, root: 4, puff: 4.5, crystal: 4.5, lotus: 2.5, fossil: 4.5, ember: 3, geode: 5, briar: 5, core: 4.5 };
  const FLOWER_TEXT = { sunny: 'Warmth swells the buds.', root: 'The roots are shrinking the buds.', puff: 'A soft spore veil is settling.', crystal: 'The buds are swaying sideways.', lotus: 'The lake is lifting the flowers.', fossil: 'Shells are closing around the buds.', ember: 'Marked flowers are catching fire.', geode: 'A crystal ring is growing.', briar: 'Thorns are taking a whole patch.', core: 'The flowers are making echoes.' };
  const flowerFields = ['r', 'shell', 'shellAngle', 'shellSpin', 'briar', 'relay', 'bossFlameUntil'];
  // Guardian kits (the first five guardians): three tiers of moves, a mood per tier, and the hooks each kit uses. A guardian
  // without a kit plays exactly as before. Kits are defined at the end of this file, one block each.
  const KITS = Object.create(null), TIER_PACE = [1, .9, .8];
  const FIXED = new Set(['portal', 'pad', 'knot']);
  // Parts whose hit lands on the guardian itself, so they are held with it while a mood change is pending.
  const REDIRECT = new Set(['heart', 'lantern']);
  const held = (s, bud) => Boolean((s.shiftPending || s.warning && s.warning.move === 'stage') && (bud.boss || REDIRECT.has(bud.bossPart)));
  function kit(kind, entry) { KITS[kind] = entry; if (entry.hp) HEALTH[kind] = entry.hp; }
  const kitOf = s => (s && KITS[s.kind]) || null;
  function active(game) { const s = game.bossState; return s && !s.boss.bloomed && !game.over ? s : null; }
  function plainFlower(p) { return p && !p.bloomed && !p.hidden && !p.boss && !p.bossPart && !p.gift && !p.puff && !p.geode && !p.gem && !p.bossEcho && !p.sunnySprout && !p.foe && !p.carried; }
  function safeFlower(game, p, seconds = 0) {
    return plainFlower(p) && !p.bossFlowerEffect && p.y + p.r + game.descentSpeed * (p.fall || 1) * seconds < game.dangerY - 100;
  }
  function flowerX(game, p) { return p.baseX + (p.sway ? Math.sin((game.time - game.waveStart) * p.swayW + p.swayPhase) * p.sway : 0); }
  function endFlowerEffect(game, s, record) {
    const p = record.bud, effect = p.bossFlowerEffect;
    if (record.echo) game.buds = game.buds.filter(b => b !== p);
    else {
      for (const [key, saved] of Object.entries(record.saved)) { if (saved.had) p[key] = saved.value; else delete p[key]; }
      if (effect && effect.kind === 'crystal') p.x = clamp(flowerX(game, p), 22 + p.r, 398 - p.r);
      if (record.health && !p.bloomed) { p.maxHp = record.health.maxHp; p.hp = Math.min(p.hp, record.health.hp); }
      if (effect && effect.kind === 'briar') {
        game.briarTimers?.delete(p.group); delete p.regrowAt; delete p.regrowSpan;
      }
    }
    delete p.bossFlowerEffect; s.flowerEffects.delete(p.id);
  }
  function clearFlowerEffects(game, s) {
    if (!s) return;
    for (const record of [...(s.flowerEffects?.values() || [])]) endFlowerEffect(game, s, record);
    s.flowerWarning = null;
    if (s.warning) { s.warning.flowerTargets = []; s.warning.targets = s.warning.targets.filter(t => !t.effect); }
  }
  function echoSpot(game, source, taken) {
    for (const [dx, dy] of [[42,-48],[-42,-48],[54,-74],[-54,-74],[0,-74]]) {
      const x = source.x + dx, y = source.y + dy, r = Math.max(8, Math.min(12, source.r));
      if (x-r<28 || x+r>392 || y-r<28 || y+r>=game.dangerY-100) continue;
      const clear = game.buds.every(p => p.bloomed || p.hidden || Math.hypot(p.x-x,p.y-y) > p.r+r+12);
      if (clear && taken.every(p=>Math.hypot(p.echoX-x,p.echoY-y)>p.echoR+r+12)) return { echoX:x,echoY:y,echoR:r };
    }
    return null;
  }
  function flowerTargets(game, s) {
    const kind=s.kind, activeCount=s.flowerEffects.size;
    if(activeCount || kind==='core' && s.echoesCreated>=4)return [];
    let buds=game.buds.filter(p=>safeFlower(game,p,TELEGRAPH)).sort((a,b)=>a.y-b.y || a.x-b.x);
    if(kind==='geode')buds=buds.filter(p=>!s.flowerUsed.has(p.id) && p.hp<3);
    if(kind==='fossil')buds=buds.filter(p=>!p.shell);
    if(kind==='briar'){
      const first=buds.find(p=>!p.briar && game.buds.filter(b=>b.group===p.group).length<=3 && game.buds.filter(b=>b.group===p.group).every(b=>!b.briar && safeFlower(game,b,TELEGRAPH)));
      buds=first?buds.filter(p=>p.group===first.group):[];
    }else buds=buds.slice(0,kind==='ember'?3:2);
    const targets=[];
    for(const p of buds){
      const target={id:p.id,x:p.x,y:p.y,r:p.r,role:kind==='ember'?'flame':'flower-effect',effect:kind};
      if(kind==='core'){const spot=echoSpot(game,p,targets);if(!spot || targets.length>=4-s.echoesCreated)continue;Object.assign(target,spot);}
      targets.push(target);
    }
    return targets;
  }
  function flowerWarning(game, s, w) {
    const targets=flowerTargets(game,s);w.flowerTargets=targets;
    w.flowerText=targets.length?FLOWER_TEXT[s.kind]:null;
    s.flowerWarning=targets.length?{kind:s.kind,text:FLOWER_TEXT[s.kind],at:w.at,until:w.until,targets}:null;
    w.targets.push(...targets);
  }
  function applyFlowerEffects(game, s, w) {
    const kind=s.kind;
    for(const t of w.flowerTargets || []){
      const p=game.buds.find(b=>b.id===t.id);if(!safeFlower(game,p))continue;
      if(kind==='core'){
        if(s.echoesCreated>=4 || game.buds.filter(b=>b.bossEcho&&!b.bloomed).length>=2)break;
        if(game.buds.some(b=>!b.bloomed&&!b.hidden&&Math.hypot(b.x-t.echoX,b.y-t.echoY)<b.r+t.echoR+8))continue;
        const id=s.boss.id+'-echo-'+s.serial++, echo={id,group:s.boss.id+'-echo-volley-'+s.action,
          x:t.echoX,y:t.echoY,baseX:t.echoX,startY:t.echoY,r:t.echoR,type:p.type,hp:1,maxHp:1,relay:false,
          fall:Math.min(1,p.fall||1),sway:0,hitAt:-100,bloomAt:-100,bloomed:false,spawnAt:game.time,
          bossEcho:true,bossEchoOf:p.id,bossSummon:true,bossSource:s.boss.id};
        echo.bossFlowerEffect={kind,at:game.time,until:game.time+FLOWER_TIME[kind]};game.buds.push(echo);
        s.flowerEffects.set(id,{bud:echo,echo:true});s.echoesCreated++;continue;
      }
      const record={bud:p,saved:Object.fromEntries(flowerFields.map(key=>[key,{had:Object.hasOwn(p,key),value:p[key]}]))};
      const effect=p.bossFlowerEffect={kind,at:game.time,until:game.time+FLOWER_TIME[kind]};
      if(kind==='sunny')p.r=Math.min(p.r*1.25,20,p.x-22,398-p.x);
      if(kind==='root')p.r=Math.max(8,p.r*.7);
      if(kind==='puff')effect.opacity=.4;
      if(kind==='crystal')effect.amplitude=16;
      if(kind==='lotus')effect.lift=12;
      if(kind==='fossil'){p.shell=true;p.shellAngle=Math.PI/2;p.shellSpin=.9;}
      if(kind==='ember')p.bossFlameUntil=s.age+FLOWER_TIME[kind];
      if(kind==='geode'){
        record.health={hp:p.hp,maxHp:p.maxHp};p.hp=Math.min(3,p.hp+1);p.maxHp=Math.max(p.maxHp,p.hp);s.flowerUsed.add(p.id);
      }
      if(kind==='briar'){p.briar=true;p.relay=false;}
      s.flowerEffects.set(p.id,record);
    }
    s.flowerWarning=null;
  }
  function stepFlowerEffects(game,s,dt){
    for(const record of [...s.flowerEffects.values()]){
      const p=record.bud,e=p.bossFlowerEffect;if(!e){s.flowerEffects.delete(p.id);continue;}
      const wholeBriar=e.kind==='briar' && game.buds.some(b=>b.group===p.group&&!b.bloomed);
      if(!game.buds.includes(p) || p.bloomed&&!wholeBriar || p.y+p.r>=game.dangerY-100 || game.time>=e.until){
        if(e.kind==='briar')for(const other of [...s.flowerEffects.values()]){if(other.bud.group===p.group)endFlowerEffect(game,s,other);}
        else endFlowerEffect(game,s,record);continue;
      }
      if(game.lullaby>0){e.until+=dt;e.at+=dt;if(e.kind==='ember')p.bossFlameUntil+=dt;}
      if(e.kind==='crystal'){
        const elapsed=game.time-e.at,duration=FLOWER_TIME.crystal,envelope=Math.sin(Math.PI*clamp(elapsed/duration,0,1));
        const edge=clamp((game.dangerY-100-p.y-p.r)/36,0,1);
        p.x=clamp(flowerX(game,p)+Math.sin(elapsed*2.6)*e.amplitude*envelope*edge,22+p.r,398-p.r);
      }
      if(e.kind==='lotus' && !(game.lullaby>0))p.y=Math.max(28+p.r,p.y-(game.descentSpeed*(p.fall||1)+e.lift)*dt);
    }
  }
  function part(game, role, x, y, r, hp, extra) {
    const s = game.bossState, boss = s.boss, id = boss.id + '-' + role + '-' + s.serial++;
    const p = { id, group: boss.group, bossId: boss.id, bossKind: s.kind, bossPart: role, x, y, baseX: x, startY: y, r,
      hp, maxHp: hp, type: boss.type, relay: false, fall: 0, sway: 0, visible: true, lit: true,
      hitAt: -100, bloomAt: -100, bloomed: false, spawnAt: game.time, ...extra };
    s.parts.push(p); game.buds.push(p); return p;
  }
  function init(game) {
    clearFlowerEffects(game,game.bossState);
    const boss = game.buds.find(b => b.boss && b.bossKind);
    game.bossState = null; game.bossWarning = null;
    if (!boss) return;
    const s = game.bossState = { kind: boss.bossKind, boss, age: 0, moveAge: 0, phase: 0, mode: 'open', vulnerable: true, weakspot: null,
      warning: null, parts: [], hazards: [], serial: 0, action: 0, next: 4, modeUntil: 0, hits: 0, crits: 0, guards: 0,
      heals: 0, summons: 0, lostLives: 0, patches: [], baseX: boss.baseX, baseY: boss.y, drift: 0, bob: 0, stunUntil: 0,
      flowerEffects:new Map(),flowerUsed:new Set(),flowerWarning:null,echoesCreated:0,
      tier: 0, cycle: 0, shiftPending: false, tierAt: null, carried: [], timers: [], lobs: [], clock: 0, lull: 0 };
    game.bossReached = true; game.bossDefeated = false;
    boss.bossWarning = null; boss.visible = true;
    boss.maxHp = boss.hp = Number.isInteger(boss.hp) && boss.hp > 0 ? boss.hp : HEALTH[s.kind];
    // A kit guardian changes mood at two thirds and one third of its health.
    if (KITS[s.kind]) s.tierAt = [Math.ceil(2 * boss.maxHp / 3), Math.ceil(boss.maxHp / 3)];
    if (s.kind === 'sunny') { s.mode = 'sleeping'; s.vulnerable = false; part(game, 'bubble', boss.x, boss.y + 46, 18, 1); }
    if (s.kind === 'crystal') { s.mode = 'split'; boss.hidden = true; boss.visible = false; for (let n = 0; n < 3; n++) part(game, 'heart', boss.x + (n - 1) * 64, boss.y, 22, 1, { real: n === 1, slot: n }); }
    if (s.kind === 'lotus') { part(game, 'lantern', boss.x + 40, boss.y + 8, 11, 1); s.weakspot = 'lantern'; }
    if (s.kind === 'fossil') { s.mode = 'lock-mouth'; boss.shell = true; boss.shellAngle = Math.PI / 2; boss.shellSpin = .75; s.shellBaseSpin=.75;s.lockAngle = Math.PI / 2; s.lockSpin=1.05;s.lockStage = 0; }
    if (s.kind === 'ember') { s.mode = 'flame'; s.vulnerable = false; }
    if (s.kind === 'geode') { s.mode = 'crust'; for (let n = 0; n < 4; n++) part(game, 'plate', boss.x, boss.y, 13, 2, { slot: n }); }
    if (s.kind === 'briar') { s.mode = 'skirt'; s.next = 2.2; }
    if (s.kind === 'core') { s.mode = 'domed'; s.vulnerable = false; for (let n = 0; n < 5; n++) part(game, 'satellite', boss.x, boss.y, 11, 2, { slot: n, lit: n < 3 }); }
    const k = kitOf(s); if (k && k.init) k.init(game, s);
    step(game, 0);
  }
  // Only presently visible, predictable motion. It does not reveal the next shuffle or unannounced attack.
  function offset(kind, t) {
    switch (kind) {
      case 'root': return { x: 70 * Math.pow(Math.sin(t * .5), 3), y: 0 };
      case 'puff': return { x: 44 * Math.sin(t * .65), y: 8 * Math.sin(t * 1.3) };
      case 'crystal': return { x: 32 * Math.sin(t * .7), y: 4 * Math.sin(t * 1.4) };
      case 'lotus': return { x: 60 * Math.sin(t * .75), y: 12 * Math.sin(t * 1.5) };
      case 'fossil': return { x: 55 * Math.sin(t * .55), y: 6 * Math.sin(t * 1.1) };
      case 'ember': return { x: 68 * Math.sin(t * .85), y: 14 * Math.sin(t * 1.7) };
      case 'geode': return { x: 72 * Math.sin(t * .6), y: 0 };
      case 'briar': return { x: 54 * Math.sin(t * .8), y: 9 * Math.sin(t * 1.6) };
      case 'core': return { x: 54 * Math.sin(t * .7), y: 12 * Math.sin(t * 1.4) };
      default: return { x: 36 * Math.sin(t * .4), y: 0 };
    }
  }
  function positions(s, seconds) {
    const boss = s.boss, future = s.age + seconds, moving = s.moveAge + Math.max(0, seconds - Math.max(0, s.stunUntil - s.age)), m = offset(s.kind, moving);
    const dive = s.kind === 'ember' && s.mode === 'dive' ? 44 * Math.sin(clamp((s.age - s.diveAt + seconds) / 2.4, 0, 1) * Math.PI) : 0;
    let x = clamp(s.baseX + m.x, 100, 320);
    if (s.kind==='fossil' && s.jetAt!=null) { const p=clamp((future-s.jetAt)/.9,0,1),e=p*p*(3-2*p);x=s.jetFrom+(s.jetTo-s.jetFrom)*e; }
    if (s.kind==='ember' && s.mode==='dive') { const p=clamp((future-s.diveAt)/2.4,0,1),e=p*p*(3-2*p);x=s.diveFrom+(s.diveTo-s.diveFrom)*e; }
    const y = Math.max(90, s.baseY + s.drift + seconds * s.fall + m.y + dive);
    // A kit's own pieces run on its clock, which a Lullaby stops (s.lull is the Lullaby time left).
    const map = new Map([[boss.id, { x, y, r: boss.r }]]), k = kitOf(s), clock = s.clock + Math.max(0, seconds - s.lull);
    for (const p of s.parts) {
      let px = x, py = y;
      if (p.bossPart === 'bubble') py += 46;
      if (p.bossPart === 'lantern') { px += 40; py += 8; }
      if (p.bossPart === 'heart') {
        const progress = p.shuffleAt == null ? 1 : clamp((future - p.shuffleAt) / .8, 0, 1), eased = progress * progress * (3 - 2 * progress);
        const slot = p.fromSlot == null ? p.slot : p.fromSlot + (p.slot - p.fromSlot) * eased;
        px += (slot - 1) * 64; py += p.real ? 0 : 5 * Math.sin(future * 2 + p.slot);
      }
      if (p.bossPart === 'plate') { const a = p.slot * Math.PI / 2 + future * .18; px += Math.cos(a) * 39; py += Math.sin(a) * 39; }
      if (p.bossPart === 'satellite') { const a = p.slot * TAU / 5 + future * .34; px += Math.cos(a) * 56; py += Math.sin(a) * 56; }
      // Portals, pads and knots stay where they opened; a kit poses its own moving parts in closed form.
      if (FIXED.has(p.bossPart)) { px = p.baseX; py = p.startY; }
      const own = k && k.pose ? k.pose(s, p, x, y, clock) : null;
      map.set(p.id, own ? { x: own.x, y: own.y, r: p.r } : { x: px, y: py, r: p.r });
    }
    // Flowers a kit carries (Rootknot's carousel) are posed by the kit, so the bot's forecast matches the board.
    for (const p of s.carried) { const own = k && k.pose ? k.pose(s, p, x, y, clock) : null; if (own) map.set(p.id, { x: own.x, y: own.y, r: p.r }); }
    return map;
  }
  function predictVisible(game, seconds) {
    const s = active(game); if (!s) return new Map();
    // Stop leading across a warned transition. The player can see that a move is about to change.
    const horizon = s.warning ? Math.min(seconds, Math.max(0, s.warning.until - game.time)) : seconds;
    return positions(s, horizon);
  }
  function warning(game, move, text, targets) {
    const s = active(game); if (!s) return;
    const boss = s.boss, w = { kind: s.kind, name: boss.name, move, text, at: game.time, until: game.time + TELEGRAPH,
      x: boss.x, y: boss.y, targets };
    if (move !== 'stage') flowerWarning(game,s,w); else w.flowerTargets = [];
    s.warning = w; game.bossWarning = w; boss.bossWarning = w; game.event('bossWarning', { ...w });
  }
  function landing(game, desired, r = 32) {
    for (const x of [desired, desired < 210 ? 332 : 88, 210]) {
      const y = 70;
      if (game.buds.every(b => b.bloomed || b.hidden || Math.hypot(b.x - x, b.y - y) >= b.r + r + 10)) return { x, y, r, role: 'summon' };
    }
    return null;
  }
  function cluster(game, target, options = {}) {
    if (!target || game.buds.filter(b => !b.bloomed && b.bossSummon).length >= 12) return [];
    if (game.buds.some(b => !b.bloomed && !b.hidden && Math.hypot(b.x - target.x, b.y - target.y) < b.r + target.r + 5)) return [];
    const s = active(game), id = s.boss.id + '-spawn-' + s.serial++, group = id;
    const made = [[0, -16], [-20, 14], [20, 14]].map(([dx, dy], i) => ({ id: id + '-' + i, group, x: target.x + dx, y: target.y + dy,
      baseX: target.x + dx, startY: target.y + dy, r: 10, type: s.boss.type, hp: options.hp || 1, maxHp: options.hp || 1,
      relay: !options.briar && i === 0, briar: Boolean(options.briar), shield: Boolean(options.cup) && i > 0,
      fall: options.fast ? 1.3 : .85, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, spawnAt: game.time,
      bossSummon: true, bossSource: s.boss.id, healing: Boolean(options.briar) }));
    game.buds.push(...made); s.summons++; return made;
  }
  function sunnyTargets(game) {
    const s = active(game), targets = [], radius = 14;
    // The first guardian teaches a change of aim. Two visible one-hit sprouts arrive in the middle
    // of the board, rather than spending the whole short fight drifting harmlessly from the ceiling.
    for (const xs of [[146, 92, 178], [274, 328, 242]]) {
      let target = null;
      for (const y of [224, 260, 194]) {
        for (const x of xs) {
          const clear = game.buds.every(p => {
            if (p.bloomed || p.hidden) return true;
            const pose = p.boss || p.bossPart ? positions(s, TELEGRAPH).get(p.id) : null;
            const px = pose ? pose.x : p.x, py = pose ? pose.y : p.y + game.descentSpeed * (p.fall || 1) * TELEGRAPH;
            return Math.hypot(px - x, py - y) >= p.r + radius + 12;
          });
          if (clear && targets.every(p => Math.hypot(p.x - x, p.y - y) > radius * 2 + 20)) { target = { x, y, r: radius, role: 'sprout' }; break; }
        }
        if (target) break;
      }
      if (target) targets.push(target);
    }
    return targets;
  }
  function sunnyVolley(game, targets) {
    const s = active(game); if (!targets.length || game.buds.some(p => p.sunnySprout && !p.bloomed)) return;
    const id = s.boss.id + '-sprouts-' + s.serial++;
    // A missed pair costs one life in total. Five seconds of travel plus the 1.3-second tell lets a
    // new player see them, change aim and land two plain shots; no paid tool or banking is needed.
    for (const [i, t] of targets.entries()) game.buds.push({ id: id + '-' + i, group: id, x: t.x, y: t.y,
      baseX: t.x, startY: t.y, r: t.r, type: 'gold', hp: 1, maxHp: 1, relay: false,
      fall: (game.dangerY - t.y - t.r) / (5 * Math.max(1, game.descentSpeed)), sway: 0,
      hitAt: -100, bloomAt: -100, bloomed: false, spawnAt: game.time, bossSummon: true,
      bossSource: s.boss.id, sunnySprout: true });
    s.summons++;
  }
  // A kit guardian's next move: its tier-0 list turns with `action` (so the first move is the familiar one), later tiers
  // with their own `cycle`.
  function kitMove(s, k) { const list = k.moves[s.tier] || k.moves[0]; return list[(s.tier ? s.cycle : s.action) % list.length]; }
  function schedule(game) {
    const s = active(game), b = s.boss, k = kitOf(s);
    if (k && s.shiftPending) return warning(game, 'stage', k.stageText[s.tier + 1], [{ x: b.x, y: b.y, r: b.r + 14, role: 'stage' }]);
    const move = k ? kitMove(s, k) : null;
    const plan = k && k.plan && k.plan[move] ? k.plan[move](game, s, b) : legacyPlan(game, s, move);
    // A kit move with nothing to do this time (no room to land, nothing to carry) rests briefly and moves on.
    if (!plan) { s.next = s.age + 1.5; if (s.tier) s.cycle++; else s.action++; return; }
    warning(game, plan.move || move, plan.text != null ? plan.text : (k && k.text && k.text[plan.move || move]) || TEXT[s.kind], plan.targets || []);
  }
  function legacyPlan(game, s, forced) {
    const b = s.boss, kind = s.kind, side = s.action % 2 ? 320 : 100;
    let move = kind, targets = [], text = TEXT[kind];
    const place = landing(game, side);
    if (['puff', 'briar'].includes(kind)) { if (place) targets.push(place); }
    if (kind === 'sunny') {
      move = forced || (s.action % 2 ? 'nap' : 'sprouts');
      text = move === 'nap' ? 'Old Sunny is nodding off.' : 'Quick sprouts! Pop both.';
      if (move === 'sprouts') targets = sunnyTargets(game);
    }
    if (kind === 'puff') { const p = positions(s, TELEGRAPH).get(b.id); targets.push({ x: clamp(p.x + (s.action % 2 ? -48 : 48), 50, 370), y: p.y, r: 12, role: 'puff' }); }
    if (kind === 'root') { targets = [{ x: 128, y: 326, r: 32, role: 'wall' }, { x: 292, y: 326, r: 32, role: 'wall' }, { x: s.action % 2 ? 128 : 292, y: b.y, r: b.r, role: 'hole' }]; }
    if (kind === 'crystal') {
      targets = [0, 1, 2].map(n => ({ x: clamp(b.x + (n - 1) * 64, 44, 376), y: b.y, r: 22, role: 'heart' }));
      if (b.hp < b.maxHp / 2) for (const x of [88,210,332]) {
        if (game.buds.every(p => p.bloomed || p.hidden || Math.hypot(p.x - x,p.y - 70) > p.r + 40)) targets.push({ x,y:70,r:32,role:'shard' });
      }
    }
    if (kind === 'lotus') targets = [{ x: 210, y: 305, r: 50, role: 'swirl' }];
    if (kind === 'fossil') { targets = [{ x: b.x, y: b.y, r: b.r + 12, role: 'lock' },{ x:s.action%2?128:292,y:b.y,r:b.r,role:'station' }]; }
    if (kind === 'ember') { const destination=s.action%2?128:292; targets = [{ x:(b.x+destination)/2,y:b.y+44,r:b.r,role:'dive' },{ x:destination,y:b.y,r:b.r,role:'alcove' }];
    }
    if (kind === 'geode') {
      targets = s.parts.filter(p => p.bossPart === 'plate' && p.bloomed && p.regrowAt <= game.time + TELEGRAPH).map(p => ({ id: p.id, x: p.x, y: p.y, r: p.r, role: 'plate' }));
      if (!targets.length) text = 'The king is tossing gems.';
      if (place) targets.push(place);
    }
    if (kind === 'core') {
      if (b.hp <= b.maxHp * .3) { move = 'supernova'; text = 'Supernova! Clear the falling stars.'; if (place) targets.push(place); }
      else {
        move = ['satellites', 'swirl', 'roots', 'thorns'][s.action % 4];
        text = { satellites: 'The little stars are waking.', swirl: 'The lake swirl is returning.', roots: 'Root walls are returning.', thorns: 'The thorns are returning.' }[move];
        targets = move === 'satellites' ? s.parts.filter(p => p.bloomed || (s.phase >= 1 && !p.lit)).map(p => ({ id: p.id, x: p.x, y: p.y, r: p.r, role: 'satellite' })) : move === 'swirl' ? [{ x: 210, y: 300, r: 50, role: 'swirl' }] : move === 'roots' ? [{ x: 126, y: 322, r: 30, role: 'wall' }, { x: 294, y: 322, r: 30, role: 'wall' }] : place ? [place] : [];
      }
    }
    return { move, text, targets };
  }
  function walls(game, targets) {
    const s = active(game); game.bumpers = game.bumpers.filter(b => !b.bossWall);
    targets.filter(t => t.role === 'wall').forEach((t, i) => { game.bumpers.push({ id: s.boss.id + '-wall-' + i, kind: 'rock', bossWall: true,
      x: t.x, y: t.y, baseX: t.x, length: 64, angle: i ? -.65 : .65, expires: s.age + 4.5 }); });
  }
  function whirlpool(game) {
    const s = active(game); game.currents = game.currents.filter(c => !c.bossSwirl);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      game.currents.push({ id: s.boss.id + '-swirl-' + i, bossSwirl: true, x: 210 + Math.cos(a) * 42, y: 305 + Math.sin(a) * 42,
          length: 48, width: 30, angle: a + Math.PI / 2, ux:Math.cos(a+Math.PI/2),uy:Math.sin(a+Math.PI/2),turn: 4, expires: s.age + 5 });
    }
    for (const lane of game.currents.filter(c => !c.bossSwirl)) { lane.angle += Math.PI;lane.ux=Math.cos(lane.angle);lane.uy=Math.sin(lane.angle); }
  }
  function revive(p, game) {
    // A revived guard must be the same object in both the encounter and collision lists. Drops keep
    // boss parts, but reconnect defensively if an earlier board cleanup removed/replaced one.
    const index = game.buds.findIndex(b => b.id === p.id);
    if (index < 0) game.buds.push(p); else if (game.buds[index] !== p) game.buds[index] = p;
    p.bloomed = false; p.popped = false; p.hp = p.maxHp; p.bloomAt = -100; p.hitAt = -100; p.spawnAt = game.time; p.regrowAt = null;
    if (p.bossPart === 'satellite') p.lit = true;
  }
  function activate(game) {
    const s = active(game), b = s.boss, w = s.warning, k = kitOf(s); s.warning = null; b.bossWarning = game.bossWarning = null; s.action++;
    if (w.move === 'stage') return stage(game, s, k, w);
    applyFlowerEffects(game,s,w);
    if (k && s.tier) s.cycle++;
    // A kit move may name its own pause (in seconds, before the tier pace); otherwise the guardian's usual one.
    const own = k && k.act && k.act[w.move], pause = own ? own(game, s, w) : legacyAct(game, s, w);
    s.next = s.age + (Number.isFinite(pause) ? pause : s.kind === 'core' && s.phase === 2 ? 4 : s.kind==='core' && s.phase===1 ? 4.5 : s.kind === 'sunny' && w.move==='sprouts' ? 2.5 : s.kind === 'sunny' ? 10 : Math.max(5, 9 - Object.keys(HEALTH).indexOf(s.kind) * .25)) * (k ? TIER_PACE[s.tier] : 1);
    if (s.kind === 'sunny' && w.move === 'sprouts') s.next = Math.max(s.next, s.modeUntil + .8);
    // A mood change waiting behind this move comes next (a burrowed guardian surfaces first).
    if (s.shiftPending) s.next = Math.min(s.next, b.hidden ? Math.max(s.age, s.modeUntil) : s.age);
    game.event('bossAbility', { kind: s.kind, move: w.move, act: 'start', name: b.name, x: b.x, y: b.y, targets: w.targets });
  }
  // Phase Bloom: the guardian changes mood, pauses a beat, and its next tier of moves begins. Whatever opening the player
  // has earned (a dizzy Sunny, a guttered lantern) stays open; a burrowed guardian surfaces before the change.
  function stage(game, s, k, w) {
    const b = s.boss;
    s.tier++; s.cycle = 0; s.shiftPending = false; s.next = s.age + 1;
    game.event('bossStage', { kind: s.kind, stage: s.tier, mood: k.moods[s.tier], name: b.name, x: b.x, y: b.y });
    game.event('bossAbility', { kind: s.kind, move: 'stage', act: 'start', name: b.name, x: b.x, y: b.y, targets: w.targets });
    if (k.stage) k.stage(game, s);
  }
  function legacyAct(game, s, w) {
    const b = s.boss;
    if (s.kind === 'sunny') {
      if (w.move === 'nap') { s.mode = 'sleeping'; s.vulnerable = false; const bubble = s.parts.find(p => p.bossPart === 'bubble'); revive(bubble, game); }
      else { sunnyVolley(game, w.targets.filter(t=>t.role==='sprout')); }
    }
    if (s.kind === 'root') { walls(game, w.targets); s.mode = 'burrow'; b.hidden = true; b.visible = false; s.vulnerable = false; s.modeUntil = s.age + 1.5; s.station = w.targets.find(t => t.role === 'hole').x; }
    if (s.kind === 'puff') {
      s.mode = 'bonnet'; s.modeUntil = s.age + 3;
      const t = w.targets.find(t=>t.role==='summon'); if (t) { const babies = cluster(game, t, { cup: true }); if (babies.length) babies[0].puff = true; }
      // A nearby puffcap is an explicit opportunity to score two damage, never a hidden weakspot.
      if (!game.buds.some(p => p.puff && !p.bloomed && Math.hypot(p.x - b.x, p.y - b.y) < 70)) {
        const target = w.targets.find(t => t.role === 'puff'), x = target.x, y = target.y;
        if (game.buds.every(p => p.bloomed || Math.hypot(p.x - x, p.y - y) > p.r + 14)) game.buds.push({ id: b.id + '-puff-' + s.serial++, group: b.id + '-puff',
          x, y, baseX: x, startY: y, r: 12, hp: 1, maxHp: 1, type: 'lilac', puff: true, relay: false, fall: .8, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, bossSummon: true });
      }
    }
    if (s.kind === 'crystal') {
      s.mode = 'split'; s.parts.filter(p => p.bossPart === 'heart').forEach((p, i) => { p.fromSlot = p.slot; p.slot = (i + s.action) % 3; p.shuffleAt = s.age; p.real = i === 1; if (p.bloomed) revive(p, game); });
      if (b.hp < b.maxHp / 2) for (const t of w.targets.filter(t=>t.role==='shard')) { const shards=cluster(game,t,{hp:2,fast:true}); shards.forEach(p=>{p.bossShard=true;p.gem=true;p.relay=false;}); }
    }
    if (s.kind === 'lotus') { whirlpool(game); }
    if (s.kind === 'fossil') { s.lockAngle += Math.PI * .6;s.shellBaseSpin=-s.shellBaseSpin;b.shellSpin=s.shellBaseSpin;s.lockStage = 0; s.mode = 'jet'; s.jetAt=s.age;s.jetFrom=b.x;s.jetTo=w.targets.find(t=>t.role==='station').x;s.modeUntil=s.age+.9; }
    if (s.kind === 'ember') { s.mode = 'dive'; s.vulnerable = true; s.modeUntil = s.age + 2.4; s.diveAt = s.age;s.diveFrom=b.x;s.diveTo=w.targets.find(t=>t.role==='alcove').x;
      for (const t of w.targets.filter(t=>t.role==='flame')) { const p=game.buds.find(p=>p.id===t.id);if(p&&!p.bloomed) p.bossFlameUntil=s.age+3; } }
    if (s.kind === 'geode') { for (const p of s.parts.filter(p => p.bossPart === 'plate' && p.bloomed && p.regrowAt <= game.time)) revive(p, game); const t = w.targets.find(t => t.role === 'summon'); const gems = cluster(game, t); gems.forEach(p => { p.gem = true; p.relay = false; }); }
    if (s.kind === 'briar') {
      const made = cluster(game, w.targets.find(t=>t.role==='summon'), { briar: true }); if (made.length) s.patches.push({ group: made[0].group, healAt: s.age + 4, cut: false });
      s.mode = s.action % 2 ? 'sealed' : 'skirt'; s.modeUntil = s.age + 2.4;
    }
    if (s.kind === 'core') {
      if (w.move === 'satellites') for (const p of s.parts) { if(p.bloomed) revive(p,game); if(s.phase>=1) p.lit=true; }
      if (w.move === 'swirl') whirlpool(game);
      if (w.move === 'roots') walls(game, w.targets);
      if (w.move === 'thorns') cluster(game, w.targets.find(t=>t.role==='summon'), { briar: true });
      if (w.move === 'supernova') { s.mode = 'supernova'; s.vulnerable = true; s.phase = 2; for (const p of s.parts) { p.bloomed = true; p.lit = false; } cluster(game, w.targets.find(t=>t.role==='summon'), { hp: 2, fast: true }); }
    }
  }
  function endMode(game, s) {
    const b = s.boss;
    if (s.kind === 'sunny') { s.mode = 'cross'; s.vulnerable = true; }
    if (s.kind === 'root') {
      s.baseX = s.station - offset(s.kind, s.moveAge).x;
      b.x = s.station; b.hidden = false; b.visible = true; s.mode = 'emerging'; s.vulnerable = true;
    }
    if (s.kind === 'puff') s.mode = 'open';
    if (s.kind === 'crystal' && s.mode === 'stunned') s.mode = 'split';
    if (s.kind === 'fossil' && s.jetAt!=null) { s.baseX=s.jetTo-offset(s.kind,s.moveAge).x;b.x=s.jetTo;s.jetAt=null;s.mode=s.lockStage?'lock-plates':'lock-mouth'; }
    if (s.kind === 'ember') { s.baseX=s.diveTo-offset(s.kind,s.moveAge).x;b.x=s.diveTo;s.mode = 'flame'; s.vulnerable = false; }
    if (s.kind === 'briar') s.mode = 'skirt';
    s.modeUntil = 0;
  }
  function step(game, dt) {
    const s = active(game); if (!s) return;
    const b = s.boss; s.age += dt; s.fall = Number.isFinite(b.bossFall) ? b.bossFall : 4;
    s.lull = game.lullaby > 0 ? game.lullaby : 0; if (!s.lull) s.clock += dt;
    if (s.age >= s.stunUntil) { s.moveAge += dt; if (!(game.lullaby > 0)) s.drift += s.fall * dt; }
    const map = positions(s, 0), k = kitOf(s);
    for (const p of [b, ...s.parts]) { const pos = map.get(p.id); p.x = pos.x; p.y = pos.y; }
    for (const p of s.carried) { const pos = map.get(p.id); if (pos) { p.x = pos.x; p.y = pos.y; } }
    if (s.warning) for (const t of s.warning.targets) if (t.id) { const pos=map.get(t.id)||game.buds.find(p=>p.id===t.id);if(pos) Object.assign(t,{x:pos.x,y:pos.y,r:pos.r}); }
    stepFlowerEffects(game,s,dt);
    b.bossPhase = 1 - b.hp / b.maxHp; b.bossEnraged = b.hp <= b.maxHp / 2;
    if (s.modeUntil && s.age >= s.modeUntil) endMode(game, s);
    // A credited seed stops at a mood threshold; anything that crosses it (a power, an uncredited strike) shifts here.
    if (s.tierAt && s.tier < 2 && b.hp <= s.tierAt[s.tier] && !b.bloomed) s.shiftPending = true;
    if (s.shiftPending && !s.warning) s.next = Math.min(s.next, b.hidden ? Math.max(s.age, s.modeUntil) : s.age);
    if (s.kind === 'lotus') { const lantern = s.parts.find(p => p.bossPart === 'lantern'); if (lantern.bloomed && s.age >= s.gutterUntil) { revive(lantern, game); s.mode = 'open'; } s.vulnerable = lantern.bloomed; }
    // Let a well-aimed opening meet Sunny's cross-sprout tell before the short introductory fight ends.
    if (s.kind === 'sunny' && s.action === 0 && s.mode !== 'sleeping' && b.hp <= b.maxHp / 2) s.next = Math.min(s.next, s.age + .25);
    if (s.kind === 'fossil') { s.lockAngle += s.lockSpin * dt; if (s.lockUntil && s.age > s.lockUntil) { s.lockStage = 0;s.lockUntil=0;b.shellSpin=s.shellBaseSpin;s.mode = 'lock-mouth'; } }
    if (s.kind === 'core' && s.phase !== 2) {
      const lit = s.parts.filter(p => !p.bloomed && p.lit).length; s.vulnerable = lit < 3; s.mode = s.vulnerable ? 'exposed' : 'domed';
      if(s.phase===0&&b.hp<=b.maxHp*.6){s.phase=1;s.action=0;s.next=Math.min(s.next,s.age+.25);}
    }
    if (s.kind === 'briar') for (const patch of s.patches) {
      const buds = game.buds.filter(p => p.group === patch.group);
      if (!buds.length || buds.every(p => p.bloomed)) { if (!patch.cut) game.event('bossVineCut', { group: patch.group, kind: s.kind }); patch.cut = true; buds.forEach(p => { p.healing = false; }); }
      if (!patch.cut && s.age >= patch.healAt) { b.hp = Math.min(b.maxHp, b.hp + 1); patch.healAt = s.age + 4; s.heals++; game.event('bossHeal', { kind: s.kind, hp: b.hp, group: patch.group }); }
    }
    game.bumpers = game.bumpers.filter(p => !p.bossWall || p.expires > s.age);
    game.currents = game.currents.filter(p => !p.bossSwirl || p.expires > s.age);
    if (game.gates.length) game.gates = game.gates.filter(g => !g.bossMoon || g.expires > s.age);
    const lull = game.lullaby > 0;
    if (!lull) for (const m of game.bumpers) if (m.bossMirror) m.angle += m.spin * dt;
    // Kit timers and lob flights run on the kit clock, so a Lullaby holds them exactly as it holds a warning.
    if (!lull) {
      if (s.lobs.length) s.lobs = s.lobs.filter(l => s.clock < l.t0 + l.T);
      while (s.timers.length) {
        const due = s.timers.findIndex(t => s.clock >= t.at); if (due < 0) break;
        const [t] = s.timers.splice(due, 1); runTimer(game, s, k, t);
        if (!active(game)) return;
      }
    }
    if (k && k.step) { k.step(game, s, dt); if (!active(game)) return; }
    // Ignited clusters visibly hurry for three seconds; Lullaby freezes them with every other flower.
    for (const p of game.buds) if (p.bossFlameUntil > s.age && !p.bloomed && !(game.lullaby > 0)) p.y += game.descentSpeed * (p.fall || 1) * .25 * dt;
    if (game.lullaby > 0) { s.next += dt; if (s.warning) s.warning.until += dt; if(s.flowerWarning)s.flowerWarning.until+=dt; }
    else if (s.warning && game.time >= s.warning.until) activate(game);
    else if (!s.warning && s.age >= s.next && !(s.kind==='fossil' && s.lockStage===1)) schedule(game);
  }
  // Shared kit pieces: a timed action, a drawn lob flight, a quiet close, a landing check and a carried flower let go.
  function after(s, seconds, act, data) { const t = { at: s.clock + seconds, act, data }; s.timers.push(t); return t; }
  function runTimer(game, s, k, t) {
    const own = k && k.timer && k.timer[t.act];
    if (own) own(game, s, t.data); else if (t.act === 'close') close(game, s, t.data);
  }
  function lob(s, look, x0, y0, x1, y1, T, extra) { const l = { look, x0, y0, x1, y1, t0: s.clock, T, ...extra }; s.lobs.push(l); return l; }
  function close(game, s, p) {
    if (!p || p.bloomed) return;
    p.bloomed = p.popped = p.closed = true; p.bloomAt = game.time; p.closedAt = s.clock;
    game.buds = game.buds.filter(b => b !== p); s.parts = s.parts.filter(b => b !== p);
  }
  function clearSpot(game, x, y, r, skip) {
    return game.buds.every(b => b === skip || b.bloomed || b.hidden || b.ghost || Math.hypot(b.x - x, b.y - y) >= b.r + r + 6);
  }
  function release(game, p, fling) {
    p.x = p.baseX = clamp(p.x, 22 + p.r, 398 - p.r);
    if (fling) p.y = Math.min(p.y, game.dangerY - 70);
    p.carried = null; const s = game.bossState; if (s) s.carried = s.carried.filter(b => b !== p);
  }
  function shellOpen(angle, hit) { return hit.nx * Math.cos(angle) + hit.ny * Math.sin(angle) >= .25; }
  function burns(game, bud, seed) {
    const s=active(game);return Boolean(s && s.kind==='ember' && bud===s.boss && s.mode==='flame' && !(seed.gateHops>0) && !['beeline','sunburst'].includes(seed.power));
  }
  function canHit(game, bud, hit = {}, seed = {}) {
    const s = active(game); if (!s || !(bud.boss || bud.bossPart)) return true;
    if (bud.hidden || bud.bloomed) return false;
    if (seed.power === 'beeline' || seed.power === 'sunburst') return true;
    // While a guardian's mood change is pending or announced, seeds glance off it (powers still land); its attackers
    // (a portal, a pad) can still be shot.
    if (held(s, bud)) return false;
    const k = kitOf(s), own = k && k.canHit ? k.canHit(game, s, bud, hit, seed) : undefined;
    if (own !== undefined) return own;
    if (bud.bossPart) return bud.bossPart !== 'heart' || bud.real;
    switch (s.kind) {
      case 'sunny': return s.mode !== 'sleeping';
      case 'root': return s.mode !== 'burrow';
      case 'puff': return s.mode !== 'bonnet' || hit.ny < .25;
      case 'crystal': return false;
      case 'lotus': return s.mode === 'gutter' || hit.ny < .25;
      case 'fossil': {
        const mouth = shellOpen(bud.shellAngle + bud.shellSpin * (hit.time || 0), hit);
        return mouth && (s.lockStage === 0 || shellOpen(s.lockAngle + s.lockSpin * (hit.time || 0), hit));
      }
      case 'ember': return s.mode === 'dive' || (seed.gateHops || hit.gateHops || 0) > 0;
      case 'geode': {
        const angle = Math.atan2(hit.ny || 0, hit.nx || 0), slot = ((Math.round((angle - (s.age + (hit.time || 0)) * .18) / (Math.PI / 2)) % 4) + 4) % 4;
        const plate = s.parts.find(p => p.bossPart === 'plate' && p.slot === slot); return !plate || plate.bloomed;
      }
      case 'briar': return s.mode !== 'sealed' && (hit.ny < .45 || s.patches.every(p => p.cut));
      case 'core': return s.vulnerable;
      default: return true;
    }
  }
  function resolve(game, bud, chain) {
    const s = active(game); let result = baseResolve(game, bud, chain);
    if (!s || !(bud.boss || bud.bossPart) || result.blocked) return result;
    const k = kitOf(s); if (k && k.damage) result = k.damage(game, s, bud, chain, result) || result;
    return tierClamp(game, s, chain, result);
  }
  // A credited seed or chain cannot carry a kit guardian past a mood threshold: the hit that reaches it stops there, and
  // until the new mood is announced, credited hits are turned away. Powers and uncredited strikes are not held.
  function tierClamp(game, s, chain, result) {
    if (!s.tierAt || s.tier >= 2 || result.target !== s.boss || !Foes || !Foes.credited(game, chain) || Foes.isPower(game, game.striker)) return result;
    const b = s.boss, th = s.tierAt[s.tier], damage = result.damage || 1;
    if (b.hp > th) { const held = Math.min(damage, b.hp - th); if (b.hp - held <= th) s.shiftPending = true; return held === damage ? result : { ...result, damage: held }; }
    s.guards++; game.event('bossGuard', { kind: s.kind, bud: b, mode: 'stage' }); return { blocked: true };
  }
  function baseResolve(game, bud, chain) {
    const s = active(game); if (!s || !(bud.boss || bud.bossPart)) return { target: bud, damage: 1 };
    if (game.powerBoss && game.powerBoss.boss===bud) return {target:bud,damage:1};
    // Uncredited strike() is also used by authored scripts and event-boundary QA fixtures.
    // Actual seed impacts carry striker; their armor, weakspots and critical hits use the rules below.
    if (bud.boss && !chain && !game.striker) return { target: bud, damage: 1 };
    const seed = game.striker || {}, hit = seed.bossContact || { nx: Math.cos(bud.impactAngle || 0), ny: Math.sin(bud.impactAngle || 0) };
    if (chain && game.due && game.due.via === 'puff' && bud.boss && s.kind==='puff') return { target: bud, damage: 2 };
    const k = kitOf(s), own = k && k.resolve ? k.resolve(game, s, bud, chain, seed, hit) : null;
    if (own) return own;
    if (chain && game.due && game.due.by != null && !['sun','boss'].includes(game.due.via) && !canHit(game, bud, hit, seed)) return { blocked: true };
    if (!chain && !canHit(game, bud, hit, seed)) { s.guards++; game.event('bossGuard', { kind: s.kind, bud, mode: held(s, bud) ? 'stage' : s.mode }); return { blocked: true }; }
    if (bud.bossPart === 'heart') { s.stunUntil = s.age + .8; s.modeUntil = s.stunUntil; s.mode = 'stunned'; return game.powerPart ? {blocked:true} : { target: s.boss, damage: 1 }; }
    if (bud.bossPart === 'lantern') { s.gutterUntil = s.age + 5; s.mode = 'gutter'; bud.bloomed = true; bud.bloomAt = game.time;
      if(game.powerPart)return {blocked:true};
      s.crits++; game.event('bossCritical', { kind: s.kind, bud, damage: 3 }); return { target: s.boss, damage: 3 }; }
    if (bud.boss && seed.power) return {target:bud,damage:1}; // Bee Line/Sunburst keep their stated three/four-ring effect
    if (bud.boss && s.kind === 'fossil' && s.lockStage === 0 && !chain && !seed.power) {
      // The mouth stays clicked for a full outer-ring revolution plus a reaction margin. A station jet
      // cannot erase that earned click while the player is waiting for the second opening.
      s.lockStage = 1;s.lockUntil = s.age + TAU/s.lockSpin + 1.2;s.mode = 'lock-plates';bud.shellAngle=Math.atan2(hit.ny,hit.nx);bud.shellSpin=0;
      if(s.warning){s.warning=null;s.flowerWarning=null;game.bossWarning=null;bud.bossWarning=null;}
      game.event('bossLock', { kind: s.kind, stage: 1 }); return { blocked: true, feed: true };
    }
    let damage = 1;
    if (bud.boss && s.kind === 'sunny' && s.mode === 'dizzy') damage = 2;
    if (bud.boss && s.kind === 'fossil' && s.lockStage === 1) damage = 2;
    if (bud.boss && s.kind === 'ember' && (seed.gateHops || 0) > 0) damage = 3;
    if (bud.boss && s.kind === 'ember' && s.mode === 'dive') damage = 2;
    if (bud.boss && s.kind === 'geode') damage = 2; // the exposed amethyst rewards the shot through a broken plate
    if (bud.boss && s.kind === 'core' && s.phase === 2) damage = 2;
    if (damage > 1) { s.crits++; game.event('bossCritical', { kind: s.kind, bud, damage }); }
    s.hits++; return { target: bud, damage };
  }
  function bloomed(game, bud) {
    const s = game.bossState; if (!s) return;
    if(bud.bossFlowerEffect?.kind==='briar' && game.briarTimers?.has(bud.group)){
      // A temporary thorn spell must have a real regrowth opportunity before its safe-line cutoff.
      // Its two-second visible clock is local to this converted patch, never the authored briars.
      const at=Math.min(game.briarTimers.get(bud.group),game.time+2);
      game.briarTimers.set(bud.group,at);
      for(const p of game.buds.filter(p=>p.group===bud.group)){p.regrowAt=at;p.regrowSpan=2;}
    }
    if (bud.boss) { game.bossDefeated = true; cleanup(game); return; }
    const k = kitOf(s); if (k && k.bloomed && k.bloomed(game, s, bud)) return;
    if (bud.bossPart === 'bubble') {
      s.mode = 'dizzy'; s.vulnerable = true; s.modeUntil = s.age + 6;
      s.next = s.action === 0 ? Math.min(s.next, s.age + 1) : s.age + 8;
      game.event('bossPhase', { kind: s.kind, mode: s.mode });
    }
    if (bud.bossPart === 'plate') bud.regrowAt = game.time + 8;
    if (bud.bossPart === 'satellite') bud.lit = false;
  }
  function breach(game) {
    const s=active(game);if(!s)return;
    clearFlowerEffects(game,s);
    s.drift=0;s.baseY=s.boss.startY;s.lostLives++;
    // Reconnect the whole visible encounter immediately, before this tick's seed collisions.
    const map=positions(s,0);for(const p of [s.boss,...s.parts]){const at=map.get(p.id);p.x=at.x;p.y=at.y;}
  }
  function cleanup(game) {
    const s = game.bossState; if (!s) return;
    clearFlowerEffects(game,s);
    s.warning = null; game.bossWarning = null; s.boss.bossWarning = null;
    game.bumpers = game.bumpers.filter(p => !p.bossWall); game.currents = game.currents.filter(p => !p.bossSwirl);
    for(const p of game.buds) p.bossFlameUntil=0;
    const k = kitOf(s); if (k && k.cleanup) k.cleanup(game, s);
    if (game.gates.length) game.gates = game.gates.filter(g => !g.bossMoon);
    for (const p of [...s.carried]) release(game, p, false);
    s.carried = []; s.timers = []; s.lobs = []; s.ink = null; s.tide = null; s.hue = null;
    game.dangerY = 448; game.aimNapUntil = 0;
    if (s.kind === 'crystal' && s.boss.bloomed) {
      const heart = s.parts.find(p => p.real); if (heart) { s.boss.x = heart.x; s.boss.y = heart.y; }
      s.boss.hidden = false; s.boss.visible = true;
    }
    s.parts.forEach(p => { p.hidden = false; if (s.boss.bloomed) { p.bloomed = true; p.bloomAt = game.time; } });
  }
  function targets(game) {
    const s = active(game); if (!s) return [];
    const result = [];
    for (const p of s.parts.filter(p => !p.bloomed && !p.hidden && p.visible)) {
      if (p.bossPart === 'heart' && !p.real || p.inert || p.decoy || p.closed) continue;
      const priority = p.bossPart === 'bubble' ? 95 : p.bossPart === 'lantern' ? 65 : p.bossPart === 'satellite' && s.mode === 'domed' ? 85 : p.bossPart === 'plate' ? 25 : 45;
      result.push({ bud: p, priority, reason: p.bossPart });
    }
    if (!s.boss.hidden) result.push({ bud: s.boss, priority: s.vulnerable ? 45 : 0, reason: s.mode });
    if (s.kind === 'puff') for (const p of game.buds.filter(p => p.puff && !p.bloomed && !p.bossPart && Math.hypot(p.x - s.boss.x, p.y - s.boss.y) < 74)) result.push({ bud: p, priority: 75, reason: 'puff' });
    if (s.kind === 'briar') for (const p of game.buds.filter(p => p.healing && !p.bloomed)) result.push({ bud: p, priority: 60, reason: 'healing-vine' });
    const k = kitOf(s); if (k && k.targets) k.targets(game, s, result);
    return result;
  }
  // ── Guardian kits ──
  // kit(kind, { hp, moods: [3], stageText: [null, t1, t2], text: {move}, moves: [tier0[], tier1[], tier2[]],
  //   plan: {move(game, s, b) -> {move?, text?, targets} | null}, act: {move(game, s, w) -> pause seconds?},
  //   timer: {act(game, s, data)}, pose(s, p, bx, by, future) -> {x, y} | null, step(game, s, dt), init(game, s),
  //   stage(game, s), canHit(game, s, bud, hit, seed) -> bool | undefined, resolve(game, s, bud, chain, seed, hit) -> result | null,
  //   damage(game, s, bud, chain, result) -> result, bloomed(game, s, bud) -> true when handled, targets(game, s, list), cleanup(game, s) })
  // A move without a plan or act runs the guardian's original code. Shared helpers: part, after, lob, close, clearSpot,
  // release, positions, sunnyTargets, sunnyVolley, cluster, legacyPlan, legacyAct, Foes.

  // ── Old Sunny (Level 1, `sunny`) ──

  // ── Rootknot (Level 2, `root`) ──

  // ── Mother Morel (Level 3, `puff`) ──

  // ── Crystal Heart (Level 4, `crystal`) ──

  // ── Lantern Lily (Level 5, `lotus`) ──

  return { init, step, canHit, burns, resolve, bloomed, breach, cleanup, predictVisible, targets, health: HEALTH, telegraph: TELEGRAPH, kits: KITS };
});
