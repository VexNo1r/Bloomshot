'use strict';
// Deliberate no-targeting policies alongside careful play. No save, purchases, powerups or rendered UI.
// node bloomshot/qa/measure-spam.cjs --levels 1 --seeds 16 --workers 2 --output .work/spam-baseline.json
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const gameRoot = path.resolve(__dirname, '..');
const hashSources = () => Object.fromEntries(['engine.js','rush.js','depths.js','bosses.js','qa/depths-bot.cjs','qa/measure-spam.cjs'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(gameRoot,file))).digest('hex')]));
if (!isMainThread) {
  const Bot = require('./depths-bot.cjs');
  parentPort.on('message', task => {
    if (!task) { parentPort.close(); return; }
    try {
      const started = performance.now(), result = Bot[task.method](task.level, task.options);
      if (result.powersUsed) throw new Error('The comparison must not use powerups.');
      parentPort.postMessage({ ...task, wall_ms: +(performance.now()-started).toFixed(2), ...result });
    } catch (error) { parentPort.postMessage({ ...task, error: error.stack }); }
  });
} else main().catch(error => { console.error(error.stack); process.exitCode=1; });
async function main() {
  const args = { levels: [1], seeds: 16, workers: 2, output: path.resolve(gameRoot,'../.work/spam-baseline.json') };
  for (let i=2;i<process.argv.length;i++) {
    const flag=process.argv[i];
    if(flag==='--levels') args.levels=process.argv[++i].split(',').map(Number);
    else if(flag==='--seeds'||flag==='--workers') args[flag.slice(2)]=Number(process.argv[++i]);
    else if(flag==='--output') args.output=path.resolve(process.argv[++i]);
    else throw new Error('Unknown argument: '+flag);
  }
  if (!Number.isInteger(args.seeds)||args.seeds<1||args.seeds>128||!Number.isInteger(args.workers)||args.workers<1||args.workers>16||
    new Set(args.levels).size!==args.levels.length||args.levels.some(n=>!Number.isInteger(n)||n<1||n>10)) throw new Error('Invalid comparison counts or level IDs');
  const started=Date.now(), hashes=hashSources(), tasks=[];
  function add(level,policy,method,options,n=args.seeds,deterministic=false) {
    for(let i=1;i<=n;i++) tasks.push({ key:`${level}:${policy}:${i}`,level,policy,method,deterministic,index:i,
      options:{ seed:method==='play'?(policy==='careful_average'?i*7919+level:500000000+i*31+level*100003):600000000+level*1009+i*65537,...options } });
  }
  for(const level of args.levels) {
    add(level,'rapid_broad_cone','mash',{mode:'wild',gap:.12});
    add(level,'rapid_middle_sweep','mash',{mode:'sweep',gap:.12});
    add(level,'rapid_lazy_lowest','mash',{mode:'lazy',gap:.12});
    add(level,'fixed_straight','mash',{mode:'fixed',angle:-90,gap:.12},1,true);
    for(const angle of [-165,-155,-145,-135,-45,-35,-25,-15]) add(level,`fixed_bank_${angle}`,'mash',{mode:'fixed',angle,gap:.12},1,true);
    for(const leftAngle of [-165,-155,-145,-135]) add(level,`alternating_banks_${leftAngle}`,'mash',{mode:'banks',leftAngle,rightAngle:-180-leftAngle,gap:.12},1,true);
    add(level,'wide_ricochet_sweep','mash',{mode:'ricochet',gap:.12},1,true);
    add(level,'careful_average','play',{noise:4,think:.5,thinkSpread:.5,bounces:1});
    add(level,'careful_good','play',{noise:2.5,think:.3,thinkSpread:.3,bounces:2});
    add(level,'careful_fast','play',{noise:2.5,think:0,thinkSpread:0,bounces:2});
  }
  const rows=[];let next=0,drift=false,failed=false;
  const mean=values=>+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(4);
  const snapshot=finished=>{
    const finalHashes=hashSources();if(JSON.stringify(finalHashes)!==JSON.stringify(hashes)) drift=true;
    const summary=[];
    for(const level of args.levels) for(const policy of [...new Set(tasks.map(t=>t.policy))]) {
      const selected=rows.filter(r=>r.level===level&&r.policy===policy&&!r.error);if(!selected.length) continue;
      summary.push({level,policy,n:selected.length,deterministic:selected[0].deterministic,wins:selected.filter(r=>r.won).length,
        S:mean(selected.map(r=>r.S)),lives:mean(selected.map(r=>r.lives)),lives_lost:mean(selected.map(r=>r.livesLost)),
        seconds:mean(selected.map(r=>r.elapsedExact)),shots_per_calm_second:mean(selected.map(r=>r.rate)),
        shots:mean(selected.map(r=>r.shots)),refunds:mean(selected.map(r=>r.refunds)),
        super_blooms:mean(selected.map(r=>r.superBlooms??r.supers)),
        final_wave:mean(selected.map(r=>r.wave)),timed_out:selected.filter(r=>r.timedOut).length});
    }
    const report={schema:1,generated_at:new Date().toISOString(),config:args,source_sha256:hashes,final_source_sha256:finalHashes,source_stable:!drift,
      finished:finished&&rows.length===tasks.length&&!drift&&!failed,completed:rows.length,expected:tasks.length,wall_seconds:+((Date.now()-started)/1000).toFixed(3),
      interpretation:'Rapid policies tap every 0.12s and do not select targets or use Split. Fixed and alternating bank angles and the wide sweep are deterministic one-case policies, not probability samples. Stochastic cone/sweep/lazy policies and careful profiles use the listed seeded aim streams. Careful players may use earned Split/Super Bloom; no profile uses powerups. This is engine simulation, not measured human or device performance.',summary,runs:rows};
    fs.mkdirSync(path.dirname(args.output),{recursive:true});fs.writeFileSync(args.output+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(args.output+'.tmp',args.output);return report;
  };
  await Promise.all(Array.from({length:Math.min(args.workers,tasks.length)},()=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename),dispatch=()=>worker.postMessage(drift||failed||next>=tasks.length?null:tasks[next++]);
    worker.on('message',row=>{rows.push(row);if(row.error)failed=true;if(rows.length%10===0){snapshot(false);console.log(`Comparison ${rows.length}/${tasks.length}: ${row.policy}`);}dispatch();});
    worker.on('error',reject);worker.on('exit',code=>code?reject(new Error('Worker exited '+code)):resolve());dispatch();
  })));
  const report=snapshot(true);console.log(JSON.stringify({output:args.output,completed:report.completed,source_stable:report.source_stable,summary:report.summary},null,2));
  if(drift||failed)process.exitCode=1;
}
