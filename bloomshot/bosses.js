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
  // Waiting to change mood: damage to the guardian (its body, its real heart, its lantern) is held.
  function held(s, bud) {
    if (!s.tierAt) return false;
    const waiting = s.shiftPending || (s.warning && s.warning.move === 'stage') || (s.tier < 2 && s.boss.hp <= s.tierAt[s.tier]);
    // By id, not identity: the bot asks about copies of the guardian.
    return Boolean(waiting && ((bud.boss && bud.id === s.boss.id) || (bud.bossPart === 'heart' && bud.real) || bud.bossPart === 'lantern'));
  }
  const STAGE_WARNING = TELEGRAPH;
  const open = b => !b.bloomed && !b.gift && !b.inert;
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
      tier: 0, cycle: 0, shiftPending: false, tierAt: null, carried: [], timers: [], lobs: [], kitAge: 0, lull: 0, hue: null };
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
    const map = new Map([[boss.id, { x, y, r: boss.r }]]), k = kitOf(s), clock = s.kitAge + Math.max(0, seconds - s.lull);
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
    if (k && s.shiftPending) {
      // The opening the player earned (a dizzy Sunny, an open gutter) is paused for the warning, not lost.
      if (s.modeUntil > s.age) s.modeUntil += STAGE_WARNING;
      if (s.kind === 'lotus' && s.gutterUntil > s.age) s.gutterUntil += STAGE_WARNING;
      return warning(game, 'stage', k.stageText[s.tier + 1], [{ x: b.x, y: b.y, r: b.r + 14, role: 'stage' }]);
    }
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
    // A mood change waiting behind this move comes next.
    if (s.shiftPending) s.next = Math.min(s.next, s.age);
    game.event('bossAbility', { kind: s.kind, move: w.move, act: 'start', name: b.name, x: b.x, y: b.y, targets: w.targets });
  }
  // Phase Bloom: the guardian changes mood, pauses a beat, and its next tier of moves begins. Whatever it was doing (a dizzy
  // Sunny, an open gutter, a burrowed Rootknot) carries on; that opening was paused while the change was announced.
  function stage(game, s, k, w) {
    const b = s.boss;
    s.tier++; s.cycle = 0; s.shiftPending = false; s.next = s.age + 1;
    game.event('bossStage', { kind: s.kind, stage: s.tier, mood: k.moods[s.tier], name: b.name, x: b.x, y: b.y });
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
    s.lull = game.lullaby > 0 ? game.lullaby : 0; if (!s.lull) s.kitAge += dt;
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
    if (s.shiftPending && !s.warning && !(game.lullaby > 0)) s.next = Math.min(s.next, s.age);
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
    // Kit pieces on the board (a snare, mirrors, moon gates) carry kitUntil on the kit clock, so a Lullaby holds them too.
    if (game.bumpers.some(p => p.kitUntil != null)) game.bumpers = game.bumpers.filter(p => p.kitUntil == null || p.kitUntil > s.kitAge);
    if (game.gates.length) game.gates = game.gates.filter(g => !g.bossMoon || (g.kitUntil == null ? g.expires > s.age : g.kitUntil > s.kitAge));
    const lull = game.lullaby > 0;
    // Kit timers and lob flights run on the kit clock, so a Lullaby holds them exactly as it holds a warning.
    if (!lull) {
      if (s.lobs.length) s.lobs = s.lobs.filter(l => s.kitAge < l.t0 + l.T);
      while (s.timers.length) {
        const due = s.timers.findIndex(t => s.kitAge >= t.at); if (due < 0) break;
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
  function after(s, seconds, act, data) { const t = { at: s.kitAge + seconds, act, data }; s.timers.push(t); return t; }
  function runTimer(game, s, k, t) {
    const own = k && k.timer && k.timer[t.act];
    if (own) own(game, s, t.data); else if (t.act === 'close') close(game, s, t.data);
  }
  function lob(s, look, x0, y0, x1, y1, T, extra) { const l = { look, x0, y0, x1, y1, t0: s.kitAge, T, ...extra }; s.lobs.push(l); return l; }
  function close(game, s, p) {
    if (!p || p.bloomed) return;
    p.bloomed = p.popped = p.closed = true; p.bloomAt = game.time; p.closedAt = s.kitAge;
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
  // The one place a kit guardian's damage is held or clamped, so no return path can skip it. A credited seed or chain
  // cannot carry it past a mood threshold: the hit that reaches it stops there, and until the new mood is announced,
  // credited hits on its body, real heart or lantern are turned away before they do anything. Powers and uncredited
  // strikes are never held.
  function resolve(game, bud, chain) {
    const s = active(game); if (!s || !(bud.boss || bud.bossPart)) return baseResolve(game, bud, chain);
    const seed = game.striker || {}, power = Boolean((game.powerBoss && game.powerBoss.boss === bud) || game.powerPart || seed.power);
    const k = kitOf(s), credited = Boolean(Foes && Foes.credited(game, chain));
    if (k && k.before) k.before(game, s, bud, chain);
    if (!power && credited && held(s, bud)) {
      if (!chain) { s.guards++; game.event('bossGuard', { kind: s.kind, bud, mode: 'stage' }); }
      return { blocked: true };
    }
    let result = baseResolve(game, bud, chain);
    if (result.blocked) return result;
    if (k && k.damage) result = k.damage(game, s, bud, chain, result) || result;
    if (!power && credited && s.tierAt && s.tier < 2 && result.target === s.boss) {
      const th = s.tierAt[s.tier], hp = s.boss.hp, damage = Math.min(result.damage || 1, hp - th);
      if (damage !== (result.damage || 1)) result = { ...result, damage };
      if (hp - damage <= th) { s.shiftPending = true; if (!s.warning) s.next = Math.min(s.next, s.age); }
    }
    return result;
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
    if (!chain && !canHit(game, bud, hit, seed)) { s.guards++; game.event('bossGuard', { kind: s.kind, bud, mode: s.mode }); return { blocked: true }; }
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
  //   stage(game, s), canHit(game, s, bud, hit, seed) -> bool | undefined, before(game, s, bud, chain) (runs before the hold),
  //   resolve(game, s, bud, chain, seed, hit) -> result | null (inside the raw resolve, after the power and puff-chain lines),
  //   damage(game, s, bud, chain, result) -> result, bloomed(game, s, bud) -> true when handled, targets(game, s, list), cleanup(game, s) })
  // A move without a plan or act runs the guardian's original code. Shared helpers: part, after, lob, close, clearSpot,
  // release, positions, sunnyTargets, sunnyVolley, cluster, legacyPlan, legacyAct, open, Foes. Times are on the kit clock
  // s.kitAge (stopped by a Lullaby); a kit bumper or moon gate with kitUntil (and expires: Infinity) leaves at that time.

  // ── Old Sunny (Level 1, `sunny`) ──
  // The first guardian, so every attack is slow, shown and answerable with one plain seed. Sleepy (tier 0) plays his
  // original pair: a sprout volley (the art draws it dropping out of little sun portals) and a nap in his bubble. Cranky
  // (tier 1) yawns real portals open: each drops a sprout at once and spits a second one 1.6 s later unless it is shot
  // shut first ("Shut!", +1 sun), and closes by itself at 3 s. His nap bubble now takes two hits. Wide awake (tier 2)
  // adds a snooze Z that drifts down to the launcher: popping it makes him dizzy for 3 s (double damage); if it gets
  // there, the aim guide naps for 2.5 s (the seed pod is never touched). Portals and the Z are one-hit parts; all their
  // timing and motion is on the kit clock, so a Lullaby holds them.
  const SUNNY = { portalUp: 34, portalR: 16, spitAt: 1.6, closeAt: 3, sproutR: 14, zR: 13, zSpeed: 60, zSway: 30, zLand: { x: 210, y: 430 }, zSide: 30, zDrop: 22, nap: 2.5, dizzy: 3 };
  // Where the snooze Z is u of the way along its lazy path: a straight drift to the launcher with two slow side sways.
  function sunnyZ(p, clock) {
    const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, u = clamp((clock - p.born) * SUNNY.zSpeed / p.len, 0, 1);
    const w = -(p.side || 1) * SUNNY.zSway * Math.sin(4 * Math.PI * u);
    return { x: p.from.x + dx * u - dy / p.len * w, y: p.from.y + dy * u + dx / p.len * w, u };
  }
  // A spot clear of every open piece, now and (ahead) once a tell has run: flowers fall and the guardian drifts.
  function sunnyClear(game, s, x, y, r, pad, ahead, skip) {
    const later = ahead ? positions(s, TELEGRAPH) : null;
    return game.buds.every(p => {
      if (p === skip || !open(p) || p.hidden) return true;
      if (Math.hypot(p.x - x, p.y - y) < p.r + r + pad) return false;
      if (!later) return true;
      const pose = p.boss || p.bossPart ? later.get(p.id) : null;
      return Math.hypot((pose ? pose.x : p.x) - x, (pose ? pose.y : p.y + game.descentSpeed * (p.fall || 1) * TELEGRAPH) - y) >= p.r + r + pad;
    });
  }
  // One sprout dropped from a portal's mouth, with the volley's fall (five seconds to the line) and markings.
  function sunnySprout(game, s, id, group, x, y) {
    const r = SUNNY.sproutR, sprout = { id, group, x, y, baseX: x, startY: y, r, type: 'gold', hp: 1, maxHp: 1, relay: false,
      fall: (game.dangerY - y - r) / (5 * Math.max(1, game.descentSpeed)), sway: 0, hitAt: -100, bloomAt: -100, bloomed: false,
      spawnAt: game.time, bossSummon: true, bossSource: s.boss.id, sunnySprout: true };
    game.buds.push(sprout); return sprout;
  }
  kit('sunny', {
    hp: 18,
    moods: ['Sleepy', 'Cranky', 'Wide awake'],
    stageText: [null, 'Old Sunny is cranky now!', 'Old Sunny is wide awake!'],
    text: { yawn: 'Big yawn! Shut the sun portals.', snooze: 'A snooze Z! Pop it before it lands.' },
    moves: [['sprouts', 'nap'], ['yawn', 'nap'], ['yawn', 'snooze', 'nap']],
    init(game, s) { s.portals = []; },
    plan: {
      // The volley's two sprout spots, each with a sun portal just above it (dropped where a piece is in the way).
      yawn(game, s) {
        const sprouts = sunnyTargets(game); if (!sprouts.length) return null;
        const portals = sprouts.map(t => ({ x: t.x, y: t.y - SUNNY.portalUp, r: SUNNY.portalR, role: 'portal' }))
          .filter(m => sunnyClear(game, s, m.x, m.y, 0, 20, true));
        // The volley holds while earlier sprouts (a volley's or a spit's) still fall, so the tell shows only what will drop.
        if (game.buds.some(p => p.sunnySprout && !p.bloomed)) return portals.length ? { targets: portals } : null;
        return { targets: [...sprouts, ...portals] };
      },
      // The Z leaves from beside his face (never over his nap bubble) and lands just above the launcher.
      snooze(game, s, b) {
        if (s.parts.some(p => p.bossPart === 'z' && !p.bloomed)) return null;
        const at = positions(s, TELEGRAPH).get(b.id), side = at.x > 210 ? -1 : 1;
        return { targets: [{ x: at.x + side * SUNNY.zSide, y: at.y + SUNNY.zDrop, r: 16, role: 'z', side }, { x: SUNNY.zLand.x, y: SUNNY.zLand.y, r: 20, role: 'zland' }] };
      }
    },
    act: {
      yawn(game, s, w) {
        // Portals open first, so the volley's own sprouts never count as something in their way.
        // The plan already looked ahead to this moment, so only what stands there now can stop a portal; the start ring
        // (sent after this, from the same warning) then marks only the portals that open.
        const marks = w.targets.filter(t => t.role === 'portal' && sunnyClear(game, s, t.x, t.y, 0, 20, false));
        w.targets = w.targets.filter(t => t.role !== 'portal' || marks.includes(t));
        sunnyVolley(game, w.targets.filter(t => t.role === 'sprout'));
        const portals = marks.map(t => part(game, 'portal', t.x, t.y, SUNNY.portalR, 1, { born: s.kitAge, sunBonus: 1 }));
        if (portals.length) { s.portals.push(...portals); after(s, SUNNY.spitAt, 'spit', portals); for (const p of portals) after(s, SUNNY.closeAt, 'close', p); }
        // Like the volley, a yawn never cuts short a dizzy window the player earned: the next move waits for it.
        return Math.max(2.5, (s.modeUntil + .8 - s.age) / TIER_PACE[s.tier]);
      },
      // The Z leaves from the spot its tell marked (a Lullaby may have moved him since) and first sways away from him.
      snooze(game, s, w) {
        const t = w.targets.find(t => t.role === 'z'), from = { x: t.x, y: t.y }, to = { ...SUNNY.zLand };
        part(game, 'z', from.x, from.y, SUNNY.zR, 1, { born: s.kitAge, from, to, side: t.side || 1, len: Math.hypot(to.x - from.x, to.y - from.y) });
      },
      // From Cranky on, his nap bubble takes two hits.
      nap(game, s, w) { const bubble = s.parts.find(p => p.bossPart === 'bubble'); if (bubble && s.tier) bubble.maxHp = 2; return legacyAct(game, s, w); }
    },
    timer: {
      // Each portal still open spits its second sprout; a pair spat together is one life, like the volley.
      spit(game, s, portals) {
        const live = portals.filter(p => !p.bloomed && !p.closed); if (!live.length) return;
        const group = `${s.boss.id}-spit-${s.serial++}`;
        let spat = 0;
        live.forEach((p, i) => {
          // A piece sitting right under its mouth stops that portal spitting.
          const x = p.x, y = p.y + SUNNY.portalUp; if (!sunnyClear(game, s, x, y, SUNNY.sproutR, 0, false, p)) return;
          sunnySprout(game, s, `${group}-${i}`, group, x, y); p.spitAt = s.kitAge; spat++;
          game.event('bossAbility', { kind: s.kind, move: 'yawn', act: 'spit', x: p.x, y: p.y });
        });
        if (spat) s.summons++;
      }
    },
    pose(s, p, bx, by, clock) { return p.bossPart === 'z' ? sunnyZ(p, clock) : null; },
    step(game, s) {
      // A Z that reaches the launcher closes and naps the aim guide (presentation only; the pod is never touched).
      for (const p of s.parts) if (p.bossPart === 'z' && !p.bloomed && sunnyZ(p, s.kitAge).u >= 1) {
        close(game, s, p); game.aimNapUntil = game.time + SUNNY.nap;
        game.event('bossAbility', { kind: s.kind, move: 'snooze', act: 'nap', x: p.x, y: p.y });
      }
      // Shut portals leave the board once their bloom has played; the art keeps a closing portal for half a second.
      if (s.parts.some(p => p.bossPart === 'portal' && p.bloomed && game.time - p.bloomAt > 1)) {
        const gone = new Set(s.parts.filter(p => p.bossPart === 'portal' && p.bloomed && game.time - p.bloomAt > 1));
        s.parts = s.parts.filter(p => !gone.has(p)); game.buds = game.buds.filter(p => !gone.has(p));
      }
      if (s.portals.length) s.portals = s.portals.filter(p => !(p.closed || p.bloomed) || s.kitAge - (p.closed ? p.closedAt : p.shutAt) < .6);
    },
    bloomed(game, s, bud) {
      if (bud.bossPart === 'portal') {
        // Shut: its spit is off (the timer skips a bloomed portal), and a credited shut pays one more sun (sunBonus).
        bud.shutAt = s.kitAge;
        game.event('bossAbility', { kind: s.kind, move: 'yawn', act: 'shut', x: bud.x, y: bud.y });
        return true;
      }
      if (bud.bossPart === 'z') {
        // Popped: the jolt wakes him (his nap bubble goes too) and leaves him dizzy, so seeds land double.
        s.mode = 'dizzy'; s.vulnerable = true; s.modeUntil = Math.max(s.modeUntil, s.age + SUNNY.dizzy);
        const bubble = s.parts.find(p => p.bossPart === 'bubble'), woke = Boolean(bubble && !bubble.bloomed);
        if (woke) { bubble.bloomed = bubble.popped = true; bubble.bloomAt = game.time; }
        game.event('bossPhase', { kind: s.kind, mode: s.mode });
        game.event('bossAbility', { kind: s.kind, move: 'snooze', act: 'zpop', x: bud.x, y: bud.y, bubble: woke ? { x: bubble.x, y: bubble.y } : null });
        return true;
      }
      return false;
    },
    // The bot: a portal about to spit outranks the sprouts' escorts, the Z more so; the bubble (95) still comes first.
    targets(game, s, list) {
      const spitting = new Set(); for (const t of s.timers) if (t.act === 'spit') for (const p of t.data) spitting.add(p);
      for (const t of list) {
        if (t.bud.bossPart === 'portal' && spitting.has(t.bud)) t.priority = 70;
        if (t.bud.bossPart === 'z') t.priority = 80;
      }
    },
    cleanup(game, s) { s.portals = []; }
  });

  // ── Rootknot (Level 2, `root`) ──
  // A grumpy old root who fights from under the soil, out of three holes on his row (x 128, 210 and 292). Grumpy, he
  // burrows behind two root walls as he always has, and every other move he also lobs a live Rolypoly out of an empty
  // hole: bump it up into him and it bowls him over for three. Tangled, he lobs two, and grabs a clump of falling flowers
  // into a Root Carousel: a knot of roots that spins them round a 30 px ring while the whole ring keeps sinking like a
  // summoned cluster. Snap the knot (two hits) and every flower it carries blooms for you in a cascade; leave it, and when
  // its spin ends (or the ring nears the line) it flings them outward, falling faster for two seconds. Furious, he adds
  // the Root Snare: a thorny root across one side of the launcher's fan for four seconds, on the side with more to aim at.
  // Every motion is closed form on the kit clock (a Lullaby stops it all), so the carousel, its fling and the lobs are
  // exactly where the bot's forecast (positions) says they will be.
  const ROOT = { holes: [128, 210, 292], land: [70, 100], lobT: .6, lobH: 48, stagger: .18, tossCap: 4, ring: 30, gather: .25,
    spin: 1.6, spinFor: [3.5, 3.5, 7], sink: .85, out: 40, throwT: .3, hurry: 1.3, hurryFor: 2, knotHp: 2, knotR: 10,
    snare: { x: [145.3, 274.7], y: 405.65, length: 82, angle: .6109, life: 4, wither: .3 } };
  const rootSmooth = p => { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); };
  // The soil line of his row, where the holes are (the art draws them there too).
  const rootRow = b => b.y + b.r * .7;
  // The hole he comes up from: 292, 128, 210 in turn (the first move's is still 292).
  const rootStation = s => ROOT.holes[[2, 0, 1][s.action % 3]];
  // Room for a piece of radius r at (x, y): inside the board above the safe line, clear of every open bud (as clearSpot)
  // and clear of every rock and wall, including the walls this move is about to raise.
  function rootRoom(game, x, y, r, walls = []) {
    if (x - r < 23 || x + r > 397 || y - r < 30 || y + r > game.dangerY - 100 || !clearSpot(game, x, y, r)) return false;
    for (const w of [...game.bumpers, ...walls]) {
      const ux = Math.cos(w.angle || 0), uy = Math.sin(w.angle || 0), half = (w.length || 0) / 2;
      const along = clamp((x - w.x) * ux + (y - w.y) * uy, -half, half);
      if (Math.hypot(x - w.x - ux * along, y - w.y - uy * along) < r + 12) return false;
    }
    return true;
  }
  // The burrow (walls and the station hole) plus up to `count` toss marks: the empty holes nearest the middle first (ties
  // go left), each landing 70 px below his row, else 100 px, else that hole stays quiet.
  function rootBurrowPlan(game, s, b, move, count) {
    const plan = legacyPlan(game, s, 'root'), station = rootStation(s);
    for (const t of plan.targets) if (t.role === 'hole') t.x = station;
    plan.move = move;
    if (!count) return plan;
    const walls = plan.targets.filter(t => t.role === 'wall').map((t, i) => ({ x: t.x, y: t.y, length: 64, angle: i ? -.65 : .65 }));
    const alive = game.buds.filter(p => p.rootToss && !p.bloomed).length, want = Math.min(count, ROOT.tossCap - alive);
    const sources = ROOT.holes.filter(x => x !== station).sort((p, q) => Math.abs(p - 210) - Math.abs(q - 210) || p - q);
    let tosses = 0;
    for (const x of sources) {
      if (tosses >= want) break;
      const y = ROOT.land.map(dy => b.y + dy).find(y => rootRoom(game, x, y, 14, walls));
      if (y == null) continue;
      plan.targets.push({ x, y, r: 14, role: 'toss', fromX: x, move }); tosses++;
    }
    plan.text = tosses > 1 ? 'Rootknot is tossing rolypolies!' : tosses ? 'Rootknot is tossing a rolypoly!' : TEXT.root;
    return plan;
  }
  function rootBurrow(game, s, w) {
    // The walls replace the last ones; a snare still standing stays.
    const snares = game.bumpers.filter(p => p.bossSnare);
    legacyAct(game, s, w);
    for (const p of snares) if (!game.bumpers.includes(p)) game.bumpers.push(p);
    w.targets.filter(t => t.role === 'toss').forEach((t, i) => { if (i) after(s, ROOT.stagger * i, 'toss', t); else rootToss(game, s, t); });
  }
  // A rolypoly pops out of a hole on a drawn arc; it becomes a real piece only when it lands (lobs are pictures).
  function rootToss(game, s, t) {
    const y0 = rootRow(s.boss);
    lob(s, 'rolypoly', t.fromX, y0, t.x, t.y, ROOT.lobT, { h: ROOT.lobH, move: t.move });
    after(s, ROOT.lobT, 'land', t);
    game.event('bossAbility', { kind: s.kind, move: t.move, act: 'toss', x: t.fromX, y: y0 });
  }
  // The flowers a carousel would take: the biggest clump (centres within 46 px of one flower) of plain open flowers in
  // the middle band, at most the 4 nearest that flower; ties keep the earliest. Fewer than 2 is no carousel.
  function rootClump(game) {
    const list = game.buds.filter(p => plainFlower(p) && open(p) && p.y >= 140 && p.y <= 300 && p.x >= 63 && p.x <= 357);
    let best = null, anchor = null;
    for (const p of list) {
      const near = list.filter(q => Math.hypot(q.x - p.x, q.y - p.y) <= 46);
      if (!best || near.length > best.length) { best = near; anchor = p; }
    }
    if (!best || best.length < 2) return null;
    return best.slice().sort((p, q) => Math.hypot(p.x - anchor.x, p.y - anchor.y) - Math.hypot(q.x - anchor.x, q.y - anchor.y)).slice(0, 4);
  }
  const rootKnot = s => s.parts.find(p => p.bossPart === 'knot' && !p.bloomed && !p.closed) || null;
  const rootRiders = (s, knot) => s.carried.filter(p => p.carried && p.carried.knot === knot.id);
  // Where a carried flower is at kit time `clock`: it slides onto the ring in .25 s (evenly spaced), then turns at 1.6
  // rad/s round a centre sinking at .85 x the descent; at `until` it is thrown 40 px outward over .3 s.
  function rootRing(c, clock) {
    const u = Math.max(0, clock - c.t0), e = rootSmooth(u / ROOT.gather), rad = c.d0 + (ROOT.ring - c.d0) * e;
    const a = c.a0 + (c.aT - c.a0) * e + ROOT.spin * Math.max(0, u - ROOT.gather), cy = c.cy + c.sink * u;
    return { x: c.cx + rad * Math.cos(a), y: cy + rad * Math.sin(a), a };
  }
  function rootPose(s, p, bx, by, clock) {
    if (p.bossPart === 'knot') return { x: p.cx, y: p.cy + p.sink * clamp(clock - p.born, 0, p.until - p.born) };
    const c = p.carried; if (!c || c.knot == null) return null;
    const ring = rootRing(c, Math.min(clock, c.until));
    if (clock <= c.until) return ring;
    const e = rootSmooth((clock - c.until) / ROOT.throwT);
    return { x: clamp(ring.x + Math.cos(ring.a) * ROOT.out * e, 22 + p.r, 398 - p.r), y: clamp(ring.y + Math.sin(ring.a) * ROOT.out * e, 30 + p.r, c.floor) };
  }
  function rootCarousel(game, s, w) {
    const riders = w.targets.filter(t => t.role === 'carried').map(t => game.buds.find(p => p.id === t.id)).filter(p => p && plainFlower(p) && open(p));
    // Shot down to one flower during the warning (or another ring still turning): nothing to carry, a short rest.
    if (riders.length < 2 || rootKnot(s)) return 1.5;
    const cx = riders.reduce((n, p) => n + p.x, 0) / riders.length, cy = riders.reduce((n, p) => n + p.y, 0) / riders.length;
    const sink = game.descentSpeed * ROOT.sink, floor = game.dangerY - 70;
    // It lets go when its spin ends, or as soon as the ring's bottom would pass 70 px above the line.
    const early = sink > 0 ? (floor - ROOT.ring - 12 - cy) / sink : Infinity, spin = Math.max(ROOT.gather, Math.min(ROOT.spinFor[s.tier], early));
    const knot = part(game, 'knot', cx, cy, ROOT.knotR, ROOT.knotHp, { born: s.kitAge, cx, cy, sink, until: s.kitAge + spin, creaks: 0 });
    riders.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    const first = Math.atan2(riders[0].y - cy, riders[0].x - cx);
    riders.forEach((p, k) => {
      p.carried = { knot: knot.id, cx, cy, sink, floor, t0: s.kitAge, until: knot.until, a0: Math.atan2(p.y - cy, p.x - cx), aT: first + TAU * k / riders.length, d0: Math.hypot(p.x - cx, p.y - cy) };
      s.carried.push(p);
    });
  }
  // The knot lets go: its flowers fly outward on the pose above, then fall faster for a while.
  function rootFling(game, s, knot) {
    const riders = rootRiders(s, knot).filter(p => !p.bloomed);
    for (const p of riders) p.carried.until = Math.min(p.carried.until, s.kitAge);
    close(game, s, knot); knot.flungAt = s.kitAge;
    after(s, ROOT.throwT, 'release', riders.map(p => p.id));
    game.event('bossAbility', { kind: s.kind, move: 'carousel', act: 'fling', x: knot.x, y: knot.y, n: riders.length });
  }
  function rootSnarePlan(game) {
    // The side of the fan (35 to 75 degrees up from the launcher) with more open pieces to aim at; ties go left.
    let left = 0, right = 0;
    for (const p of game.buds) {
      if (!open(p) || p.hidden) continue;
      const dx = p.x - 210, dy = 498 - p.y, a = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
      if (dy <= 0 || a < 35 || a > 75) continue;
      if (dx < 0) left++; else if (dx > 0) right++;
    }
    const side = right > left ? 1 : 0;
    return { targets: [{ x: ROOT.snare.x[side], y: ROOT.snare.y, r: 42, role: 'snare', side }] };
  }
  kit('root', {
    hp: 26,
    moods: ['Grumpy', 'Tangled', 'Furious'],
    stageText: [null, 'Rootknot is tangling up!', 'Rootknot is furious!'],
    text: { toss: 'Rootknot is tossing a rolypoly!', toss2: 'Rootknot is tossing rolypolies!', carousel: 'Root carousel! Snap the knot.', snare: 'A root snare blocks one side!' },
    moves: [['root', 'toss'], ['toss2', 'carousel'], ['toss2', 'carousel', 'snare']],
    plan: {
      root: (game, s, b) => rootBurrowPlan(game, s, b, 'root', 0),
      toss: (game, s, b) => rootBurrowPlan(game, s, b, 'toss', 1),
      toss2: (game, s, b) => rootBurrowPlan(game, s, b, 'toss2', 2),
      carousel(game, s, b) {
        // Decided now, so the warning is true: with no clump to take (or a ring still turning) he tosses two instead.
        const clump = !rootKnot(s) && !s.carried.length ? rootClump(game) : null;
        if (!clump) return rootBurrowPlan(game, s, b, 'toss2', 2);
        const cx = clump.reduce((n, p) => n + p.x, 0) / clump.length, cy = clump.reduce((n, p) => n + p.y, 0) / clump.length;
        return { targets: [{ x: cx, y: cy, r: 40, role: 'knot' }, ...clump.map(p => ({ id: p.id, x: p.x, y: p.y, r: p.r, role: 'carried' }))] };
      },
      snare: game => rootSnarePlan(game)
    },
    act: {
      root: rootBurrow, toss: rootBurrow, toss2: rootBurrow, carousel: rootCarousel,
      snare(game, s, w) {
        const t = w.targets.find(t => t.role === 'snare'), left = !t.side, sn = ROOT.snare;
        game.bumpers = game.bumpers.filter(p => !p.bossSnare);
        // A rock wall on the kit clock; kitDrawn: the kit's art draws it as a thorny root.
        game.bumpers.push({ id: s.boss.id + '-snare', kind: 'rock', bossWall: true, bossSnare: true, kitDrawn: true, x: t.x, y: sn.y, baseX: t.x,
          length: sn.length, angle: left ? -sn.angle : sn.angle, kitAt: s.kitAge, kitUntil: s.kitAge + sn.life, expires: Infinity });
        // It withers through its last .3 s (the sound with it) and is gone at four seconds.
        after(s, sn.life - sn.wither, 'wither', { x: t.x, y: sn.y });
      }
    },
    timer: {
      toss: rootToss,
      land(game, s, t) {
        // Lands where it was shown, or a little aside if a flower has drifted onto the spot; with no room it bounces off.
        const spot = [[t.x, t.y], [t.x - 18, t.y], [t.x + 18, t.y], [t.x, t.y - 18]].find(([x, y]) => rootRoom(game, x, y, 12));
        if (!spot) { game.event('foe', { kind: 'rolypoly:bump', x: t.x, y: t.y, nx: 0, ny: -1 }); return; }
        const [bud] = Foes.make('rolypoly', ['rolypoly', spot[0], spot[1], {}], s.boss.id + '-toss', s.serial++, null, null);
        if (!bud) return;
        Object.assign(bud, { fall: .85, bossSummon: true, bossSource: s.boss.id, rootToss: true, kitLandAt: s.kitAge, hitAt: -100, bloomAt: -100, bloomed: false, spawnAt: game.time - 1 });
        Foes.place(game, bud);
        game.event('foe', { kind: 'rolypoly:land', bud, x: bud.x, y: bud.y });
        game.event('bossAbility', { kind: s.kind, move: t.move, act: 'land', x: bud.x, y: bud.y });
      },
      release(game, s, ids) {
        for (const id of ids) {
          const p = s.carried.find(b => b.id === id); if (!p) continue;
          release(game, p, true);
          // Thrown flowers fall 1.3x as fast for two seconds: ignoring the knot costs something.
          if (!p.bloomed) { if (p.kitHurry == null) { p.kitHurry = p.fall || 1; p.fall = p.kitHurry * ROOT.hurry; } after(s, ROOT.hurryFor, 'calm', p.id); }
        }
      },
      calm(game, s, id) { const p = game.buds.find(b => b.id === id); if (p && p.kitHurry != null) { p.fall = p.kitHurry; delete p.kitHurry; } },
      wither(game, s, at) { game.event('bossAbility', { kind: s.kind, move: 'snare', act: 'wither', x: at.x, y: at.y }); }
    },
    pose: rootPose,
    step(game, s) {
      // The carousel's tell follows the flowers it is about to take.
      const w = s.warning;
      if (w && w.move === 'carousel') {
        const riders = w.targets.filter(t => t.role === 'carried'), mark = w.targets.find(t => t.role === 'knot');
        if (mark && riders.length) { mark.x = riders.reduce((n, t) => n + t.x, 0) / riders.length; mark.y = riders.reduce((n, t) => n + t.y, 0) / riders.length; }
      }
      // A carried flower shot off the ring, or gone with its group over the line, is let go.
      for (const p of [...s.carried]) if (p.bloomed || !game.buds.includes(p)) release(game, p, false);
      const knot = rootKnot(s); if (!knot) return;
      const riders = rootRiders(s, knot);
      if (!riders.length) { close(game, s, knot); return; }
      // The knot is the ring's centre: it lets go at the end of its spin, or once the ring's bottom nears the line.
      if (s.kitAge >= knot.until || knot.y + ROOT.ring + 12 > game.dangerY - 70) { rootFling(game, s, knot); return; }
      // A soft creak every quarter turn.
      const turned = Math.floor(ROOT.spin * Math.max(0, s.kitAge - knot.born - ROOT.gather) / (Math.PI / 2));
      if (turned > knot.creaks) { knot.creaks = turned; game.event('bossAbility', { kind: s.kind, move: 'carousel', act: 'creak', x: knot.x, y: knot.y, n: turned }); }
    },
    // Bowled over: a rolypoly's roll into him (not while he is underground) deals three.
    resolve(game, s, bud, chain) {
      if (!(chain && game.due && game.due.via === 'roll' && bud === s.boss && s.mode !== 'burrow' && !bud.hidden)) return null;
      s.crits++; game.event('bossCritical', { kind: s.kind, bud, damage: 3, via: 'roll' });
      return { target: bud, damage: 3 };
    },
    bloomed(game, s, bud) {
      if (bud.carried) { release(game, bud, false); return true; }
      if (bud.bossPart !== 'knot') return false;
      // Snap! Every flower still on the ring blooms in a cascade, credited to whoever snapped the knot.
      const riders = rootRiders(s, bud).filter(p => !p.bloomed), by = game.striker ? game.striker.id : game.due && game.due.by != null ? game.due.by : null;
      bud.snappedAt = s.kitAge; bud.ends = riders.map(p => ({ x: p.x, y: p.y, type: p.type }));
      riders.forEach((p, k) => { release(game, p, false); game.pending.push(game._linkBy(p.id, game.time + .08 * k, bud, 'knot', by, true)); });
      game.event('bossAbility', { kind: s.kind, move: 'carousel', act: 'snap', x: bud.x, y: bud.y, n: riders.length });
      return true;
    },
    // The bot: a knot with flowers on it is worth snapping now.
    targets(game, s, list) { for (const t of list) if (t.bud.bossPart === 'knot') { t.priority = 60 + 10 * rootRiders(s, t.bud).length; t.reason = 'knot'; } },
    cleanup(game) { for (const p of game.buds) if (p.kitHurry != null) { p.fall = p.kitHurry; delete p.kitHurry; } }
  });

  // ── Mother Morel (Level 3, `puff`) ──
  // A grand, motherly morel who dances with her spores. Graceful (tier 0) plays her original bonnet (she pulls her cap
  // down, so only seeds from above land, and drops a cupped bunch and a puffcap beside her; it now alternates sides) and
  // the spore waltz: a puffcap partner twirls round her at MOREL.R px, inside a puffcap's 74 px reach, a turn every 2π s,
  // for MOREL.dance s. Popping it sets the puffcap chain off into her: two damage and "Waltz pop!". Tricky (tier 1) adds
  // the fakeout: she lobs three caps along shown arcs to three marks below her, one real spotted puffcap and two striped
  // fibcaps that sneeze when a seed is aimed at them. Stormy (tier 2) brings ink rain (three lanes of falling ink drops
  // for MOREL.rain s; each drop gulps a plain seed) and the painted waltz: three partners, and MOREL.paintAt s in a stripe
  // wipe paints two of them into fibcap decoys. Only the spotty one is real; a seed aimed at a painted one makes it
  // sneeze and slams her bonnet shut. Every pose, flight and drip is on the kit clock (a Lullaby holds them all), and
  // every choice comes from hash01.
  const MOREL = { R: 58, spin: 1, capR: 12, dance: 8, paintAt: 2.3, toss: 64, tossT: .9, tossAt: [40, 90, 140], lane: 60,
    rain: 4, drip: .8, stagger: .27, dropGap: 8, bonnet: 2, gone: 1 };
  // A dancing partner's pose: a closed-form orbit round her pose of the moment.
  const morelOrbit = (p, bx, by, clock) => Foes.orbitAt(bx, by, MOREL.R, MOREL.spin, p.a0, clock - p.born);
  // Where her partners would open (a0 each), round where she will be when the tell ends.
  function morelMarks(s, starts) {
    const q = positions(s, TELEGRAPH).get(s.boss.id);
    return starts.map(a0 => { const at = Foes.orbitAt(q.x, q.y, MOREL.R, MOREL.spin, a0, 0); return { x: at.x, y: at.y, r: 14, role: 'waltz' }; });
  }
  // A partner joins the dance (a one-hit puffcap part) and twirls home quietly after MOREL.dance s.
  function morelPartner(game, s, a0, extra) {
    const b = s.boss, at = Foes.orbitAt(b.x, b.y, MOREL.R, MOREL.spin, a0, 0);
    const p = part(game, 'waltz', at.x, at.y, MOREL.capR, 1, { born: s.kitAge, a0, puff: true, type: 'lilac', ...extra });
    s.partners.push(p); after(s, MOREL.dance, 'close', p); return p;
  }
  // One drop of ink rain from the cloud over lane k: an inkdrop with no cap, its own group, falling as an inkcap's does.
  function morelDrop(game, s, k) {
    const b = s.boss, x = s.ink.lanes[k], y = b.y + b.r + MOREL.dropGap;
    const [drop] = Foes.make('inkdrop', ['inkdrop', x, y, {}], `${b.id}-ink-${s.serial++}`, null);
    if (!drop) return;
    drop.lane = k; Foes.place(game, drop); s.ink.last[k] = s.kitAge;
    game.event('foe', { kind: 'inkcap:drip', bud: drop, x, y, n: k });
  }
  // The fakeout's marks: below where she stands as she tosses, each clear of every piece now and as the caps land
  // (`ahead` s from now). They are checked again as she tosses, so the warning only ever shows spots that get a cap.
  function morelTossMarks(game, s) {
    const q = positions(s, TELEGRAPH).get(s.boss.id);
    return MOREL.tossAt.map(deg => {
      const a = deg * Math.PI / 180;
      return { x: clamp(q.x + MOREL.toss * Math.cos(a), 34, 386), y: Math.min(q.y + MOREL.toss * Math.sin(a), game.dangerY - 120), r: MOREL.capR, role: 'fakeout' };
    }).filter(m => morelClear(game, s, m, TELEGRAPH + MOREL.tossT));
  }
  function morelClear(game, s, m, ahead) {
    const later = positions(s, ahead);
    return game.buds.every(p => {
      if (!open(p) || p.hidden || p.ghost || p.boss) return true;
      const pose = p.bossPart ? later.get(p.id) : null, gap = p.r + m.r + 6;
      if (Math.hypot(p.x - m.x, p.y - m.y) < gap) return false;
      return Math.hypot((pose ? pose.x : p.x) - m.x, (pose ? pose.y : p.y + game.descentSpeed * (p.fall || 1) * ahead) - m.y) >= gap;
    });
  }
  kit('puff', {
    hp: 33,
    moods: ['Graceful', 'Tricky', 'Stormy'],
    stageText: [null, 'Mother Morel gets tricky!', 'Mother Morel brings the rain!'],
    text: { waltz: 'Spore waltz! Pop her dancing cap.', fakeout: 'Which cap is real? Find the spots!', ink: 'Ink rain! Mind the drips.',
      fibwaltz: 'Watch the paint! Pop the spotty cap.' },
    moves: [['puff', 'waltz'], ['puff', 'waltz', 'fakeout'], ['ink', 'puff', 'fibwaltz']],
    init(game, s) { s.partners = []; s.puffs = 0; },
    plan: {
      // Her original bonnet, its bunch and puffcap swapping sides each time (the first is the familiar right-hand one).
      puff(game, s) { const action = s.action; s.action = s.puffs; try { return legacyPlan(game, s, 'puff'); } finally { s.action = action; } },
      waltz(game, s) { if (s.parts.some(p => p.bossPart === 'waltz' && !p.bloomed)) return null; return { targets: morelMarks(s, [0]) }; },
      fibwaltz(game, s) { if (s.parts.some(p => (p.bossPart === 'waltz' || p.bossPart === 'fibwaltz') && !p.bloomed)) return null; return { targets: morelMarks(s, [0, 1, 2].map(i => i * TAU / 3)) }; },
      fakeout(game, s) {
        const marks = morelTossMarks(game, s); if (!marks.length) return null;
        // Which mark gets the real puffcap is fixed by the guardian and the move count, never by chance.
        marks[Math.floor(Foes.hash01(s.boss.id, s.action) * marks.length)].real = true;
        return { targets: marks };
      },
      ink(game, s) {
        if (s.ink && s.ink.until > s.kitAge) return null;
        const q = positions(s, TELEGRAPH).get(s.boss.id);
        return { targets: [-1, 0, 1].map(k => ({ x: clamp(q.x + k * MOREL.lane, 40, 380), y: 300, r: 18, role: 'ink' })) };
      }
    },
    act: {
      puff(game, s, w) { s.puffs++; return legacyAct(game, s, w); },
      // The partners open where she actually is (a tick from the forecast mark); the start ring shows those spots.
      waltz(game, s, w) { const p = morelPartner(game, s, 0); w.targets = [{ x: p.x, y: p.y, r: 14, role: 'waltz' }]; },
      fibwaltz(game, s, w) {
        // The partner that stays real is chosen now; the art shows the wipe coming over the other two.
        const real = Math.floor(Foes.hash01(s.boss.id, s.action) * 3), parts = [0, 1, 2].map(i => morelPartner(game, s, i * TAU / 3, { painting: i !== real }));
        w.targets = parts.map(p => ({ x: p.x, y: p.y, r: 14, role: 'waltz' })); after(s, MOREL.paintAt, 'paint', parts);
      },
      fakeout(game, s, w) {
        // Only spots still clear get a cap (written back, so the start ring shows exactly those); if the real one's spot
        // filled up, the real cap goes to another, still by hash01.
        const b = s.boss, marks = w.targets.filter(t => t.role === 'fakeout' && morelClear(game, s, t, MOREL.tossT));
        w.targets = marks; if (!marks.length) return;
        if (!marks.some(m => m.real)) marks[Math.floor(Foes.hash01(b.id, s.action) * marks.length)].real = true;
        marks.forEach((m, i) => lob(s, m.real ? 'puffcap' : 'fibcap', b.x, b.y, m.x, m.y, MOREL.tossT, { real: Boolean(m.real), turn: i % 2 ? -1 : 1 }));
        after(s, MOREL.tossT, 'land', marks);
      },
      ink(game, s, w) {
        const b = s.boss, lanes = w.targets.filter(t => t.role === 'ink').map(t => t.x);
        s.ink = { lanes, t0: s.kitAge, until: s.kitAge + MOREL.rain, made: lanes.map(() => 0), last: lanes.map(() => -9) };
        game.event('bossAbility', { kind: s.kind, move: 'ink', act: 'ink', x: b.x, y: b.y, lanes });
      }
    },
    timer: {
      // The caps land where they were shown going: the spotted one a real puffcap, the striped ones fibcaps. A mark a
      // piece has fallen onto meanwhile gets nothing.
      land(game, s, marks) {
        const b = s.boss; let landed = 0, real = null;
        for (const m of marks) {
          if (!clearSpot(game, m.x, m.y, m.r)) continue;
          const id = `${b.id}-fake-${s.serial++}`;
          if (m.real) {
            real = { id, group: id, x: m.x, y: m.y, baseX: m.x, startY: m.y, r: m.r, hp: 1, maxHp: 1, type: 'lilac', puff: true, relay: false,
              fall: .8, sway: 0, hitAt: -100, bloomed: false, bloomAt: -100, bossSummon: true, bossSource: b.id };
            game.buds.push(real);
          } else {
            const [fake] = Foes.make('fibcap', ['fibcap', m.x, m.y, {}], id, null); if (!fake) continue;
            fake.bossSummon = true; fake.bossSource = b.id; Foes.place(game, fake);
            game.event('foe', { kind: 'fibcap:land', bud: fake, x: m.x, y: m.y });
          }
          landed++;
        }
        if (!landed) return;
        s.summons++;
        game.event('bossAbility', { kind: s.kind, move: 'fakeout', act: 'land', x: real ? real.x : marks[0].x, y: real ? real.y : marks[0].y, marks: marks.map(m => ({ x: m.x, y: m.y, real: Boolean(m.real) })) });
      },
      // The wipe ends: every partner still dancing but the real one is painted into a striped decoy.
      paint(game, s, parts) {
        let painted = 0;
        for (const p of parts) {
          if (p.bloomed || p.closed) continue;
          // The real one only twinkles (art), so the player can find the spots.
          if (!p.painting) { p.spottedAt = s.kitAge; continue; }
          p.bossPart = 'fibwaltz'; p.puff = false; p.decoy = p.inert = true; p.paintedAt = s.kitAge; painted++;
        }
        if (painted) game.event('bossAbility', { kind: s.kind, move: 'fibwaltz', act: 'paint', x: s.boss.x, y: s.boss.y });
      }
    },
    pose(s, p, bx, by, clock) {
      if (p.bossPart !== 'waltz' && p.bossPart !== 'fibwaltz') return null;
      // A popped partner stays where it burst while its burst plays.
      if (p.bloomed) return { x: p.x, y: p.y };
      const at = morelOrbit(p, bx, by, clock); return { x: at.x, y: at.y };
    },
    step(game, s) {
      // Ink rain: lane k drips at t0 + stagger k + drip n until the rain stops (nothing drips while the kit clock waits).
      const ink = s.ink;
      if (ink) {
        for (let k = 0; k < ink.lanes.length; k++) {
          for (let at = ink.t0 + MOREL.stagger * k + MOREL.drip * ink.made[k]; at < ink.until - 1e-9 && s.kitAge >= at - 1e-9; at = ink.t0 + MOREL.stagger * k + MOREL.drip * ink.made[k]) {
            morelDrop(game, s, k); ink.made[k]++;
          }
        }
        // The clouds stay a moment after the last drop so the art can blow them away.
        if (s.kitAge >= ink.until + .6) s.ink = null;
      }
      // Partners that were popped leave the board once their burst has played; the art keeps the rest a moment longer.
      if (s.parts.some(p => (p.bossPart === 'waltz' || p.bossPart === 'fibwaltz') && p.bloomed && game.time - p.bloomAt > MOREL.gone)) {
        const gone = new Set(s.parts.filter(p => (p.bossPart === 'waltz' || p.bossPart === 'fibwaltz') && p.bloomed && game.time - p.bloomAt > MOREL.gone));
        s.parts = s.parts.filter(p => !gone.has(p)); game.buds = game.buds.filter(p => !gone.has(p));
      }
      if (s.partners.length) s.partners = s.partners.filter(p => p.closed ? s.kitAge - p.closedAt < .6 : !p.bloomed || game.time - p.bloomAt < 1.2);
    },
    // A painted partner is a decoy: a seed aimed at it makes it sneeze (the gust scatters nearby buds) and slams her
    // bonnet shut for MOREL.bonnet s, and it does her no harm. A chain, a power or a script just pops it quietly.
    resolve(game, s, bud, chain, seed) {
      if (bud.bossPart !== 'fibwaltz') return null;
      if (Foes.direct(game, chain, Foes.credited(game, chain), seed)) {
        game._pop(bud, 'fibcap:sneeze'); Foes.FOES.fibcap.sneeze(game, bud.x, bud.y);
        s.mode = 'bonnet'; s.modeUntil = Math.max(s.modeUntil, s.age + MOREL.bonnet);
      } else game._pop(bud, 'fibcap:pop');
      return { blocked: true };
    },
    // A chain set off by a waltz partner (its links carry `waltz`) is the critical: "Waltz pop!".
    damage(game, s, bud, chain, result) {
      if (chain && game.due && game.due.waltz && bud === s.boss && result.target === s.boss && result.damage > 1) {
        s.crits++; game.event('bossCritical', { kind: s.kind, bud, damage: result.damage, via: 'waltz' });
      }
      return result;
    },
    // The bot: a dancing partner is worth chasing (it also counts as a puffcap); painted ones are decoys (never listed).
    targets(game, s, list) { for (const t of list) if (t.bud.bossPart === 'waltz') t.priority = 75; },
    cleanup(game, s) { s.partners = []; }
  });

  // ── Crystal Heart (Level 4, `crystal`) ──
  // The free levels' wall: three glass hearts, and only one of them is real. The two fakes are glass decoys: a seed's
  // touch shatters one (no damage) into two fast coral shards that tumble out and fall, and it re-forms in its slot
  // 2 s later on the kit clock, so popping both fakes needs two aimed pops and buys under 2 s of a bare heart. Powers
  // and credited chains never pop a fake; an uncredited strike pops it quietly, so a script's strike loop still ends.
  //   Calm (tier 0): today's shuffle.
  //   Shining (tier 1): the shuffle, then Mirror Shards: two glass blades low on the board (y 356, clear of the sliding
  //     rock at 304) that hold still for .8 s, then turn .7 rad over .2 s, every second for 6 s. A seed that banks off
  //     one and reaches the real heart within 1.2 s lands double: "Mirror shot!" (the mood clamp still applies).
  //   Racing (tier 2): Heartbeat Hues (a shuffle, then the real heart takes only one color, always one of the next three
  //     seeds, until her next move) alternating with the mirrors.
  const CRYSTAL = { mirrorX: [120, 300], mirrorY: 356, mirrorLength: 56, mirrorLife: 6, hold: .8, every: 1, turn: .7,
    reform: 2, shardCap: 6, shardR: 9, bank: 1.2, huePause: 4.5 };
  const crystalHearts = s => s.parts.filter(p => p.bossPart === 'heart');
  // Wherever a heart's `real` is set (the opening, every shuffle), its fakes become inert glass decoys.
  function crystalMark(s) { for (const p of crystalHearts(s)) p.decoy = p.inert = !p.real; }
  // Two fast coral shards tumble out of a shattered fake, never more than six loose at once. They are ghosts to the
  // seed that shattered it until it has flown clear, so its own rebound never blooms one for free.
  function crystalShards(game, s, heart, seed) {
    const loose = game.buds.filter(p => p.bossShard && !p.bloomed).length, made = [], r = CRYSTAL.shardR;
    const group = s.boss.id + '-shards-' + s.serial++;
    for (const [i, dx] of [-14, 14].entries()) {
      if (loose + made.length >= CRYSTAL.shardCap) break;
      const x = clamp(heart.x + dx, 22 + r, 398 - r), y = Math.min(heart.y + 26, game.dangerY - 70);
      if (!clearSpot(game, x, y, r, heart)) continue;
      const p = { id: group + '-' + i, group, x, y, baseX: x, startY: y, r, type: 'coral', hp: 1, maxHp: 1, relay: false, fall: 1.5, sway: 0,
        hitAt: -100, bloomAt: -100, bloomed: false, spawnAt: game.time, gem: true, bossShard: true, bossSummon: true, bossSource: s.boss.id,
        shardFrom: { x: heart.x, y: heart.y } };
      if (seed && seed.id != null) { p.ghost = true; p.ghostSeed = seed.id; }
      game.buds.push(p); made.push(p);
    }
    if (made.length) s.summons++;
    return made;
  }
  // The pair of mirrors: one each side of the launcher's line, angled in, turning in opposite directions.
  function crystalMirrors(game, s) {
    game.bumpers = game.bumpers.filter(m => !m.bossMirror);
    CRYSTAL.mirrorX.forEach((x, i) => {
      const angle = i ? -.6 : .6;
      game.bumpers.push({ id: s.boss.id + '-mirror-' + i, kind: 'rock', bossWall: true, bossMirror: true, x, y: CRYSTAL.mirrorY, baseX: x,
        length: CRYSTAL.mirrorLength, angle0: angle, angle, dir: i ? -1 : 1, t0: s.kitAge, kitUntil: s.kitAge + CRYSTAL.mirrorLife,
        expires: Infinity, turns: 0, lead: i === 0, flashAt: null, flashSeen: null });
    });
  }
  // A mirror's angle at kit time t: still for .8 s of every second, then a .2 s smoothstep turn of .7 rad.
  function mirrorAngle(m, t) {
    const u = (t - m.t0) / CRYSTAL.every, k = Math.floor(u);
    return m.angle0 + m.dir * CRYSTAL.turn * (k + Foes.smooth((u - k - CRYSTAL.hold) / (CRYSTAL.every - CRYSTAL.hold)));
  }
  kit('crystal', {
    hp: 36,
    moods: ['Calm', 'Shining', 'Racing'],
    stageText: [null, 'Crystal Heart is shining!', 'Crystal Heart is racing!'],
    text: { mirrors: 'Mirror shards! Bank a seed off one.', hues: 'The heart wants one color!' },
    moves: [['crystal'], ['crystal', 'mirrors'], ['hues', 'mirrors']],
    init(game, s) { crystalMark(s); },
    plan: {
      mirrors() { return { targets: CRYSTAL.mirrorX.map(x => ({ x, y: CRYSTAL.mirrorY, r: 30, role: 'mirror' })) }; },
      // Today's shuffle (with its shard clusters below half health), under its own name.
      hues(game, s) { return { ...legacyPlan(game, s, 'crystal'), move: 'hues', text: null }; }
    },
    act: {
      crystal(game, s, w) { s.hue = null; legacyAct(game, s, w); crystalMark(s); },
      mirrors(game, s) {
        s.hue = null; crystalMirrors(game, s);
        game.event('bossAbility', { kind: s.kind, move: 'mirrors', act: 'mirror', x: 210, y: CRYSTAL.mirrorY });
      },
      hues(game, s, w) {
        legacyAct(game, s, w); crystalMark(s);
        s.hue = typeof game.typeAhead === 'function' ? game.typeAhead(Math.floor(Foes.hash01(s.boss.id, s.action) * 3)) : null;
        // The start event carries the wanted color on a `hue` target (its sound and its effects read it).
        const real = crystalHearts(s).find(p => p.real);
        if (s.hue && real) w.targets = [...w.targets, { x: real.x, y: real.y, r: real.r + 8, role: 'hue', type: s.hue }];
        return CRYSTAL.huePause / TIER_PACE[s.tier];
      }
    },
    timer: {
      // A shattered fake grows back in its slot, unless a shuffle has already revived it (or popped it again since).
      reform(game, s, data) {
        const p = s.parts.find(q => q.id === data.id);
        if (!p || !p.popped || p.popSerial !== data.serial || s.boss.bloomed) return;
        revive(p, game); p.decoy = p.inert = !p.real;
        game.event('bossAbility', { kind: s.kind, move: 'heart', act: 'reform', x: p.x, y: p.y });
      }
    },
    step(game, s) {
      for (const m of game.bumpers) {
        if (!m.bossMirror) continue;
        m.angle = mirrorAngle(m, s.kitAge);
        const turns = Math.max(0, Math.floor((s.kitAge - m.t0) / CRYSTAL.every - CRYSTAL.hold + 1e-9) + 1);
        if (turns > m.turns) { m.turns = turns; if (m.lead) game.event('bossAbility', { kind: s.kind, move: 'mirrors', act: 'turn', x: 210, y: m.y, n: turns }); }
        // rush.js stamps flashAt when a seed banks off a mirror; the glint and its ping follow here.
        if (m.flashAt != null && m.flashAt !== m.flashSeen) { m.flashSeen = m.flashAt; game.event('bossAbility', { kind: s.kind, move: 'mirrors', act: 'bank', x: m.x, y: m.y }); }
      }
      // A shard turns solid once the seed that shattered its heart has flown clear (or is gone).
      for (const p of game.buds) {
        if (p.ghostSeed == null) continue;
        const ball = game.balls && game.balls.find(b => b.id === p.ghostSeed);
        if (!ball || Math.hypot(ball.x - p.x, ball.y - p.y) > p.r + 30) { p.ghost = false; p.ghostSeed = null; }
      }
    },
    // The bot's view (and the app's finale check): a fake can be touched (it shatters), the real heart only by the
    // wanted color while the hues are up.
    canHit(game, s, bud, hit, seed) {
      if (bud.bossPart !== 'heart') return undefined;
      return !(bud.real && s.hue && seed.type && !hit.chain && !seed.power && seed.type !== s.hue);
    },
    resolve(game, s, bud, chain, seed) {
      if (bud.bossPart !== 'heart') return null;
      if (!bud.real) {
        if (Foes.isPower(game, seed) || (chain && Foes.credited(game, true))) return { blocked: true };
        bud.popX = bud.x; bud.popY = bud.y; bud.popSerial = (bud.popSerial || 0) + 1;
        game._pop(bud, 'crystal:fake');
        if (Foes.credited(game, chain)) {
          crystalShards(game, s, bud, seed);
          game.event('bossAbility', { kind: s.kind, move: 'heart', act: 'fake', x: bud.x, y: bud.y });
        }
        after(s, CRYSTAL.reform, 'reform', { id: bud.id, serial: bud.popSerial });
        return { blocked: true };
      }
      if (s.hue && !chain && !Foes.isPower(game, seed) && seed.type && seed.type !== s.hue) {
        s.guards++; game.event('bossGuard', { kind: s.kind, bud, mode: 'hue' }); return { blocked: true };
      }
      return null;
    },
    // Mirror shot: a seed that banked off a mirror within 1.2 s lands double on the real heart.
    damage(game, s, bud, chain, result) {
      const seed = game.striker;
      if (chain || !seed || bud.bossPart !== 'heart' || !bud.real || result.target !== s.boss || seed.power || game.powerPart) return result;
      if (seed.mirrorAt == null || !(game.time - seed.mirrorAt <= CRYSTAL.bank)) return result;
      s.crits++;
      game.event('bossCritical', { kind: s.kind, bud, damage: 2, via: 'mirror' });
      game.event('bossAbility', { kind: s.kind, move: 'mirrors', act: 'shot', x: bud.x, y: bud.y });
      return { ...result, damage: 2 };
    },
    // The practice bot: while the hues are up, a seed of the wanted color makes the real heart the shot to take.
    targets(game, s, list) {
      if (!s.hue || game.nextType !== s.hue) return;
      for (const t of list) if (t.bud.bossPart === 'heart' && t.bud.real) t.priority = Math.max(t.priority, 75);
    },
    cleanup(game, s) { s.hue = null; for (const p of game.buds) if (p.ghostSeed != null) { p.ghost = false; p.ghostSeed = null; } }
  });

  // ── Lantern Lily (Level 5, `lotus`) ──

  return { init, step, canHit, burns, resolve, bloomed, breach, cleanup, predictVisible, targets, health: HEALTH, telegraph: TELEGRAPH, kits: KITS };
});
