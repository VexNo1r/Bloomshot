(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Game, clamp } = BloomEngine;
  const { levels, flowers, worlds } = BloomLevels;
  // Five-seed chapters share one flow: Moon gates are free, Koi currents are free for two pools.
  const chapters = { moon: BloomMoon, koi: BloomKoi };
  const CHAPTER_NAMES = { moon: 'Moon', koi: 'Koi' };
  const store = window.BloomStore || null;
  const Keepsakes = window.BloomKeepsakes;
  const native = window.BloomNative || null;
  const STORAGE = new URLSearchParams(location.search).has('qa') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  const Goals = window.BloomGoals;
  const Depths = window.BloomDepths;
  const Tutorial = window.BloomTutorial;
  const Powers = window.BloomPowers;
  const defaults = { version: 1, garden: BloomGarden.normalize(), goals: Goals.normalize(null, localDate()), progress: {}, moon: {}, koi: {}, daily: {}, rush: { best: 0, bestWave: 1, runs: 0, blooms: 0 }, depths: {}, powers: Powers.normalize(), powerReceipts: [], powersMet: false, tutorial: false, lastLevel: 1, keepsake: 'meadow', settings: { sound: true, haptics: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches } };
  let storageAvailable = true;
  function readSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (!raw || raw.version !== 1) return structuredClone(defaults);
      const valid = structuredClone(defaults);
      valid.garden = BloomGarden.normalize(raw.garden);
      valid.goals = Goals.normalize(raw.goals, localDate());
      valid.depths = Depths.normalize(raw.depths);
      // Powerups are counted, never reset; a save from before them starts with one of each.
      valid.powers = Powers.normalize(raw.powers); valid.powerReceipts = Powers.receipts(raw.powerReceipts); valid.powersMet = raw.powersMet === true;
      for (const world of Object.keys(chapters)) for (const level of chapters[world].levels) {
        const record = raw[world]?.[level.id];
        if (record && Number.isFinite(record.best) && Number.isInteger(record.stars) && record.stars >= 0 && record.stars <= 3) valid[world][level.id] = { best: Math.max(0, record.best), stars: record.stars, attempts: Math.max(0, Number(record.attempts) || 0) };
      }
      for (const level of levels) {
        const record = raw.progress?.[level.id];
        if (record && Number.isFinite(record.best) && Number.isInteger(record.stars) && record.stars >= 0 && record.stars <= 3) valid.progress[level.id] = { best: Math.max(0, record.best), stars: record.stars, attempts: Math.max(0, Number(record.attempts) || 0) };
      }
      valid.lastLevel = clamp(Number(raw.lastLevel) || 1, 1, levels.length);
      // The chosen style is kept even while locked (a refund or a restore in progress); play shows Meadow until it is owned.
      if (typeof raw.keepsake === 'string' && Keepsakes.byId[raw.keepsake]) valid.keepsake = raw.keepsake;
      for (const key of ['best', 'bestWave', 'runs', 'blooms']) if (Number.isFinite(raw.rush?.[key]) && raw.rush[key] >= 0) valid.rush[key] = Math.floor(raw.rush[key]);
      for (const key of ['sound', 'haptics', 'motion', 'music']) if (typeof raw.settings?.[key] === 'boolean') valid.settings[key] = raw.settings[key];
      if (raw.daily && typeof raw.daily === 'object') for (const [key, value] of Object.entries(raw.daily).slice(-14)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        if (/^daily-\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value.best) && value.best >= 0 && Number.isInteger(value.stars) && value.stars >= 0 && value.stars <= 3) valid.daily[key] = value;
      }
      // The tutorial plays once, for a new player. Anyone who has already played anything counts as having seen it.
      valid.tutorial = raw.tutorial === true || valid.powersMet || Object.keys(valid.depths).length > 0 || valid.rush.runs > 0 || Object.keys(valid.progress).length > 0
        || Object.keys(valid.daily).length > 0 || Object.keys(chapters).some(world => Object.keys(valid[world]).length > 0);
      return valid;
    } catch (_) { return structuredClone(defaults); }
  }
  const save = readSave();
  function persist() {
    if (native && native.reloading) return; // a restored save is about to replace this page, so nothing may overwrite it
    let json = '';
    try { json = JSON.stringify(save); localStorage.setItem(STORAGE, json); }
    catch (_) { storageAvailable = false; $('settings-storage').textContent = "This browser won't save, so progress lasts for this visit only."; }
    if (native && json) native.mirror(STORAGE, json); // the phone's own preferences may still work when web storage does not
  }
  function haptic(kind) { if (save.settings.haptics && native) native.haptic(kind); }
  // In the native app a second copy of the save lives in the phone's preferences. If the OS wiped the web
  // storage, put that copy back and reload once so the game starts from it.
  if (native) native.restore(STORAGE).then(restored => { if (restored) location.reload(); });
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const meadowCanvas = $('meadow-canvas'), meadowCtx = meadowCanvas.getContext('2d');
  let meadowDirty = true, meadowFrame = 0, growth = null, bubbleTimer = 0;
  const friendPokes = {};
  let runId = '', runAward = 0, runBouquet = null, runGoals = null, depthNews = null;
  // How many flowers each shot of a garden bloomed, for the shared daily result.
  let shotTrail = [], trailTotal = 0;
  // A level just opened by a first clear: its card greets the player on the map until they play it.
  let freshDepth = 0, freshShown = false;
  let game, route = 'game', theme = 'meadow', preview = false, returnSession = null, tutorial = null, tutorialKey = '', tutorialNudges = 0;
  let aiming = false, guiding = false, pointer = null, activePointer = null, angle = -Math.PI / 2, resultAt = Infinity, resultShown = false;
  const narrowLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  let lastFrame = 0, accumulator = 0, toastTimer, currentWorld = null, newFlower = null, newKeepsake = null;
  let displayScore = 0, hudKey = '', pulseTime = 0, rushRecordBroken = false;
  const dialogs = ['result-dialog', 'settings-dialog', 'help-dialog', 'world-dialog'];
  // Three filled stars, the unearned ones dimmed, so a row of stars always reads the same width.
  const starHTML = n => '<span>★</span>'.repeat(n) + '<span class="off">★</span>'.repeat(3 - n);
  const fmt = number => Math.round(number).toLocaleString();
  const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function say(text) { $('announcement').textContent = text; }
  function toast(text) {
    $('toast').textContent = text; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
    say(text);
  }
  function showDialog(id) {
    cancelInteraction();
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
    // The result card starts on its main button, never on Share or an offer.
    if (id === 'result-dialog') { const main = $('next-btn').hidden ? $('retry-btn') : $('next-btn'); if (main.focus) main.focus(); }
  }
  function closeDialog(id) { if ($(id).open) $(id).close(); }
  function closeDialogs() { dialogs.forEach(closeDialog); }
  function unlocked(id) { return id === 1 || (save.progress[id - 1]?.stars || 0) > 0; }
  function earned(flower) { return (save.progress[flower.unlockLevel]?.stars || 0) > 0; }
  const isRush = () => game?.mode === 'rush';
  // The levels run on the Rush engine with a plan of ten waves each. Levels past the free ones wait for the full unlock.
  const isDepth = () => isRush() && Boolean(game.plan);
  // The first-time tutorial is a scripted Rush board; while it runs, only the control its card points at works.
  const isTutorial = () => Boolean(tutorial) && isRush() && Boolean(game.scripted);
  const gate = action => !isTutorial() || tutorial.allows(action);
  const powerCount = id => isTutorial() ? tutorial.count(id) : save.powers[id];
  const depthsOwned = () => Boolean(store && store.owns(Depths.entitlement));
  const depthPaid = id => id <= Depths.free || depthsOwned();
  const depthOpen = id => Depths.unlocked(save.depths, id, depthsOwned());
  const depthTheme = id => `depth-${Depths.level(id).key}`;
  // A free taste: once level 4 is cleared, anyone can play the first three waves of level 5. It records no
  // progress; when it is played through, the unlock is offered on the result card, never during play.
  const TASTE = Object.freeze({ level: Depths.free + 1, waves: Math.min(3, Depths.waveCount) });
  const tasteOpen = () => !depthsOwned() && Boolean(Depths.level(TASTE.level)) && (save.depths[TASTE.level - 1]?.stars || 0) > 0;
  const isTaste = () => isDepth() && Boolean(game.plan.taste);
  function depthPlan(id, taste) { const level = Depths.level(id); return { id, name: level.name, waves: taste ? TASTE.waves : Depths.waveCount, wave: n => Depths.wave(id, n), taste: Boolean(taste) }; }
  // The level the map points at: the first open one without stars, otherwise the deepest open one.
  function nextDepth() { const open = Depths.levels.filter(level => depthOpen(level.id)); return (open.find(level => !save.depths[level.id]?.stars) || open.at(-1) || Depths.levels[0]).id; }
  // In a level the wave's own tip stays up while playing; waves without one keep the basic reminder.
  const depthHint = () => game.waveHint || 'Keep the flowers above the line.';
  const inProgress = () => Boolean(isRush() && game.started && !game.over && !preview);
  const isMoon = () => game?.level.worldId === 'moon';
  const isKoi = () => game?.level.worldId === 'koi';
  const isChapter = () => Boolean(game && chapters[game.level.worldId]);
  const isDaily = () => Boolean(game && typeof game.level.id === 'string' && game.level.id.startsWith('daily-'));
  const koiOwned = () => Boolean(store && store.owns(BloomKoi.entitlement));
  // A trial opens when the previous one has a star and, for paid pools, when the pack is owned.
  const trialPaid = (world, level) => world !== 'koi' || level.free || koiOwned();
  const trialCleared = (world, index) => index === 0 || (save[world][chapters[world].levels[index - 1].id]?.stars || 0) > 0;
  const trialOpen = (world, index) => trialCleared(world, index) && trialPaid(world, chapters[world].levels[index]);
  const nextTrial = level => { const list = chapters[level.worldId].levels; return list[list.findIndex(item => item.id === level.id) + 1] || null; };
  const productInfo = id => (store && store.products().find(item => item.id === id)) || null;
  function offerFor(productId) {
    const product = productInfo(productId);
    return { live: Boolean(store && store.isLive()), available: Boolean(product && product.available), price: product?.price || '', mode: store?.mode || 'web' };
  }
  // The Complete Garden is one store product that grants levels 5 to 10, the Koi Conservatory and the Keepsake
  // Collection. It is offered only to a player who owns none of the three, so nobody pays twice for a part.
  const BUNDLE = 'bloomshot.bundle.complete1';
  function bundleOffer() {
    const bundle = productInfo(BUNDLE);
    if (!store || !store.isLive() || !bundle || !bundle.available || bundle.owned || bundle.partial) return '';
    const parts = [Depths.product, BloomKoi.product, Keepsakes.product].map(productInfo);
    if (parts.some(part => !part || part.owned)) return '';
    // The exact saving is shown only when the store gives comparable amounts; otherwise the wording names no number.
    let saving = 'Less than buying all three';
    if ([bundle, ...parts].every(p => Number.isFinite(p.amount) && p.currency && p.currency === bundle.currency)) {
      const amount = Math.round((parts.reduce((sum, p) => sum + p.amount, 0) - bundle.amount) * 100) / 100;
      if (amount > 0) try { saving = `${new Intl.NumberFormat(undefined, { style: 'currency', currency: bundle.currency }).format(amount)} less than buying all three`; } catch (_) { /* keep the plain wording */ }
    }
    const separately = parts.every(p => p.price) ? ` (${parts.map(p => p.price).join(' + ')})` : '';
    return `<div class="bundle-offer"><span class="card-tag gold">Complete Garden</span><strong>Levels ${Depths.free + 1} to ${Depths.total}, Koi pools and seed styles</strong><p>${escape(saving + separately)}.</p><button class="button-secondary bundle-btn" type="button" data-buy="${BUNDLE}">Get everything${bundle.price ? ` · ${escape(bundle.price)}` : ''}</button></div>`;
  }
  // Keepsakes: Meadow is free, Moonlit is earned in the Moon Garden, the rest come with the collection.
  const keepsakeContext = () => ({ moon: save.moon, moonLevels: BloomMoon.levels, owns: entitlement => Boolean(store && store.owns(entitlement)) });
  const keepsakeOpen = id => Keepsakes.unlocked(id, keepsakeContext());
  const currentKeepsake = () => Keepsakes.resolve(save.keepsake, keepsakeContext());
  const collectionOwned = () => Boolean(store && store.owns(Keepsakes.entitlement));
  function record() { return isTutorial() ? null : isDepth() ? save.depths[game.plan.id] : isRush() ? save.rush : isChapter() ? save[game.level.worldId][game.level.id] : typeof game.level.id === 'number' ? save.progress[game.level.id] : save.daily[game.level.id]; }
  function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function setRoute(next) {
    route = next; cancelInteraction();
    for (const name of ['game', 'levels', 'garden', 'collection', 'worlds']) $(`${name}-view`).hidden = next !== name;
    for (const name of ['rush', 'garden', 'collection', 'worlds']) {
      const active = next === name || (name === 'rush' && (next === 'game' || next === 'levels'));
      $(`${name}-btn`).classList.toggle('active', active); $(`${name}-btn`).setAttribute('aria-current', active ? 'page' : 'false');
    }
    if (next === 'garden') renderGarden();
    if (next === 'collection') { keepsakePreview = null; showcase.dirty = true; renderCollection(); }
    if (next === 'worlds') renderWorlds();
    if (next === 'levels') renderLevels();
    document.body.dataset.view = next;
    $('tutorial').hidden = !(tutorial && next === 'game');
    if (next === 'game') resize();
  }
  function startLevel(level, options = {}) {
    closeDialogs();
    game = level.tutorial ? new BloomRush.RushGame({ scripted: true }) : level.depth ? new BloomRush.RushGame({ plan: depthPlan(level.depth, level.taste), random: Math.random, startWave: level.from || 1 }) : level.id === 'rush' ? new BloomRush.RushGame({ random: Math.random }) : new Game(level); game.particles = []; game.floaters = []; if ($('checkpoint-btn')) $('checkpoint-btn').hidden = true;
    tutorial = level.tutorial ? Tutorial.create() : null; tutorialKey = ''; document.body.dataset.tutorial = tutorial ? 'on' : '';
    if (tutorial) tutorial.begin(game);
    preview = Boolean(options.preview); theme = options.theme || (isChapter() ? game.level.worldId : 'meadow');
    document.body.dataset.theme = theme;
    document.body.dataset.mode = isRush() ? 'rush' : 'campaign';
    document.body.dataset.world = isChapter() ? game.level.worldId : 'meadow';
    if (!isRush()) for (const key of ['wave', 'lives', 'elapsed', 'splitReady']) delete canvas.dataset[key];
    $('split-btn').hidden = !isRush();
    angle = -Math.PI / 2; pointer = null; aiming = false; guiding = false; resultAt = Infinity; resultShown = false;
    displayScore = 0; hudKey = ''; newFlower = null; newKeepsake = null; accumulator = 0; rushRecordBroken = false; depthNews = null; game.shieldSeen = false; game.shellSeen = false; game.geodeSeen = false;
    runId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; runAward = 0; runBouquet = null; runGoals = null; shotTrail = []; trailTotal = 0;
    if (!preview && typeof level.id === 'number') { save.lastLevel = level.id; persist(); }
    $('level-name').textContent = level.name;
    $('level-label').textContent = preview ? 'Preview' : typeof level.id === 'number' ? `Garden ${level.id}/${levels.length}` : 'Daily garden';
    $('game-hint').textContent = preview ? 'A look at a garden still being built.' : level.id === 1 ? 'Pull back, let go, then drag to steer.' : 'Aim, let go, then drag to steer.';
    canvas.setAttribute('aria-label', `${level.name}. Aim with arrow keys and press Space to launch three balls. While flying, arrow keys guide the swarm. Press R to turn a petal. Three shots to bloom the garden.`);
    if (isRush()) {
      $('level-name').textContent = 'Meadow Rush';
      $('game-hint').textContent = 'Keep the flowers above the line.';
      canvas.setAttribute('aria-label', 'Meadow Rush. Aim and release one seed at a time. Flowers descend after your first shot. Three breached clusters end your run. Arrow keys aim, Space fires, S splits after six direct hits, R turns the petal.');
    }
    if (isTutorial()) {
      $('level-name').textContent = 'How to play';
      $('game-hint').textContent = 'Follow the card to learn each button.';
      canvas.setAttribute('aria-label', 'How to play. A short guided run: each card names one control to try, and the game slows down while it waits. Arrow keys aim, Space fires, S splits, R turns the petal, 1 to 4 pick a powerup.');
    }
    if (isDepth()) {
      const depth = Depths.level(game.plan.id);
      $('level-name').textContent = depth.name;
      $('game-hint').textContent = game.waveHint || depth.twist;
      canvas.setAttribute('aria-label', `Level ${depth.id}, ${depth.name}. ${isTaste() ? `The first ${TASTE.waves} waves, free to try.` : 'Ten waves of flowers.'} Keep them above the line: three clusters over it ends the level. Arrow keys aim, Space fires, S splits after six direct hits, R turns the leaf.`);
    }
    $('back-btn').querySelector('span').textContent = isRush() ? 'Levels' : 'Meadow';
    if (isChapter()) {
      const list = chapters[level.worldId].levels;
      $('level-label').textContent = `${CHAPTER_NAMES[level.worldId]} ${list.findIndex(item => item.id === level.id) + 1}/${list.length}`;
      $('game-hint').textContent = level.hint || level.description;
      canvas.setAttribute('aria-label', `${level.name}. Five single-seed shots. ${isKoi() ? 'Flowing currents turn your seed toward the way the water runs.' : 'Paired moon gates transport your seed.'} Aim with arrows, Space fires, R turns a leaf between shots. No in-flight steering.`);
    }
    setRoute('game'); trayKey = ''; updateHud();
    if (isRush() && !preview && !options.behind && !tutorial && !save.powersMet) { save.powersMet = true; persist(); toast('New: powerups! Tap one above the board, then fire.'); }
  }
  function updateHud() {
    const rush = isRush();
    const key = `${game.shotsLeft}|${game.bloomedCount}|${game.status}|${game.rotationUsed}|${game.wave}|${game.lives}`;
    if (key !== hudKey) {
      hudKey = key;
      const remaining = rush ? game.lives : game.shotsLeft;
      const units = rush ? remaining === 1 ? 'life' : 'lives' : isChapter() ? remaining === 1 ? 'seed' : 'seeds' : remaining === 1 ? 'shot' : 'shots';
      $('seed-count').innerHTML = Array.from({ length: isChapter() ? game.rules.shots : 3 }, (_, index) => `<span class="seed-dot ${index < remaining ? 'available' : 'used'}" aria-hidden="true"></span>`).join('') + `<span class="seed-label">${remaining} ${units}</span>`;
      $('seed-count').setAttribute('aria-label', `${remaining} ${units} remaining`);
      $('bloom-count').textContent = rush ? `${game.bloomedCount} ${game.bloomedCount === 1 ? 'bloom' : 'blooms'}` : `${game.bloomedCount} / ${game.buds.length} bloomed`;
      if (rush) $('level-label').textContent = isTutorial() ? 'Tutorial' : isDepth() ? `Level ${game.plan.id} · Wave ${game.wave}/${game.finalWave}` : `Wave ${game.wave} · ×${game.tempo.toFixed(1)}`;
      $('best-value').textContent = preview ? 'Preview' : record()?.best ? fmt(record().best) : '—';
      canvas.dataset.status = game.status; canvas.dataset.blooms = game.bloomedCount; canvas.dataset.level = game.level.id; canvas.dataset.shots = game.shotsLeft;
      $('rotate-btn').disabled = game.status !== 'aiming' || game.rotationUsed || !game.bumpers.length;
      $('rotate-btn').textContent = game.rotationUsed ? 'Petal turned' : 'Turn petal';
    }
    $('score-value').textContent = fmt(displayScore);
    canvas.dataset.balls = game.balls.length;
    canvas.dataset.world = isChapter() ? game.level.worldId : 'meadow';
    canvas.dataset.gatePasses = game.gatePasses || 0;
    if (!isChapter()) $('combo-meter').removeAttribute('aria-valuetext');
    if (isKoi()) {
      const rides = game.currentRides || 0, words = `${rides} ${rides === 1 ? 'current' : 'currents'} ridden`;
      $('combo-label').textContent = words;
      $('combo-meter').style.setProperty('--charge', '0%'); $('combo-meter').classList.remove('fever');
      $('combo-meter').setAttribute('aria-label', 'Koi currents ridden'); $('combo-meter').setAttribute('aria-valuenow', '0');
      $('combo-meter').setAttribute('aria-valuetext', words.toLowerCase());
      $('guide-label').textContent = game.status === 'flying' ? 'Ride it' : `★★★ in ${game.level.par}`;
      $('fever-banner').hidden = true; return;
    }
    if (isMoon()) {
      $('combo-label').textContent = `${game.gatePasses || 0} ${game.gatePasses === 1 ? 'gate' : 'gates'} crossed`;
      $('combo-meter').style.setProperty('--charge', '0%'); $('combo-meter').classList.remove('fever');
      $('combo-meter').setAttribute('aria-label', 'Moon gate crossings'); $('combo-meter').setAttribute('aria-valuenow', '0');
      $('combo-meter').setAttribute('aria-valuetext', `${game.gatePasses || 0} gate crossings`);
      $('guide-label').textContent = game.status === 'flying' ? 'Through the gate' : `★★★ in ${game.level.par}`;
      $('fever-banner').hidden = true; return;
    }
    if (rush) {
      canvas.dataset.wave = game.wave; canvas.dataset.lives = game.lives; canvas.dataset.balls = game.balls.length;
      canvas.dataset.elapsed = game.elapsed.toFixed(2); canvas.dataset.splitReady = game.splitReady;
      $('rotate-btn').disabled = game.over || game.rotateCooldown > 0;
      $('rotate-btn').textContent = game.rotateCooldown > 0 ? `Turn · ${Math.ceil(game.rotateCooldown)}s` : 'Turn petal';
      $('combo-label').textContent = game.splitCharge >= 1 ? 'Split ready!' : `Split ${Math.round(game.splitCharge * 6)}/6`;
      $('combo-meter').style.setProperty('--charge', `${game.splitCharge * 100}%`);
      $('combo-meter').classList.toggle('fever', game.splitReady);
      $('combo-meter').setAttribute('aria-label', 'Manual split charge');
      $('combo-meter').setAttribute('aria-valuenow', String(Math.round(game.splitCharge * 100)));
      $('guide-label').textContent = game.status === 'won' ? 'Cleared!' : game.status === 'lost' ? isDepth() ? 'Out of lives' : 'Run over' : game.fireCooldown > 0 ? 'Reloading' : game.balls.length >= 5 ? 'Max seeds' : 'Fire!';
      $('split-btn').disabled = !game.splitReady;
      $('split-btn').style.setProperty('--split-charge', `${game.splitCharge * 100}%`);
      $('split-btn').textContent = game.splitReady ? 'Split! +2' : game.splitCharge >= 1 ? game.balls.length ? 'No room' : 'Fire first' : `Split ${Math.round(game.splitCharge * 6)}/6`;
      canvas.dataset.sun = (game.sun || 0).toFixed(2); canvas.dataset.mult = game.mult || 1; canvas.dataset.superBloom = (game.superBloom || 0).toFixed(2);
      $('fever-banner').hidden = game.feverTime <= 0;
      $('fever-banner').textContent = 'Super Bloom!';
      $('fever-banner').setAttribute('aria-label', 'Super Bloom, double points');
      renderTray();
      return;
    }
    if ($('combo-label')) $('combo-label').textContent = game.combo ? `${game.combo} chain · ×${Math.min(10, 1 + Math.floor((game.combo - 1) / 5))}` : 'Chain blooms';
    if ($('combo-meter')) {
      $('combo-meter').style.setProperty('--charge', `${game.feverTime > 0 ? 100 : game.combo % 12 / 12 * 100}%`);
      $('combo-meter').classList.toggle('fever', game.feverTime > 0);
      $('combo-meter').setAttribute('aria-label', `${game.combo} consecutive blooms`);
      $('combo-meter').setAttribute('aria-valuenow', String(game.feverTime > 0 ? 100 : Math.round(game.combo % 12 / 12 * 100)));
    }
    if ($('guide-label')) $('guide-label').textContent = game.status === 'flying' ? `Steer ${Math.ceil(game.guideCharge * 100)}%` : '3 seeds a shot';
    if ($('fever-banner')) { $('fever-banner').hidden = game.feverTime <= 0; $('fever-banner').textContent = 'Super Bloom!'; }
  }
  const flowerIcons = new Map();
  function flowerGraphic(flower, locked = false) {
    if (!flowerIcons.has(flower.id)) {
      const icon = document.createElement('canvas'); icon.width = 300; icon.height = 336;
      const brush = icon.getContext('2d'); brush.scale(3, 3);
      brush.strokeStyle = '#29a77f'; brush.lineWidth = 2.2; brush.beginPath(); brush.moveTo(50, 45); brush.bezierCurveTo(41, 69, 44, 91, 53, 108); brush.stroke();
      brush.fillStyle = '#52cc87'; brush.beginPath(); brush.moveTo(47, 88); brush.bezierCurveTo(22, 85, 20, 68, 27, 70); brush.bezierCurveTo(39, 71, 45, 78, 47, 88); brush.fill();
      brush.fillStyle = '#25a78c'; brush.beginPath(); brush.moveTo(47, 95); brush.bezierCurveTo(70, 95, 81, 75, 73, 78); brush.bezierCurveTo(58, 79, 49, 86, 47, 95); brush.fill();
      BloomArt.drawFlower(brush, 50, 43, 23, flower.type, 1, 0);
      flowerIcons.set(flower.id, icon.toDataURL('image/png'));
    }
    return `<svg viewBox="0 0 100 112" aria-hidden="true" class="collection-flower" style="${locked ? 'filter:saturate(.18);opacity:.6' : ''}"><image href="${flowerIcons.get(flower.id)}" width="100" height="112"/></svg>`;
  }
  // The daily garden: one new layout a day. It pays seeds once per new star, and any four clears in a
  // Monday-to-Sunday week gather a bouquet. A missed day takes nothing away, and nothing counts down.
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let dailyDrawn = '';
  function renderDaily() {
    const level = BloomLevels.dailyLevel(localDate()), stars = save.daily[level.id]?.stars || 0;
    const week = BloomGarden.week(save.garden, level.id), { firstClear, perStar } = BloomGarden.daily;
    const source = levels.find(l => l.id === level.sourceLevelId);
    $('daily-eyebrow').textContent = WEEKDAYS[week.days.findIndex(d => d.today)];
    $('daily-status').innerHTML = !stars ? `${escape(source ? source.name : 'A favorite garden')}, remixed. Clear it for ${firstClear[0]}–${firstClear[2]} seeds.` : `<span class="daily-stars" aria-hidden="true">${starHTML(stars)}</span> ${stars < 3 ? `+${perStar} seeds per new star.` : 'New garden tomorrow.'}`;
    $('daily-week').innerHTML = week.days.map((d, i) => `<span class="${[d.stars ? 'bloomed' : '', d.today ? 'today' : '', d.future ? 'later' : ''].join(' ').trim()}"><i></i>${'MTWTFSS'[i]}</span>`).join('');
    $('daily-bouquet').textContent = week.claimed ? `Bouquet earned · +${week.seeds} seeds` : `Bouquet ${Math.min(week.cleared, week.goal)}/${week.goal} · +${week.seeds} seeds`;
    $('daily-btn').setAttribute('aria-label', `Play today's daily garden. ${stars ? `${stars} of 3 stars today.` : 'Not cleared yet.'} ${$('daily-bouquet').textContent}`);
    $('garden-btn').classList.toggle('has-daily', !stars);
    drawDailyBoard(level, stars > 0);
  }
  // A small map of today's layout; its buds open once the day is cleared.
  function drawDailyBoard(level, open) {
    const key = `${level.id}:${open}`; if (dailyDrawn === key) return; dailyDrawn = key;
    const board = $('daily-canvas'), brush = board.getContext('2d');
    brush.setTransform(board.width / 420, 0, 0, board.height / 560, 0, 0);
    BloomArt.drawGarden(brush, 420, 560, 'meadow');
    brush.lineCap = 'round'; brush.strokeStyle = '#2f9e7a'; brush.lineWidth = 12;
    for (const b of level.bumpers) {
      const dx = Math.cos(b.angle) * b.length / 2, dy = Math.sin(b.angle) * b.length / 2;
      brush.beginPath(); brush.moveTo(b.x - dx, b.y - dy); brush.lineTo(b.x + dx, b.y + dy); brush.stroke();
    }
    for (const bud of level.buds) BloomArt.drawFlower(brush, bud.x, bud.y, (bud.r || 16) * 1.3, bud.type, open ? 1 : 0, 0);
    brush.fillStyle = '#123d36'; brush.beginPath(); brush.arc(level.launcher.x, level.launcher.y, 16, 0, Math.PI * 2); brush.fill();
  }
  const lower = name => name.charAt(0).toLowerCase() + name.slice(1);
  const canSpend = data => data.plots.some(p => p.canPlant) || data.decor.some(d => d.canBuild);
  // One plain next step for the seeds just earned: a patch to grow first, then something to build.
  function nextGoal() {
    const data = BloomGarden.summary(save.garden), open = data.plots.filter(p => p.stage < 3), unbuilt = data.decor.filter(d => !d.built);
    if (data.complete) return 'Your meadow is complete!';
    const ready = [data.plots.find(p => p.selected), ...open].find(p => p && p.canPlant);
    if (ready) return `Enough to ${ready.stage ? 'grow' : 'plant'} ${ready.name} now.`;
    const piece = unbuilt.find(d => d.canBuild);
    if (piece) return `Enough to build the ${lower(piece.name)} now.`;
    const targets = [...open.map(p => ({ cost: p.nextCost, text: `${p.stage ? 'grow' : 'plant'} ${p.name}`, selected: p.selected })),
      ...unbuilt.map(d => ({ cost: d.cost, text: `build the ${lower(d.name)}` }))];
    const target = targets.find(t => t.selected) || targets.reduce((a, b) => b.cost < a.cost ? b : a);
    const need = target.cost - data.seeds;
    return `${need} more ${need === 1 ? 'seed' : 'seeds'} to ${target.text}.`;
  }
  // Three stems from the daily gardens, tied with a ribbon, drawn with the same flower art as play.
  let bouquetIcon = '';
  function bouquetGraphic() {
    if (!bouquetIcon) {
      const icon = document.createElement('canvas'); icon.width = 300; icon.height = 336;
      const brush = icon.getContext('2d'); brush.scale(3, 3);
      brush.strokeStyle = '#29a77f'; brush.lineWidth = 2.2; brush.lineCap = 'round';
      for (const [x, y] of [[27, 44], [50, 30], [73, 44]]) { brush.beginPath(); brush.moveTo(x, y); brush.quadraticCurveTo((x + 50) / 2, 78, 50, 106); brush.stroke(); }
      brush.fillStyle = '#52cc87';
      brush.beginPath(); brush.moveTo(46, 80); brush.bezierCurveTo(26, 78, 22, 64, 28, 65); brush.bezierCurveTo(38, 66, 44, 72, 46, 80); brush.fill();
      brush.beginPath(); brush.moveTo(54, 80); brush.bezierCurveTo(74, 78, 78, 64, 72, 65); brush.bezierCurveTo(62, 66, 56, 72, 54, 80); brush.fill();
      brush.fillStyle = '#ef7aa0';
      brush.beginPath(); brush.moveTo(50, 88); brush.bezierCurveTo(40, 80, 36, 92, 44, 93); brush.closePath(); brush.fill();
      brush.beginPath(); brush.moveTo(50, 88); brush.bezierCurveTo(60, 80, 64, 92, 56, 93); brush.closePath(); brush.fill();
      brush.beginPath(); brush.moveTo(49, 89); brush.lineTo(43, 104); brush.lineTo(47, 103); brush.lineTo(51, 90); brush.moveTo(51, 89); brush.lineTo(58, 103); brush.lineTo(54, 104); brush.lineTo(49, 90); brush.fill();
      brush.fillStyle = '#d65583'; brush.beginPath(); brush.arc(50, 88.5, 3, 0, Math.PI * 2); brush.fill();
      BloomArt.drawFlower(brush, 27, 44, 16, 'coral', 1, 0); BloomArt.drawFlower(brush, 73, 44, 16, 'lilac', 1, 0); BloomArt.drawFlower(brush, 50, 30, 19, 'gold', 1, 0);
      bouquetIcon = icon.toDataURL('image/png');
    }
    return `<svg viewBox="0 0 100 112" aria-hidden="true" class="collection-flower"><image href="${bouquetIcon}" width="100" height="112"/></svg>`;
  }
  function renderGarden() {
    renderMeadow(); renderDaily(); renderGoals();
    $('rush-best').textContent = save.rush.runs ? `Best ${fmt(save.rush.best)} · Wave ${save.rush.bestWave}` : 'Endless waves. Set your first best!';
    const rushLabel = isRush() && game.started && game.status !== 'lost' ? 'Resume Meadow Rush' : 'Play Meadow Rush';
    $('garden-rush-btn').setAttribute('aria-label', rushLabel);
    $('garden-rush-btn').querySelector('strong').textContent = rushLabel;
    $('level-grid').innerHTML = levels.map(level => {
      const data = save.progress[level.id], open = unlocked(level.id);
      return `<button class="level-card ${data?.stars ? 'completed' : ''} ${level.id === save.lastLevel ? 'current' : ''}" data-level="${level.id}" ${open ? '' : 'disabled'} aria-label="Garden ${level.id}, ${escape(level.name)}${open ? data?.stars ? `, ${data.stars} stars` : ', ready to play' : ', locked'}"><span class="level-number">${String(level.id).padStart(2, '0')}</span><span class="level-card-name">${escape(level.name)}</span><span class="level-stars" aria-hidden="true">${open ? starHTML(data?.stars || 0) : '<i class="level-lock"></i>'}</span></button>`;
    }).join('');
    const completed = Object.values(save.progress).filter(p => p.stars > 0).length;
    const total = Object.values(save.progress).reduce((n, p) => n + p.stars, 0);
    const summary = $('garden-summary'); if (summary) summary.textContent = `${completed}/${levels.length} · ${total} ★`;
  }
  // The level map on Play: a card per level showing a slice of its own scene, stacked the way the levels go down.
  const SCENE_SLICE = { meadow: 240, roots: 0, grotto: 350, crystal: 330, lake: 380, fossil: 390, ember: 370, geode: 10, briar: 10, core: 390 };
  const sceneSlices = new Map();
  function sceneSlice(level) {
    if (!sceneSlices.has(level.key)) {
      let url = '';
      try {
        const slice = document.createElement('canvas'); slice.width = 840; slice.height = 340;
        const brush = slice.getContext('2d'); brush.scale(2, 2); brush.translate(0, -(SCENE_SLICE[level.key] ?? 186));
        window.BloomScenery.paint(brush, `depth-${level.key}`, { frame: false });
        url = slice.toDataURL('image/jpeg', .9);
      } catch (_) { /* the card keeps its plain backing */ }
      sceneSlices.set(level.key, url);
    }
    return sceneSlices.get(level.key);
  }
  function renderLevels() {
    const list = Depths.levels, suggested = nextDepth();
    const cleared = list.filter(level => save.depths[level.id]?.stars).length, stars = list.reduce((n, level) => n + (save.depths[level.id]?.stars || 0), 0);
    $('levels-summary').textContent = cleared ? `${cleared} of ${Depths.total} cleared · ${stars} ★` : 'Start at the top and dig down.';
    const resume = inProgress();
    $('resume-btn').hidden = !resume;
    if (resume) {
      $('resume-title').textContent = isDepth() ? `Resume level ${game.plan.id}` : 'Resume Meadow Rush';
      $('resume-sub').textContent = isDepth() ? `${Depths.level(game.plan.id).name} · wave ${game.wave} of ${game.finalWave}` : `Wave ${game.wave} · ${fmt(game.score)} points`;
    }
    const owned = depthsOwned();
    $('depth-map').innerHTML = list.map(level => {
      const data = save.depths[level.id], open = depthOpen(level.id), paid = depthPaid(level.id), done = data?.stars || 0, next = open && !done && level.id === suggested;
      const taste = !paid && level.id === TASTE.level && tasteOpen(), fresh = (open || taste) && !done && level.id === freshDepth;
      const state = taste ? `First ${TASTE.waves} waves free` : !paid ? level.id === TASTE.level ? `Clear level ${level.id - 1} to try it free` : `Part of levels ${Depths.free + 1} to ${Depths.total}` : !open ? `Clear level ${level.id - 1} to open` : done ? `${done} of 3 stars` : data?.wave ? `Best: wave ${data.wave} of ${Depths.waveCount}` : 'Ready to play';
      const art = sceneSlice(level);
      return `<li class="depth-stop"><button class="depth-card${open || taste ? '' : ' locked'}${paid ? '' : ' paid'}${taste ? ' taste' : ''}${done ? ' cleared' : ''}${next || taste ? ' next' : ''}${fresh ? ' fresh' : ''}" type="button" data-depth="${level.id}" aria-label="Level ${level.id}, ${escape(level.name)}. ${escape(level.twist)}. ${state}.">`
        + `<span class="depth-window" aria-hidden="true">${art ? `<img class="depth-scene" src="${art}" alt="">` : ''}<span class="depth-badge">${level.id}</span>${fresh ? '<span class="depth-new">New!</span>' : ''}${open || taste ? '' : '<span class="depth-lock"><i class="level-lock"></i></span>'}</span>`
        + `<span class="depth-foot" aria-hidden="true"><span class="depth-copy"><strong>${escape(level.name)}</strong><span>${escape(taste ? state : open || !paid ? data?.wave && !done ? state : level.twist : state)}</span></span>`
        + (taste ? '<span class="depth-go">Try it</span>' : next ? '<span class="depth-go">Play</span>' : open ? `<span class="depth-stars">${starHTML(done)}</span>` : '') + '</span></button></li>'
        + (level.id === TASTE.level && !owned ? depthUnlockCard() : '');
    }).join('');
    // The first time the map shows a newly opened level, it brings that card into view.
    const freshCard = freshDepth && !freshShown && route === 'levels' ? $('depth-map').querySelector?.('.depth-card.fresh') : null;
    if (freshCard) { freshShown = true; freshCard.scrollIntoView({ behavior: 'auto', block: 'center' }); }
    $('levels-rush-best').textContent = save.rush.runs ? `Best ${fmt(save.rush.best)} · wave ${save.rush.bestWave}` : 'Endless waves. How far can you go?';
    renderPowerShelf();
  }
  // Powerups: four in a tray beside the Fire! sign in the levels and Meadow Rush, and a shelf on the Levels page.
  // Each one is drawn once by the board art and reused as a picture.
  const powerIcons = new Map();
  function powerIcon(id) {
    if (!powerIcons.has(id)) {
      let url = '';
      try {
        const icon = document.createElement('canvas'); icon.width = 132; icon.height = 132;
        BloomArt.drawPowerIcon(icon.getContext('2d'), id, 66, 68, 50, 0); url = icon.toDataURL('image/png');
      } catch (_) { /* the button keeps its label */ }
      powerIcons.set(id, url);
    }
    return powerIcons.get(id);
  }
  const TRAY = { 'power-left': ['sunburst', 'dandelion'], 'power-right': ['beeline', 'lullaby'] };
  let trayKey = '';
  function powerChip(id) {
    const def = Powers.byId[id], n = powerCount(id), armed = game.armed === id, playing = id === 'lullaby' && game.lullaby > 0;
    const label = `${def.name}, ${n} left. ${def.text}${armed ? ' Ready on your next shot.' : playing ? ' Playing now.' : ''}`;
    return `<button class="power-chip${armed ? ' armed' : playing ? ' active' : n ? '' : ' empty'}" type="button" data-power="${id}" aria-label="${escape(label)}" aria-pressed="${armed || playing}">`
      + `<img src="${powerIcon(id)}" alt=""><span class="power-count" aria-hidden="true">${n}</span></button>`;
  }
  function renderTray() {
    if (!isRush() || preview) return;
    const key = `${Powers.ids.map(powerCount).join()}|${game.armed}|${game.lullaby > 0}|${isTutorial()}`;
    if (key === trayKey) return;
    trayKey = key;
    for (const [group, ids] of Object.entries(TRAY)) $(group).innerHTML = ids.map(powerChip).join('');
  }
  // A shot powerup is only spent when the shot is fired; picking it again puts it back for free.
  function usePower(id) {
    const def = Powers.byId[id];
    if (!def || !isRush() || preview || game.over) return;
    BloomSound.wake();
    if (!gate(`power:${id}`)) { nudgeTutorial(); return; }
    if (def.shot && (game.armed === id || powerCount(id))) { if (game.arm(id)) { processEvents(); renderTray(); } return; }
    if (!powerCount(id)) { BloomSound.play('tap'); toast(`No ${def.name} left. Gift bubbles in the waves hold more.`); return; }
    if (!game.started) { BloomSound.play('tap'); toast('Fire your first seed, then use Lullaby.'); return; }
    if (game.lull()) { processEvents(); renderTray(); }
  }
  // The shelf says what each powerup does and how many you have. Once they are on sale in the app, each button
  // says exactly what it buys (one, five of that kind, or the bag with three of each) at the price the store
  // shows. Nothing is random, and nothing here appears during play.
  function renderPowerShelf() {
    const total = Powers.ids.reduce((n, id) => n + save.powers[id], 0);
    $('power-total').textContent = `${total} in your bag`;
    let selling = false;
    const buy = (product, label, aria, classes) => {
      const offer = offerFor(product);
      if (!offer.live || !offer.available) return '';
      selling = true;
      return `<button class="${classes}" type="button" data-buy="${product}" aria-label="${escape(aria)}${offer.price ? ` for ${escape(offer.price)}` : ''}">${label}${offer.price ? ` · ${escape(offer.price)}` : ''}</button>`;
    };
    const tiles = Powers.list.map(def => {
      const five = Powers.packs.find(pack => pack.single === def.id);
      return `<div class="power-tile panel"><img src="${powerIcon(def.id)}" alt=""><strong>${escape(def.name)}</strong><p>${escape(def.text)}</p><span class="power-have">You have ${save.powers[def.id]}</span>`
        + buy(def.product, 'Get 1', `Buy one ${def.name}`, 'unlock-btn power-buy')
        + (five ? buy(five.product, 'Get 5', `Buy five ${def.name}`, 'button-secondary power-buy power-five') : '') + '</div>';
    }).join('');
    const bag = Powers.packs.find(pack => !pack.single), each = bag && bag.contents[Powers.ids[0]];
    const bagBuy = bag ? buy(bag.product, 'Get the bag', `Buy the ${bag.name}: ${each} of each powerup`, 'unlock-btn power-buy') : '';
    const bagTile = bagBuy ? `<div class="power-bag panel"><span class="power-bag-icons" aria-hidden="true">${Powers.ids.map(id => `<img src="${powerIcon(id)}" alt="">`).join('')}</span>`
      + `<span class="power-bag-copy"><strong>${escape(bag.name)}</strong><span>${each} of each, ${Object.values(bag.contents).reduce((n, c) => n + c, 0)} in all.</span></span>${bagBuy}</div>` : '';
    const live = Boolean(store && store.isLive()), mode = store?.mode || 'web';
    const note = selling ? mode === 'mock' ? 'Test mode: nothing is charged.' : 'Each button buys exactly what it says.' : live ? 'Not on sale yet.' : 'You can buy more in the Bloomshot app.';
    $('power-shelf').innerHTML = `${tiles}${bagTile}<p class="power-note">${escape(note)} Gift bubbles in the waves hold more, free.</p>`;
  }
  // The store hands every powerup purchase here. It keeps the grant waiting in its own ledger until this returns
  // true (the store itself finishes the payment straight away), so a crash before saving is offered again next
  // launch. A purchase that comes back again is recognized by its transaction id and adds nothing.
  // A pack arrives as the store's list of items ([{ power, count }]), a set of powerups (`powers`), or just its
  // product id; whichever it is, everything in it is added together.
  const itemSet = items => Array.isArray(items) && items.length > 1 ? items.reduce((all, it) => ({ ...all, [it && it.power]: it && it.count }), {}) : null;
  function grantPower(info) {
    const set = info && !info.power ? itemSet(info.items) || info.powers || (Powers.byProduct[info.productId] ? null : Powers.contents(info.productId)) : null;
    const power = info && (info.power || Powers.byProduct[info.productId]?.id);
    const result = Powers.grant(save.powers, save.powerReceipts, set ? { powers: set, transaction: info.transaction } : { power, count: info && info.count, transaction: info && info.transaction });
    if (!result.ok) return false;
    if (!result.repeat) { save.powers = result.counts; save.powerReceipts = result.receipts; persist(); trayKey = ''; if (route === 'levels') renderPowerShelf(); }
    return storageAvailable;
  }
  if (store && typeof store.onConsumable === 'function') store.onConsumable(grantPower);
  // not-granted: the store saw a payment it could not match yet. It keeps it waiting and grants it on the next launch.
  const notBought = result => result.cancelled ? 'Purchase cancelled. Nothing was charged.' : result.reason === 'not-granted' ? 'Your purchase is being confirmed. It arrives the next time you open Bloomshot.' : "Purchase didn't go through. Nothing was charged.";
  async function buyPower(button) {
    const id = button.dataset.buy, contents = Powers.contents(id), product = contents && productInfo(id);
    if (!contents || !store || store.busy || !product || !product.available) return;
    const kinds = Object.keys(contents), count = kinds.reduce((n, kind) => n + contents[kind], 0), one = kinds.length === 1 ? Powers.byId[kinds[0]] : null;
    button.disabled = true; button.textContent = 'Opening the store…';
    const before = Powers.ids.map(kind => save.powers[kind]).join();
    let result;
    try { result = await store.purchase(id); } catch (_) { result = { ok: false }; }
    // A store that only reports the purchase (without handing it over first) still gets it counted, once.
    if (result.ok && Powers.ids.map(kind => save.powers[kind]).join() === before) grantPower({ productId: id, powers: contents, transaction: result.transaction });
    if (result.ok) { BloomSound.wake(); BloomSound.play('gift'); toast(one ? `+${count} ${one.name}! You have ${save.powers[one.id]}.` : `+${count} powerups! ${contents[kinds[0]]} of each.`); }
    else toast(result.pending ? `Your payment is waiting to clear. ${count === 1 ? `The ${one.name} arrives` : 'Your powerups arrive'} as soon as it does.` : notBought(result));
    renderPowerShelf();
  }
  // The unlock is described exactly: what it contains, the price the store reports, and that it is one payment.
  // It sits on the map between the free levels and the deeper ones, and nowhere interrupts play.
  function depthUnlockAction() {
    const offer = offerFor(Depths.product), range = `${Depths.free + 1} to ${Depths.total}`;
    let action;
    if (offer.live && offer.available) action = `<button class="button-primary unlock-btn" type="button" data-buy="${Depths.product}">Unlock levels ${range}${offer.price ? ` · ${escape(offer.price)}` : ''}</button>${bundleOffer()}<p class="unlock-fine">${offer.mode === 'mock' ? 'Test mode: nothing is charged.' : 'One payment. Restore it any time in Settings.'}</p>`;
    else if (offer.live) action = `<p class="unlock-fine">Not on sale yet. Levels 1 to ${Depths.free} are free to play now.</p>`;
    else action = `<p class="unlock-fine">Levels ${range} unlock in the Bloomshot app for iPhone, iPad and Android.</p>`;
    return action;
  }
  function depthUnlockCard() {
    const deeper = Depths.levels.filter(level => level.id > Depths.free), range = `${Depths.free + 1} to ${Depths.total}`, action = depthUnlockAction();
    return `<li class="depth-stop depth-more depth-unlock" id="depth-unlock"><span class="depth-more-art" aria-hidden="true">${DEEPER}</span><div class="depth-more-copy"><span class="card-tag gold">Levels ${range}</span><strong>${deeper.length} deeper levels</strong>`
      + `<p>From ${escape(deeper[0].name)} down to the ${escape(deeper.at(-1).name)}. Currents, turning shells, tunnels, geodes and briars, ten waves each. One-time purchase, no ads.</p>${action}</div></li>`;
  }
  // Under the free levels: rock layers, a fossil and a few crystals, drawn as flat shapes like the scenes.
  const DEEPER = '<svg viewBox="0 0 380 120" preserveAspectRatio="xMidYMid slice"><rect width="380" height="120" fill="#3a2b3d"/>'
    + '<path d="M0 0H380V30C330 22 300 38 250 33S170 22 120 30 40 38 0 28Z" fill="#6b4a36"/><path d="M0 28C40 38 80 30 120 30S170 22 250 33 330 22 380 30V36C330 30 300 44 250 40S170 30 120 37 40 44 0 35Z" fill="#4f3832"/>'
    + '<path d="M0 120V82C50 74 90 88 150 82S260 70 310 80 360 86 380 80V120Z" fill="#2a2036"/>'
    + '<g fill="#8a6a52" stroke="#3a2b3d" stroke-width="1.4"><ellipse cx="40" cy="16" rx="7" ry="4.5"/><ellipse cx="150" cy="12" rx="5" ry="3.4"/><ellipse cx="282" cy="18" rx="8" ry="5"/><ellipse cx="350" cy="10" rx="4" ry="3"/></g>'
    + '<g fill="none" stroke="#a48a75" stroke-width="2.4" stroke-linecap="round"><path d="M64 62a9 9 0 1 0 -9 -9a6 6 0 1 0 6 -6a3.5 3.5 0 1 0 -3 3"/><path d="M104 66h34M112 60v12M121 59v14M130 61v10"/><path d="M138 66l8-6v12Z" fill="#a48a75"/></g>'
    + '<g stroke="#20324f" stroke-width="1.6" stroke-linejoin="round"><path d="M300 98l7-24 7 24Z" fill="#7fe0ff"/><path d="M314 98l5-15 5 15Z" fill="#b9f6ff"/><path d="M290 98l4-11 4 11Z" fill="#a98cf5"/></g>'
    + '<g fill="#ffd979"><circle cx="190" cy="58" r="2.4"/><circle cx="214" cy="70" r="1.8"/><circle cx="168" cy="72" r="1.6"/></g>'
    + '<path d="M190 0C176 30 206 52 190 120" fill="none" stroke="#e8c48a" stroke-width="3" stroke-dasharray="7 8" stroke-linecap="round" opacity=".7"/></svg>';
  function renderMeadow() {
    const data = BloomGarden.summary(save.garden), selected = data.plots.find(p => p.selected);
    $('garden-seeds').textContent = fmt(data.seeds);
    $('meadow-summary').textContent = data.complete ? 'Your meadow is complete!' : !data.totalStages && !data.builtDecor ? data.seeds >= 4 ? 'Pick a patch and plant your first seeds.' : 'Pick a patch. Rush earns the seeds.' : `${data.completedPlots === 6 ? 'Full bloom' : `${data.totalStages}/18 grown`} · ${data.builtDecor}/${data.totalDecor} built`;
    $('garden-seeds').nextElementSibling.textContent = data.seeds === 1 ? 'seed' : 'seeds';
    if (!$('plot-markers').children.length) $('plot-markers').innerHTML = data.plots.map(plot => {
      const point = BloomMeadow.plots.find(p => p.id === plot.id);
      return `<button class="plot-marker" data-plot="${plot.id}" style="left:${point.x / 420 * 100}%;top:${(point.labelY - 34) / 330 * 100}%"><span>${escape(plot.name)}</span></button>`;
    }).join('');
    for (const plot of data.plots) {
      const button = $('plot-markers').querySelector(`[data-plot="${plot.id}"]`);
      button.setAttribute('aria-pressed', String(plot.selected));
      button.setAttribute('aria-label', `${plot.name}, ${plot.stageName}, stage ${plot.stage} of 3`);
    }
    $('plot-name').textContent = selected.name;
    $('plot-stage').textContent = selected.stage ? `${selected.stageName} · ${selected.stage}/3` : 'Ready to plant';
    $('plot-message').textContent = selected.description;
    $('plant-btn').disabled = !selected.canPlant;
    $('plant-btn').textContent = selected.stage === 3 ? 'In full bloom' : `${selected.stage ? 'Grow' : 'Plant'} · ${selected.nextCost} seeds`;
    $('garden-earning-hint').textContent = selected.stage === 3 ? data.completedPlots === 6 ? 'Every patch is in full bloom.' : 'Pick another patch to grow.' : !selected.canPlant ? `${selected.nextCost - data.seeds} more ${selected.nextCost - data.seeds === 1 ? 'seed' : 'seeds'} needed. Play a level to earn them.` : 'Earn seeds in levels, puzzles and the daily garden.';
    $('garden-btn').classList.toggle('has-seeds', canSpend(data));
    renderDecor(data); renderFriendSpots(data);
    meadowCanvas.dataset.seeds = data.seeds; meadowCanvas.dataset.stages = data.totalStages;
    meadowCanvas.dataset.selected = data.selectedId;
    meadowCanvas.setAttribute('aria-label', `Your meadow, ${data.totalStages} of 18 growth stages and ${data.builtDecor} of ${data.totalDecor} decorations. ${data.seeds} ${data.seeds === 1 ? 'seed' : 'seeds'} available. Choose a flower patch using the labeled buttons.`);
    meadowDirty = true;
  }
  // Six things to build with seeds. Each card shows the same art the meadow draws once it is built.
  const decorIcons = new Map();
  function decorIcon(id) {
    if (!decorIcons.has(id)) {
      const icon = document.createElement('canvas'); icon.width = 192; icon.height = 192;
      BloomMeadow.drawDecorIcon(icon.getContext('2d'), id, 192);
      decorIcons.set(id, icon.toDataURL('image/png'));
    }
    return decorIcons.get(id);
  }
  // Friends live on the map once their decoration is built; each has a tap target over it.
  function renderFriendSpots(data) {
    const spots = $('friend-spots');
    if (!spots.children.length) spots.innerHTML = data.decor.map(d => {
      const spot = BloomMeadow.friends.find(f => f.id === d.friend.id);
      return `<button class="friend-spot" type="button" data-friend="${d.friend.id}" style="left:${spot.x / 420 * 100}%;top:${spot.y / 330 * 100}%" aria-label="${escape(d.friend.name)} the ${d.friend.kind}. Say hi." hidden></button>`;
    }).join('');
    for (const d of data.decor) spots.querySelector(`[data-friend="${d.friend.id}"]`).hidden = !d.built;
  }
  function greetFriend(id) {
    const friend = BloomGarden.decor.map(d => d.friend).find(f => f.id === id), spot = BloomMeadow.friends.find(f => f.id === id);
    if (!friend || !spot) return;
    friendPokes[id] = performance.now(); meadowDirty = true;
    BloomSound.wake(); BloomSound.play('friend', { kind: friend.kind, x: spot.x }); haptic('tick');
    const bubble = $('friend-bubble');
    bubble.textContent = friend.says; bubble.style.left = `${spot.x / 420 * 100}%`; bubble.style.top = `${spot.y / 330 * 100}%`;
    bubble.hidden = false; bubble.classList.remove('pop');
    // Keep the bubble inside the map for friends near its edge; the tail still points at the friend.
    const mapWidth = bubble.parentElement.clientWidth, center = spot.x / 420 * mapWidth, half = bubble.offsetWidth / 2;
    const overLeft = 6 - (center - half), overRight = center + half - (mapWidth - 6);
    bubble.style.setProperty('--shift', `${Math.round(overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0)}px`);
    void bubble.offsetWidth; bubble.classList.add('pop');
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 1600);
    say(`${friend.name} says ${friend.says}`);
  }
  // Meadow friends in the Collection: met ones in color with a line about them, the rest as silhouettes.
  const friendIcons = new Map();
  function friendIcon(id, met) {
    const key = `${id}:${met}`;
    if (!friendIcons.has(key)) {
      const icon = document.createElement('canvas'); icon.width = 192; icon.height = 192;
      BloomMeadow.drawFriendIcon(icon.getContext('2d'), id, 192, met);
      friendIcons.set(key, icon.toDataURL('image/png'));
    }
    return friendIcons.get(key);
  }
  function renderFriends() {
    const data = BloomGarden.summary(save.garden);
    $('friend-count').textContent = `${data.builtDecor}/${data.totalDecor}`;
    $('friend-grid').innerHTML = data.decor.map(d => d.built
      ? `<button class="friend-card met" type="button" data-friend="${d.friend.id}" aria-label="${escape(d.friend.name)} the ${d.friend.kind}. ${escape(d.friend.about)} Say hi."><img class="friend-art" src="${friendIcon(d.friend.id, true)}" alt="" width="64" height="64"><strong>${escape(d.friend.name)}</strong><span class="friend-kind">${escape(d.friend.kind.charAt(0).toUpperCase() + d.friend.kind.slice(1))}</span><p>${escape(d.friend.about)}</p></button>`
      : `<article class="friend-card"><img class="friend-art" src="${friendIcon(d.friend.id, false)}" alt="" width="64" height="64"><strong>???</strong><p>Build the ${escape(lower(d.name))} to meet them.</p></article>`).join('');
  }
  function renderDecor(data) {
    $('decor-count').textContent = `${data.builtDecor}/${data.totalDecor} built`;
    const grid = $('decor-grid');
    if (!grid.children.length) grid.innerHTML = data.decor.map(d => `<button class="decor-card" type="button" data-decor="${d.id}"><img class="decor-art" src="${decorIcon(d.id)}" alt="" width="64" height="64"><strong>${escape(d.name)}</strong><span class="decor-price"></span></button>`).join('');
    for (const d of data.decor) {
      const card = grid.querySelector(`[data-decor="${d.id}"]`);
      card.classList.toggle('built', d.built); card.classList.toggle('ready', d.canBuild);
      if (d.built) card.setAttribute('aria-disabled', 'true'); else card.removeAttribute('aria-disabled');
      card.setAttribute('aria-label', `${d.name}. ${d.built ? 'Built.' : `${d.cost} seeds.`} ${d.description}`);
      card.querySelector('.decor-price').innerHTML = d.built ? 'Built!' : `<span class="purse-leaf" aria-hidden="true"></span>${d.cost}`;
    }
  }
  function drawMeadow(timestamp) {
    const progress = growth ? Math.min(1, (timestamp - growth.started) / 950) : 1;
    const pokes = {};
    for (const [id, at] of Object.entries(friendPokes)) { const seconds = (timestamp - at) / 1000; if (seconds >= 0 && seconds < BloomMeadow.reactSeconds) pokes[id] = seconds; }
    BloomMeadow.draw(meadowCtx, { width: 420, height: 330, state: save.garden, selectedId: save.garden.selectedId, time: timestamp / 1000, motion: save.settings.motion, growth: growth && { ...growth, progress }, pokes });
    if (growth && save.settings.motion && progress < 1) {
      const spot = growth.decorId && BloomMeadow.decor.find(d => d.id === growth.decorId);
      const point = spot ? { x: spot.icon[0], y: spot.icon[1], accent: spot.accent } : BloomMeadow.plots.find(p => p.id === growth.plotId);
      meadowCtx.save(); meadowCtx.globalAlpha = Math.sin(progress * Math.PI) * .8;
      for (let i = 0; i < 28; i++) {
        const a = i * 2.39996, radius = 8 + progress * (24 + i % 5 * 8);
        const x = point.x + Math.cos(a) * radius, y = point.y + Math.sin(a) * radius * .65 - progress * 16;
        meadowCtx.fillStyle = i % 3 ? '#fff5a5' : point.accent;
        meadowCtx.beginPath(); meadowCtx.ellipse(x, y, i % 3 ? 1.4 : 3, i % 3 ? 1.4 : 1.5, a + progress, 0, Math.PI * 2); meadowCtx.fill();
      }
      meadowCtx.restore();
    }
    if (progress >= 1 || !save.settings.motion) growth = null;
    meadowDirty = false; meadowFrame = timestamp;
  }
  function showSeeds() {
    const data = BloomGarden.summary(save.garden);
    $('garden-seeds').textContent = fmt(data.seeds); $('garden-seeds').nextElementSibling.textContent = data.seeds === 1 ? 'seed' : 'seeds';
    $('garden-btn').classList.toggle('has-seeds', canSpend(data));
  }
  function awardSeeds(reward) {
    const result = BloomGarden.grant(save.garden, { ...reward, runId, completed: true });
    save.garden = result.state; runAward = result.awarded; runBouquet = result.bouquet;
    showSeeds();
  }
  // Today's three goals pay through the garden like any reward, each with its own receipt for the day.
  function trackGoals(event) {
    const today = localDate(), result = Goals.record(save.goals, today, event), list = Goals.forDay(today);
    save.goals = result.state;
    let paid = 0;
    for (const slot of [...result.done, ...(result.bonus ? ['bonus'] : [])]) {
      const grant = BloomGarden.grant(save.garden, { mode: 'goal', completed: true, runId: `goal-${today}-${slot}`, day: today, slot });
      save.garden = grant.state; paid += grant.awarded;
    }
    if (paid) showSeeds();
    return { paid, finished: result.done.map(slot => list[slot]), bonus: result.bonus, done: result.state.done.filter(Boolean).length };
  }
  const goalNews = goals => goals.bonus ? `All 3 goals done! +${BloomGarden.daily.goalBonus} bonus seeds.` : goals.finished.length > 1 ? `${goals.finished.length} goals done!` : `Goal done! ${goals.finished[0].text}.`;
  const starry = text => escape(text).replace(/★+/g, stars => `<span class="goal-stars">${stars}</span>`);
  function renderGoals() {
    const today = localDate(), data = Goals.summary(save.goals, today), seeds = BloomGarden.daily.goalSeeds;
    $('goals-count').textContent = `${data.done}/3 done`;
    $('goals-list').innerHTML = data.goals.map(g => `<li><button class="goal${g.done ? ' done' : ''}" type="button" data-goal="${g.play}"${g.done ? ' aria-disabled="true"' : ''} aria-label="${escape(g.text)}. ${g.done ? 'Done.' : `${g.progress} of ${g.target}. Earns ${seeds} seeds.`}"><span class="goal-check" aria-hidden="true"></span><span class="goal-copy"><span class="goal-line"><span class="goal-text">${starry(g.text)}</span>${g.target > 1 && !g.done ? `<span class="goal-count">${g.progress}/${g.target}</span>` : ''}</span><span class="goal-bar" aria-hidden="true"><i style="width:${Math.round(g.progress / g.target * 100)}%"></i></span></span><span class="goal-reward" aria-hidden="true">${g.done ? 'Done!' : `<span class="purse-leaf"></span>+${seeds}`}</span></button></li>`).join('');
    $('goals-bonus').textContent = data.bonus ? 'All done! New goals tomorrow.' : `Finish all 3 for +${BloomGarden.daily.goalBonus} bonus seeds.`;
  }
  function renderCollection() {
    $('collection-grid').innerHTML = flowers.map(flower => {
      const has = earned(flower);
      return `<article class="flower-card ${has ? 'unlocked' : 'locked'}">${flowerGraphic(flower, !has)}<span class="flower-index">#${flowers.indexOf(flower) + 1}</span><h3>${has ? escape(flower.name) : '???'}</h3><p>${has ? escape(flower.description) : `Clear garden ${flower.unlockLevel} to find it.`}</p><span class="flower-status">${has ? 'Found!' : `Garden ${flower.unlockLevel}`}</span></article>`;
    }).join('');
    const summary = $('collection-summary'); if (summary) summary.textContent = `${flowers.filter(earned).length} of ${flowers.length} flowers found`;
    renderKeepsakes(); renderFriends();
  }
  // Garden Keepsakes shelf: every style can be previewed in motion before it is earned or bought.
  let keepsakePreview = null;
  const keepsakeIcons = new Map();
  function keepsakeGraphic(style) {
    if (!keepsakeIcons.has(style.id)) {
      const icon = document.createElement('canvas'); icon.width = 240; icon.height = 240;
      const brush = icon.getContext('2d'); brush.scale(4, 4);
      // A real seed mid-flight on a short arc, drawn by the same code as play.
      const trail = Array.from({ length: 16 }, (_, i) => { const u = i / 15; return { x: 6 + u * 34 + Math.sin(u * 3) * 3, y: 54 - u * 34 - Math.sin(u * Math.PI) * 6 }; });
      const ball = { x: 41, y: 20, r: 7.4, type: 'coral', trail };
      BloomArt.drawProjectile(brush, ball, 0, .6, false, false, style.seed ? style : null);
      keepsakeIcons.set(style.id, icon.toDataURL('image/png'));
    }
    return `<img class="keepsake-swatch" src="${keepsakeIcons.get(style.id)}" alt="" width="60" height="60">`;
  }
  function keepsakeStatus(style, open, worn) {
    if (worn) return 'Wearing';
    if (open) return 'Tap to wear';
    if (style.source === 'earned') return `Moon ${BloomMoon.levels.filter(level => save.moon[level.id]?.stars > 0).length}/${BloomMoon.levels.length}`;
    return 'Collection';
  }
  function keepsakeOfferPanel() {
    if (collectionOwned()) return '';
    const offer = offerFor(Keepsakes.product);
    let action;
    if (offer.live && offer.available) action = `<button class="button-primary unlock-btn" type="button" data-buy="${Keepsakes.product}">Get all three${offer.price ? ` · ${escape(offer.price)}` : ''}</button>${bundleOffer()}<p class="unlock-fine">${offer.mode === 'mock' ? 'Test mode: nothing is charged.' : 'One payment. Restore it any time in Settings.'}</p>`;
    else if (offer.live) action = '<p class="unlock-fine">Not on sale yet. You can still preview every style.</p>';
    else action = '<p class="unlock-fine">Available in the Bloomshot app for iPhone, iPad and Android.</p>';
    return `<div class="unlock-panel keepsake-offer"><div class="unlock-copy"><span class="card-tag">Keepsake Collection</span><strong>Three seed styles</strong><p>Sakura Breeze, Firefly Night and Gilded Leaf. Each changes your seed, its trail and your blooms. Looks only: every shot flies the same.</p>${action}</div></div>`;
  }
  function renderKeepsakes() {
    if (!$('keepsake-grid')) return;
    const context = keepsakeContext(), worn = currentKeepsake();
    const shown = Keepsakes.byId[keepsakePreview] || worn;
    $('keepsake-grid').innerHTML = Keepsakes.styles.map(style => {
      const open = Keepsakes.unlocked(style.id, context), wearing = style.id === worn.id;
      const where = wearing ? 'wearing now' : open ? 'unlocked' : style.source === 'earned' ? 'earned by clearing the Moon Garden' : 'part of the Keepsake Collection';
      return `<button class="keepsake-card${wearing ? ' worn' : ''}${open ? '' : ' locked'}" type="button" data-keepsake="${style.id}" aria-pressed="${style.id === shown.id}" aria-label="${escape(style.name)}, ${where}">${keepsakeGraphic(style)}<span class="keepsake-name">${escape(style.name)}</span><span class="keepsake-status">${keepsakeStatus(style, open, wearing)}</span></button>`;
    }).join('');
    const open = Keepsakes.unlocked(shown.id, context);
    const note = shown.id === worn.id ? 'On your seed now.' : open ? 'Yours to wear.' : shown.source === 'earned' ? `Earned, never sold. ${shown.requirement}` : 'Preview. Part of the Keepsake Collection.';
    $('keepsake-caption').innerHTML = `<strong>${escape(shown.name)}</strong><p>${escape(shown.blurb)}</p><span class="keepsake-note">${escape(note)}</span>`;
    $('keepsake-offer').innerHTML = keepsakeOfferPanel();
    $('keepsake-canvas').setAttribute('aria-label', `Preview of the ${shown.name} seed style: a seed flies to a bud and blooms.`);
  }
  function chooseKeepsake(id) {
    const style = Keepsakes.byId[id]; if (!style) return;
    BloomSound.wake(); keepsakePreview = id; showcase.t = 0; showcase.dirty = true;
    if (keepsakeOpen(id) && save.keepsake !== id) {
      save.keepsake = id; persist(); BloomSound.play('tap');
      toast(`Wearing ${style.name}!`);
    }
    renderKeepsakes();
  }
  // The shelf's moving preview: a seed arcs to a bud, blooms, and the loop repeats.
  const showcase = { t: 0, last: 0, particles: [], trail: [], bloomed: 0, style: '', dirty: true };
  // The scene is drawn 1.5x closer than the board so each style's trail and burst read clearly.
  const SHOW = { zoom: 1.5, loop: 3, launch: .3, flight: 1, from: { x: 46, y: 106 }, peak: { x: 112, y: 0 }, bud: { x: 214, y: 54, r: 17 } };
  const SHOW_BUD = { sakura: 'lilac', firefly: 'lilac', gilded: 'lilac' };
  function showcasePoint(u) {
    const a = SHOW.from, c = SHOW.peak, b = SHOW.bud, v = 1 - u;
    return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
  }
  function drawShowcase(timestamp) {
    const surface = $('keepsake-canvas'); if (!surface) return;
    const motion = save.settings.motion, style = Keepsakes.byId[keepsakePreview] || currentKeepsake();
    if (style.id !== showcase.style) { showcase.style = style.id; showcase.t = 0; showcase.particles = []; showcase.dirty = true; }
    if (!motion && !showcase.dirty) return;
    const dt = showcase.last ? Math.min(.06, (timestamp - showcase.last) / 1000) : 0; showcase.last = timestamp;
    const s = showcase, time = timestamp / 1000;
    if (!motion) { s.t = SHOW.launch + SHOW.flight * .92; s.particles = []; }
    else { s.t += dt; if (s.t >= SHOW.loop) s.t = 0; }
    if (s.t < SHOW.launch) { s.trail = []; s.bloomed = 0; }
    const u = (s.t - SHOW.launch) / SHOW.flight, flying = u >= 0 && u < 1;
    if (flying) { const p = showcasePoint(u); s.trail.push(p); if (s.trail.length > 26) s.trail.shift(); }
    if (motion && u >= 1 && !s.bloomed) {
      // The shelf leans on the style's own particles so the difference between styles is easy to see.
      s.bloomed = s.t; burst({ ...SHOW.bud, type: SHOW_BUD[style.id] || 'coral' }, style.burst ? 16 : 40, s.particles, style);
      if (style.burst) for (const p of Keepsakes.burstExtras(style, SHOW.bud.x, SHOW.bud.y, 60)) { p.size *= 1.35; s.particles.push(p); }
    }
    s.particles = stepParticles(s.particles, dt, 4, 276, 122);
    const dpr = Math.min(devicePixelRatio || 1, 2.5), w = Math.round(420 * dpr), h = Math.round(190 * dpr);
    if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h; }
    const brush = surface.getContext('2d'); brush.setTransform(dpr, 0, 0, dpr, 0, 0);
    brush.save(); brush.beginPath(); brush.rect(0, 0, 420, 190); brush.clip();
    brush.translate(-18, -392); BloomArt.drawGarden(brush, 456, 608, 'meadow', {}); brush.restore();
    brush.setTransform(dpr * SHOW.zoom, 0, 0, dpr * SHOW.zoom, 0, 0);
    // Launcher ring, then the bud (opening once struck), then the seed and its burst.
    brush.save(); brush.globalAlpha = .9; brush.fillStyle = 'rgba(214,255,238,.85)'; brush.strokeStyle = '#ffffff'; brush.lineWidth = 1.5;
    brush.beginPath(); brush.arc(SHOW.from.x, SHOW.from.y, 12, 0, Math.PI * 2); brush.fill(); brush.stroke(); brush.restore();
    const openness = s.bloomed ? Math.min(1, (s.t - s.bloomed) / .5) : 0;
    BloomArt.drawFlower(brush, SHOW.bud.x, SHOW.bud.y, SHOW.bud.r, SHOW_BUD[style.id] || 'coral', openness, time);
    if (!flying && (s.t < SHOW.launch || s.t > SHOW.loop - .6)) BloomArt.drawSeed(brush, SHOW.from.x, SHOW.from.y, 6.2, time, false, style.seed ? style : null);
    if (flying || !motion) {
      const head = showcasePoint(Math.min(1, Math.max(0, u)));
      BloomArt.drawProjectile(brush, { x: head.x, y: head.y, r: 6, type: 'coral', trail: s.trail }, 0, time, !motion, false, style.seed ? style : null);
    }
    for (const p of s.particles) BloomArt.drawParticle(brush, p, time, !motion);
    showcase.dirty = false;
  }
  const worldImages = new Map();
  // Each world card shows a slice of that world's own painted board, with a few of its flowers or koi in front.
  const WORLD_SLICE = { meadow: 232, moon: 238, koi: 96 };
  function worldArt(world) {
    if (!worldImages.has(world.id)) {
      const surface = document.createElement('canvas'); surface.width = 720; surface.height = 340;
      const brush = surface.getContext('2d'); brush.scale(2, 2);
      const moon = world.id === 'moon', koi = world.id === 'koi', theme = moon ? 'moon' : koi ? 'koi' : 'meadow', painter = window.BloomScenery;
      if (painter && painter.garden && painter.garden(theme)) {
        brush.save(); brush.scale(360 / 420, 360 / 420); brush.translate(0, -WORLD_SLICE[theme]); painter.paintGarden(brush, theme, false, false); brush.restore();
      } else {
        const sky = brush.createLinearGradient(0, 0, 360, 170);
        sky.addColorStop(0, moon ? '#292253' : koi ? '#8fefe4' : '#b6eef8'); sky.addColorStop(1, moon ? '#7056a2' : koi ? '#5dbecd' : '#e0f8d3');
        brush.fillStyle = sky; brush.fillRect(0, 0, 360, 170);
      }
      if (moon) BloomArt.drawMoon(brush, 300, 40, 22);
      if (koi) {
        if (BloomArt.koiFish) for (const [x, y, a, size, palette] of [[150, 104, -.35, 22, ['#f0552f', '#ffb48a']], [252, 64, 2.7, 18, ['#ffffff', '#ffe7c7']], [104, 150, .15, 15, ['#f7a21b', '#ffe3a1']]]) {
          brush.save(); brush.globalAlpha = .22; brush.fillStyle = '#0b5e63'; brush.beginPath(); brush.ellipse(x + 4, y + 6, size, size * .4, a, 0, Math.PI * 2); brush.fill(); brush.restore();
          BloomArt.koiFish(brush, x, y, a, .4, size, palette);
        }
      } else for (const [x, y, r, type] of moon ? [[166, 98, 21, 'lilac'], [318, 126, 19, 'coral']] : [[58, 100, 23, 'coral'], [312, 120, 21, 'gold']]) {
        brush.strokeStyle = moon ? '#5de0c7' : '#209f83'; brush.lineWidth = 3;
        brush.beginPath(); brush.moveTo(x + 8, 180); brush.quadraticCurveTo(x - 15, y + 45, x, y); brush.stroke();
        brush.save(); brush.translate(x, y + 43); brush.rotate(-.55);
        brush.fillStyle = moon ? '#45bdb6' : '#45c69a'; brush.beginPath(); brush.ellipse(-12, 0, 18, 6, 0, 0, Math.PI * 2); brush.fill(); brush.restore();
        BloomArt.drawFlower(brush, x, y, r, type, 1, 0);
      }
      worldImages.set(world.id, surface.toDataURL('image/png'));
    }
    return `<svg viewBox="0 0 360 170" aria-hidden="true"><image href="${worldImages.get(world.id)}" width="360" height="170"/></svg>`;
  }
  function chapterEyebrow(world) {
    const cleared = Object.values(save[world.id]).filter(p => p.stars > 0).length, total = chapters[world.id].levels.length;
    if (world.id === 'koi') return `${koiOwned() ? 'Unlocked' : `${BloomKoi.freeBoards} free`} · ${cleared}/${total}`;
    return `Free · ${cleared}/${total}`;
  }
  function renderWorlds() {
    $('worlds-grid').innerHTML = worlds.map(world => {
      const chapter = Boolean(chapters[world.id]);
      const tag = chapter ? chapterEyebrow(world) : world.available ? `Free · ${Object.values(save.progress).filter(p => p.stars > 0).length}/${levels.length}` : 'Coming soon';
      const action = chapter ? 'Enter' : world.available ? 'Play' : 'Peek';
      return `<button class="world-card ${world.id}" data-world="${world.id}"><span class="world-art">${worldArt(world)}</span><span class="world-card-body"><span class="card-tag ${world.id}">${tag}</span><span class="world-card-title">${escape(world.name)}</span><span class="world-card-desc">${escape(world.tagline)}</span><span class="world-card-action">${action}</span></span></button>`;
    }).join('');
  }
  // The unlock is described exactly: what it contains, the price the store reports, and that it is one purchase.
  function koiUnlockPanel() {
    if (koiOwned()) return '';
    const offer = offerFor(BloomKoi.product), paid = BloomKoi.levels.filter(level => !level.free).length;
    let action;
    if (offer.live && offer.available) action = `<button class="button-primary unlock-btn" type="button" data-buy="${BloomKoi.product}">Unlock all ${BloomKoi.levels.length} pools${offer.price ? ` · ${escape(offer.price)}` : ''}</button>${bundleOffer()}<p class="unlock-fine">${offer.mode === 'mock' ? 'Test mode: nothing is charged.' : 'One payment. Restore it any time in Settings.'}</p>`;
    else if (offer.live) action = `<p class="unlock-fine">Not on sale yet. Your free pools are open now.</p>`;
    else action = `<p class="unlock-fine">Pools ${BloomKoi.freeBoards + 1}–${BloomKoi.levels.length} unlock in the Bloomshot app for iPhone, iPad and Android.</p>`;
    return `<div class="unlock-panel" id="koi-unlock"><div class="unlock-copy"><span class="card-tag koi">Full Conservatory</span><strong>${paid} more pools</strong><p>Whirlpools, a waterfall, a reed maze and a moonlit finale. One-time purchase, no ads.</p>${action}</div></div>`;
  }
  function renderChapter(world) {
    const id = world.id, chapter = chapters[id], koi = id === 'koi', records = save[id];
    const rows = chapter.levels.map((level, index) => {
      const paid = trialPaid(id, level), open = paid && trialCleared(id, index), stars = records[level.id]?.stars || 0;
      const state = !paid ? 'included with the full Koi Conservatory' : open ? `${stars} stars` : 'locked';
      const tag = koi && level.free && !koiOwned() ? '<small class="free-tag">Free</small>' : '';
      return `<button class="moon-trial${paid ? '' : ' paid-lock'}" data-trial="${level.id}" data-chapter="${id}" ${open || !paid ? '' : 'disabled'} aria-label="${koi ? 'Koi pool' : 'Moon trial'} ${index + 1}, ${escape(level.name)}, ${state}"><span class="moon-trial-number">${String(index + 1).padStart(2, '0')}</span><span class="moon-trial-name">${escape(level.name)}${tag}</span><span class="moon-trial-stars" aria-hidden="true">${!paid ? '❀' : open ? starHTML(stars) : '<i class="level-lock"></i>'}</span></button>`;
    }).join('');
    const intro = koi
      ? `<span class="card-tag koi">${koiOwned() ? `All ${chapter.levels.length} pools` : `${BloomKoi.freeBoards} free pools`}</span><h2>Koi Conservatory</h2><p>${escape(world.description)}</p><p class="moon-route-hint koi-hint">Your aim line bends with the water, so you see the curve before you shoot.</p>`
      : `<span class="card-tag moon">Free · ${chapter.levels.length} trials</span><h2>Moon Garden</h2><p>${escape(world.description)}</p><p class="moon-route-hint">Gates come in pairs. Your aim line shows where you pop out.</p><p class="keepsake-hint">${Keepsakes.moonCleared(save.moon, BloomMoon.levels) ? 'Moonlit seed earned! Wear it from your Collection.' : `Clear all ${chapter.levels.length} to earn the Moonlit seed.`}</p>`;
    $('world-detail').innerHTML = `<div class="world-preview-art">${worldArt(world)}</div>${intro}<div class="moon-trail${koi ? ' koi-trail' : ''}" role="group" aria-label="${koi ? 'Koi Conservatory pools' : 'Moon Garden trials'}">${rows}</div>${koi ? koiUnlockPanel() : ''}`;
    const openIndexes = chapter.levels.map((_, index) => index).filter(index => trialOpen(id, index));
    const fresh = openIndexes.find(index => !records[chapter.levels[index].id]?.stars);
    const next = chapter.levels[fresh ?? openIndexes.at(-1) ?? 0];
    $('world-preview-btn').textContent = `${fresh === undefined ? 'Replay' : 'Play'} ${next.name}`;
    $('world-preview-btn').dataset.trial = next.id;
  }
  function openWorld(id) {
    const world = worlds.find(w => w.id === id); if (!world) return;
    if (world.id === 'meadow') { startLevel(levels.find(l => l.id === save.lastLevel) || levels[0]); return; }
    currentWorld = world;
    if (chapters[world.id]) { renderChapter(world); showDialog('world-dialog'); return; }
    delete $('world-preview-btn').dataset.trial;
    $('world-detail').innerHTML = `<div class="world-preview-art">${worldArt(world)}</div><span class="card-tag gold">Coming soon</span><h2>${escape(world.name)}</h2><p>${escape(world.description)}</p><div class="world-mechanic"><strong>How it plays</strong><p>${escape(world.mechanic)}</p></div><p class="preview-note">Still being built. The preview shows its colors on a meadow board.</p>`;
    $('world-preview-btn').textContent = 'Play a preview';
    showDialog('world-dialog');
  }
  const PURCHASES = {
    [BloomKoi.product]: { thanks: 'Koi Conservatory unlocked! Six new pools.' },
    [Keepsakes.product]: { thanks: 'Keepsake Collection unlocked! Three new styles.' },
    [BUNDLE]: { thanks: () => `Complete Garden unlocked! Levels ${Depths.free + 1} to ${Depths.total}, Koi pools and seed styles are yours.` },
    [Depths.product]: { thanks: () => `Levels ${Depths.free + 1} to ${Depths.total} unlocked! ${depthOpen(Depths.free + 1) ? `${Depths.level(Depths.free + 1).name} is open.` : `Clear level ${Depths.free} to head down.`}` }
  };
  async function buyProduct(button) {
    if (Powers.contents(button.dataset.buy)) { buyPower(button); return; }
    const id = button.dataset.buy, item = PURCHASES[id];
    const product = productInfo(id);
    if (!item || !store || store.busy || !product || product.owned || product.partial) return;
    button.disabled = true; button.textContent = 'Opening the store…';
    let result;
    try { result = await store.purchase(id); } catch (_) { result = { ok: false }; }
    if (result.ok) {
      BloomSound.wake(); BloomSound.play('won'); toast(typeof item.thanks === 'function' ? item.thanks() : item.thanks);
      // Buying while previewing a style puts that style on the seed straight away.
      if ((id === Keepsakes.product || id === BUNDLE) && keepsakePreview && keepsakeOpen(keepsakePreview)) { save.keepsake = keepsakePreview; persist(); }
    } else toast(result.pending ? 'Your payment is waiting to clear. It unlocks as soon as it does.' : notBought(result));
    refreshStoreViews();
  }
  function refreshStoreViews() {
    if (route === 'worlds') renderWorlds();
    if (route === 'collection') renderKeepsakes();
    if (route === 'levels') renderLevels();
    if (currentWorld && chapters[currentWorld.id] && $('world-dialog').open) renderChapter(currentWorld);
    if (game && isTaste() && $('result-dialog').open) renderTasteOffer(game.status === 'won');
  }
  if (store) store.subscribe(refreshStoreViews);
  // The stage. A level opens on a ribbon between two leafy curtains, every wave tumbles in, a cleared wave's
  // blooms fly into the score as a harvest of light, and a big bloom drops in with its name and a health vine.
  // It is all presentation kept on the game object (game.stage, game.harvest and the buds' enter fields, which
  // art.js reads); hitboxes never move and the engine never waits for any of it.
  const STAGE = { plops: 8, plopGap: .04, introDelay: .2, harvest: 24, orbGap: .03, orbTime: .55 };
  const ORB_COLORS = { coral: '#ff5d94', gold: '#ffd148', lilac: '#a47dff', sky: '#45adff', poppy: '#ff7433' };
  // How far into its entry a bud first touches down: easeOutBack(1.4) crosses 1 at 1/2.4, easeOutBounce at 1/2.75.
  const TOUCHDOWN = { back: 1 / 2.4, bounce: 1 / 2.75 };
  const stage = { game: null, plops: [], plopAt: -1, plopIndex: 0, land: null, entering: [] };
  // Depth levels and endless Rush get the show; the tutorial and the calm boards never do.
  const staged = () => isRush() && !isTutorial() && !preview;
  const stageLevel = () => isDepth() ? game.plan.id : 0;
  function stageFrame(dt) {
    if (game !== stage.game) {
      stage.game = game; stage.plops = []; stage.plopAt = -1; stage.land = null; stage.entering = [];
      // A game picked up again (after a preview) already had its intro.
      if (staged() && !game.stage) { intro(); bossIntro(null); }
    }
    if (!game.stage) return;
    const held = narrowLandscape.matches || dialogs.some(id => $(id).open);
    if (!held && game.harvest && game.harvest.length) stepHarvest(dt);
    if (game.stage.glow > 0) game.stage.glow = Math.max(0, game.stage.glow - dt * 2.6);
    // Each tumbling bud lands with a soft plop, at most eight a wave and never closer than 40 ms.
    const plop = stage.plops[0];
    if (plop && game.time >= plop.at && game.time - stage.plopAt >= STAGE.plopGap - 1e-6) {
      stage.plops.shift(); stage.plopAt = game.time; BloomSound.play('plop', { i: plop.i, x: plop.x });
    }
    if (stage.land && game.time >= stage.land.at) bossLand();
    const vine = game.stage.vine;
    if (vine) {
      const hp = vine.bud.bloomed ? 0 : Math.max(0, vine.bud.hp);
      // Each lost leaf falls off the vine; a lighter stretch of stem shows the damage, then shrinks in .4 s.
      if (hp < vine.hp) {
        for (let i = vine.hp - 1; i >= hp; i--) vine.fallen.push({ i, at: game.time, spin: i % 2 ? 1 : -1 });
        vine.hp = hp; vine.lagHold = .1; vine.lagSpeed = (vine.lag - hp) / .4;
      }
      if (vine.lagHold > 0) vine.lagHold -= dt;
      else if (vine.lag > vine.hp) vine.lag = Math.max(vine.hp, vine.lag - vine.lagSpeed * dt);
      if (vine.fallen.length && game.time - vine.fallen[0].at > 1) vine.fallen = vine.fallen.filter(leaf => game.time - leaf.at <= 1);
    }
    // Once a bud has landed its enter fields go, so a later respawn (a regrown briar, a boss climbing back) pops in as before.
    if (stage.entering.length && game.time > stage.entering[0].doneAt) {
      stage.entering = stage.entering.filter(item => {
        if (game.time <= item.doneAt) return true;
        if (item.bud.enterAt === item.at) { delete item.bud.enterAt; delete item.bud.enterDrop; delete item.bud.enterDur; delete item.bud.enterBounce; }
        return false;
      });
    }
  }
  // The opening: 'Level 4' and the level's name on a ribbon, the curtains part, and the first wave tumbles in.
  function intro() {
    const depth = isDepth() ? Depths.level(game.plan.id) : null;
    game.stage = { introAt: game.time, glow: 0 };
    game.floaters.push({ kind: 'title', x: 210, y: 210, life: 1.2, maxLife: 1.2, text: depth ? `Level ${depth.id}` : 'Rush', label: depth ? depth.name : 'how long can you last?' });
    BloomSound.play('intro', { level: stageLevel(), boss: false });
    tumble(STAGE.introDelay);
  }
  // A new wave's buds drop in from just above, left to right, all within .35 s. Only the drawing moves.
  function tumble(delay = 0) {
    if (!save.settings.motion) return;
    const list = game.buds.filter(bud => !bud.bloomed && !bud.boss && !bud.gift).sort((a, b) => a.x - b.x), n = list.length;
    if (!n) return;
    const gap = Math.min(.035, .35 / n), every = Math.max(Math.ceil(n / STAGE.plops), Math.ceil(STAGE.plopGap / gap - 1e-6));
    stage.plops = []; stage.plopAt = -1;
    list.forEach((bud, i) => {
      bud.enterAt = game.time + delay + i * gap; bud.enterDrop = 48; bud.enterDur = .4; delete bud.enterBounce;
      if (i % every === 0 && stage.plops.length < STAGE.plops) stage.plops.push({ at: bud.enterAt + bud.enterDur * TOUCHDOWN.back, i: stage.plops.length, x: bud.x });
      stage.entering.push({ bud, at: bud.enterAt, doneAt: bud.enterAt + bud.enterDur + .1 });
    });
    stage.entering.sort((a, b) => a.doneAt - b.doneAt);
  }
  // A cleared wave cashes in: up to 24 of its blooms, latest first, fly into the score as orbs of light.
  function startHarvest() {
    const blooms = game.buds.filter(bud => bud.bloomed && !bud.gift).sort((a, b) => b.bloomAt - a.bloomAt).slice(0, STAGE.harvest);
    if (!blooms.length) return;
    if (!save.settings.motion) { BloomSound.play('pluck', { i: 0, n: 1 }); return; }
    if (!game.stage) game.stage = { glow: 0 };
    const n = blooms.length, orbs = blooms.map((bud, i) => ({ x: bud.x, y: bud.y, bud, color: ORB_COLORS[bud.type] || ORB_COLORS.gold, delay: i * STAGE.orbGap, dur: STAGE.orbTime, t: 0, i, n }));
    game.harvest = (game.harvest || []).concat(orbs);
  }
  // Orbs fly on real time, so a slow-motion finale or a hit-stop never strands them mid-air.
  function stepHarvest(dt) {
    let kept = 0;
    for (const orb of game.harvest) {
      orb.t += dt;
      // Spent flowers keep drifting down (fast in a late Rush wave), so an orb sits on its flower until it lifts off.
      if (orb.t < orb.delay && orb.bud) { orb.x = orb.bud.x; orb.y = orb.bud.y; }
      if (orb.t < orb.delay + orb.dur) { game.harvest[kept++] = orb; continue; }
      bumpScore(); game.stage.glow = Math.min(1, (game.stage.glow || 0) + .35);
      if (orb.i < 12 || (orb.i - 12) % 3 === 0) BloomSound.play('pluck', { i: orb.i, n: orb.n });
    }
    game.harvest.length = kept;
  }
  // A big bloom drops in from high above, lands with a thud, and its name card and health vine come up.
  function bossIntro(event) {
    const boss = game.buds.find(bud => bud.boss && !bud.bloomed);
    if (!boss) return;
    const name = (event && event.bossName) || boss.name || 'Big bloom', max = Math.max(1, boss.maxHp || boss.hp || 1);
    if (!game.stage) game.stage = { glow: 0 };
    game.stage.vine = { bud: boss, name, max, hp: Math.max(0, boss.hp), lag: Math.max(0, boss.hp), lagHold: 0, lagSpeed: 0, shakeAt: -100, shownAt: null, fallen: [] };
    BloomSound.play('intro', { level: stageLevel(), boss: true });
    const card = { kind: 'title', boss: true, text: name, label: `${max} ${max === 1 ? 'hit' : 'hits'} to bloom`, x: 210, y: 160, life: 1.6, maxLife: 1.6 };
    if (!save.settings.motion) { stage.land = { bud: boss, card, at: -Infinity }; bossLand(); return; }
    boss.enterAt = game.time + .15; boss.enterDrop = 140; boss.enterDur = .8; boss.enterBounce = true;
    stage.land = { bud: boss, card, at: boss.enterAt + boss.enterDur * TOUCHDOWN.bounce };
    stage.entering.push({ bud: boss, at: boss.enterAt, doneAt: boss.enterAt + boss.enterDur + .1 });
    stage.entering.sort((a, b) => a.doneAt - b.doneAt);
  }
  function bossLand() {
    const { bud, card } = stage.land; stage.land = null;
    BloomSound.play('bossLand', { x: bud.x }); jolt(.3, 0, .2); haptic('tap');
    game.floaters = game.floaters.filter(item => !(item.kind === 'title' && item.size === 'small'));
    game.floaters.push(card);
    if (game.stage.vine && game.stage.vine.bud === bud) game.stage.vine.shownAt = game.time;
    if (!save.settings.motion) return;
    // A puff of dust where it touches down.
    const r = bud.r || 24;
    game.particles.push({ x: bud.x, y: bud.y + r * .6, vx: 0, vy: 0, life: .5, maxLife: .5, kind: 'ring', color: '#fff4cf', size: r * .9, grow: 46, gravity: 0, drag: 0 });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, speed = 70 + (i * 37 % 60), life = .5 + (i % 3) * .12;
      game.particles.push({ x: bud.x + side * r * .5, y: bud.y + r * .7, vx: side * speed, vy: -25 - (i % 4) * 12, life, maxLife: life, kind: 'pollen', color: '#fff1c8', size: 1.6 + (i % 3) * .7, rotation: 0, spin: 0, drag: 3, gravity: 60 });
    }
  }
  function bossCrack() { if (game.stage && game.stage.vine) game.stage.vine.shakeAt = game.time; }
  // Entering a current: a soft ripple and a few droplets thrown along the flow.
  function ripple(event) {
    if (!save.settings.motion) return;
    game.particles.push({ x: event.x, y: event.y, vx: 0, vy: 0, life: .7, maxLife: .7, kind: 'ring', color: '#bdf3ea', size: 6, grow: 34, gravity: 0, drag: 0 });
    for (let i = 0; i < 7; i++) {
      const a = (event.angle || 0) + (Math.random() - .5) * 1.1, speed = 40 + Math.random() * 70, life = .45 + Math.random() * .4;
      game.particles.push({ x: event.x, y: event.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, kind: 'pollen', color: i % 2 ? '#e9fffb' : '#7fd8cb', size: 1.2 + Math.random() * 1.6, rotation: a, spin: 0, drag: 2.2, gravity: 0 });
    }
  }
  function burst(bud, count = 24, into = game.particles, style = currentKeepsake()) {
    if (!save.settings.motion) return;
    // A phone that cannot keep up gets lighter bursts (feel.js governor tiers).
    count = Math.max(4, Math.round(count * [1, .6, .35][game?.quality || 0]));
    const colors = { coral: '#ff5d94', gold: '#ffd148', lilac: '#a47dff', sky: '#45adff', poppy: '#ff7433' };
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + Math.random() * .3, speed = 60 + Math.random() * 150, life = .7 + Math.random() * 1.3;
      const kind = i % 5 === 0 ? 'spark' : i % 3 === 0 ? 'pollen' : 'petal';
      into.push({ x: bud.x, y: bud.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40, life, maxLife: life, color: kind === 'spark' ? '#fff7be' : colors[bud.type] || colors.coral, size: kind === 'pollen' ? 1.2 + Math.random() * 2 : 2.5 + Math.random() * 4, kind, rotation: a, spin: (Math.random() - .5) * 9, drag: kind === 'petal' ? 1.1 : .7, gravity: kind === 'petal' ? 90 : 35, flutter: kind === 'petal' ? 18 + Math.random() * 30 : 0, phase: Math.random() * 6.28 });
    }
    // A colored shockwave ring and a couple of drifting glow motes per burst.
    const tint = colors[bud.type] || colors.coral;
    into.push({ x: bud.x, y: bud.y, vx: 0, vy: 0, life: .55, maxLife: .55, kind: 'ring', color: tint, size: (bud.r || 12) * .8, grow: 30 + Math.min(40, count), gravity: 0, drag: 0 });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, life = 1 + Math.random() * .8;
      into.push({ x: bud.x, y: bud.y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 25, life, maxLife: life, kind: 'glow', color: tint, size: 2.5 + Math.random() * 2, gravity: -12, drag: .9 });
    }
    // The worn keepsake adds its own signature particles on top of the flower's petals.
    if (style.burst) for (const extra of Keepsakes.burstExtras(style, bud.x, bud.y, count)) into.push(extra);
  }
  function stepParticles(list, dt, left, right, floor) {
    for (const p of list) {
      p.life -= dt; p.vx *= Math.exp(-(p.drag || 1) * dt); p.vy *= Math.exp(-(p.drag || 1) * dt);
      p.vy += (p.gravity ?? 70) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += (p.spin || 0) * dt;
      if (p.flutter) { p.phase += dt * 5; p.x += Math.sin(p.phase) * p.flutter * dt; p.vy = Math.min(p.vy, 70); }
      if (p.x < left || p.x > right) { p.x = clamp(p.x, left, right); p.vx *= -.35; }
      if (p.y > floor) { p.y = floor; p.vy *= -.25; p.vx *= .8; }
    }
    return list.filter(p => p.life > 0).slice(-600);
  }
  // Game feel: trauma-based screen shake, brief hit-stop on big moments and a
  // soft screen flash. All three are skipped when reduced motion is on.
  let trauma = 0, freeze = 0, flash = 0, lastBump = 0, kick = 0;
  const PRAISE = ['Lovely!', 'Blooming!', 'Gorgeous!', 'Dazzling!', 'Magnificent!', 'Legendary!'];
  const POP_COLORS = { coral: '#e8366f', gold: '#e59a12', lilac: '#7b52e6', sky: '#1f7fe0', poppy: '#e24a14' };
  function jolt(amount, stop = 0, glow = 0) {
    if (!save.settings.motion) return;
    trauma = Math.min(1, trauma + amount); flash = Math.max(flash, glow);
    // Hit-stops share one budget (feel.js): at most .09 s each and .09 s in any second, so cascades never stutter.
    // While the finale's slow motion holds, other hits never freeze it (a stutter mid-glide) or spend the impact's stop.
    if (stop > 0 && !(feel && feel.out.phase === 'finale')) freeze = Math.max(freeze, hitStop ? hitStop.request(stop, performance.now() / 1000) : stop);
  }
  function bumpScore() {
    const now = performance.now(); if (now - lastBump < 90) return; lastBump = now;
    const el = $('score-value'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  // Camera, time and the shot (feel.js). The flower that ends a level goes into slow motion with a drumroll while
  // the camera leans in; the hit freezes for a blink and a gold wave flares across the garden before the result.
  // Losses read clearly (wilted ghosts on the line, a heart that breaks, a red flash) and aiming clicks like a dial.
  // All of it is presentation kept on the game object, most of it is skipped with Animations off, and without
  // BloomFeel the game plays exactly as before.
  const Feel = window.BloomFeel || null;
  const feel = Feel ? Feel.create({ motion: save.settings.motion }) : null;
  const hitStop = Feel ? Feel.createHitStop() : null, governor = Feel ? Feel.createGovernor() : null;
  const danger = { redFlash: 0, mintFlash: 0, lastLife: false };
  let redFlash = 0, mintFlash = 0, feelGame = null, beatAt = 0, aimNotch = null, aimTickAt = -1, aimBuzzAt = -1, aimTarget = null;
  const feelState = () => game.feel || (game.feel = { finaleWave: 0, sweeping: false, dipWave: 0, impactWave: 0, armed: false, at: 0,
    impact: null, sweep: null, sounds: null, sounded: 0, noteAt: 0, sweepWave: 0, sweepEnd: 0, waiting: false, wonFor: 0 });
  // The final beat: a level's last wave, or every fifth wave of endless Rush. Never the tutorial or the calm boards.
  const finaleWave = () => isRush() && !isTutorial() && !preview && (isDepth() ? game.wave === game.finalWave : game.wave % 5 === 0);
  // The flower whose bloom ends the wave: the boss on its last ring, otherwise the only open flower left (one hit
  // must bloom it, and a geode would only crack into gems). Nothing is final while reinforcements are still to come.
  function finaleTarget() {
    if (game.over || (game.drops && game.drops.length)) return null;
    let only = null, count = 0, boss = null;
    for (const bud of game.buds) {
      if (bud.bloomed || bud.gift) continue;
      count++; only = bud; if (bud.boss) boss = bud;
    }
    if (boss) return (boss.hp || 1) <= 1 ? boss : null;
    return count === 1 && (only.hp || 1) <= 1 && !only.geode ? only : null;
  }
  // Mirrors rush.js: a cup turns away shots from below, a shell everything but its turning gap.
  function guardedHit(bud, hit) {
    if (bud.shield && hit.ny > .28) return true;
    if (!bud.shell) return false;
    const a = (bud.shellAngle || 0) + (bud.shellSpin || 0) * hit.t;
    return hit.nx * Math.cos(a) + hit.ny * Math.sin(a) < .34;
  }
  // Does this bloom end the wave? A boss blooms the rest of its wave; anything else must leave nothing open or queued.
  function endsWave(bud) {
    if (game.drops && game.drops.length) return false;
    if (bud.boss) return true;
    return !game.pending.length && !game.buds.some(other => !other.bloomed && !other.gift);
  }
  // The final flower's own motion (a boss sways 40 px/s or more), measured frame to frame in game time so the
  // prediction leads it; a jump (a boss climbing back up) counts as standing still. Until a new target has been
  // seen move once (a frame or two) there is no prediction, so a guess never starts a drumroll for a miss.
  const feelLead = { vx: 0, vy: 0 };
  let leadBud = null, leadX = 0, leadY = 0, leadT = 0, leadReady = false;
  function trackLead(bud) {
    const dt = game.time - leadT;
    if (bud !== leadBud || dt < 0 || dt > .25) { leadReady = false; leadBud = bud; leadX = bud.x; leadY = bud.y; leadT = game.time; return null; }
    if (dt > 1e-6) {
      const vx = (bud.x - leadX) / dt, vy = (bud.y - leadY) / dt, jump = Math.hypot(vx, vy) > 400;
      feelLead.vx = jump ? 0 : vx; feelLead.vy = jump ? 0 : vy; leadX = bud.x; leadY = bud.y; leadT = game.time; leadReady = true;
    }
    return leadReady ? feelLead : null;
  }
  // Up to five seeds in flight are checked a fifth of a second ahead, and only while a final flower is waiting.
  function finaleWatch() {
    if (!isRush() || isTutorial() || preview || game.over || !game.balls) return;
    const f = feelState(), final = finaleWave();
    if (final ? f.finaleWave === game.wave : f.dipWave === game.wave) return;
    const target = finaleTarget();
    if (!target) return;
    const lead = trackLead(target);
    if (!lead) return;
    for (let i = 0; i < Math.min(5, game.balls.length); i++) {
      const hit = Feel.predictHit(BloomEngine, game, game.balls[i], target, .2, lead);
      if (!hit || guardedHit(target, hit)) continue;
      if (!final) { f.dipWave = game.wave; feel.request('dip', hit); return; }
      f.finaleWave = game.wave; f.sweeping = false;
      if (!feel.request('finale', hit)) return;
      f.armed = true; f.at = game.time;
      BloomSound.play('roll', { dur: .9 });
      if (typeof BloomSound.muffle === 'function') BloomSound.muffle(.75, .5);
      return;
    }
  }
  // The final flower blooms: a frozen blink, a gold double ring, the biggest burst of the run and the finale chord.
  function finaleImpact(event, bud) {
    const f = feelState();
    f.impactWave = game.wave; f.impact = { x: bud.x, y: bud.y, type: bud.type }; f.armed = false;
    event.finale = true;
    BloomSound.play('finale', { x: bud.x, type: bud.type });
    haptic('surge');
    if (!save.settings.motion) return;
    // A predicted finale is already framed on the hit; one that a chain finished kicks in about the bloom itself.
    // The impact ends the slow-motion hold first; its frozen blink is a priority stop, so the crack that left a boss
    // on its last ring a moment earlier never cuts it short.
    feel.request('impact', feel.out.zoom > 1.001 ? null : bud);
    jolt(.5, 0, 1);
    freeze = Math.max(freeze, hitStop.request(.09, performance.now() / 1000, true));
    // Tier 2 still gets a 36-piece burst (burst() scales by the tier, so ask for the count that lands there).
    burst(bud, (game.quality || 0) === 2 ? 36 / .35 : 72);
    game.particles.push({ x: bud.x, y: bud.y, vx: 0, vy: 0, rotation: 0, life: .6, maxLife: .6, kind: 'ring', color: '#ffd148', size: 20, grow: 170, gravity: 0, drag: 0 },
      { x: bud.x, y: bud.y, vx: 0, vy: 0, rotation: 0, life: .9, maxLife: .9, kind: 'ring', color: '#ffd148', size: 30, grow: 280, gravity: 0, drag: 0 });
  }
  function feelEvent(event) {
    const f = feelState(), type = event.type, bud = event.bud;
    if (type === 'bloom' && bud) {
      if (f.impactWave !== game.wave && finaleWave() && endsWave(bud)) { finaleImpact(event, bud); return; }
      if (bud.relay && !event.chain) jolt(0, .025);
    } else if (type === 'boss' || type === 'cleared' || type === 'won') {
      if (f.impactWave === game.wave && f.impact) event.finale = true;
      if (type === 'boss') { if (!event.finale && feel) feel.request('punch', bud); }
      else if (event.finale && (type === 'won' || !isDepth())) startSweep();
    } else if (type === 'puff') jolt(0, .04);
    else if (type === 'crack' && bud && bud.boss) jolt(0, .05);
    else if (type === 'superBloom') { if (feel) feel.request('punch'); }
    else if (type === 'trick') {
      if (event.kind === 'hat' || event.kind === 'slam') jolt(0, .04);
      if (event.kind === 'slam' && feel) feel.request('punch', Number.isFinite(event.x) ? event : null);
      // A close call saved at the line: a mint ring at the flower and a cool edge glow.
      if (event.kind === 'close' && save.settings.motion) {
        mintFlash = 1;
        if (Number.isFinite(event.x)) game.particles.push({ x: event.x, y: event.y, vx: 0, vy: 0, rotation: 0, life: .5, maxLife: .5, kind: 'ring', color: '#78f0c8', size: 10, grow: 46, gravity: 0, drag: 0 });
      }
    }
  }
  // After the final bloom a gold light runs out from the impact: each open flower flares in turn (the flower art draws
  // it from bud.flareAt), up to ten notes climb, blossoms fall, and a level gets its title ribbon.
  function startSweep() {
    const f = feelState(), origin = f.impact;
    if (!origin || f.sweepWave === game.wave) return;
    f.sweepWave = game.wave;
    if (isDepth()) {
      game.floaters = game.floaters.filter(item => !['wave', 'combo', 'bonus', 'title'].includes(item.kind));
      game.floaters.push({ kind: 'title', text: isTaste() ? 'Nice run!' : `Level ${game.plan.id} clear!`, label: game.plan.name, x: 210, y: 200, life: 1.8, maxLife: 1.8 });
    }
    if (!save.settings.motion || !feel) return;
    const rush = !isDepth();
    const list = game.buds.filter(bud => bud.bloomed && !bud.gift).map(bud => ({ bud, d: Math.hypot(bud.x - origin.x, bud.y - origin.y) })).sort((a, b) => a.d - b.d);
    for (const item of list) item.bud.flareAt = game.time + .08 + (rush ? Math.min(.6, item.d / 900) : item.d / 650);
    const n = Math.min(10, list.length);
    f.sounds = Array.from({ length: n }, (_, k) => list[Math.floor(k * list.length / n)].bud); f.sounded = 0; f.noteAt = -Infinity;
    f.sweep = list.map(item => item.bud);
    f.sweepEnd = (list.length ? list.at(-1).bud.flareAt : game.time) + .35;
    f.sweeping = true; f.waiting = game.status === 'won'; f.wonFor = 0;
    if ((game.quality || 0) >= 2) return;
    const colors = ['#ffd6e4', '#ffe9a8', '#e6dcff', '#cfeaff', '#ffd2bd', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const life = 2.3 + Math.random() * .7, spin = (Math.random() - .5) * 5;
      game.particles.push({ x: 30 + (i + Math.random()) / 40 * 360, y: -10 - Math.random() * 120, vx: (Math.random() - .5) * 40, vy: 120 + Math.random() * 90,
        life, maxLife: life, kind: 'blossom', color: colors[i % colors.length], size: 3.4 + Math.random() * 2.6, rotation: Math.random() * 6.28, spin, drag: .25, gravity: 50 });
    }
  }
  // A breach leaves wilted ghosts of the lost flowers on the line (drawn by art.js from game.wilts).
  function addWilts(event) {
    if (event.boss) return;
    const lost = Array.isArray(event.buds) && event.buds.length ? event.buds : [{ x: event.x, y: event.y, type: 'coral', r: 11 }];
    const now = game.time, wilts = (game.wilts || []).filter(w => now - w.at < 1.2);
    for (const bud of lost.slice(0, 8)) if (Number.isFinite(bud.x)) wilts.push({ x: bud.x, y: game.dangerY, type: bud.type || 'coral', r: bud.r || 11, at: now });
    game.wilts = wilts.slice(-8);
  }
  const livesNote = () => ({ kind: 'life', text: game.lives > 1 ? `${game.lives} lives left` : game.lives === 1 ? '1 life left' : 'Out of lives', x: 210, y: 380, life: 1.1, maxLife: 1.1 });
  // Called every frame with real time: the camera, the governor, the finale watch, the sweep's notes and the result wait.
  function feelStep(dt) {
    if (!game) return;
    const paused = narrowLandscape.matches || dialogs.some(id => $(id).open);
    if (feelGame !== game) { feelGame = game; redFlash = 0; mintFlash = 0; aimTarget = null; if (feel) feel.reset(); }
    redFlash = Math.max(0, redFlash - dt / .35); mintFlash = Math.max(0, mintFlash - dt / .25);
    danger.redFlash = redFlash; danger.mintFlash = mintFlash; danger.lastLife = isRush() && game.lives === 1 && !game.over;
    if (!feel) return;
    feel.setMotion(save.settings.motion);
    if (governor) game.quality = governor.sample(dt);
    if (paused) return;
    feel.step(dt);
    const f = game.feel, motion = save.settings.motion;
    if (motion) finaleWatch();
    if (f && f.armed && game.time - f.at > .6) { f.armed = false; feel.request('release'); }
    if (f && f.sweeping) {
      // Flowers the same distance out (a boss wave's formation is mirrored) flare together, but their notes still
      // climb one at a time, at least 60 ms apart, instead of landing as one chord.
      if (f.sounded < f.sounds.length && game.time >= f.sounds[f.sounded].flareAt && game.time >= f.noteAt + .06) {
        BloomSound.play('sweep', { i: f.sounded, n: f.sounds.length, type: f.sounds[f.sounded].type }); f.sounded++; f.noteAt = game.time;
      }
      if ((game.time >= f.sweepEnd && f.sounded >= f.sounds.length) || f.sweepWave !== game.wave) f.sweeping = false;
    }
    if (f && f.waiting && !resultShown) {
      f.wonFor += dt;
      if (!motion || f.wonFor > 4) { f.waiting = false; f.sweeping = false; resultAt = Math.min(resultAt, game.time + (motion ? 0 : .4)); }
      else if (!f.sweeping && !feel.out.busy) { f.waiting = false; resultAt = game.time + 1.25; }
    }
    // On the last life the heart beats while a flower hangs close over the line (a sound, so Animations off keeps it).
    if (danger.lastLife && game.started) {
      let low = -Infinity;
      for (const bud of game.buds) if (!bud.bloomed && !bud.gift) low = Math.max(low, bud.y + (bud.r || 11));
      const now = performance.now() / 1000;
      if (low >= game.dangerY - 90 && now - beatAt >= .83) { beatAt = now; BloomSound.play('heartbeat', {}); }
    }
  }
  // The aim clicks like a dial, one notch every 2.5 degrees; locking onto a crowned flower, a boss or a gift clicks twice.
  function aimFeel() {
    const notch = Math.round(angle / (Math.PI / 72)), now = performance.now();
    if (notch !== aimNotch) {
      aimNotch = notch;
      if (now - aimTickAt >= 45) { aimTickAt = now; BloomSound.play('aimTick', { notch }); }
      if (notch % 2 === 0 && now - aimBuzzAt >= 90) { aimBuzzAt = now; haptic('tick'); }
    }
    aimLock();
  }
  function aimLock() {
    const target = (game.aim && game.aim.target) || null;
    if (target === aimTarget) return;
    aimTarget = target;
    if (target && (target.relay || target.boss || target.gift)) { BloomSound.play('aimLock', { type: target.type }); haptic('tick'); }
  }
  function processEvents() {
    for (const event of game.drainEvents()) {
      if (isTutorial()) tutorial.observe(event);
      if (feel && !isTutorial()) feelEvent(event);
      BloomSound.play(event.type, event);
      if (event.type === 'launch') { kick = 1; game.recoilAt = game.time; game.recoilAngle = angle; }
      else if (event.type === 'bounce' && event.caught) {
        // The petal saved a falling seed: a bright little ring and a pop of sparks so the save reads.
        burst({ x: event.x, y: event.y, type: 'gold', r: 6 }, 10);
        if (save.settings.motion) game.particles.push({ x: event.x, y: event.y, vx: 0, vy: 0, life: .45, maxLife: .45, kind: 'ring', color: '#9ff0c8', size: 6, grow: 26, gravity: 0, drag: 0 });
        haptic('tick');
      }
      else if (event.type === 'bloom') {
        const combo = event.combo || 1, golden = Boolean(event.super), milestone = CHAIN_MILESTONES.indexOf(combo);
        // During a Super Bloom flowers open fast, so each burst stays small and the screen keeps its shape.
        burst(event.bud, Math.min(golden ? 30 : 60, 24 + combo * 3));
        if (save.settings.motion && event.gain) {
          const px = event.bud.x, py = event.bud.y - (event.bud.r || 14) - 6;
          const stacked = game.floaters.filter(f => f.kind === 'pop' && f.life > f.maxLife - .35 && Math.abs(f.x - px) < 58 && Math.abs(f.y - py) < 50).length;
          game.floaters.push({ x: px, y: py - stacked * 19, text: `+${event.gain}`, life: .8, maxLife: .8, kind: 'pop', color: golden ? POP_COLORS.gold : POP_COLORS[event.bud.type] || POP_COLORS.coral, size: Math.min(26, 14 + (event.mult || 1) * 2.4), golden });
        }
        jolt(.08 + Math.min(.2, combo * .015), milestone >= 0 ? .055 : 0, milestone >= 0 ? .7 : 0);
        bumpScore();
        if (milestone >= 0) {
          BloomSound.play('shimmer', event);
          game.floaters = game.floaters.filter(item => item.kind !== 'combo');
          // Long chains earn a bigger word at each milestone, each in a new flower's color.
          const tier = milestone;
          game.floaters.push({ x: 210, y: 92, text: PRAISE[tier], label: `${event.combo} in a row`, tier, life: 1.05, maxLife: 1.05, kind: 'combo' });
        }
        if (event.combo % 3 === 1) haptic('tick');
        $('game-hint').textContent = isKoi() ? 'Ride it!' : isMoon() ? 'Nice path!' : isRush() ? game.splitReady ? 'Split is ready!' : isDepth() ? depthHint() : 'Gold rings bloom their neighbors too.' : game.guideCharge > 0 ? 'Drag to steer!' : 'Keep the chain going!';
      } else if (event.type === 'gate') {
        burst({ x: event.entry.x, y: event.entry.y, type: 'lilac' }, 12);
        burst({ x: event.exit.x, y: event.exit.y, type: 'gold' }, 16);
        // In a level the wave's tip stays up; the burst at both holes already shows where the shot went.
        if (!isDepth()) $('game-hint').textContent = 'Through the gate!';
      } else if (event.type === 'current') {
        ripple(event);
        if (!isDepth()) $('game-hint').textContent = 'Caught the current!';
      } else if (event.type === 'split') {
        burst(game.ball || game.launcher, 25);
        game.floaters = game.floaters.filter(item => item.kind !== 'bonus');
        game.floaters.push({ x: 210, y: 418, text: '+2', life: 1.05, maxLife: 1.05, kind: 'bonus' });
        $('game-hint').textContent = 'Split! Hit flowers to charge the next one.';
      } else if (event.type === 'cleared') {
        // Clearing a wave is the big beat of a run: a golden shower, a banner with the next tempo, a rising chord,
        // and the wave's blooms flying into the score (a finale's sweep takes the harvest's place).
        burst({ x: 210, y: 230, type: 'gold', r: 18 }, 30); burst({ x: 120, y: 170, type: 'coral' }, 20); burst({ x: 300, y: 170, type: 'lilac' }, 20);
        jolt(.32, .07, .85);
        game.floaters = game.floaters.filter(item => !['wave', 'combo', 'bonus'].includes(item.kind));
        const next = isDepth() ? Depths.wave(game.plan.id, event.wave + 1) : null, nextBoss = next && next.boss ? next.buds.find(bud => bud.boss) : null;
        const label = next ? next.boss ? `${(nextBoss && nextBoss.name) || 'Big bloom'} next!` : `wave ${event.wave + 1} of ${game.finalWave} next` : `next ×${event.next.toFixed(1)}`;
        game.floaters.push({ x: 210, y: 290, text: 'Wave clear!', label, life: 1, maxLife: 1, kind: 'wave' });
        haptic('surge');
        if (!event.finale && staged()) startHarvest();
      } else if (event.type === 'wave') {
        const bossName = event.boss ? event.bossName || (game.buds.find(bud => bud.boss) || {}).name || '' : '';
        if (isDepth()) {
          $('game-hint').textContent = event.hint || `Wave ${game.wave} of ${game.finalWave}.`;
          say(`Wave ${game.wave} of ${game.finalWave}. ${bossName ? `${bossName}! ` : ''}${event.hint || ''} ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.`);
        } else {
          $('game-hint').textContent = `Wave ${game.wave}! Faster flowers, ×${game.tempo.toFixed(1)} points.`;
          say(`Wave ${game.wave}. Tempo times ${game.tempo.toFixed(1)}. ${game.lives} lives left.`);
        }
        // The new buds tumble in; a boss wave drops its big bloom with a name card, any other wave shows its number.
        if (staged()) {
          tumble();
          if (event.boss) bossIntro(event);
          else game.floaters.push({ kind: 'title', size: 'small', x: 210, y: 120, life: .9, maxLife: .9, text: isDepth() ? `Wave ${game.wave} of ${game.finalWave}` : `Wave ${game.wave}`, label: isDepth() ? '' : `×${game.tempo.toFixed(1)}` });
        }
      } else if (event.type === 'puff') {
        burst(event.bud, 34); jolt(.14, 0, .25);
        // A ring of spores shows exactly how far the puff reaches.
        if (save.settings.motion) game.particles.push({ x: event.bud.x, y: event.bud.y, vx: 0, vy: 0, life: .5, maxLife: .5, kind: 'ring', color: '#c99cf5', size: event.bud.r || 12, grow: Math.max(0, ((window.BloomRush && BloomRush.PUFF_REACH) || 74) - (event.bud.r || 12)), gravity: 0, drag: 0 });
        $('game-hint').textContent = event.count ? `Puff! ${event.count} ${event.count === 1 ? 'flower' : 'flowers'} caught the spores.` : 'Puff!';
      } else if (event.type === 'shield') {
        burst({ x: event.x, y: event.y, type: 'gold', r: 6 }, 6); haptic('tick');
        if (event.shell && !game.shellSeen) { game.shellSeen = true; $('game-hint').textContent = 'Shells only open on one side. Wait for the gap.'; }
        else if (!event.shell && !game.shieldSeen) { game.shieldSeen = true; $('game-hint').textContent = 'Cups block shots from below. Hit them from the side.'; }
      } else if (event.type === 'geode') {
        burst(event.bud, 30); burst({ x: event.bud.x, y: event.bud.y, type: 'lilac', r: 10 }, 18); jolt(.16, .04, .2);
        if (!game.geodeSeen) { game.geodeSeen = true; $('game-hint').textContent = `${event.count} gems! Bloom them before they fall.`; }
      } else if (event.type === 'regrow') {
        burst({ x: event.x, y: event.y, type: 'coral', r: 8 }, 14); haptic('tick');
        $('game-hint').textContent = 'The briars grew back! Bloom the whole patch fast.';
      } else if (event.type === 'boss') {
        burst(event.bud, 80); burst({ x: 110, y: 200, type: 'gold' }, 40); burst({ x: 310, y: 200, type: 'lilac' }, 40);
        jolt(.5, .12, 1); haptic('surge');
        game.floaters = game.floaters.filter(item => !['wave', 'combo', 'bonus'].includes(item.kind));
        const name = event.name || (event.bud && event.bud.name) || '';
        game.floaters.push({ x: 210, y: 250, text: name ? `${name} bloomed!` : 'Big bloom!', label: 'everything blooms', life: 1.2, maxLife: 1.2, kind: 'wave' });
        $('game-hint').textContent = 'Big bloom! The whole garden opens.';
        say(name ? `${name} bloomed. The whole wave blooms.` : 'Big bloom. The whole wave blooms.');
      } else if (event.type === 'arm') {
        $('game-hint').textContent = event.power ? Powers.byId[event.power].tip : isDepth() ? depthHint() : 'Keep the flowers above the line.';
        haptic('tick'); trayKey = '';
      } else if (event.type === 'power') {
        const def = Powers.byId[event.power];
        // The tutorial's powerups are its own; it never spends the player's.
        if (isTutorial()) tutorial.spend(event.power); else { save.powers = Powers.spend(save.powers, event.power).counts; persist(); }
        trayKey = '';
        if (event.power === 'lullaby') {
          game.floaters = game.floaters.filter(item => !['wave', 'combo', 'bonus'].includes(item.kind));
          game.floaters.push({ x: 210, y: 250, text: 'Lullaby', label: 'the flowers doze for 6 seconds', life: 1.3, maxLife: 1.3, kind: 'wave' });
          $('game-hint').textContent = def.tip; haptic('surge');
        } else { burst({ x: event.x, y: event.y - 10, type: 'gold', r: 8 }, 14); haptic('tick'); }
        say(isTutorial() ? `${def.name} used.` : `${def.name} used. ${save.powers[event.power]} left.`);
      } else if (event.type === 'sunburst') {
        burst({ x: event.x, y: event.y, type: 'gold', r: 22 }, 70); burst({ x: event.x, y: event.y, type: 'coral', r: 14 }, 24);
        if (save.settings.motion) game.particles.push({ x: event.x, y: event.y, vx: 0, vy: 0, life: .6, maxLife: .6, kind: 'ring', color: '#ffc94a', size: 10, grow: 90, gravity: 0, drag: 0 });
        jolt(.4, .1, .8); haptic('surge');
        $('game-hint').textContent = event.count > 1 ? `Sunburst! ${event.count} flowers caught the light.` : 'Sunburst!';
      } else if (event.type === 'bee') {
        burst({ x: event.x, y: event.y, type: 'gold', r: 6 }, 8);
      } else if (event.type === 'giftAppear') {
        $('game-hint').textContent = `A gift bubble! Shoot it to keep the ${Powers.byId[event.power].name}.`;
        say($('game-hint').textContent);
      } else if (event.type === 'gift') {
        const def = Powers.byId[event.power];
        save.powers = Powers.add(save.powers, event.power, 1); persist(); trayKey = '';
        burst({ x: event.x, y: event.y, type: 'gold', r: 12 }, 30); burst({ x: event.x, y: event.y, type: 'lilac', r: 8 }, 14); jolt(.18, .04, .4); haptic('surge');
        game.floaters = game.floaters.filter(item => !['wave', 'bonus'].includes(item.kind));
        game.floaters.push({ x: 210, y: 250, text: `+1 ${def.name}`, label: 'a free gift!', life: 1.2, maxLife: 1.2, kind: 'wave' });
        $('game-hint').textContent = `You caught a ${def.name}! You have ${save.powers[event.power]}.`;
        say($('game-hint').textContent);
      } else if (event.type === 'giftGone') {
        $('game-hint').textContent = 'The gift bubble floated away.';
      } else if (event.type === 'drop') {
        $('game-hint').textContent = 'More flowers dropping in!';
      } else if (event.type === 'life') {
        jolt(.45, .06, 0); addWilts(event); game.heartBreak = { index: event.index ?? game.lives, at: game.time }; redFlash = 1; game.floaters.push(livesNote());
        $('game-hint').textContent = !game.lives ? 'The flowers reached the line.' : event.boss ? `The big bloom touched the line and climbed back up! ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.` : `Flowers crossed the line! ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.`;
        haptic('warn');
        say($('game-hint').textContent);
      } else if (event.type === 'burst') {
        burst(event.bud, 45); game.floaters = game.floaters.filter(item => item.kind !== 'bonus');
        game.floaters.push({ x: 210, y: 418, text: '+2', life: 1.05, maxLife: 1.05, kind: 'bonus' });
      } else if (event.type === 'fever') {
        jolt(.35, .08, 1);
        haptic('surge');
      } else if (event.type === 'sunPetal') {
        if (event.petal % 2 === 0) haptic('tick');
      } else if (event.type === 'superBloom') {
        jolt(.35, .06, 1); haptic('surge');
        game.floaters = game.floaters.filter(item => !['wave', 'combo', 'bonus'].includes(item.kind));
        game.floaters.push({ x: 210, y: 250, text: 'Super Bloom!', label: superSeen ? 'double points' : 'seeds fly through flowers', life: 1.3, maxLife: 1.3, kind: 'wave' });
        $('game-hint').textContent = superSeen ? 'Super Bloom! Double points.' : 'Super Bloom! Seeds fly through flowers.';
        say(superSeen ? 'Super Bloom. Double points.' : 'Super Bloom. Seeds fly through flowers for double points.');
        superSeen = true;
      } else if (event.type === 'superBloomEnd') {
        $('game-hint').textContent = isDepth() ? depthHint() : 'Keep the flowers above the line.';
      } else if (event.type === 'mult') {
        haptic('tick');
      } else if (event.type === 'chainEnd') {
        if (event.chain >= 8) {
          game.floaters = game.floaters.filter(item => item.kind !== 'combo');
          game.floaters.push({ x: 210, y: 92, text: `${event.chain} in a row!`, life: 1.05, maxLife: 1.05, kind: 'combo' });
          say(`${event.chain} in a row!`);
        }
      } else if (event.type === 'trick') {
        game.floaters.push({ kind: 'trick', trick: event.kind, text: event.name, label: `+${event.bonus}`, x: event.x, y: clamp(event.y - 30, 70, 400), life: 1.1, maxLife: 1.1 });
        haptic('tap'); bumpScore(); say(event.name);
      } else if (event.type === 'crack') {
        burst(event.bud, 12); jolt(.05); if (event.bud && event.bud.boss) bossCrack();
      } else if (event.type === 'ready') {
        if (!isRush()) { shotTrail.push(game.bloomedCount - trailTotal); trailTotal = game.bloomedCount; }
        $('game-hint').textContent = isChapter() ? `${game.shotsLeft} ${game.shotsLeft === 1 ? 'seed' : 'seeds'} left. ${game.level.hint || (isKoi() ? 'Watch where the water goes.' : 'Check the gate exit first.')}` : event.blooms ? 'Turn a petal or line up your next shot.' : 'Missed! Try turning a petal.';
        say(`${game.bloomedCount} of ${game.buds.length} bloomed. ${game.shotsLeft} ${isChapter() ? 'seeds' : 'shots'} left.`);
      } else if (event.type === 'won' || event.type === 'lost') {
        if (!isRush() && game.bloomedCount > trailTotal) { shotTrail.push(game.bloomedCount - trailTotal); trailTotal = game.bloomedCount; }
        if (event.type === 'won') { if (!event.finale) { burst({ x: 110, y: 210, type: 'coral' }, 70); burst({ x: 310, y: 210, type: 'gold' }, 70); burst({ x: 210, y: 150, type: 'lilac' }, 60); } jolt(.45, .14, 1); }
        resultAt = event.finale && save.settings.motion && feel ? Infinity : game.time + (save.settings.motion ? 1.45 : .4); resultShown = false;
        if (isTaste()) {
          // A taste records no progress and earns no stars; its blooms pay seeds like any finished level run.
          const id = game.plan.id, won = event.type === 'won';
          awardSeeds({ mode: 'depths', levelId: id, stars: 0, blooms: game.bloomedCount, wave: game.wave });
          runGoals = trackGoals({ type: 'rush', blooms: game.bloomedCount, wave: game.wave, chain: game.bestCombo }); runAward += runGoals.paid;
          persist(); hudKey = '';
          $('game-hint').textContent = won ? `That was the first ${TASTE.waves} waves!` : 'Out of lives. Try a new angle.';
          say(won ? `You played the first ${TASTE.waves} waves of level ${id}. ${game.score} points.` : `Out of lives on wave ${game.wave} of ${game.finalWave}. ${game.bloomedCount} blooms.`);
          continue;
        }
        if (isDepth()) {
          const id = game.plan.id, won = event.type === 'won', previousStars = save.depths[id]?.stars || 0;
          const recorded = Depths.record(save.depths, id, { won, lives: game.startWave > 1 ? Math.min(2, game.lives) : game.lives, score: game.score, wave: game.wave });
          save.depths = recorded.progress;
          depthNews = { firstClear: recorded.firstClear, newStars: recorded.newStars, opened: recorded.firstClear && Depths.level(id + 1) && depthOpen(id + 1) ? id + 1 : null };
          if (depthNews.opened) { freshDepth = depthNews.opened; freshShown = false; }
          else if (recorded.firstClear && id + 1 === TASTE.level && tasteOpen()) { freshDepth = TASTE.level; freshShown = false; }
          awardSeeds({ mode: 'depths', levelId: id, stars: won ? game.stars : 0, previousStars, blooms: game.bloomedCount, wave: game.wave - (game.startWave || 1) + 1 });
          runGoals = trackGoals({ type: 'rush', blooms: game.bloomedCount, wave: game.wave, chain: game.bestCombo }); runAward += runGoals.paid;
          persist(); hudKey = '';
          $('game-hint').textContent = won ? 'Level clear!' : 'Out of lives. Try a new angle.';
          say(won ? `Level ${id} clear. ${game.stars} stars. ${game.score} points.` : `Out of lives on wave ${game.wave} of ${game.finalWave}. ${game.bloomedCount} blooms.`);
          continue;
        }
        if (isRush()) {
          rushRecordBroken = game.score > save.rush.best;
          if (rushRecordBroken && save.rush.best > 0) BloomSound.play('record', {});
          save.rush.best = Math.max(save.rush.best, game.score);
          save.rush.bestWave = Math.max(save.rush.bestWave, game.wave);
          save.rush.blooms += game.bloomedCount; save.rush.runs++;
          awardSeeds({ mode: 'rush', blooms: game.bloomedCount, wave: game.wave });
          runGoals = trackGoals({ type: 'rush', blooms: game.bloomedCount, wave: game.wave, chain: game.bestCombo }); runAward += runGoals.paid;
          persist(); hudKey = '';
          $('game-hint').textContent = 'Run over. Your best is saved.';
          say(`Run complete. Wave ${game.wave}, ${game.bloomedCount} blooms, ${game.score} points.`);
          continue;
        }
        if (!preview) {
          const data = record() || { best: 0, stars: 0, attempts: 0 };
          const previousStars = data.stars, moonWasCleared = Keepsakes.moonCleared(save.moon, BloomMoon.levels);
          data.best = Math.max(data.best, game.score); data.stars = Math.max(data.stars, game.stars); data.attempts++;
          if (isChapter()) save[game.level.worldId][game.level.id] = data;
          else if (typeof game.level.id === 'number') save.progress[game.level.id] = data;
          else {
            save.daily[game.level.id] = data;
            const keys = Object.keys(save.daily).sort(); while (keys.length > 14) delete save.daily[keys.shift()];
          }
          if (event.type === 'won' && previousStars === 0) newFlower = flowers.find(flower => flower.unlockLevel === game.level.id) || null;
          if (event.type === 'won' && typeof game.level.id === 'number') awardSeeds({ mode: 'campaign', levelId: game.level.id, stars: game.stars, previousStars });
          if (event.type === 'won' && isChapter()) awardSeeds({ mode: game.level.worldId, levelId: game.level.id, stars: game.stars, previousStars });
          if (event.type === 'won' && isDaily()) awardSeeds({ mode: 'daily', levelId: game.level.id, stars: game.stars, previousStars });
          // Clearing the last Moon trial earns the Moonlit seed style, once, and the result says so.
          if (isMoon() && !moonWasCleared && Keepsakes.moonCleared(save.moon, BloomMoon.levels)) newKeepsake = Keepsakes.byId.moonlit;
          if (event.type === 'won') { runGoals = trackGoals({ type: 'clear', mode: isDaily() ? 'daily' : isChapter() ? game.level.worldId : 'campaign', stars: game.stars }); runAward += runGoals.paid; }
          persist();
        }
        $('game-hint').textContent = event.type === 'won' ? 'Cleared!' : 'Try a new angle.';
        say(event.type === 'won' ? `Cleared. ${game.stars} stars. ${game.score} points.` : `${game.bloomedCount} of ${game.buds.length} bloomed. Try a new angle.`);
      }
    }
  }
  // Long chains are praised at these lengths, one PRAISE word each. The first Super Bloom of a session explains itself.
  const CHAIN_MILESTONES = [8, 16, 24, 32, 40, 50];
  let superSeen = false;
  // A level run lost at wave 6 or later can start again from wave 6, free and as often as the player likes.
  // Stars from those runs stop at two, and the card says so.
  const checkpointOffered = won => isDepth() && !isTaste() && !won && game.wave >= Depths.checkpoint;
  const fromCheckpoint = () => isDepth() && (game.startWave || 1) > 1;
  if ($('checkpoint-btn')) $('checkpoint-btn').addEventListener('click', () => { if (isDepth() && !isTaste()) startDepth(game.plan.id, false, Depths.checkpoint); });
  // A chain of one is not worth a mention.
  const chainNote = () => game.bestCombo > 1 ? ` · best chain ${game.bestCombo}` : '';
  // The result card's stars pop in one at a time (styles.css), each with a chime.
  const resultStars = n => [0, 1, 2].map(i => `<span class="${i < n ? 'on' : 'off'}" style="--i:${i}">★</span>`).join('');
  // A win ends with a shower of petals over the result card, and every result counts its score up. It all runs
  // off the main frame loop and is skipped when Animations is off. The petals sit in a popover so they can fall
  // over the card; a browser without popovers just skips them.
  const Petals = window.BloomPetals || null, petalLayer = $('petal-layer');
  let party = null;
  function celebrate(won) {
    endParty();
    if (!save.settings.motion) return;
    party = { at: null, last: null, score: game.score, stars: $('result-stars').hidden ? 0 : game.stars, chimed: 0, ticks: 0, shower: null, dpr: 1 };
    if (!won || !Petals || !petalLayer || typeof petalLayer.showPopover !== 'function') return;
    try {
      const dpr = Math.min(2, window.devicePixelRatio || 1), width = innerWidth, height = innerHeight, banner = $('result-eyebrow').getBoundingClientRect();
      petalLayer.width = Math.round(width * dpr); petalLayer.height = Math.round(height * dpr);
      petalLayer.showPopover();
      party.shower = Petals.create(width, height, { x: banner.left + banner.width / 2, y: banner.top + banner.height / 2 }); party.dpr = dpr;
    } catch (_) { party.shower = null; }
  }
  function endParty() {
    if (party?.shower) { try { petalLayer.hidePopover(); } catch (_) {} }
    party = null;
  }
  // The soundtrack follows the screen about ten times a second, and at once when the screen changes: the groove (a
  // level's own, or home for the menus and endless Rush), how hot the chain runs, how near the flowers are to the
  // line, and whether play is paused, over or hidden. sound.js turns that into layers; this only describes the board.
  let musicAt = -Infinity, musicKey = '', cueWatch = null;
  function musicFrame(timestamp, force = false) {
    const music = BloomSound.music;
    if (!music || typeof music.frame !== 'function') return;
    const onGame = route === 'game' && Boolean(game);
    if (onGame) watchCues(); else cueWatch = null;
    const groove = !onGame ? 'home' : isTutorial() ? 'meadow' : isDepth() ? Depths.level(game.plan.id)?.key || 'home' : 'home';
    const paused = narrowLandscape.matches || dialogs.some(id => $(id).open), result = $('result-dialog').open;
    const over = onGame && Boolean(game.over ?? (game.status === 'won' || game.status === 'lost'));
    const key = `${route}|${groove}|${paused}|${result}|${over}|${document.hidden}`;
    if (!force && key === musicKey && timestamp - musicAt < 100) return;
    musicKey = key; musicAt = timestamp;
    const state = { route: onGame ? 'game' : route, groove, paused, result, over, hidden: document.hidden, heat: 0, threat: 0, superBloom: false, boss: false };
    if (onGame) {
      state.superBloom = (Number(game.superBloom ?? game.feverTime) || 0) > 0;
      state.heat = Math.max((game.combo || 0) / 12, state.superBloom ? 1 : 0) + ((game.balls || []).length >= 2 ? .15 : 0);
      if (isRush() && !isTutorial()) {
        let lowest = -Infinity;
        for (const bud of game.buds) if (!bud.bloomed && bud.y > lowest) lowest = bud.y;
        state.threat = (Number.isFinite(lowest) ? clamp((lowest - (game.dangerY - 120)) / 120, 0, 1) : 0) + (game.lives === 1 ? .3 : 0);
      }
      state.boss = Boolean(game.bossWave);
    }
    music.frame(state);
  }
  // Small cues the board never sends as events: Split charged (once per charge), the lullaby's last three seconds
  // and its wake-up, and a briar patch counting down its last two seconds before it grows back.
  function watchCues() {
    if (!isRush()) { cueWatch = null; return; }
    if (!cueWatch || cueWatch.game !== game) cueWatch = { game, split: Boolean(game.splitReady), told: Boolean(game.splitReady), lullaby: Number(game.lullaby) || 0, briar: new Map() };
    const watch = cueWatch, split = Boolean(game.splitReady), lullaby = Number(game.lullaby) || 0;
    if (split && !watch.split && !watch.told) { BloomSound.play('splitReady', {}); watch.told = true; }
    if ((game.splitCharge || 0) < 1) watch.told = false;
    watch.split = split;
    if (lullaby < watch.lullaby) {
      const mark = [1, 2, 3].find(n => watch.lullaby > n && lullaby <= n && lullaby > 0);
      if (mark) BloomSound.play('lullabyTick', { left: mark });
      else if (lullaby <= 0 && !game.over) BloomSound.play('lullabyWake', {});
    }
    watch.lullaby = lullaby;
    if (!(game.briarTimers instanceof Map)) return;
    for (const [group, at] of game.briarTimers) {
      const left = at - game.time;
      if (!(left > 0 && left < 2)) continue;
      const slot = Math.ceil(left * 2) / 2;
      if (watch.briar.has(group) && watch.briar.get(group) <= slot) continue;
      watch.briar.set(group, slot);
      let x = 0, count = 0;
      for (const bud of game.buds) if (bud.group === group) { x += bud.x; count++; }
      BloomSound.play('briarTick', { left: slot, x: count ? x / count : 210 });
    }
    for (const group of watch.briar.keys()) if (!game.briarTimers.has(group)) watch.briar.delete(group);
  }
  function partyFrame(timestamp) {
    if (!party) return;
    if (!$('result-dialog').open) { endParty(); return; }
    if (party.at === null) party.at = party.last = timestamp;
    const t = (timestamp - party.at) / 1000, k = clamp((t - .2) / .9, 0, 1);
    $('result-score').textContent = fmt(party.score * (1 - Math.pow(1 - k, 3)));
    // The count-up ticks along: thirteen small rising notes, one every 70 ms, and never a backlog after a stall.
    if (party.score > 0 && party.ticks < 13 && t >= .2 + party.ticks * .07) { const due = Math.min(12, Math.floor((t - .2) / .07)); party.ticks = due + 1; BloomSound.play('tally', { i: due, n: 13 }); }
    while (party.chimed < party.stars && t >= .4 + party.chimed * .17) BloomSound.play('star', { index: party.chimed++ });
    if (party.shower) {
      const dt = Math.min(.05, (timestamp - party.last) / 1000), alive = Petals.step(party.shower, dt), layer = petalLayer.getContext('2d');
      party.last = timestamp;
      layer.setTransform(party.dpr, 0, 0, party.dpr, 0, 0); layer.clearRect(0, 0, party.shower.width, party.shower.height);
      Petals.draw(layer, party.shower);
      if (!alive) { try { petalLayer.hidePopover(); } catch (_) {} party.shower = null; }
    }
    if (k >= 1 && !party.shower && party.chimed >= party.stars) party = null;
  }
  function showResult() {
    resultShown = true; const won = game.status === 'won';
    $('next-btn').classList.add('button-primary'); $('next-btn').classList.remove('button-secondary');
    $('result-offer').hidden = true; $('share-btn').hidden = !canShare(won);
    $('garden-reward').hidden = preview || runAward <= 0;
    $('reward-seeds').textContent = `+${runAward} ${runAward === 1 ? 'seed' : 'seeds'}`;
    $('reward-goal').textContent = nextGoal();
    const news = !preview && runGoals && (runGoals.finished.length || runGoals.bonus);
    $('result-goals').hidden = !news;
    if (news) $('result-goals').innerHTML = `<span class="goal-check" aria-hidden="true"></span><span>${starry(goalNews(runGoals))}</span>${runGoals.done < 3 ? `<span class="goal-today">${runGoals.done}/3 today</span>` : ''}`;
    $('result-stars').hidden = isRush() && !(isDepth() && won);
    $('result-dialog').classList.toggle('lost', isDepth() ? !won : isRush() ? !rushRecordBroken : !won);
    $('result-garden-btn').textContent = isRush() ? 'All levels' : 'Back to the meadow';
    if (isTaste()) { showTasteResult(won); return; }
    if (isDepth()) {
      const id = game.plan.id, next = Depths.level(id + 1), nextOpen = Boolean(next && depthOpen(id + 1)), nextPaid = Boolean(next && depthPaid(id + 1));
      const taste = Boolean(won && next && !nextPaid && next.id === TASTE.level && tasteOpen());
      $('result-eyebrow').textContent = won ? `Level ${id} clear!` : 'Out of lives';
      $('result-title').textContent = won ? ['Cleared!', 'Cleared!', 'Great!', 'Perfect!'][game.stars] : `Wave ${game.wave} of ${game.finalWave}`;
      const checkpoint = checkpointOffered(won), restarted = fromCheckpoint();
      $('result-message').textContent = won && restarted
        ? `Cleared from wave ${game.startWave}!${depthNews?.opened ? ` Level ${id + 1} is open.` : ''} Start at wave 1 for three stars.`
        : won
        ? depthNews?.opened ? `Level ${id + 1}, ${next.name}, is open!` : !next ? `${game.bloomedCount} blooms. You reached the Starseed Core!` : taste ? `Try the first ${TASTE.waves} waves of level ${next.id}, ${next.name}, free!` : !nextPaid ? `${next.name} and the levels below it come with a one-time unlock.` : game.stars < 3 ? `${game.bloomedCount} blooms. Keep all 3 lives for ★★★.` : `${game.bloomedCount} blooms${chainNote()}`
        : checkpoint ? `${game.bloomedCount} blooms.${game.wave >= game.finalWave - 2 ? ' So close!' : ''} A run from wave ${Depths.checkpoint} can earn up to two stars.`
        : `${game.bloomedCount} blooms. ${game.wave >= game.finalWave - 2 ? 'So close!' : 'Try a new angle.'}`;
      $('result-stars').innerHTML = resultStars(game.stars); $('result-stars').setAttribute('aria-label', `${game.stars} of 3 stars`);
      $('result-score').textContent = fmt(game.score);
      $('reward-flower').hidden = true;
      $('next-btn').hidden = !won || !(nextOpen || next && !nextPaid); $('next-btn').textContent = nextPaid ? `Level ${id + 1}` : taste ? 'Try it free' : `See levels ${Depths.free + 1} to ${Depths.total}`;
      // Pointing at the unlock is a quiet button under Replay, never the big one. The free taste is play, so it can be.
      $('next-btn').classList.toggle('button-primary', nextPaid || taste); $('next-btn').classList.toggle('button-secondary', !nextPaid && !taste);
      $('retry-btn').textContent = won ? 'Replay' : 'Try again'; $('retry-btn').classList.toggle('primary', !won || !nextOpen && !taste);
      // After a late loss the free wave-6 restart leads, and starting over from wave 1 is the quiet choice.
      const restart = $('checkpoint-btn'), offered = checkpoint && Boolean(restart);
      if (restart) { restart.hidden = !offered; restart.textContent = `Try from wave ${Depths.checkpoint}`; restart.classList.toggle('primary', offered); }
      if (offered) { $('retry-btn').textContent = 'Start over'; $('retry-btn').classList.remove('primary'); }
      showDialog('result-dialog'); if (offered && restart.focus) restart.focus(); celebrate(won); return;
    }
    if (isRush()) {
      $('result-eyebrow').textContent = rushRecordBroken ? 'New best!' : 'Run over';
      $('result-title').textContent = `Wave ${game.wave}`;
      $('result-message').textContent = `${game.bloomedCount} blooms${chainNote()} · tempo ×${game.tempo.toFixed(1)}${game.tricks > 0 ? ` · ${game.tricks} ${game.tricks === 1 ? 'trick' : 'tricks'}` : ''}`;
      $('result-score').textContent = fmt(game.score);
      $('reward-flower').hidden = true; $('next-btn').hidden = true;
      $('retry-btn').textContent = 'Play again'; $('retry-btn').classList.add('primary');
      showDialog('result-dialog'); celebrate(rushRecordBroken); return;
    }
    $('result-eyebrow').textContent = preview ? 'Preview' : !won ? 'Out of seeds' : isDaily() ? 'Daily clear!' : isKoi() ? 'Pool clear!' : isMoon() ? 'Trial clear!' : 'Garden clear!';
    $('result-title').textContent = won ? ['Cleared!', 'Cleared!', 'Great!', 'Perfect!'][game.stars] : game.bloomedCount >= game.buds.length * .6 ? 'So close!' : 'Not this time!';
    const three = isChapter() && game.stars < 3 ? ` ★★★ in ${game.level.par} shots.` : '';
    $('result-message').textContent = won ? game.shotsLeft === 2 ? `All ${game.buds.length} flowers in one shot!` : `${game.buds.length} flowers${chainNote()}` : `${game.bloomedCount} of ${game.buds.length} bloomed. Drag mid-flight to steer!`;
    if (isMoon()) $('result-message').textContent = won ? `${game.shotNumber} ${game.shotNumber === 1 ? 'seed' : 'seeds'} · ${game.gatePasses} ${game.gatePasses === 1 ? 'gate' : 'gates'}.${three}` : `${game.bloomedCount} of ${game.buds.length} flowers. Check the gate exit and try again.`;
    if (isKoi()) $('result-message').textContent = won ? `${game.shotNumber} ${game.shotNumber === 1 ? 'seed' : 'seeds'} · ${game.currentRides} ${game.currentRides === 1 ? 'current' : 'currents'}.${three}` : `${game.bloomedCount} of ${game.buds.length} flowers. Watch where the water turns.`;
    $('result-score').textContent = fmt(game.score);
    $('result-stars').innerHTML = resultStars(game.stars); $('result-stars').setAttribute('aria-label', `${game.stars} of 3 stars`);
    $('reward-flower').hidden = !newFlower && !newKeepsake && !runBouquet;
    $('reward-flower').setAttribute('aria-hidden', String(!newKeepsake));
    if (newKeepsake) $('reward-flower').innerHTML = `${keepsakeGraphic(newKeepsake)}<div><span class="card-tag moon">New seed style!</span><strong>${escape(newKeepsake.name)}</strong><button class="keepsake-wear" type="button" data-wear="${newKeepsake.id}"${save.keepsake === newKeepsake.id ? ' disabled' : ''}>${save.keepsake === newKeepsake.id ? 'Wearing' : 'Wear it'}</button></div>`;
    else if (newFlower) $('reward-flower').innerHTML = `${flowerGraphic(newFlower)}<div><span class="card-tag green">New flower!</span><strong>${escape(newFlower.name)}</strong></div>`;
    else if (runBouquet) $('reward-flower').innerHTML = `${bouquetGraphic()}<div><span class="card-tag gold">Weekly bouquet!</span><strong>+${runBouquet.seeds} bonus seeds</strong><span class="reward-note">${BloomGarden.daily.bouquetGoal} daily gardens this week</span></div>`;
    const next = isChapter() ? nextTrial(game.level) : typeof game.level.id === 'number' ? levels.find(l => l.id === game.level.id + 1) : null;
    $('next-btn').hidden = !won;
    $('next-btn').textContent = preview ? 'Back to Worlds' : isKoi() ? !next ? 'All pools' : trialPaid('koi', next) ? 'Next pool' : 'See all pools' : isMoon() ? next ? 'Next trial' : 'All trials' : next ? 'Next garden' : 'My meadow';
    $('retry-btn').textContent = won ? 'Replay' : 'Try again';
    $('retry-btn').classList.toggle('primary', !won);
    showDialog('result-dialog'); celebrate(won);
  }
  // The end of a free taste. Played through, the card says what the unlock adds and offers it; a run that ends
  // early only gets another try, never an offer.
  function showTasteResult(won) {
    const level = Depths.level(game.plan.id);
    $('result-eyebrow').textContent = won ? 'Free taste done!' : 'Out of lives';
    $('result-title').textContent = won ? 'Nice!' : `Wave ${game.wave} of ${game.finalWave}`;
    $('result-message').textContent = won
      ? `Waves ${TASTE.waves + 1} to ${Depths.waveCount} of ${level.name}, and the ${Depths.total - level.id} levels below it, come with the one-time unlock.`
      : `${game.bloomedCount} blooms. The first ${TASTE.waves} waves of ${level.name} are free to try.`;
    $('result-stars').hidden = true;
    $('result-score').textContent = fmt(game.score);
    $('reward-flower').hidden = true;
    renderTasteOffer(won);
    $('retry-btn').textContent = won ? 'Play again' : 'Try again'; $('retry-btn').classList.toggle('primary', !won);
    showDialog('result-dialog'); celebrate(won);
  }
  // Bought from the card, the offer gives way to the full level.
  function renderTasteOffer(won) {
    const owned = depthsOwned(), level = Depths.level(game.plan.id);
    $('result-offer').hidden = !won || owned;
    $('result-offer').innerHTML = won && !owned ? `<span class="card-tag gold">Levels ${Depths.free + 1} to ${Depths.total}</span>${depthUnlockAction()}` : '';
    $('next-btn').hidden = !(won && owned && depthOpen(level.id)); $('next-btn').textContent = `Play ${level.name}`;
  }
  // Sharing: a short note with no spoilers and the link to the free web game. On a phone the share sheet opens;
  // elsewhere the note is copied, ready to paste. The daily garden shares a tiny picture of each shot, like a
  // word-game grid: a leaf for a miss, then a sprout, a tulip or a bouquet as more of the garden bloomed.
  const SHARE_URL = 'https://vexno1r.github.io/Bloomshot/';
  const DAILY_FIRST = Date.UTC(2026, 9, 1);
  function canShare(won) {
    if (preview) return false;
    if (isTaste()) return false;
    if (isDepth() || isDaily()) return won;
    return isRush() && rushRecordBroken;
  }
  function shareNote() {
    const stars = n => `${'⭐'.repeat(n)} ${n}/3`;
    if (isDaily()) {
      const day = Math.round((Date.parse(`${game.level.id.slice(6)}T00:00:00Z`) - DAILY_FIRST) / 864e5) + 1, total = game.buds.length || 1;
      const shots = shotTrail.map(n => !n ? '🍂' : n / total < .25 ? '🌱' : n / total < .5 ? '🌷' : '💐').join('');
      return `Bloomshot daily garden #${day}\n${stars(game.stars)}\n${shots}`;
    }
    if (isDepth()) { const level = Depths.level(game.plan.id); return `Bloomshot · Level ${level.id}, ${level.name} 🌸\n${stars(game.stars)} · ${fmt(game.score)} points`; }
    return `Bloomshot · Meadow Rush 🌼\nNew best: wave ${game.wave} · ${fmt(game.score)} points`;
  }
  // The app's share helper picks the phone's sheet, the browser's, or the clipboard, and the link (the Play Store
  // page from the Android app). Without it, the browser's own sheet or the clipboard is used here.
  async function shareResult() {
    const url = native?.link || SHARE_URL, text = shareNote(), payload = { title: 'Bloomshot', text, url };
    BloomSound.wake(); BloomSound.play('tap');
    if (native && typeof native.share === 'function') {
      let result;
      try { result = await native.share(payload); } catch (_) { result = { ok: false }; }
      if (result && result.cancelled) return;
      if (!result || !result.ok) toast('Sharing is not available here.');
      else if (result.via === 'copied') toast('Copied! Paste it in a chat.');
      return;
    }
    try { if (navigator.share) { await navigator.share(payload); return; } }
    catch (error) { if (error && error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied! Paste it in a chat.'); }
    catch (_) { toast('Sharing is not available here.'); }
  }
  function rotateNearest(point) {
    if (!gate('rotate')) return false;
    const near = game.bumpers.find(b => b.kind !== 'rock' && Math.hypot(b.x - point.x, b.y - point.y) <= b.length / 2 + 14);
    if (!near) return false;
    if (game.rotate(near.id)) { BloomSound.wake(); processEvents(); toast('Petal turned!'); }
    else if (isRush()) toast('Wait a moment to turn it again.');
    else if (game.status === 'aiming') toast(isChapter() ? 'One turn per seed.' : 'One turn per shot.');
    return true;
  }
  function coordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const point = { x: clamp((event.clientX - rect.left) / rect.width * 420, 0, 420), y: clamp((event.clientY - rect.top) / rect.height * 560, 0, 560) };
    // While the finale camera leans in, a touch lands where the board is drawn, not where it would be unzoomed.
    return feel && feel.out.zoom > 1.001 ? Feel.toBoard(point, feel.out) : point;
  }
  function aimAt(point) {
    const dx = point.x - game.launcher.x, dy = Math.min(-35, point.y - game.launcher.y);
    angle = clamp(Math.atan2(dy, dx), -Math.PI + .16, -.16);
    pointer = point; game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400);
    aimFeel();
  }
  function launch() {
    if (!gate('fire')) { pointer = null; aiming = false; game.aim = []; nudgeTutorial(); return; }
    const fired = game.fire(Math.cos(angle), Math.sin(angle));
    pointer = null; aiming = false; game.aim = [];
    if (fired) { processEvents(); $('game-hint').textContent = isKoi() ? 'Let the water take it.' : isMoon() ? 'Let it fly.' : isRush() ? isDepth() ? depthHint() : 'Six direct hits charge your split.' : 'Now drag to steer!'; }
    else if (isRush()) $('game-hint').textContent = game.balls.length >= 5 ? 'Max 5 seeds. Wait for one to land.' : 'Reloading…';
  }
  function cancelInteraction() {
    const id = activePointer; activePointer = null;
    aiming = false; guiding = false; pointer = null;
    if (game) { game.guide(null); game.aim = []; }
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.addEventListener('pointerdown', event => {
    // A tap during the finale's gold sweep skips straight to the result.
    if (game && game.status === 'won' && game.feel && (game.feel.sweeping || game.feel.waiting) && !resultShown) { game.feel.sweeping = false; game.feel.waiting = false; if (feel) feel.reset(); resultAt = game.time; return; }
    if (route !== 'game' || activePointer !== null || !event.isPrimary || !['aiming', 'flying'].includes(game.status) || narrowLandscape.matches) return;
    if (isChapter() && game.status === 'flying') return;
    if (isTutorial() && !tutorial.allows('fire') && !tutorial.allows('rotate')) { nudgeTutorial(); return; }
    event.preventDefault(); BloomSound.wake(); canvas.focus({ preventScroll: true });
    const point = coordinates(event);
    if (!isRush() && game.status === 'flying') { guiding = true; pointer = point; activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); game.guide(point); return; }
    // In Rush and the levels a touch on the board always aims; only Turn petal (or R) turns the petal there, so aiming
    // past it in a hurry never turns it by accident. The calm puzzle boards still turn it with a tap.
    if (!isRush() && rotateNearest(point)) return;
    if (point.y > game.launcher.y + 24) { toast('Aim above the seed, then let go.'); return; }
    aiming = true; activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); aimAt(point);
    $('game-hint').textContent = 'Let go to fire.';
  });
  canvas.addEventListener('pointermove', event => { if (event.pointerId !== activePointer) return; if (guiding && game.status === 'flying') { pointer = coordinates(event); game.guide(pointer); } else if (aiming && (isRush() || game.status === 'aiming')) aimAt(coordinates(event)); });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (guiding) { guiding = false; pointer = null; game.guide(null); return; }
    if (!aiming) return;
    const rect = canvas.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) { aiming = false; pointer = null; game.aim = []; return; }
    launch();
  });
  canvas.addEventListener('pointercancel', event => { if (event.pointerId === activePointer) cancelInteraction(); });
  canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === activePointer) cancelInteraction(); });
  canvas.addEventListener('keydown', event => {
    if (route !== 'game' || narrowLandscape.matches || dialogs.some(id => $(id).open)) return;
    if (!isRush() && !isChapter() && game.status === 'flying' && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const target = game.guideTarget || { x: 210, y: 230 };
      game.guide({ x: target.x + (event.key === 'ArrowLeft' ? -60 : event.key === 'ArrowRight' ? 60 : 0), y: target.y + (event.key === 'ArrowUp' ? -60 : event.key === 'ArrowDown' ? 60 : 0) });
      return;
    }
    if (game.status !== 'aiming' && !(isRush() && game.status === 'flying')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'r', 'R', 's', 'S'].includes(event.key)) event.preventDefault();
    BloomSound.wake();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') angle -= Math.PI / 60;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') angle += Math.PI / 60;
    angle = clamp(angle, -Math.PI + .16, -.16);
    if (event.key === ' ' || event.key === 'Enter') { if (!event.repeat) launch(); }
    else if (isRush() && event.key.toLowerCase() === 's') { if (!gate('split')) nudgeTutorial(); else if (game.split()) processEvents(); }
    else if (event.key.toLowerCase() === 'r') { if (game.bumpers[0]) rotateNearest(game.bumpers[0]); }
    else if (isRush() && /^[1-4]$/.test(event.key)) usePower(Powers.ids[Number(event.key) - 1]);
    else game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400);
  });
  canvas.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') && game.status === 'flying') game.guide(null); });
  canvas.addEventListener('blur', cancelInteraction);
  window.addEventListener('blur', cancelInteraction);
  const rotateButton = document.createElement('button'); rotateButton.id = 'rotate-btn'; rotateButton.type = 'button'; rotateButton.className = 'turn-petal-btn'; rotateButton.textContent = 'Turn petal';
  $('restart-btn').parentElement.insertBefore(rotateButton, $('restart-btn'));
  rotateButton.addEventListener('click', () => { if (!gate('rotate')) nudgeTutorial(); else if (game.bumpers[0]) rotateNearest(game.bumpers[0]); });
  function openRush() { if (preview) exitPreview(); if (isRush() && !isDepth() && !game.over) { closeDialogs(); setRoute('game'); } else startLevel({ id: 'rush', name: 'Meadow Rush' }); }
  function openLevels() { if (preview) exitPreview(); closeDialogs(); setRoute('levels'); }
  function showUnlock() { const card = $('depth-unlock'); if (card) card.scrollIntoView({ behavior: save.settings.motion ? 'smooth' : 'auto', block: 'center' }); }
  function startDepth(id, taste, from) { if (id === freshDepth) freshDepth = 0; if (preview) exitPreview(); startLevel({ id: 'rush', depth: id, name: Depths.level(id).name, taste: Boolean(taste), from: taste ? 1 : from || 1 }, { theme: depthTheme(id) }); }
  function replay() { if (isDepth()) startDepth(game.plan.id, isTaste()); else startLevel(game.level, { preview, theme }); }
  // The tutorial plays on the Sunny Meadow board. Finishing it (or skipping) marks it seen; the first time through
  // it leads straight into level 1, and it can be played again from How to play.
  function startTutorial() { if (preview) exitPreview(); startLevel({ id: 'rush', name: 'How to play', tutorial: true }, { theme: depthTheme(1) }); }
  function endTutorial(play) {
    if (!tutorial) return;
    tutorial.finish(); tutorial = null; tutorialKey = ''; document.body.dataset.tutorial = ''; document.body.dataset.tutorialPhase = ''; $('tutorial').hidden = true;
    // The tutorial teaches the powerups, so the one-time powerups tip is done too.
    const first = !save.tutorial; save.tutorial = true; save.powersMet = true; persist();
    if (play) { startDepth(1); return; }
    startLevel({ id: 'rush', name: 'Meadow Rush' }, { behind: true }); setRoute('levels');
    if (first) toast('You can play the tutorial again from the ? button.');
  }
  function nudgeTutorial() { if (!isTutorial()) return; BloomSound.play('tap'); $('tutorial').dataset.nudge = String(++tutorialNudges % 2); }
  // The card, the spotlight on the control it names, and a ghost finger showing the drag for a shot.
  function tutorialRect(target) {
    if (target === 'board') return canvas.getBoundingClientRect();
    // The petal is lit where it sits on the board, with room for its turn ring.
    if (target === 'petal') {
      const petal = game.bumpers.find(b => b.id === 'petal'); if (!petal) return null;
      const board = canvas.getBoundingClientRect(), sx = board.width / 420, sy = board.height / 560, r = (petal.length * .62 + 8) * sx;
      return { left: board.left + petal.x * sx - r, top: board.top + petal.y * sy - r, width: r * 2, height: r * 2 };
    }
    const el = target.startsWith('power:') ? $(Object.keys(TRAY).find(group => TRAY[group].includes(target.slice(6)))).querySelector(`[data-power="${target.slice(6)}"]`) : $(target);
    return el ? el.getBoundingClientRect() : null;
  }
  function renderTutorial() {
    const box = $('tutorial');
    if (!isTutorial() || route !== 'game') { box.hidden = true; return; }
    const v = tutorial.view(), done = v.phase === 'finale' || v.phase === 'end';
    box.hidden = false;
    const key = `${v.phase}|${v.number}|${v.title}|${v.text}|${v.target}`;
    if (key !== tutorialKey) {
      const fresh = v.phase === 'prompt' && !tutorialKey.startsWith(`prompt|${v.number}|${v.title}|${v.text}|`);
      tutorialKey = key;
      $('tutorial-step').textContent = done ? 'All done' : `${v.number} of ${v.total}`;
      $('tutorial-title').textContent = v.title; $('tutorial-text').textContent = v.text;
      $('tutorial-go').hidden = v.phase !== 'end'; $('tutorial-skip').hidden = done;
      $('tutorial-go').textContent = save.depths[1]?.stars ? 'Back to the levels' : 'Play level 1';
      box.dataset.phase = v.phase; document.body.dataset.tutorialPhase = v.phase;
      box.dataset.place = v.target && v.target.startsWith('power:') ? 'low' : 'high';
      $('tutorial-dim').hidden = $('tutorial-spot').hidden = !v.target; $('tutorial-spot-2').hidden = !v.also;
      $('tutorial-finger').hidden = !v.finger || !save.settings.motion;
      if (fresh) { say(`${v.title}. ${v.text}`); if (tutorial.index > 0 || tutorial.prompt > 0) BloomSound.play('tap'); }
      if (v.phase === 'show') BloomSound.play('shimmer', { combo: 5 });
    }
    if (!v.target) return;
    // Everything dims except a hole around each thing the card names, and each gets its own ring.
    [[v.target, 'tutorial-spot', 'tutorial-hole-1'], [v.also, 'tutorial-spot-2', 'tutorial-hole-2']].forEach(([target, ring, hole]) => {
      const rect = target && tutorialRect(target);
      if (!rect) { $(hole).setAttribute('width', 0); $(hole).setAttribute('height', 0); return; }
      const pad = target === 'board' || target.startsWith('power:') ? 4 : target === 'petal' ? 0 : 8;
      const left = rect.left - pad, top = rect.top - pad, width = rect.width + pad * 2, height = rect.height + pad * 2;
      const shape = target === 'board' ? 'board' : 'round', spot = $(ring).style;
      $(ring).dataset.shape = shape;
      spot.left = `${left}px`; spot.top = `${top}px`; spot.width = `${width}px`; spot.height = `${height}px`;
      for (const [name, value] of Object.entries({ x: left, y: top, width, height, rx: shape === 'board' ? 22 : Math.min(width, height) / 2 })) $(hole).setAttribute(name, value);
    });
    if (v.finger) {
      const board = canvas.getBoundingClientRect(), sx = board.width / 420, sy = board.height / 560, finger = $('tutorial-finger').style;
      finger.left = `${board.left + Tutorial.launcher.x * sx}px`; finger.top = `${board.top + (Tutorial.launcher.y - 26) * sy}px`;
      finger.setProperty('--dx', `${(v.finger[0] - Tutorial.launcher.x) * sx}px`); finger.setProperty('--dy', `${(v.finger[1] - Tutorial.launcher.y + 26) * sy}px`);
    }
  }
  $('rush-btn').addEventListener('click', openLevels);
  $('levels-rush-btn').addEventListener('click', openRush);
  $('resume-btn').addEventListener('click', () => { if (inProgress()) setRoute('game'); else renderLevels(); });
  $('depth-map').addEventListener('click', event => {
    const buy = event.target.closest('[data-buy]'); if (buy) { buyProduct(buy); return; }
    const card = event.target.closest('[data-depth]'); if (!card) return;
    const id = Number(card.dataset.depth), level = Depths.level(id); if (!level) return;
    BloomSound.wake();
    if (!depthPaid(id) && id === TASTE.level && tasteOpen()) { if (inProgress() && isTaste()) setRoute('game'); else startDepth(id, true); return; }
    if (!depthPaid(id)) { BloomSound.play('tap'); toast(id === TASTE.level ? `Clear level ${id - 1} to try ${level.name} free.` : `${level.name} is part of levels ${Depths.free + 1} to ${Depths.total}.`); showUnlock(); return; }
    if (!depthOpen(id)) { BloomSound.play('tap'); toast(`Clear level ${id - 1} to open ${level.name}.`); return; }
    // Tapping the level already being played picks it up where it was.
    if (inProgress() && isDepth() && game.plan.id === id) setRoute('game'); else startDepth(id);
  });
  $('garden-rush-btn').addEventListener('click', openRush);
  for (const group of Object.keys(TRAY)) $(group).addEventListener('click', event => { const chip = event.target.closest('[data-power]'); if (chip) usePower(chip.dataset.power); });
  $('power-shelf').addEventListener('click', event => { const button = event.target.closest('[data-buy]'); if (button) buyPower(button); });
  $('split-btn').addEventListener('click', () => { BloomSound.wake(); if (!gate('split')) nudgeTutorial(); else if (game.split()) processEvents(); });
  $('restart-btn').addEventListener('click', replay);
  $('back-btn').addEventListener('click', () => { if (preview) exitPreview(); else setRoute(isRush() ? 'levels' : 'garden'); });
  $('garden-btn').addEventListener('click', () => { if (preview) exitPreview(); setRoute('garden'); });
  $('grow-garden-btn').addEventListener('click', () => { closeDialogs(); setRoute('garden'); });
  $('plot-markers').addEventListener('click', event => {
    const button = event.target.closest('[data-plot]'); if (!button) return;
    save.garden = BloomGarden.select(save.garden, button.dataset.plot); persist(); renderMeadow();
    BloomSound.wake(); BloomSound.play('tap');
  });
  $('plant-btn').addEventListener('click', () => {
    const id = save.garden.selectedId, fromStage = save.garden.levels[id];
    const planted = BloomGarden.plant(save.garden, id); if (!planted.success) return;
    save.garden = planted.state;
    const goals = trackGoals({ type: 'meadow' }); persist(); renderMeadow();
    if (goals.paid) toast(`${goalNews(goals)} +${goals.paid} seeds`);
    growth = { plotId: id, fromStage, started: performance.now() };
    BloomSound.wake(); BloomSound.play('plant', { x: BloomMeadow.plots.find(p => p.id === id).x });
    haptic('tap');
    say(`${BloomGarden.plots.find(p => p.id === id).name} ${fromStage ? 'grew' : 'planted'}. ${save.garden.seeds} seeds left.`);
  });
  $('friend-spots').addEventListener('click', event => {
    const spot = event.target.closest('[data-friend]'); if (spot) greetFriend(spot.dataset.friend);
  });
  $('friend-grid').addEventListener('click', event => {
    const card = event.target.closest('[data-friend]'); if (!card) return;
    const friend = BloomGarden.decor.map(d => d.friend).find(f => f.id === card.dataset.friend); if (!friend) return;
    BloomSound.wake(); BloomSound.play('friend', { kind: friend.kind }); haptic('tick');
    card.classList.remove('wiggle'); void card.offsetWidth; card.classList.add('wiggle');
    toast(`${friend.name}: ${friend.says}`);
  });
  $('decor-grid').addEventListener('click', event => {
    const card = event.target.closest('[data-decor]'); if (!card) return;
    const id = card.dataset.decor, piece = BloomGarden.decor.find(d => d.id === id); if (!piece) return;
    BloomSound.wake();
    const built = BloomGarden.build(save.garden, id);
    if (!built.success) {
      BloomSound.play('tap');
      if (built.reason === 'insufficient-seeds') { const need = built.cost - save.garden.seeds; toast(`${need} more ${need === 1 ? 'seed' : 'seeds'} for the ${lower(piece.name)}.`); }
      return;
    }
    save.garden = built.state;
    const goals = trackGoals({ type: 'meadow' }); persist(); renderMeadow();
    growth = { decorId: id, started: performance.now() };
    const spot = BloomMeadow.decor.find(d => d.id === id);
    BloomSound.play('plant', { x: spot.x }); haptic('surge');
    toast(goals.paid ? `${piece.name} built! Goal done, +${goals.paid} seeds.` : `${piece.name} built!`);
    say(`${piece.name} built. ${save.garden.seeds} seeds left.`);
    const map = meadowCanvas.getBoundingClientRect();
    if (map.top < 0 || map.bottom > window.innerHeight) meadowCanvas.scrollIntoView({ behavior: save.settings.motion ? 'smooth' : 'auto', block: 'center' });
  });
  $('goals-list').addEventListener('click', event => {
    const button = event.target.closest('[data-goal]'); if (!button || button.getAttribute('aria-disabled') === 'true') return;
    BloomSound.wake(); BloomSound.play('tap');
    const play = button.dataset.goal;
    if (play === 'rush') openLevels();
    else if (play === 'daily') startLevel(BloomLevels.dailyLevel(localDate()));
    else if (play === 'puzzles') openWorld('meadow');
    else if (play === 'moon' || play === 'koi') openWorld(play);
    else if (play === 'meadow') meadowCanvas.scrollIntoView({ behavior: save.settings.motion ? 'smooth' : 'auto', block: 'center' });
  });
  $('collection-btn').addEventListener('click', () => { if (preview) exitPreview(); setRoute('collection'); });
  $('keepsake-shelf').addEventListener('click', event => {
    const buy = event.target.closest('[data-buy]'); if (buy) { buyProduct(buy); return; }
    const card = event.target.closest('[data-keepsake]'); if (card) chooseKeepsake(card.dataset.keepsake);
  });
  $('worlds-btn').addEventListener('click', () => { if (preview) exitPreview(); else setRoute('worlds'); });
  $('level-grid').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && unlocked(Number(button.dataset.level))) startLevel(levels.find(l => l.id === Number(button.dataset.level))); });
  $('worlds-grid').addEventListener('click', event => { const button = event.target.closest('[data-world]'); if (button) openWorld(button.dataset.world); });
  $('world-detail').addEventListener('click', event => {
    const buy = event.target.closest('[data-buy]'); if (buy) { buyProduct(buy); return; }
    const button = event.target.closest('[data-trial]'); if (!button || !chapters[button.dataset.chapter]) return;
    const world = button.dataset.chapter, list = chapters[world].levels, index = list.findIndex(level => level.id === button.dataset.trial);
    if (index < 0) return;
    if (!trialPaid(world, list[index])) { toast('This pool is part of the full Koi Conservatory.'); return; }
    if (trialOpen(world, index)) startLevel(list[index]);
  });
  $('reward-flower').addEventListener('click', event => {
    const wear = event.target.closest('[data-wear]'); if (!wear || !keepsakeOpen(wear.dataset.wear)) return;
    save.keepsake = wear.dataset.wear; persist(); BloomSound.wake(); BloomSound.play('tap');
    wear.disabled = true; wear.textContent = 'Wearing'; toast(`Wearing ${Keepsakes.byId[save.keepsake].name}!`);
  });
  $('daily-btn').addEventListener('click', () => startLevel(BloomLevels.dailyLevel(localDate())));
  $('retry-btn').addEventListener('click', replay);
  $('share-btn').addEventListener('click', shareResult);
  $('result-offer').addEventListener('click', event => { const buy = event.target.closest('[data-buy]'); if (buy) buyProduct(buy); });
  $('result-garden-btn').addEventListener('click', () => { closeDialogs(); if (preview) exitPreview(); else setRoute(isRush() ? 'levels' : 'garden'); });
  $('next-btn').addEventListener('click', () => {
    closeDialogs(); if (preview) { exitPreview(); return; }
    if (isDepth()) {
      const id = isTaste() ? game.plan.id : game.plan.id + 1;
      if (Depths.level(id) && depthOpen(id)) startDepth(id);
      else if (id === TASTE.level && tasteOpen()) startDepth(id, true);
      else { setRoute('levels'); if (Depths.level(id) && !depthPaid(id)) showUnlock(); }
      return;
    }
    const next = isChapter() ? nextTrial(game.level) : levels.find(l => l.id === game.level.id + 1);
    if (isChapter() && (!next || !trialPaid(game.level.worldId, next))) { const world = game.level.worldId; setRoute('worlds'); openWorld(world); }
    else if (next) startLevel(next); else setRoute('garden');
  });
  function exitPreview() {
    closeDialogs();
    if (returnSession) {
      const session = returnSession; returnSession = null;
      game = session.game; theme = session.theme; preview = false; angle = session.angle;
      displayScore = session.displayScore; resultAt = session.resultAt; resultShown = session.resultShown; newFlower = session.newFlower; newKeepsake = session.newKeepsake; rushRecordBroken = session.rushRecordBroken;
      runId = session.runId; runAward = session.runAward; runBouquet = session.runBouquet; runGoals = session.runGoals;
      aiming = false; guiding = false; pointer = null; game.aim = []; accumulator = 0; lastFrame = 0; hudKey = '';
      document.body.dataset.theme = theme; document.body.dataset.mode = isRush() ? 'rush' : 'campaign';
      document.body.dataset.world = isChapter() ? game.level.worldId : 'meadow';
      $('split-btn').hidden = !isRush();
      $('level-label').textContent = session.label; $('level-name').textContent = session.name; $('game-hint').textContent = session.hint;
      canvas.setAttribute('aria-label', session.aria); updateHud();
    } else startLevel(levels[save.lastLevel - 1] || levels[0]);
    setRoute('worlds');
  }
  $('world-preview-btn').addEventListener('click', () => {
    if (!currentWorld) return;
    if (chapters[currentWorld.id]) { const level = chapters[currentWorld.id].levels.find(item => item.id === $('world-preview-btn').dataset.trial); if (level) startLevel(level); return; }
    if (!preview) returnSession = { game, theme, angle, displayScore, resultAt, resultShown, newFlower, newKeepsake, rushRecordBroken, runId, runAward, runBouquet, runGoals, label: $('level-label').textContent, name: $('level-name').textContent, hint: $('game-hint').textContent, aria: canvas.getAttribute('aria-label') };
    startLevel(levels[0], { preview: true, theme: currentWorld.theme || currentWorld.id });
  });
  function updateSettings() {
    BloomSound.setEnabled(save.settings.sound);
    // Music has no default in the save: a missing value means on, so older saves keep their exact settings.
    if (typeof BloomSound.setMusic === 'function') BloomSound.setMusic(save.settings.sound && save.settings.music !== false);
    $('toggle-sound').checked = save.settings.sound; $('toggle-haptics').checked = save.settings.haptics; $('toggle-motion').checked = save.settings.motion;
    $('toggle-music').checked = save.settings.music !== false;
    $('sound-btn').setAttribute('aria-pressed', String(save.settings.sound)); $('sound-btn').setAttribute('aria-label', save.settings.sound ? 'Mute sound' : 'Enable sound');
    $('sound-btn').classList.toggle('muted', !save.settings.sound);
    document.body.classList.toggle('reduce-motion', !save.settings.motion);
    meadowDirty = true;
    $('settings-storage').textContent = storageAvailable ? 'Saved on this device. No account needed.' : "This browser won't save, so progress lasts for this visit only.";
  }
  $('settings-btn').addEventListener('click', () => { updateSettings(); showDialog('settings-dialog'); });
  $('help-btn').addEventListener('click', () => { $('levels-help').open = isDepth() || route === 'levels'; $('rush-help').open = isRush() && !isDepth() && route !== 'levels'; $('campaign-help').open = !isRush() && !isChapter(); $('moon-help').open = isMoon(); $('koi-help').open = isKoi(); $('tutorial-replay').hidden = isTutorial(); showDialog('help-dialog'); });
  $('tutorial-replay').addEventListener('click', () => { closeDialogs(); BloomSound.wake(); startTutorial(); });
  $('tutorial-skip').addEventListener('click', () => { BloomSound.wake(); endTutorial(false); });
  $('tutorial-go').addEventListener('click', () => { BloomSound.wake(); endTutorial(!save.depths[1]?.stars); });
  for (const key of ['sound', 'haptics', 'motion', 'music']) $(`toggle-${key}`).addEventListener('change', event => { save.settings[key] = event.target.checked; BloomSound.wake(); updateSettings(); persist(); });
  $('sound-btn').addEventListener('click', () => { save.settings.sound = !save.settings.sound; BloomSound.wake(); updateSettings(); persist(); toast(save.settings.sound ? 'Sound on' : 'Sound off'); });
  for (const key of ['settings', 'help', 'world']) $(`close-${key}`).addEventListener('click', () => closeDialog(`${key}-dialog`));
  dialogs.forEach(id => $(id).addEventListener('click', event => { if (event.target === $(id)) { const r = $(id).getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(id); } }));
  function resize() {
    cancelInteraction();
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const width = Math.round(420 * dpr), height = Math.round(560 * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (meadowCanvas.width !== width || meadowCanvas.height !== Math.round(330 * dpr)) { meadowCanvas.width = width; meadowCanvas.height = Math.round(330 * dpr); }
    meadowCtx.setTransform(dpr, 0, 0, dpr, 0, 0); meadowDirty = true;
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastFrame = 0; accumulator = 0; cancelInteraction(); musicFrame(performance.now(), true); });
  function frame(timestamp) {
    requestAnimationFrame(frame);
    partyFrame(timestamp);
    musicFrame(timestamp);
    if (!document.hidden && route === 'collection') drawShowcase(timestamp);
    if (!document.hidden && route === 'garden' && (meadowDirty || save.settings.motion && timestamp - meadowFrame >= 1000 / 30)) drawMeadow(timestamp);
    if (document.hidden || route !== 'game') { lastFrame = timestamp; return; }
    const dt = Math.min(lastFrame ? (timestamp - lastFrame) / 1000 : 0, .06); lastFrame = timestamp;
    feelStep(dt);
    const paused = narrowLandscape.matches || dialogs.some(id => $(id).open);
    // In the tutorial the whole board (seeds, flowers, petals and sparkles) runs at the speed its card sets.
    if (!paused && isTutorial()) tutorial.tick(game, dt);
    const gdt = (isTutorial() ? dt * tutorial.scale : dt) * (feel && !isTutorial() ? feel.out.scale : 1);
    if (!paused && freeze > 0) { freeze -= dt; }
    else if (!paused) {
      accumulator += gdt;
      while (accumulator >= 1 / 120) { game.step(1 / 120); accumulator -= 1 / 120; }
      processEvents();
      for (const ball of game.balls || []) ball.hot = !isRush() && (game.combo || 0) >= 8;
      game.particles = stepParticles(game.particles, gdt, 24, 396, 530);
      for (const p of game.floaters) { p.life -= gdt; p.y -= gdt * 12; }
      game.floaters = game.floaters.filter(p => p.life > 0).slice(-16);
      if (!resultShown && game.time >= resultAt && !(feel && feel.out.busy)) showResult();
    }
    displayScore += (game.score - displayScore) * Math.min(1, dt * 10);
    if (Math.abs(game.score - displayScore) < 1) displayScore = game.score;
    stageFrame(dt);
    updateHud(); renderTutorial(); pulseTime += dt;
    if (isRush() && (aiming || game.aim.length)) { game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400); aimLock(); }
    trauma = Math.max(0, trauma - dt * 1.7); flash = Math.max(0, flash - dt * 3.2); kick = Math.max(0, kick - dt * 5);
    // While the camera is zoomed in, the shake is divided by the zoom so the leaned-in frame stays steady.
    const t2 = trauma * trauma / (feel ? feel.out.zoom : 1), nt = timestamp / 1000;
    const shake = t2 > .001 ? { x: Math.sin(nt * 47.3) * Math.cos(nt * 13.1) * 9 * t2, y: Math.sin(nt * 39.7 + 1.3) * 9 * t2, r: Math.sin(nt * 29.1) * .018 * t2 } : null;
    const worn = currentKeepsake(), view = feel && !isTutorial() ? feel.out : null;
    BloomArt.draw(ctx, game, game.time, { theme, reducedMotion: !save.settings.motion, keepsake: worn.seed ? worn : null, pointer, shake, flash, kick, showAim: isRush() ? aiming || game.aim.length > 0 : game.status === 'aiming', selectedBumper: isRush() ? game.rotateCooldown <= 0 ? game.bumpers[0]?.id : null : game.status === 'aiming' && !game.rotationUsed ? game.bumpers[0]?.id : null,
      camera: view && view.zoom > 1.001 ? view : null, vignette: view ? view.vignette : 0, quality: game.quality || 0, ahead: view && view.scale < .99 ? accumulator : 0, danger, realTime: nt });
  }
  updateSettings(); persist(); renderMeadow(); renderDaily();
  // The game opens on the level map; an endless Rush board waits behind it until a level is picked.
  const initial = { id: 'rush', name: 'Meadow Rush' };
  startLevel(initial, { behind: true }); setRoute('levels'); resize(); requestAnimationFrame(frame);
  // A brand-new player starts with the tutorial; it leads into level 1.
  if (!save.tutorial) startTutorial();
  // A read-only snapshot aids local QA without adding a way to grant progress.
  Object.defineProperty(window, 'bloomshotState', { get: () => ({ ...game.snapshot(), route, theme, preview, earnedFlowers: flowers.filter(earned).map(f => f.id), storageAvailable }), configurable: false });
})();
