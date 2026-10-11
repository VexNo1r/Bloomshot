'use strict';
// node qa/fire-rate-report.cjs a.json [b.json ...]: a per-level table for each player, one column per file (A -> B).
const fs = require('node:fs');
const files = process.argv.slice(2).filter(f => !f.startsWith('--'));
const data = files.map(f => JSON.parse(fs.readFileSync(f)));
const names = files.map(f => require('node:path').basename(f, '.json'));
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pain = r => r.won ? 3 - r.lives : 3 + (10 - r.wave);
const players = [...new Set(data.flatMap(d => Object.values(d).flatMap(L => Object.keys(L))))];
for (const p of players) {
  console.log(`\n== ${p} ==  cells: wins/runs (mean lives on wins) [median loss wave] sps len`);
  const tot = data.map(() => ({ w: 0, n: 0, pain: [], sps: [], len: [] }));
  for (let id = 1; id <= 10; id++) {
    const cells = data.map((d, k) => {
      const runs = d[id] && d[id][p]; if (!runs) return '-';
      const wins = runs.filter(r => r.won), losses = runs.filter(r => !r.won);
      tot[k].w += wins.length; tot[k].n += runs.length; tot[k].pain.push(...runs.map(pain)); tot[k].sps.push(mean(runs.map(r => r.sps))); if (wins.length) tot[k].len.push(mean(wins.map(r => r.t)));
      return `${wins.length}/${runs.length} (${wins.length ? mean(wins.map(r => r.lives)).toFixed(1) : '-'})${losses.length ? ' [w' + median(losses.map(r => r.wave)) + ']' : ''} ${mean(runs.map(r => r.sps)).toFixed(2)}/s ${wins.length ? Math.round(mean(wins.map(r => r.t))) + 's' : ''}`.padEnd(34);
    });
    console.log(`L${String(id).padEnd(2)} ` + cells.join(' | '));
  }
  console.log('TOT ' + tot.map((t, k) => `${names[k]}: ${t.w}/${t.n} pain ${mean(t.pain).toFixed(2)} sps ${Math.min(...t.sps).toFixed(2)}-${Math.max(...t.sps).toFixed(2)} (mean ${mean(t.sps).toFixed(2)})`.padEnd(34)).join(' | '));
  if (data.some(d => d[0] && d[0][p])) console.log('ENDLESS ' + data.map((d, k) => d[0] && d[0][p] ? `${names[k]}: mean wave ${mean(d[0][p].map(r => r.wave)).toFixed(1)} [${d[0][p].map(r => r.wave).join(',')}] sps ${mean(d[0][p].map(r => r.sps)).toFixed(2)}` : '-').join(' | '));
}
// average curve as test-depths counts it
for (let k = 0; k < data.length; k++) {
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some(id => !data[k][id] || !data[k][id].average)) continue;
  const curve = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => data[k][id].average.reduce((n, r) => n + pain(r), 0));
  console.log(`${names[k]} average lives-lost curve: ${curve.join(' ')}  L1<=1 ${curve[0] <= 1} L4>L1&&>=L2 ${curve[3] > curve[0] && curve[3] >= curve[1]} m5-10>m1-3 ${mean(curve.slice(4)) > mean(curve.slice(0, 3))} L10>L1 ${curve[9] > curve[0]}`);
}
