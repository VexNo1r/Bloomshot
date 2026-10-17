'use strict';
// Deterministic practice-player corpus. Pure game simulation; no store, save or rendering side effects.
// node qa/measure-depths.cjs --smoke --output ../.work/boss-smoke.json
// node qa/measure-depths.cjs --workers 2 --output ../.work/campaign-corpus.json
// --groups average,heldout,boss,good --levels 1,2 --average 128 --heldout 32 --boss 48 --good 16
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const gameRoot = path.resolve(__dirname, '..');
const profiles = {
  average: { noise: 4, think: .5, thinkSpread: .5, bounces: 1 },
  good: { noise: 2.5, think: .3, thinkSpread: .3, bounces: 2 }
};
const hashSources = () => Object.fromEntries(['engine.js', 'rush.js', 'depths.js', 'bosses.js', 'qa/depths-bot.cjs', 'qa/measure-depths.cjs'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot, file))).digest('hex')]));
if (!isMainThread) {
  const Bot = require('./depths-bot.cjs');
  parentPort.on('message', task => {
    if (!task) { parentPort.close(); return; }
    try {
      const started = performance.now(), run = Bot.play(task.level, { seed: task.seed, ...task.options, maxTime: workerData.maxTime });
      if (run.powersUsed) throw new Error('The corpus must not use powerups.');
      parentPort.postMessage({ key: task.key, group: task.group, index: task.index, level: task.level, seed: task.seed, wall_ms: +(performance.now() - started).toFixed(2), ...run });
    } catch (error) { parentPort.postMessage({ key: task.key, error: error.stack }); }
  });
} else main().catch(error => { console.error(error.stack); process.exitCode = 1; });

