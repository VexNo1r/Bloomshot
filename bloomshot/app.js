(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Game, clamp } = BloomEngine;
  const { levels, flowers, worlds } = BloomLevels;
  // Five-seed chapters share one flow: Moon gates are free, Koi currents are free for two pools.
  const chapters = { moon: BloomMoon, koi: BloomKoi };
  const CHAPTER_NAMES = { moon: 'MOON GARDEN', koi: 'KOI CONSERVATORY' };
  const store = window.BloomStore || null;
  const STORAGE = new URLSearchParams(location.search).has('qa') ? 'bloomshot.qa.v1' : 'bloomshot.save.v1';
  const defaults = { version: 1, garden: BloomGarden.normalize(), progress: {}, moon: {}, koi: {}, daily: {}, rush: { best: 0, bestWave: 1, runs: 0, blooms: 0 }, lastLevel: 1, settings: { sound: true, haptics: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches } };
  let storageAvailable = true;
  function readSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (!raw || raw.version !== 1) return structuredClone(defaults);
      const valid = structuredClone(defaults);
      valid.garden = BloomGarden.normalize(raw.garden);
      for (const world of Object.keys(chapters)) for (const level of chapters[world].levels) {
        const record = raw[world]?.[level.id];
        if (record && Number.isFinite(record.best) && Number.isInteger(record.stars) && record.stars >= 0 && record.stars <= 3) valid[world][level.id] = { best: Math.max(0, record.best), stars: record.stars, attempts: Math.max(0, Number(record.attempts) || 0) };
      }
      for (const level of levels) {
        const record = raw.progress?.[level.id];
        if (record && Number.isFinite(record.best) && Number.isInteger(record.stars) && record.stars >= 0 && record.stars <= 3) valid.progress[level.id] = { best: Math.max(0, record.best), stars: record.stars, attempts: Math.max(0, Number(record.attempts) || 0) };
      }
      valid.lastLevel = clamp(Number(raw.lastLevel) || 1, 1, levels.length);
      for (const key of ['best', 'bestWave', 'runs', 'blooms']) if (Number.isFinite(raw.rush?.[key]) && raw.rush[key] >= 0) valid.rush[key] = Math.floor(raw.rush[key]);
      for (const key of ['sound', 'haptics', 'motion']) if (typeof raw.settings?.[key] === 'boolean') valid.settings[key] = raw.settings[key];
      if (raw.daily && typeof raw.daily === 'object') for (const [key, value] of Object.entries(raw.daily).slice(-14)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        if (/^daily-\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(value.best) && value.best >= 0 && Number.isInteger(value.stars) && value.stars >= 0 && value.stars <= 3) valid.daily[key] = value;
      }
      return valid;
    } catch (_) { return structuredClone(defaults); }
  }
  const save = readSave();
  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify(save)); }
    catch (_) { storageAvailable = false; $('settings-storage').textContent = 'Progress is saved for this visit only. This browser is not allowing device storage.'; }
  }
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const meadowCanvas = $('meadow-canvas'), meadowCtx = meadowCanvas.getContext('2d');
  let meadowDirty = true, meadowFrame = 0, growth = null;
  let runId = '', runAward = 0;
  let game, route = 'game', theme = 'meadow', preview = false, returnSession = null;
  let aiming = false, guiding = false, pointer = null, activePointer = null, angle = -Math.PI / 2, resultAt = Infinity, resultShown = false;
  const narrowLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
  let lastFrame = 0, accumulator = 0, toastTimer, currentWorld = null, newFlower = null;
  let displayScore = 0, hudKey = '', pulseTime = 0, rushRecordBroken = false;
  const dialogs = ['result-dialog', 'settings-dialog', 'help-dialog', 'world-dialog'];
  const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
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
  }
  function closeDialog(id) { if ($(id).open) $(id).close(); }
  function closeDialogs() { dialogs.forEach(closeDialog); }
  function unlocked(id) { return id === 1 || (save.progress[id - 1]?.stars || 0) > 0; }
  function earned(flower) { return (save.progress[flower.unlockLevel]?.stars || 0) > 0; }
  const isRush = () => game?.mode === 'rush';
  const isMoon = () => game?.level.worldId === 'moon';
  const isKoi = () => game?.level.worldId === 'koi';
  const isChapter = () => Boolean(game && chapters[game.level.worldId]);
  const koiOwned = () => Boolean(store && store.owns(BloomKoi.entitlement));
  // A trial opens when the previous one has a star and, for paid pools, when the pack is owned.
  const trialPaid = (world, level) => world !== 'koi' || level.free || koiOwned();
  const trialCleared = (world, index) => index === 0 || (save[world][chapters[world].levels[index - 1].id]?.stars || 0) > 0;
  const trialOpen = (world, index) => trialCleared(world, index) && trialPaid(world, chapters[world].levels[index]);
  const nextTrial = level => { const list = chapters[level.worldId].levels; return list[list.findIndex(item => item.id === level.id) + 1] || null; };
  function koiOffer() {
    const product = store && store.products().find(item => item.id === BloomKoi.product);
    return { live: Boolean(store && store.isLive()), available: Boolean(product && product.available), price: product?.price || '', mode: store?.mode || 'web' };
  }
  function record() { return isRush() ? save.rush : isChapter() ? save[game.level.worldId][game.level.id] : typeof game.level.id === 'number' ? save.progress[game.level.id] : save.daily[game.level.id]; }
  function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function setRoute(next) {
    route = next; cancelInteraction();
    for (const name of ['game', 'garden', 'collection', 'worlds']) $(`${name}-view`).hidden = next !== name;
    for (const name of ['rush', 'garden', 'collection', 'worlds']) {
      const active = next === name || (name === 'rush' && next === 'game');
      $(`${name}-btn`).classList.toggle('active', active); $(`${name}-btn`).setAttribute('aria-current', active ? 'page' : 'false');
    }
    if (next === 'garden') renderGarden();
    if (next === 'collection') renderCollection();
    if (next === 'worlds') renderWorlds();
    document.body.dataset.view = next;
    if (next === 'game') resize();
  }
  function startLevel(level, options = {}) {
    closeDialogs();
    game = level.id === 'rush' ? new BloomRush.RushGame() : new Game(level); game.particles = []; game.floaters = [];
    preview = Boolean(options.preview); theme = options.theme || (isChapter() ? game.level.worldId : 'meadow');
    document.body.dataset.theme = theme;
    document.body.dataset.mode = isRush() ? 'rush' : 'campaign';
    document.body.dataset.world = isChapter() ? game.level.worldId : 'meadow';
    if (!isRush()) for (const key of ['wave', 'lives', 'elapsed', 'splitReady']) delete canvas.dataset[key];
    $('split-btn').hidden = !isRush();
    angle = -Math.PI / 2; pointer = null; aiming = false; guiding = false; resultAt = Infinity; resultShown = false;
    displayScore = 0; hudKey = ''; newFlower = null; accumulator = 0; rushRecordBroken = false;
    runId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; runAward = 0;
    if (!preview && typeof level.id === 'number') { save.lastLevel = level.id; persist(); }
    $('level-name').textContent = level.name;
    $('level-label').textContent = preview ? `${theme === 'moon' ? 'MOON GARDEN' : 'KOI GARDEN'} · VISUAL PREVIEW` : typeof level.id === 'number' ? `THE MEADOW · ${String(level.id).padStart(2, '0')} / ${levels.length}` : 'THE DAILY GARDEN';
    $('game-hint').textContent = preview ? 'Preview the colors of a future garden.' : level.id === 1 ? 'Aim & release. Then drag to guide your swarm!' : 'Aim your volley. Drag to guide it into the flowers.';
    canvas.setAttribute('aria-label', `${level.name}. Aim with arrow keys and press Space to launch three balls. While flying, arrow keys guide the swarm. Press R to rotate a petal. Three volleys to bloom the garden.`);
    if (isRush()) {
      $('level-name').textContent = 'Meadow Rush';
      $('game-hint').textContent = 'Aim & release one seed. Keep flowers above the line.';
      canvas.setAttribute('aria-label', 'Meadow Rush. Aim and release one seed at a time. Flowers descend after your first shot. Three breached clusters end your run. Arrow keys aim, Space fires, S splits after six direct hits, R turns the petal.');
    }
    if (isChapter()) {
      const list = chapters[level.worldId].levels;
      $('level-label').textContent = `${CHAPTER_NAMES[level.worldId]} · ${String(list.findIndex(item => item.id === level.id) + 1).padStart(2, '0')} / ${list.length}`;
      $('game-hint').textContent = level.hint || level.description;
      canvas.setAttribute('aria-label', `${level.name}. Five single-seed shots. ${isKoi() ? 'Flowing currents turn your seed toward the way the water runs.' : 'Paired moon gates transport your seed.'} Aim with arrows, Space fires, R turns a leaf between shots. No in-flight steering.`);
    }
    setRoute('game'); updateHud();
  }
  function updateHud() {
    const rush = isRush();
    const key = `${game.shotsLeft}|${game.bloomedCount}|${game.status}|${game.rotationUsed}|${game.wave}|${game.lives}`;
    if (key !== hudKey) {
      hudKey = key;
      const remaining = rush ? game.lives : game.shotsLeft;
      const units = rush ? remaining === 1 ? 'life' : 'lives' : isChapter() ? remaining === 1 ? 'seed' : 'seeds' : remaining === 1 ? 'volley' : 'volleys';
      $('seed-count').innerHTML = Array.from({ length: isChapter() ? game.rules.shots : 3 }, (_, index) => `<span class="seed-dot ${index < remaining ? 'available' : 'used'}" aria-hidden="true"></span>`).join('') + `<span class="seed-label">${remaining} ${units}</span>`;
      $('seed-count').setAttribute('aria-label', `${remaining} ${units} remaining`);
      $('bloom-count').textContent = rush ? `${game.bloomedCount} ${game.bloomedCount === 1 ? 'bloom' : 'blooms'}` : `${game.bloomedCount} / ${game.buds.length} bloomed`;
      if (rush) $('level-label').textContent = `SURVIVAL · WAVE ${String(game.wave).padStart(2, '0')}`;
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
      const rides = game.currentRides || 0, words = `${rides} ${rides === 1 ? 'CURRENT' : 'CURRENTS'} RIDDEN`;
      $('combo-label').textContent = words;
      $('combo-meter').style.setProperty('--charge', '0%'); $('combo-meter').classList.remove('fever');
      $('combo-meter').setAttribute('aria-label', 'Koi currents ridden'); $('combo-meter').setAttribute('aria-valuenow', '0');
      $('combo-meter').setAttribute('aria-valuetext', words.toLowerCase());
      $('guide-label').textContent = game.status === 'flying' ? 'FOLLOW THE CURRENT' : `3 STARS · ${game.level.par} SHOTS`;
      $('fever-banner').hidden = true; return;
    }
    if (isMoon()) {
      $('combo-label').textContent = `${game.gatePasses || 0} GATE ${game.gatePasses === 1 ? 'CROSSING' : 'CROSSINGS'}`;
      $('combo-meter').style.setProperty('--charge', '0%'); $('combo-meter').classList.remove('fever');
      $('combo-meter').setAttribute('aria-label', 'Moon gate crossings'); $('combo-meter').setAttribute('aria-valuenow', '0');
      $('combo-meter').setAttribute('aria-valuetext', `${game.gatePasses || 0} gate crossings`);
      $('guide-label').textContent = game.status === 'flying' ? 'FOLLOW THE MOONLIGHT' : `3 STARS · ${game.level.par} SHOTS`;
      $('fever-banner').hidden = true; return;
    }
    if (rush) {
      canvas.dataset.wave = game.wave; canvas.dataset.lives = game.lives; canvas.dataset.balls = game.balls.length;
      canvas.dataset.elapsed = game.elapsed.toFixed(2); canvas.dataset.splitReady = game.splitReady;
      $('rotate-btn').disabled = game.status === 'lost' || game.rotateCooldown > 0;
      $('rotate-btn').textContent = game.rotateCooldown > 0 ? `Turn · ${Math.ceil(game.rotateCooldown)}s` : 'Turn petal';
      $('combo-label').textContent = game.splitCharge >= 1 ? 'SPLIT CHARGED' : `SPLIT · ${Math.round(game.splitCharge * 6)}/6 HITS`;
      $('combo-meter').style.setProperty('--charge', `${game.splitCharge * 100}%`);
      $('combo-meter').classList.toggle('fever', game.splitReady);
      $('combo-meter').setAttribute('aria-label', 'Manual split charge');
      $('combo-meter').setAttribute('aria-valuenow', String(Math.round(game.splitCharge * 100)));
      $('guide-label').textContent = game.status === 'lost' ? 'RUN OVER' : game.fireCooldown > 0 ? 'RELOADING' : game.balls.length >= 5 ? '5 SEEDS IN PLAY' : 'SHOT READY';
      $('split-btn').disabled = !game.splitReady;
      $('split-btn').style.setProperty('--split-charge', `${game.splitCharge * 100}%`);
      $('split-btn').textContent = game.splitReady ? 'Split +2 ✦' : game.splitCharge >= 1 ? game.balls.length ? 'Split · need room' : 'Split · fire first' : `Split · ${Math.round(game.splitCharge * 6)}/6`;
      $('fever-banner').hidden = game.feverTime <= 0;
      $('fever-banner').textContent = 'SUPER BLOOM!';
      return;
    }
    if ($('combo-label')) $('combo-label').textContent = game.combo ? `${game.combo} BLOOMS · ×${Math.min(10, 1 + Math.floor((game.combo - 1) / 5))}` : 'BUILD YOUR SUPER BLOOM';
    if ($('combo-meter')) {
      $('combo-meter').style.setProperty('--charge', `${game.feverTime > 0 ? 100 : game.combo % 12 / 12 * 100}%`);
      $('combo-meter').classList.toggle('fever', game.feverTime > 0);
      $('combo-meter').setAttribute('aria-label', `${game.combo} consecutive blooms`);
      $('combo-meter').setAttribute('aria-valuenow', String(game.feverTime > 0 ? 100 : Math.round(game.combo % 12 / 12 * 100)));
    }
    if ($('guide-label')) $('guide-label').textContent = game.status === 'flying' ? `GUIDE ${Math.ceil(game.guideCharge * 100)}%` : '3 BALLS / VOLLEY';
    if ($('fever-banner')) { $('fever-banner').hidden = game.feverTime <= 0; $('fever-banner').textContent = 'SUPER BLOOM!'; }
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
  function renderGarden() {
    renderMeadow();
    $('rush-best').textContent = save.rush.runs ? `Best ${fmt(save.rush.best)} · Wave ${save.rush.bestWave} · ${fmt(save.rush.blooms)} total blooms` : 'One seed. Rising pressure. How far can you grow?';
    const rushLabel = isRush() && game.started && game.status !== 'lost' ? 'Resume Meadow Rush' : 'Play Meadow Rush';
    $('garden-rush-btn').setAttribute('aria-label', rushLabel);
    $('garden-rush-btn').querySelector('strong').textContent = rushLabel;
    $('level-grid').innerHTML = levels.map(level => {
      const data = save.progress[level.id], open = unlocked(level.id);
      return `<button class="level-card ${data?.stars ? 'completed' : ''} ${level.id === save.lastLevel ? 'current' : ''}" data-level="${level.id}" ${open ? '' : 'disabled'} aria-label="Garden ${level.id}, ${escape(level.name)}${open ? data?.stars ? `, ${data.stars} stars` : ', ready to play' : ', locked'}"><span class="level-number">${String(level.id).padStart(2, '0')}</span><span class="level-card-name">${escape(level.name)}</span><span class="level-stars" aria-hidden="true">${open ? starText(data?.stars || 0) : '◇'}</span></button>`;
    }).join('');
    const completed = Object.values(save.progress).filter(p => p.stars > 0).length;
    const total = Object.values(save.progress).reduce((n, p) => n + p.stars, 0);
    const summary = $('garden-summary'); if (summary) summary.textContent = `${completed} of ${levels.length} gardens in bloom · ${total} stars`;
  }
  function renderMeadow() {
    const data = BloomGarden.summary(save.garden), selected = data.plots.find(p => p.selected);
    $('garden-seeds').textContent = fmt(data.seeds);
    $('meadow-summary').textContent = !data.totalStages ? data.seeds >= 4 ? 'Choose your first patch. Your seeds are ready to plant.' : 'Choose a patch. Your next run helps bring it to life.' : data.completedPlots === 6 ? 'Your meadow is in full bloom. Every flower grew from your play.' : `${data.totalStages} of 18 growth stages · ${data.completedPlots} of 6 patches in full bloom`;
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
    $('plot-stage').textContent = selected.stage ? `${selected.stageName} · ${selected.stage}/3` : 'READY TO PLANT';
    $('plot-message').textContent = selected.description;
    $('plant-btn').disabled = !selected.canPlant;
    $('plant-btn').textContent = selected.stage === 3 ? 'In full bloom' : `${selected.stage ? 'Grow' : 'Plant'} · ${selected.nextCost} seeds`;
    $('garden-earning-hint').textContent = selected.stage === 3 ? 'Choose another patch, or head back into Rush.' : !selected.canPlant ? `${selected.nextCost - data.seeds} more seeds to ${selected.stage ? 'grow' : 'plant'} this patch. Bloom flowers in Rush to earn them.` : 'Seeds come from Rush blooms and new stars in garden puzzles.';
    $('garden-btn').classList.toggle('has-seeds', data.plots.some(p => p.canPlant));
    meadowCanvas.dataset.seeds = data.seeds; meadowCanvas.dataset.stages = data.totalStages;
    meadowCanvas.dataset.selected = data.selectedId;
    meadowCanvas.setAttribute('aria-label', `Your meadow, ${data.totalStages} of 18 growth stages. ${data.seeds} ${data.seeds === 1 ? 'seed' : 'seeds'} available. Choose a flower patch using the labeled buttons.`);
    meadowDirty = true;
  }
  function drawMeadow(timestamp) {
    const progress = growth ? Math.min(1, (timestamp - growth.started) / 950) : 1;
    BloomMeadow.draw(meadowCtx, { width: 420, height: 330, state: save.garden, selectedId: save.garden.selectedId, time: timestamp / 1000, motion: save.settings.motion, growth: growth && { ...growth, progress } });
    if (growth && save.settings.motion && progress < 1) {
      const point = BloomMeadow.plots.find(p => p.id === growth.plotId);
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
  function awardSeeds(reward) {
    const result = BloomGarden.grant(save.garden, { ...reward, runId, completed: true });
    save.garden = result.state; runAward = result.awarded;
    $('garden-btn').classList.toggle('has-seeds', BloomGarden.summary(save.garden).plots.some(p => p.canPlant));
  }
  function renderCollection() {
    $('collection-grid').innerHTML = flowers.map(flower => {
      const has = earned(flower);
      return `<article class="flower-card ${has ? 'unlocked' : 'locked'}">${flowerGraphic(flower, !has)}<span class="flower-index">NO. ${String(flowers.indexOf(flower) + 1).padStart(2, '0')}</span><h3>${escape(flower.name)}</h3><p class="flower-latin">${escape(flower.latin || '')}</p><p>${has ? escape(flower.description) : `Complete garden ${flower.unlockLevel} to collect.`}</p><span class="flower-status">${has ? 'In your collection' : `Garden ${String(flower.unlockLevel).padStart(2, '0')}`}</span></article>`;
    }).join('');
    const summary = $('collection-summary'); if (summary) summary.textContent = `${flowers.filter(earned).length} of ${flowers.length} flowers discovered`;
  }
  const worldImages = new Map();
  function worldArt(world) {
    if (!worldImages.has(world.id)) {
      const surface = document.createElement('canvas'); surface.width = 720; surface.height = 340;
      const brush = surface.getContext('2d'); brush.scale(2, 2);
      const moon = world.id === 'moon', koi = world.id === 'koi';
      const sky = brush.createLinearGradient(0, 0, 360, 170);
      sky.addColorStop(0, moon ? '#292253' : koi ? '#8fefe4' : '#b6eef8');
      sky.addColorStop(1, moon ? '#7056a2' : koi ? '#5dbecd' : '#e0f8d3');
      brush.fillStyle = sky; brush.fillRect(0, 0, 360, 170);
      if (moon) BloomArt.drawMoon(brush, 285, 44, 29);
      if (koi) {
        // A still pool seen from above: sunlit caustics, ripples, lily pads and three koi.
        const glow = brush.createRadialGradient(250, 40, 10, 250, 40, 220);
        glow.addColorStop(0, 'rgba(255,248,214,.75)'); glow.addColorStop(1, 'rgba(255,248,214,0)');
        brush.fillStyle = glow; brush.fillRect(0, 0, 360, 170);
        brush.strokeStyle = '#eafff9'; brush.lineWidth = 1.1;
        for (let i = 0; i < 9; i++) { brush.globalAlpha = .18; brush.beginPath(); brush.moveTo(-10, 18 + i * 19); brush.bezierCurveTo(90, 8 + i * 19, 200, 34 + i * 19, 370, 14 + i * 19); brush.stroke(); }
        brush.globalAlpha = .45; brush.lineWidth = 1.3;
        for (const [cx, cy] of [[287, 89], [96, 58]]) for (let i = 0; i < 4; i++) { brush.beginPath(); brush.ellipse(cx, cy, 16 + i * 13, 5 + i * 4.5, -.18, 0, Math.PI * 2); brush.stroke(); }
        brush.globalAlpha = 1;
        for (const [x, y, r, notch] of [[54, 128, 30, .3], [168, 34, 22, 2.2], [322, 140, 34, 3.7], [236, 150, 18, 1.2]]) {
          brush.fillStyle = '#2f9e6e'; brush.beginPath(); brush.moveTo(x, y); brush.arc(x, y, r, notch + .35, notch + Math.PI * 2 - .05); brush.closePath(); brush.fill();
          brush.fillStyle = '#5cc98c'; brush.beginPath(); brush.moveTo(x, y); brush.arc(x, y, r * .82, notch + .4, notch + Math.PI * 2 - .1); brush.closePath(); brush.fill();
          brush.strokeStyle = 'rgba(255,255,255,.35)'; brush.lineWidth = 1;
          for (let v = 0; v < 6; v++) { const a = notch + .7 + v * .95; brush.beginPath(); brush.moveTo(x, y); brush.lineTo(x + Math.cos(a) * r * .78, y + Math.sin(a) * r * .78); brush.stroke(); }
        }
        BloomArt.drawFlower(brush, 54, 124, 17, 'coral', 1, 0); BloomArt.drawFlower(brush, 322, 134, 19, 'lilac', 1, 0); BloomArt.drawFlower(brush, 168, 31, 12, 'gold', 1, 0);
        if (BloomArt.koiFish) for (const [x, y, a, size, palette] of [[150, 104, -.35, 22, ['#f0552f', '#ffb48a']], [252, 64, 2.7, 18, ['#ffffff', '#ffe7c7']], [104, 150, .15, 15, ['#f7a21b', '#ffe3a1']]]) {
          brush.save(); brush.globalAlpha = .22; brush.fillStyle = '#0b5e63'; brush.beginPath(); brush.ellipse(x + 4, y + 6, size, size * .4, a, 0, Math.PI * 2); brush.fill(); brush.restore();
          BloomArt.koiFish(brush, x, y, a, .4, size, palette);
        }
      } else for (const [x, y, r, type] of [[72, 71, 32, 'coral'], [173, 109, 30, 'gold'], [238, 126, 24, 'lilac'], [331, 160, 28, 'coral']]) {
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
    if (world.id === 'koi') return `${koiOwned() ? 'YOUR CONSERVATORY' : 'TWO FREE POOLS'} · ${cleared} / ${total} CLEARED`;
    return `FREE CHAPTER · ${cleared} / ${total} CLEARED`;
  }
  function renderWorlds() {
    $('worlds-grid').innerHTML = worlds.map(world => {
      const chapter = Boolean(chapters[world.id]);
      const eyebrow = chapter ? chapterEyebrow(world) : world.available ? 'YOURS TO EXPLORE' : 'A FUTURE GARDEN';
      const action = world.id === 'moon' ? 'Enter the moon garden' : world.id === 'koi' ? 'Enter the conservatory' : world.available ? 'Return to the meadow' : 'Take a look';
      return `<button class="world-card ${world.id}" data-world="${world.id}"><span class="world-art">${worldArt(world)}</span><span class="world-card-body"><span class="eyebrow">${eyebrow}</span><span class="world-card-title">${escape(world.name)}</span><span class="world-card-desc">${escape(world.tagline)}</span><span class="world-card-action">${action}</span></span></button>`;
    }).join('');
  }
  // The unlock is described exactly: what it contains, the price the store reports, and that it is one purchase.
  function koiUnlockPanel() {
    if (koiOwned()) return '';
    const offer = koiOffer(), paid = BloomKoi.levels.filter(level => !level.free).length;
    let action;
    if (offer.live && offer.available) action = `<button class="button-primary unlock-btn" type="button" data-buy="${BloomKoi.product}">Unlock all ${BloomKoi.levels.length} pools${offer.price ? ` · ${escape(offer.price)}` : ''}</button><p class="unlock-fine">${offer.mode === 'mock' ? 'TEST MODE: this purchase is simulated and nothing is charged.' : 'One payment through your app store. Restore it any time from Settings.'}</p>`;
    else if (offer.live) action = `<p class="unlock-fine">The full conservatory is not on sale yet. Your free pools are ready now.</p>`;
    else action = `<p class="unlock-fine">Pools ${BloomKoi.freeBoards + 1} to ${BloomKoi.levels.length} unlock in the Bloomshot app for iPhone, iPad and Android.</p>`;
    return `<div class="unlock-panel" id="koi-unlock"><div class="unlock-copy"><span class="eyebrow">THE FULL CONSERVATORY</span><strong>${paid} more pools of moving water</strong><p>Whirlpools, a waterfall, a reed maze and a moonlit finale. A one-time purchase with no ads, no timers and nothing random. Your stars and seeds carry over.</p>${action}</div></div>`;
  }
  function renderChapter(world) {
    const id = world.id, chapter = chapters[id], koi = id === 'koi', records = save[id];
    const rows = chapter.levels.map((level, index) => {
      const paid = trialPaid(id, level), open = paid && trialCleared(id, index), stars = records[level.id]?.stars || 0;
      const state = !paid ? 'included with the full Koi Conservatory' : open ? `${stars} stars` : 'locked';
      const tag = koi && level.free && !koiOwned() ? '<small class="free-tag">FREE</small>' : '';
      return `<button class="moon-trial${paid ? '' : ' paid-lock'}" data-trial="${level.id}" data-chapter="${id}" ${open || !paid ? '' : 'disabled'} aria-label="${koi ? 'Koi pool' : 'Moon trial'} ${index + 1}, ${escape(level.name)}, ${state}"><span class="moon-trial-number">${String(index + 1).padStart(2, '0')}</span><span class="moon-trial-name">${escape(level.name)}${tag}</span><span class="moon-trial-stars" aria-hidden="true">${!paid ? '❀' : open ? starText(stars) : '◇'}</span></button>`;
    }).join('');
    const intro = koi
      ? `<p class="eyebrow">${koiOwned() ? 'EIGHT CURRENT POOLS · YOURS' : 'FIVE-SEED POOLS · TWO FREE'}</p><h2>Koi Conservatory</h2><p>${escape(world.description)}</p><p class="moon-route-hint koi-hint">The dotted aim line follows the water, so you can see the bend before you shoot.</p>`
      : `<p class="eyebrow">FREE CHAPTER · FIVE-SEED TRIALS</p><h2>Moon Garden</h2><p>${escape(world.description)}</p><p class="moon-route-hint">Matching gates carry your seed across the garden. The aim line shows the exit.</p>`;
    $('world-detail').innerHTML = `<div class="world-preview-art">${worldArt(world)}</div>${intro}<div class="moon-trail${koi ? ' koi-trail' : ''}" role="group" aria-label="${koi ? 'Koi Conservatory pools' : 'Moon Garden trials'}">${rows}</div>${koi ? koiUnlockPanel() : ''}`;
    const openIndexes = chapter.levels.map((_, index) => index).filter(index => trialOpen(id, index));
    const fresh = openIndexes.find(index => !records[chapter.levels[index].id]?.stars);
    const next = chapter.levels[fresh ?? openIndexes.at(-1) ?? 0];
    const label = koi ? 'Koi Conservatory' : 'Moon Garden';
    $('world-preview-btn').textContent = fresh === undefined ? `Replay ${next.name}` : records[chapter.levels[0].id]?.stars ? `Continue ${label}` : `Begin ${label}`;
    $('world-preview-btn').dataset.trial = next.id;
  }
  function openWorld(id) {
    const world = worlds.find(w => w.id === id); if (!world) return;
    if (world.id === 'meadow') { startLevel(levels.find(l => l.id === save.lastLevel) || levels[0]); return; }
    currentWorld = world;
    if (chapters[world.id]) { renderChapter(world); showDialog('world-dialog'); return; }
    delete $('world-preview-btn').dataset.trial;
    $('world-detail').innerHTML = `<div class="world-preview-art">${worldArt(world)}</div><p class="eyebrow">IN DEVELOPMENT</p><h2>${escape(world.name)}</h2><p>${escape(world.description)}</p><div class="world-mechanic"><strong>A new way to play</strong><p>${escape(world.mechanic)}</p></div><p class="preview-note">Explore the art direction on a meadow board. This is a visual preview; this garden’s new mechanics and purchases aren’t available yet.</p>`;
    $('world-preview-btn').textContent = 'Play the visual preview';
    showDialog('world-dialog');
  }
  async function buyKoi(button) {
    if (!store || store.busy || koiOwned()) return;
    button.disabled = true; button.textContent = 'Opening the store…';
    let result;
    try { result = await store.purchase(BloomKoi.product); } catch (_) { result = { ok: false }; }
    if (result.ok) { BloomSound.wake(); BloomSound.play('won'); toast('The Koi Conservatory is yours. Six new pools are open.'); }
    else toast(result.cancelled ? 'Purchase cancelled. Nothing was charged.' : 'That purchase did not go through. Nothing was charged.');
    refreshStoreViews();
  }
  function refreshStoreViews() {
    if (route === 'worlds') renderWorlds();
    if (currentWorld && chapters[currentWorld.id] && $('world-dialog').open) renderChapter(currentWorld);
  }
  if (store) store.subscribe(refreshStoreViews);
  // Entering a current: a soft ripple and a few droplets thrown along the flow.
  function ripple(event) {
    if (!save.settings.motion) return;
    game.particles.push({ x: event.x, y: event.y, vx: 0, vy: 0, life: .7, maxLife: .7, kind: 'ring', color: '#bdf3ea', size: 6, grow: 34, gravity: 0, drag: 0 });
    for (let i = 0; i < 7; i++) {
      const a = (event.angle || 0) + (Math.random() - .5) * 1.1, speed = 40 + Math.random() * 70, life = .45 + Math.random() * .4;
      game.particles.push({ x: event.x, y: event.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, kind: 'pollen', color: i % 2 ? '#e9fffb' : '#7fd8cb', size: 1.2 + Math.random() * 1.6, rotation: a, spin: 0, drag: 2.2, gravity: 0 });
    }
  }
  function burst(bud, count = 24) {
    if (!save.settings.motion) return;
    const colors = { coral: '#ff5d94', gold: '#ffd148', lilac: '#a47dff' };
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2 + Math.random() * .3, speed = 60 + Math.random() * 150, life = .7 + Math.random() * 1.3;
      const kind = i % 5 === 0 ? 'spark' : i % 3 === 0 ? 'pollen' : 'petal';
      game.particles.push({ x: bud.x, y: bud.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40, life, maxLife: life, color: kind === 'spark' ? '#fff7be' : colors[bud.type] || colors.coral, size: kind === 'pollen' ? 1.2 + Math.random() * 2 : 2.5 + Math.random() * 4, kind, rotation: a, spin: (Math.random() - .5) * 9, drag: kind === 'petal' ? 1.1 : .7, gravity: kind === 'petal' ? 90 : 35, flutter: kind === 'petal' ? 18 + Math.random() * 30 : 0, phase: Math.random() * 6.28 });
    }
    // A colored shockwave ring and a couple of drifting glow motes per burst.
    const tint = colors[bud.type] || colors.coral;
    game.particles.push({ x: bud.x, y: bud.y, vx: 0, vy: 0, life: .55, maxLife: .55, kind: 'ring', color: tint, size: (bud.r || 12) * .8, grow: 30 + Math.min(40, count), gravity: 0, drag: 0 });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, life = 1 + Math.random() * .8;
      game.particles.push({ x: bud.x, y: bud.y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 25, life, maxLife: life, kind: 'glow', color: tint, size: 2.5 + Math.random() * 2, gravity: -12, drag: .9 });
    }
  }
  // Game feel: trauma-based screen shake, brief hit-stop on big moments and a
  // soft screen flash. All three are skipped when reduced motion is on.
  let trauma = 0, freeze = 0, flash = 0, lastBump = 0;
  const POP_COLORS = { coral: '#e8366f', gold: '#e59a12', lilac: '#7b52e6' };
  function jolt(amount, stop = 0, glow = 0) {
    if (!save.settings.motion) return;
    trauma = Math.min(1, trauma + amount); freeze = Math.max(freeze, stop); flash = Math.max(flash, glow);
  }
  function bumpScore() {
    const now = performance.now(); if (now - lastBump < 90) return; lastBump = now;
    const el = $('score-value'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function processEvents() {
    for (const event of game.drainEvents()) {
      BloomSound.play(event.type, event);
      if (event.type === 'bloom') {
        const combo = event.combo || 1;
        burst(event.bud, 24 + Math.min(36, combo * 3));
        if (save.settings.motion && event.gain) {
          const px = event.bud.x, py = event.bud.y - (event.bud.r || 14) - 6;
          const stacked = game.floaters.filter(f => f.kind === 'pop' && f.life > f.maxLife - .35 && Math.abs(f.x - px) < 58 && Math.abs(f.y - py) < 50).length;
          game.floaters.push({ x: px, y: py - stacked * 19, text: `+${event.gain}`, life: .8, maxLife: .8, kind: 'pop', color: POP_COLORS[event.bud.type] || POP_COLORS.coral, size: Math.min(24, 14 + combo * .8) });
        }
        jolt(.08 + Math.min(.2, combo * .015), combo % 5 === 0 ? .055 : 0, combo % 5 === 0 ? .7 : 0);
        bumpScore();
        if (event.combo % 5 === 0) {
          BloomSound.play('shimmer', event);
          game.floaters = game.floaters.filter(item => item.kind !== 'combo');
          game.floaters.push({ x: 210, y: 92, text: `${event.combo} BLOOM CHAIN`, life: .9, maxLife: .9, kind: 'combo' });
        }
        if (save.settings.haptics && navigator.vibrate && event.combo % 3 === 1) navigator.vibrate(8);
        $('game-hint').textContent = isKoi() ? 'The water carries it on.' : isMoon() ? 'Every opening creates a new path.' : isRush() ? game.splitReady ? 'Split is ready. Choose your moment.' : 'Gold-ring flowers bloom two neighbors. Aim for them.' : game.guideCharge > 0 ? 'Drag toward the flowers. Guide your swarm!' : 'Keep that chain reaction going!';
      } else if (event.type === 'gate') {
        burst({ x: event.entry.x, y: event.entry.y, type: 'lilac' }, 12);
        burst({ x: event.exit.x, y: event.exit.y, type: 'gold' }, 16);
        $('game-hint').textContent = 'Through the gate. Follow the new angle.';
      } else if (event.type === 'current') {
        ripple(event);
        $('game-hint').textContent = 'Caught the current. Watch it turn.';
      } else if (event.type === 'split') {
        burst(game.ball || game.launcher, 25);
        game.floaters = game.floaters.filter(item => item.kind !== 'bonus');
        game.floaters.push({ x: 210, y: 418, text: '+2 BALLS!', life: 1.05, maxLife: 1.05, kind: 'bonus' });
        $('game-hint').textContent = 'Your split is in play. Hit flowers to charge the next.';
      } else if (event.type === 'wave') {
        $('game-hint').textContent = `Wave ${game.wave}. The flowers are moving faster.`;
        say(`Wave ${game.wave}. ${game.lives} lives left.`);
      } else if (event.type === 'life') {
        jolt(.6, .12, 0);
        $('game-hint').textContent = game.lives ? `A cluster crossed the line. ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.` : 'The garden reached the line.';
        if (save.settings.haptics && navigator.vibrate) navigator.vibrate([18, 25, 18]);
        say($('game-hint').textContent);
      } else if (event.type === 'burst') {
        burst(event.bud, 45); game.floaters = game.floaters.filter(item => item.kind !== 'bonus');
        game.floaters.push({ x: 210, y: 418, text: '+2 BALLS!', life: 1.05, maxLife: 1.05, kind: 'bonus' });
      } else if (event.type === 'fever') {
        jolt(.35, .08, 1);
        if (save.settings.haptics && navigator.vibrate) navigator.vibrate([12, 35, 18]);
      } else if (event.type === 'crack') {
        burst(event.bud, 12); jolt(.05);
      } else if (event.type === 'ready') {
        $('game-hint').textContent = isChapter() ? `${game.shotsLeft} seeds left. ${game.level.hint || (isKoi() ? 'Read where the water will carry you.' : 'Read the gate exit before your next shot.')}` : event.blooms ? 'Turn a petal, or line up your next volley.' : 'Try another angle. Turn a petal to redirect your shot.';
        say(`${game.bloomedCount} of ${game.buds.length} bloomed. ${game.shotsLeft} ${isChapter() ? 'seeds' : 'volleys'} left.`);
      } else if (event.type === 'won' || event.type === 'lost') {
        if (event.type === 'won') { burst({ x: 110, y: 210, type: 'coral' }, 70); burst({ x: 310, y: 210, type: 'gold' }, 70); burst({ x: 210, y: 150, type: 'lilac' }, 60); jolt(.45, .14, 1); }
        resultAt = game.time + (save.settings.motion ? 1.45 : .4); resultShown = false;
        if (isRush()) {
          rushRecordBroken = game.score > save.rush.best;
          save.rush.best = Math.max(save.rush.best, game.score);
          save.rush.bestWave = Math.max(save.rush.bestWave, game.wave);
          save.rush.blooms += game.bloomedCount; save.rush.runs++;
          awardSeeds({ mode: 'rush', blooms: game.bloomedCount, wave: game.wave });
          persist(); hudKey = '';
          $('game-hint').textContent = 'Run complete. Your best score is saved.';
          say(`Run complete. Wave ${game.wave}, ${game.bloomedCount} blooms, ${game.score} points.`);
          continue;
        }
        if (!preview) {
          const data = record() || { best: 0, stars: 0, attempts: 0 };
          const previousStars = data.stars;
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
          persist();
        }
        $('game-hint').textContent = event.type === 'won' ? 'Garden cleared.' : 'Try a different angle.';
        say(event.type === 'won' ? `Garden complete. ${game.stars} stars. ${game.score} points.` : `${game.bloomedCount} of ${game.buds.length} bloomed. Try a fresh angle.`);
      }
    }
  }
  function showResult() {
    resultShown = true; const won = game.status === 'won';
    $('garden-reward').hidden = preview || runAward <= 0;
    $('reward-seeds').textContent = `+${runAward} ${runAward === 1 ? 'seed' : 'seeds'}`;
    $('result-stars').hidden = isRush();
    if (isRush()) {
      $('result-eyebrow').textContent = `WAVE ${game.wave} · RUN COMPLETE`;
      $('result-title').textContent = rushRecordBroken ? 'A new garden record.' : 'Room to grow.';
      $('result-message').textContent = `${game.bloomedCount} blooms · best chain ${game.bestCombo}. Target gold-ring flowers and save your split for a crowded path.`;
      $('result-score').textContent = fmt(game.score);
      $('reward-flower').hidden = true; $('next-btn').hidden = true;
      $('retry-btn').textContent = 'Start a new rush'; $('retry-btn').classList.add('primary');
      showDialog('result-dialog'); return;
    }
    $('result-eyebrow').textContent = preview ? 'GARDEN PREVIEW' : isChapter() ? won ? isKoi() ? 'KOI POOL COMPLETE' : 'MOON TRIAL COMPLETE' : isKoi() ? 'READ THE WATER AGAIN' : 'FIND ANOTHER PATH' : won ? 'GARDEN COMPLETE' : 'TRY AGAIN';
    $('result-title').textContent = won ? game.stars === 3 ? 'Blooming brilliant!' : 'You grew all of this.' : 'So close. Go again?';
    $('result-message').textContent = won ? game.shotsLeft === 2 ? `One volley. ${game.buds.length} flowers. Beautiful chaos.` : `${game.buds.length} blossoms. Your best chain: ${game.bestCombo}.` : `${game.bloomedCount} of ${game.buds.length} bloomed. Drag during flight to guide the swarm!`;
    if (isMoon()) $('result-message').textContent = won ? `${game.shotNumber} ${game.shotNumber === 1 ? 'seed' : 'seeds'} · ${game.gatePasses} gate crossings · ${game.buds.length} flowers. ${game.stars === 3 ? 'A beautifully chosen route.' : `Try ${game.level.par} shots for three stars.`}` : `${game.bloomedCount} of ${game.buds.length} flowers. Trace the gate exit and try a different angle.`;
    if (isKoi()) $('result-message').textContent = won ? `${game.shotNumber} ${game.shotNumber === 1 ? 'seed' : 'seeds'} · ${game.currentRides} ${game.currentRides === 1 ? 'current' : 'currents'} ridden · ${game.buds.length} flowers. ${game.stars === 3 ? 'The water went exactly where you meant it to.' : `Try ${game.level.par} shots for three stars.`}` : `${game.bloomedCount} of ${game.buds.length} flowers. Watch where the current turns, then try a new angle.`;
    $('result-score').textContent = fmt(game.score);
    $('result-stars').textContent = starText(game.stars); $('result-stars').setAttribute('aria-label', `${game.stars} of 3 stars`);
    $('reward-flower').hidden = !newFlower;
    if (newFlower) $('reward-flower').innerHTML = `${flowerGraphic(newFlower)}<div><span class="eyebrow">NEW IN YOUR COLLECTION</span><strong>${escape(newFlower.name)}</strong></div>`;
    const next = isChapter() ? nextTrial(game.level) : typeof game.level.id === 'number' ? levels.find(l => l.id === game.level.id + 1) : null;
    $('next-btn').hidden = !won;
    $('next-btn').textContent = preview ? 'Back to the worlds' : isKoi() ? !next ? 'Conservatory complete' : trialPaid('koi', next) ? 'Next koi pool' : 'See all eight pools' : isMoon() ? next ? 'Next moon trial' : 'Moon chapter complete' : next ? 'Next garden →' : 'Explore your garden';
    $('retry-btn').textContent = won ? 'Play it again' : 'Try a fresh shot';
    $('retry-btn').classList.toggle('primary', !won);
    showDialog('result-dialog');
  }
  function rotateNearest(point) {
    const near = game.bumpers.find(b => Math.hypot(b.x - point.x, b.y - point.y) <= b.length / 2 + 14);
    if (!near) return false;
    if (game.rotate(near.id)) { BloomSound.wake(); processEvents(); toast('Petal turned. Your next shot has a new path.'); }
    else if (isRush()) toast('The petal needs two seconds between turns.');
    else if (game.status === 'aiming') toast(isChapter() ? 'One petal turn per seed. Find your next angle.' : 'One petal turn per volley. Let it fly!');
    return true;
  }
  function coordinates(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * 420, 0, 420), y: clamp((event.clientY - rect.top) / rect.height * 560, 0, 560) };
  }
  function aimAt(point) {
    const dx = point.x - game.launcher.x, dy = Math.min(-35, point.y - game.launcher.y);
    angle = clamp(Math.atan2(dy, dx), -Math.PI + .16, -.16);
    pointer = point; game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400);
  }
  function launch() {
    const fired = game.fire(Math.cos(angle), Math.sin(angle));
    pointer = null; aiming = false; game.aim = [];
    if (fired) { processEvents(); $('game-hint').textContent = isKoi() ? 'Let the water take it. Your next choice comes when the seed settles.' : isMoon() ? 'Let it travel. Your next choice comes when the seed returns.' : isRush() ? 'Keep aiming. Six direct hits charge your split.' : 'Now drag toward flowers to guide your swarm!'; }
    else if (isRush()) $('game-hint').textContent = game.balls.length >= 5 ? 'Five seeds in play. Let one return before firing.' : 'Reloading. Line up your next shot.';
  }
  function cancelInteraction() {
    const id = activePointer; activePointer = null;
    aiming = false; guiding = false; pointer = null;
    if (game) { game.guide(null); game.aim = []; }
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  canvas.addEventListener('pointerdown', event => {
    if (route !== 'game' || activePointer !== null || !event.isPrimary || !['aiming', 'flying'].includes(game.status) || narrowLandscape.matches) return;
    if (isChapter() && game.status === 'flying') return;
    event.preventDefault(); BloomSound.wake(); canvas.focus({ preventScroll: true });
    const point = coordinates(event);
    if (!isRush() && game.status === 'flying') { guiding = true; pointer = point; activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); game.guide(point); return; }
    if (rotateNearest(point)) return;
    if (point.y > game.launcher.y + 24) { toast('Aim anywhere above the seed, then release.'); return; }
    aiming = true; activePointer = event.pointerId; canvas.setPointerCapture(event.pointerId); aimAt(point);
    $('game-hint').textContent = 'Find your angle. Release to let it fly.';
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
    else if (isRush() && event.key.toLowerCase() === 's') { if (game.split()) processEvents(); }
    else if (event.key.toLowerCase() === 'r') { if (game.bumpers[0]) rotateNearest(game.bumpers[0]); }
    else game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400);
  });
  canvas.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') && game.status === 'flying') game.guide(null); });
  canvas.addEventListener('blur', cancelInteraction);
  window.addEventListener('blur', cancelInteraction);
  const rotateButton = document.createElement('button'); rotateButton.id = 'rotate-btn'; rotateButton.type = 'button'; rotateButton.className = 'turn-petal-btn'; rotateButton.textContent = 'Turn petal';
  $('restart-btn').parentElement.insertBefore(rotateButton, $('restart-btn'));
  rotateButton.addEventListener('click', () => { if (game.bumpers[0]) rotateNearest(game.bumpers[0]); });
  function openRush() { if (preview) exitPreview(); if (isRush() && game.status !== 'lost') { closeDialogs(); setRoute('game'); } else startLevel({ id: 'rush', name: 'Meadow Rush' }); }
  $('rush-btn').addEventListener('click', () => { if (preview) exitPreview(); closeDialogs(); setRoute('game'); if (['won', 'lost'].includes(game.status)) showResult(); });
  $('garden-rush-btn').addEventListener('click', openRush);
  $('split-btn').addEventListener('click', () => { BloomSound.wake(); if (game.split()) processEvents(); });
  $('restart-btn').addEventListener('click', () => startLevel(game.level, { preview, theme }));
  $('back-btn').addEventListener('click', () => { if (preview) exitPreview(); else setRoute('garden'); });
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
    save.garden = planted.state; persist(); renderMeadow();
    growth = { plotId: id, fromStage, started: performance.now() };
    BloomSound.wake(); BloomSound.play('plant', { x: BloomMeadow.plots.find(p => p.id === id).x });
    if (save.settings.haptics && navigator.vibrate) navigator.vibrate(12);
    say(`${BloomGarden.plots.find(p => p.id === id).name} ${fromStage ? 'grew' : 'planted'}. ${save.garden.seeds} seeds left.`);
  });
  $('collection-btn').addEventListener('click', () => { if (preview) exitPreview(); setRoute('collection'); });
  $('worlds-btn').addEventListener('click', () => { if (preview) exitPreview(); else setRoute('worlds'); });
  $('level-grid').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && unlocked(Number(button.dataset.level))) startLevel(levels.find(l => l.id === Number(button.dataset.level))); });
  $('worlds-grid').addEventListener('click', event => { const button = event.target.closest('[data-world]'); if (button) openWorld(button.dataset.world); });
  $('world-detail').addEventListener('click', event => {
    const buy = event.target.closest('[data-buy]'); if (buy) { buyKoi(buy); return; }
    const button = event.target.closest('[data-trial]'); if (!button || !chapters[button.dataset.chapter]) return;
    const world = button.dataset.chapter, list = chapters[world].levels, index = list.findIndex(level => level.id === button.dataset.trial);
    if (index < 0) return;
    if (!trialPaid(world, list[index])) { toast('This pool comes with the full Koi Conservatory.'); return; }
    if (trialOpen(world, index)) startLevel(list[index]);
  });
  $('daily-btn').addEventListener('click', () => startLevel(BloomLevels.dailyLevel(localDate())));
  $('retry-btn').addEventListener('click', () => startLevel(game.level, { preview, theme }));
  $('result-garden-btn').addEventListener('click', () => { closeDialogs(); if (preview) exitPreview(); else setRoute('garden'); });
  $('next-btn').addEventListener('click', () => {
    closeDialogs(); if (preview) { exitPreview(); return; }
    const next = isChapter() ? nextTrial(game.level) : levels.find(l => l.id === game.level.id + 1);
    if (isChapter() && (!next || !trialPaid(game.level.worldId, next))) { const world = game.level.worldId; setRoute('worlds'); openWorld(world); }
    else if (next) startLevel(next); else setRoute('garden');
  });
  function exitPreview() {
    closeDialogs();
    if (returnSession) {
      const session = returnSession; returnSession = null;
      game = session.game; theme = session.theme; preview = false; angle = session.angle;
      displayScore = session.displayScore; resultAt = session.resultAt; resultShown = session.resultShown; newFlower = session.newFlower; rushRecordBroken = session.rushRecordBroken;
      runId = session.runId; runAward = session.runAward;
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
    if (!preview) returnSession = { game, theme, angle, displayScore, resultAt, resultShown, newFlower, rushRecordBroken, runId, runAward, label: $('level-label').textContent, name: $('level-name').textContent, hint: $('game-hint').textContent, aria: canvas.getAttribute('aria-label') };
    startLevel(levels[0], { preview: true, theme: currentWorld.theme || currentWorld.id });
  });
  function updateSettings() {
    BloomSound.setEnabled(save.settings.sound);
    $('toggle-sound').checked = save.settings.sound; $('toggle-haptics').checked = save.settings.haptics; $('toggle-motion').checked = save.settings.motion;
    $('sound-btn').setAttribute('aria-pressed', String(save.settings.sound)); $('sound-btn').setAttribute('aria-label', save.settings.sound ? 'Mute sound' : 'Enable sound');
    $('sound-btn').classList.toggle('muted', !save.settings.sound);
    document.body.classList.toggle('reduce-motion', !save.settings.motion);
    meadowDirty = true;
    $('settings-storage').textContent = storageAvailable ? 'Your garden is saved on this browser. No account needed.' : 'Progress is saved for this visit only. Device storage is unavailable.';
  }
  $('settings-btn').addEventListener('click', () => { updateSettings(); showDialog('settings-dialog'); });
  $('help-btn').addEventListener('click', () => { $('rush-help').open = isRush(); $('campaign-help').open = !isRush() && !isChapter(); $('moon-help').open = isMoon(); $('koi-help').open = isKoi(); showDialog('help-dialog'); });
  for (const key of ['sound', 'haptics', 'motion']) $(`toggle-${key}`).addEventListener('change', event => { save.settings[key] = event.target.checked; BloomSound.wake(); updateSettings(); persist(); });
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
  document.addEventListener('visibilitychange', () => { lastFrame = 0; accumulator = 0; cancelInteraction(); });
  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (!document.hidden && route === 'garden' && (meadowDirty || save.settings.motion && timestamp - meadowFrame >= 1000 / 30)) drawMeadow(timestamp);
    if (document.hidden || route !== 'game') { lastFrame = timestamp; return; }
    const dt = Math.min(lastFrame ? (timestamp - lastFrame) / 1000 : 0, .06); lastFrame = timestamp;
    const paused = narrowLandscape.matches || dialogs.some(id => $(id).open);
    if (!paused && freeze > 0) { freeze -= dt; }
    else if (!paused) {
      accumulator += dt;
      while (accumulator >= 1 / 120) { game.step(1 / 120); accumulator -= 1 / 120; }
      processEvents();
      for (const ball of game.balls || []) ball.hot = (game.combo || 0) >= 8;
      for (const p of game.particles) {
        p.life -= dt; p.vx *= Math.exp(-(p.drag || 1) * dt); p.vy *= Math.exp(-(p.drag || 1) * dt);
        p.vy += (p.gravity ?? 70) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rotation += (p.spin || 0) * dt;
        if (p.flutter) { p.phase += dt * 5; p.x += Math.sin(p.phase) * p.flutter * dt; p.vy = Math.min(p.vy, 70); }
        if (p.x < 24 || p.x > 396) { p.x = clamp(p.x, 24, 396); p.vx *= -.35; }
        if (p.y > 530) { p.y = 530; p.vy *= -.25; p.vx *= .8; }
      }
      game.particles = game.particles.filter(p => p.life > 0).slice(-600);
      for (const p of game.floaters) { p.life -= dt; p.y -= dt * 12; }
      game.floaters = game.floaters.filter(p => p.life > 0).slice(-16);
      if (!resultShown && game.time >= resultAt) showResult();
    }
    displayScore += (game.score - displayScore) * Math.min(1, dt * 10);
    if (Math.abs(game.score - displayScore) < 1) displayScore = game.score;
    updateHud(); pulseTime += dt;
    if (isRush() && (aiming || game.aim.length)) game.aim = game.trace(Math.cos(angle) * 400, Math.sin(angle) * 400);
    trauma = Math.max(0, trauma - dt * 1.7); flash = Math.max(0, flash - dt * 3.2);
    const t2 = trauma * trauma, nt = timestamp / 1000;
    const shake = t2 > .001 ? { x: Math.sin(nt * 47.3) * Math.cos(nt * 13.1) * 9 * t2, y: Math.sin(nt * 39.7 + 1.3) * 9 * t2, r: Math.sin(nt * 29.1) * .018 * t2 } : null;
    BloomArt.draw(ctx, game, game.time, { theme, reducedMotion: !save.settings.motion, pointer, shake, flash, showAim: isRush() ? aiming || game.aim.length > 0 : game.status === 'aiming', selectedBumper: isRush() ? game.rotateCooldown <= 0 ? game.bumpers[0]?.id : null : game.status === 'aiming' && !game.rotationUsed ? game.bumpers[0]?.id : null });
  }
  updateSettings(); persist(); renderMeadow();
  const initial = { id: 'rush', name: 'Meadow Rush' };
  startLevel(initial); resize(); requestAnimationFrame(frame);
  // A read-only snapshot aids local QA without adding a way to grant progress.
  Object.defineProperty(window, 'bloomshotState', { get: () => ({ ...game.snapshot(), route, theme, preview, earnedFlowers: flowers.filter(earned).map(f => f.id), storageAvailable }), configurable: false });
})();