function argumentsFor(argv) {
  const options = { average: 128, heldout: 32, boss: 48, good: 16, levels: Array.from({ length: 10 }, (_, i) => i + 1), groups: ['average', 'heldout', 'boss', 'good'], workers: Math.min(2, os.availableParallelism()), maxTime: 900,
    output: path.resolve(gameRoot, '../.work/campaign-corpus.json'), resume: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'smoke') Object.assign(options, { average: 3, heldout: 0, boss: 3, good: 2 });
    else if (key === 'resume') options.resume = true;
    else if (key === 'levels') options.levels = argv[++i].split(',').map(Number);
    else if (key === 'groups') options.groups = argv[++i].split(',');
    else if (key === 'output') options.output = path.resolve(argv[++i]);
    else if (['average', 'heldout', 'boss', 'good', 'workers', 'maxTime'].includes(key)) options[key] = Number(argv[++i]);
    else throw new Error('Unknown argument: ' + argv[i]);
  }
  for (const key of ['average', 'heldout', 'boss', 'good']) if (!Number.isInteger(options[key]) || options[key] < 0 || options[key] > 10000) throw new Error('Invalid count: ' + key);
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 16 || !Number.isFinite(options.maxTime) || options.maxTime <= 0) throw new Error('Invalid worker/time limit');
  if (new Set(options.levels).size !== options.levels.length || options.levels.some(n => !Number.isInteger(n) || n < 1 || n > 10)) throw new Error('Levels must be distinct IDs 1 through 10');
  if (new Set(options.groups).size !== options.groups.length || options.groups.some(g => !['average', 'heldout', 'boss', 'good'].includes(g))) throw new Error('Unknown or duplicate corpus group');
  return options;
}
function seedFor(group, level, index) {
  if (group === 'average') return index * 7919 + level;
  if (group === 'heldout') return 100000000 + index * 104729 + level * 1009;
  if (group === 'boss') return 300000000 + index * 65537 + level * 2017;
  return 500000000 + index * 31 + level * 100003;
}
const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const round = n => n == null ? null : +n.toFixed(4);
function stats(list) {
  if (!list.length) return { n: 0, mean: null, min: null, max: null, standard_error: null };
  const m = mean(list), variance = list.length > 1 ? list.reduce((sum, n) => sum + (n - m) ** 2, 0) / (list.length - 1) : 0;
  return { n: list.length, mean: round(m), min: round(Math.min(...list)), max: round(Math.max(...list)), standard_error: round(Math.sqrt(variance / list.length)) };
}
function winInterval(wins, n) {
  if (!n) return [null, null]; const z = 1.96, p = wins / n, divisor = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / divisor, spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / divisor;
  return [round(center - spread), round(center + spread)];
}
function summarize(rows) {
  const summary = [];
  for (const group of ['average', 'heldout', 'boss', 'good']) for (let level = 1; level <= 10; level++) {
    const runs = rows.filter(r => r.group === group && r.level === level && !r.error); if (!runs.length) continue;
    const wins = runs.filter(r => r.won).length, kills = runs.filter(r => r.bossP != null);
    summary.push({ group, level, n: runs.length, wins, win_rate: round(wins / runs.length), win_rate_95_wilson: winInterval(wins, runs.length),
      S: stats(runs.map(r => r.S)), lives_remaining: stats(runs.map(r => r.lives)), lives_lost: stats(runs.map(r => r.livesLost)),
      elapsed_seconds: stats(runs.map(r => r.elapsedExact)), super_blooms: stats(runs.map(r => r.supers)), shots_per_calm_second: stats(runs.map(r => r.rate)),
      shots: stats(runs.map(r => r.shots)), refunds: stats(runs.map(r => r.refunds)),
      boss_reached: runs.filter(r => r.bossReached).length, boss_kills: kills.length,
      P_on_kills: stats(kills.map(r => r.bossP)), boss_kill_seconds: stats(kills.map(r => r.bossKillSeconds)),
      boss_lives_lost: stats(runs.filter(r => r.bossReached).map(r => r.bossLivesLost)),
      // Failed fights have no kill time. Keep their observed pressure separately instead of silently dropping losses from P.
      boss_observed_pressure_all_attempts: stats(runs.filter(r => r.bossReached).map(r => r.bossLivesLost + (r.bossKillSeconds ?? r.bossSeconds) / 50)),
      timed_out: runs.filter(r => r.timedOut).length });
  }
  return summary;
}
async function main() {
  const options = argumentsFor(process.argv.slice(2)), sourceHashes = hashSources(), started = Date.now(), tasks = [];
  for (const group of options.groups) for (const level of options.levels) for (let index = 1; index <= options[group]; index++) tasks.push({ key: `${group}:${level}:${index}`, group, level, index, seed: seedFor(group, level, index), options: { ...profiles[group === 'good' ? 'good' : 'average'], ...(group === 'boss' ? { startWave: 10 } : {}) } });
  if (!tasks.length) throw new Error('No corpus cases selected');
  const config = { levels: options.levels, groups: options.groups, counts: { average: options.average, heldout: options.heldout, boss: options.boss, good: options.good }, profiles, max_time_seconds: options.maxTime, seed_formula_version: 1 };
  const rows = [], complete = new Set();
  if (options.resume && fs.existsSync(options.output)) {
    const previous = JSON.parse(fs.readFileSync(options.output, 'utf8'));
    if (!previous.source_stable) throw new Error('Cannot resume a corpus that observed changing sources; select a new output file.');
    if (JSON.stringify(previous.source_sha256) !== JSON.stringify(sourceHashes) || JSON.stringify(previous.config) !== JSON.stringify(config)) throw new Error('Cannot resume a different source/corpus configuration');
    for (const row of previous.runs || []) if (!row.error) { rows.push(row); complete.add(row.key); }
  }
  const remaining = tasks.filter(t => !complete.has(t.key)); let next = 0, failed = false, sourceDrift = false, stoppedReason = null;
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  const write = finished => {
    const endHashes = hashSources(), stable = JSON.stringify(endHashes) === JSON.stringify(sourceHashes);
    if (!stable && !sourceDrift) { sourceDrift = true; stoppedReason = 'Gameplay or measurement source changed during the run.'; console.error(stoppedReason + ' No further cases will be scheduled.'); }
    const sorted = rows.slice().sort((a, b) => a.group.localeCompare(b.group) || a.level - b.level || a.index - b.index);
    const report = { schema: 1, generated_at: new Date().toISOString(), config, source_sha256: sourceHashes, source_stable: stable && !sourceDrift, final_source_sha256: endHashes,
      completed: rows.length, expected: tasks.length, finished: finished && rows.length === tasks.length && !failed && !sourceDrift, stopped_reason: stoppedReason,
      wall_seconds: round((Date.now() - started) / 1000), workers: options.workers,
      interpretation: { S: 'On a clear: 3 - remaining lives. On a loss: 3 + (10 - final wave).', P: 'Lives lost during the boss fight + kill time / 50, only for boss kills. Failed fights have censored duration and are reported separately.', heldout: 'Disjoint aim-error/reaction seeds on the same authored levels, not unseen level layouts. Freeze tuning before using this validation group.', scope: 'Engine practice bot using visible targets/current advertised motion; manual Split and earned Super Bloom allowed, no powerups, no purchases, no save, no rendered UI or physical-device test.' },
      summary: summarize(sorted), runs: sorted };
    const temporary = options.output + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n'); fs.renameSync(temporary, options.output); return report;
  };
  let lastWritten = rows.length;
  await Promise.all(Array.from({ length: Math.min(options.workers, Math.max(1, remaining.length)) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { maxTime: options.maxTime } });
    const dispatch = () => { if (failed || sourceDrift || next >= remaining.length) { worker.postMessage(null); return; } worker.postMessage(remaining[next++]); };
    worker.on('message', row => {
      rows.push(row); if (row.error) { failed = true; stoppedReason = 'A practice-player case raised an exception.'; }
      if (rows.length - lastWritten >= 20 || rows.length === tasks.length) { write(false); lastWritten = rows.length; console.log(`Corpus ${rows.length}/${tasks.length}: ${row.group} level ${row.level}`); }
      dispatch();
    });
    worker.on('error', reject); worker.on('exit', code => code ? reject(new Error('Worker exited ' + code)) : resolve()); dispatch();
  })));
  const report = write(true);
  console.log(JSON.stringify({ output: options.output, completed: report.completed, source_stable: report.source_stable, wall_seconds: report.wall_seconds, summary: report.summary.map(s => ({ group: s.group, level: s.level, n: s.n, wins: s.wins, S: s.S.mean, lives: s.lives_remaining.mean, seconds: s.elapsed_seconds.mean, P: s.P_on_kills.mean, boss_kills: s.boss_kills })) }, null, 2));
  if (failed || !report.source_stable) process.exitCode = 1;
}
