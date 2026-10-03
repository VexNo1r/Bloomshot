'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Game, BOUNDS, RADIUS } = require('../engine.js');
const { levels } = require('../moon.js');
const solutionsFile = path.join(__dirname, 'moon-solutions.json');
const reportFile = path.join(__dirname, 'moon-test-results.json');
const copy = x => JSON.parse(JSON.stringify(x));
let simulatedShots = 0;
function distanceToPetal(point, petal) {
  const dx = point.x - petal.x, dy = point.y - petal.y;
  const along = Math.max(-petal.length/2, Math.min(petal.length/2, dx*Math.cos(petal.angle)+dy*Math.sin(petal.angle)));
  return Math.hypot(dx-along*Math.cos(petal.angle), dy-along*Math.sin(petal.angle));
}
function validateGeometry(level) {
  assert.equal(level.worldId, 'moon');
  assert(level.buds.length >= 12 && level.buds.length <= 24);
  assert(level.difficulty >= 1 && level.difficulty <= 8);
  assert.equal(level.rules.shots, 5); assert.equal(level.rules.ballsPerShot, 1);
  assert.equal(level.rules.guide, false); assert.equal(level.rules.autoBurst, false);
  assert.equal(level.rules.ballLifetime, 7);
  assert(level.description.length > 40);
  assert(level.hint.length <= 75, 'Hints must fit the mobile strip');
  assert(level.name.length <= 18, 'Names must fit the narrow mobile HUD');
  const groups = new Map();
  for (const bud of level.buds) {
    assert(['gold','lilac','coral'].includes(bud.type));
    assert(bud.x-bud.r > BOUNDS.left && bud.x+bud.r < BOUNDS.right && bud.y-bud.r > BOUNDS.top && bud.y+bud.r < level.launcher.y-24, `${level.id}: bud boundary ${bud.id}`);
    if (bud.group) groups.set(bud.group, (groups.get(bud.group)||0)+1);
    for (const other of level.buds) if (bud !== other) assert(Math.hypot(bud.x-other.x,bud.y-other.y)>bud.r+other.r+1, `${level.id}: buds overlap`);
    for (const petal of level.bumpers) assert(distanceToPetal(bud,petal)>bud.r+6+1, `${level.id}: bud/petal overlap ${bud.id}`);
  }
  assert([...groups.values()].every(count => count >= 2 && count <= 4), 'Discrete local bloom groups');
  for (const gate of level.gates) {
    const partner = level.gates.find(other => other.id === gate.pair);
    assert(partner && partner.pair === gate.id, 'Reciprocal gate pair');
    const margin = gate.r + 2*RADIUS + .2;
    assert(gate.x-margin>BOUNDS.left && gate.x+margin<BOUNDS.right && gate.y-margin>BOUNDS.top && gate.y+margin<BOUNDS.bottom, `${level.id}: gate exit clearance`);
    for (const other of level.gates) if (gate !== other) assert(Math.hypot(gate.x-other.x,gate.y-other.y)>gate.r+other.r+2, 'Gate overlap');
    for (const bud of level.buds) assert(Math.hypot(gate.x-bud.x,gate.y-bud.y)>gate.r+bud.r+2, `${level.id}: gate/bud overlap`);
    for (const petal of level.bumpers) assert(distanceToPetal(gate,petal)>gate.r+6+2, `${level.id}: gate/petal overlap`);
  }
  return { id: level.id, buds: level.buds.length, groups: groups.size, gatePairs: level.gates.length/2, petals: level.bumpers.length };
}
function clone(game) {
  const target = new Game(game.level);
  Object.assign(target, copy(game));
  target.events = [];
  return target;
}
function settle(game, fps=60) {
  const portals = [];
  for (let frame=0; frame<fps*11 && (game.status==='flying'||game.pending.length); frame++) {
    game.step(1/fps);
    for (const event of game.drainEvents()) if (event.type === 'gate') {
      const entry = typeof event.entry === 'string' ? event.entry : event.entry?.id || event.entryId || event.gate?.id;
      const exit = typeof event.exit === 'string' ? event.exit : event.exit?.id || event.exitId;
      portals.push({ entry, exit });
    }
  }
  assert.notEqual(game.status,'flying','Every shot must settle');
  return portals;
}
function shoot(current, angle, rotateId, fps=60) {
  const game = clone(current);
  if (rotateId && !game.rotate(rotateId)) return null;
  if (!game.fire(Math.cos(angle),Math.sin(angle))) return null;
  simulatedShots++;
  const portals = settle(game,fps);
  return { game, portals };
}
function candidateAngles(game) {
  const values = new Map();
  function add(angle) {
    if (angle >= -Math.PI+.125 && angle <= -.125) values.set(Math.round(angle*10000),angle);
  }
  add(-Math.PI/2);
  for (const gate of game.level.gates||[]) {
    const angle = Math.atan2(gate.y-game.launcher.y,gate.x-game.launcher.x);
    for (const delta of [0,-.018,.018,-.045,.045,-.08,.08]) add(angle+delta);
    const exit = game.level.gates.find(other=>other.id===gate.pair);
    if (exit) for (const bud of game.buds) if (!bud.bloomed) add(Math.atan2(bud.y-exit.y,bud.x-exit.x)-(exit.angle-gate.angle));
  }
  for (const bud of game.buds) if (!bud.bloomed) {
    const angle = Math.atan2(bud.y-game.launcher.y,bud.x-game.launcher.x);
    add(angle); add(angle-.02); add(angle+.02);
    for (const wall of [BOUNDS.left+RADIUS,BOUNDS.right-RADIUS]) add(Math.atan2(bud.y-game.launcher.y,2*wall-bud.x-game.launcher.x));
  }
  for(let deg=-171;deg<=-9;deg+=4.5)add(deg*Math.PI/180);
  return [...values.values()];
}
const remaining = game => game.buds.reduce((sum,bud)=>sum+(bud.bloomed?0:bud.hp),0);
function stateKey(game) { return game.buds.map(bud=>bud.bloomed?'0':String(bud.hp)).join('')+':'+game.bumpers.map(b=>Math.round(((b.angle%Math.PI+Math.PI)%Math.PI)*10000)).join(','); }
function solve(level,width=10) {
  let beam = [{game:new Game(level),shots:[],portals:[]}];
  assert.equal(beam[0].game.shotsLeft,5,'Moon optional rules require the updated engine');
  for(let depth=0;depth<5;depth++) {
    const unique = new Map();
    for(const current of beam) for(const rotateId of (level.chapterIndex===1&&depth===0?[null]:[null,...current.game.bumpers.map(p=>p.id)])) for(const angle of (level.chapterIndex===1&&depth===0?[-Math.PI/2]:candidateAngles(current.game))) {
      const trial=shoot(current.game,angle,rotateId);
      if(!trial)continue;
      const portals=[...current.portals,...trial.portals];
      const shot={angleRadians:angle,rotateId,bloomsAfter:trial.game.bloomedCount,gatePassages:trial.portals.length};
      const result={game:trial.game,shots:[...current.shots,shot],portals};
      if(trial.game.status==='won'&&portals.length)return result;
      if(trial.game.status!=='aiming'||remaining(trial.game)>=remaining(current.game))continue;
      const key=stateKey(trial.game)+':'+Boolean(portals.length);
      const old=unique.get(key);
      if(!old||trial.game.score>old.game.score)unique.set(key,result);
    }
    beam=[...unique.values()].sort((a,b)=>remaining(a.game)-remaining(b.game)||Number(Boolean(b.portals.length))-Number(Boolean(a.portals.length))||b.game.score-a.game.score).slice(0,width);
    if(!beam.length)break;
  }
  return null;
}
function replay(level,shots,fps) {
  const game=new Game(level),portals=[];
  for(const shot of shots) {
    if(game.status!=='aiming')break;
    if(shot.rotateId)assert(game.rotate(shot.rotateId));
    assert(game.fire(Math.cos(shot.angleRadians),Math.sin(shot.angleRadians)));
    portals.push(...settle(game,fps));
  }
  return {game,portals};
}
function summary(result) {
  return {status:result.game.status,score:result.game.score,stars:result.game.stars,shotsLeft:result.game.shotsLeft,blooms:result.game.bloomedCount,gatePassages:result.portals.length,gateEntries:result.portals.map(p=>p.entry),buds:result.game.buds.map(b=>({id:b.id,hp:b.hp,bloomed:b.bloomed}))};
}
function main() {
  const geometry=levels.map(validateGeometry);
  if(process.argv.includes('--geometry-only')) {console.log(JSON.stringify(geometry,null,2));return;}
  let records;
  if(process.argv.includes('--solve')) {
    records=[];
    const started=Date.now();
    for(const level of levels) {
      const result=solve(level);
      assert(result,`${level.id} needs an authored solvable gate path`);
      const record={id:level.id,name:level.name,par:level.par,shots:result.shots,score:result.game.score,stars:result.game.stars,portals:result.portals};
      records.push(record);
      fs.writeFileSync(solutionsFile,JSON.stringify({method:'Deterministic direct/grazing/wall/gate angles and one-petal turns; beam width 10; maximum five shots. Gate traversal required. Moon 1 deliberately starts straight up to teach its gate; a stronger two-shot route is known. These are executable routes, not a human playtest or optimality proof.',simulatedShots,elapsedSeconds:(Date.now()-started)/1000,levels:records},null,2)+'\n');
      console.log(`${level.id}: ${result.shots.length} shots, ${result.portals.length} gate passages, ${result.game.score} points`);
    }
  }else records=JSON.parse(fs.readFileSync(solutionsFile)).levels;
  const report={generatedAt:new Date().toISOString(),geometry,levels:[],limits:'Deterministic solver proofs, not human difficulty, fun, device rendering, optimal routes, or proof that every solution requires gates.'};
  for(const level of levels) {
    const record=records.find(item=>item.id===level.id);
    assert(record,'Missing solution: '+level.id);
    const runs=[30,60,144].map(fps=>({fps,...replay(level,record.shots,fps)}));
    for(const run of runs) {assert.equal(run.game.status,'won',`${level.id} replay ${run.fps} FPS`);assert(run.portals.length>0,'Moon solution must use gates');assert.deepEqual(summary(run),summary(runs[0]),`${level.id}: frame-rate mismatch`);}
    const noGate=replay({...copy(level),gates:[]},record.shots,60);
    assert(noGate.game.status!=='won'||noGate.game.bloomedCount<level.buds.length,`${level.id}: recorded route must depend on gates`);
    const survey=[];
    for(let degrees=-171;degrees<=-9;degrees+=3)for(const rotateId of [null,...level.bumpers.map(p=>p.id)]) {
      const trial=shoot(new Game(level),degrees*Math.PI/180,rotateId);
      survey.push({degrees,rotateId,won:trial.game.status==='won',blooms:trial.game.bloomedCount,gatePassages:trial.portals.length});
    }
    const firstShotWins=survey.filter(attempt=>attempt.won).length;
    assert(record.shots.length>=2,`${level.id}: authored route should span multiple shots`);
    // The teaching trial links whole sprigs so finger-aim error is forgiven; a rare
    // lucky opener is acceptable there. Every later trial must still need several shots.
    if(level.chapterIndex===1)assert(firstShotWins<=Math.ceil(survey.length*.05),`${level.id}: lucky one-shot openers must stay rare`);
    else assert.equal(firstShotWins,0,`${level.id}: sampled opening must not clear the chapter board at once`);
    const run=runs[0];
    report.levels.push({id:level.id,name:level.name,shotsUsed:record.shots.length,authoredPar:level.par,parMet:record.shots.length<=level.par,gatePassages:run.portals.length,gateEntries:[...new Set(run.portals.map(p=>p.entry))],score:run.game.score,stars:run.game.stars,replayedFps:[30,60,144],identicalReplayOutcomes:true,noGatesReplay:{status:noGate.game.status,blooms:noGate.game.bloomedCount},openingSurvey:{attempts:survey.length,firstShotWins,maxBlooms:Math.max(...survey.map(s=>s.blooms)),attemptsDetail:survey}});
  }
  const priorRoutes=JSON.parse(fs.readFileSync(path.join(__dirname,'moon-geometry-control-results.json')));
  report.geometryTightening=[];
  for(const control of priorRoutes) {
    const current=levels.find(level=>level.id===control.id), prior=copy(current);
    if(control.id==='moon-4')prior.buds=prior.buds.slice(0,18);
    else if(control.id==='moon-6')[[183,68],[211,49],[239,68]].forEach((point,index)=>Object.assign(prior.buds[6+index],{x:point[0],y:point[1]}));
    else throw new Error('Unknown earlier geometry control');
    assert.equal(replay(prior,control.priorRoute,60).game.status,'won','Prior two-shot route must remain reproducible on prior geometry');
    const tightened=replay(current,control.priorRoute,60);
    assert.notEqual(tightened.game.status,'won','Geometry must actually defeat the previously known short route');
    report.geometryTightening.push({id:control.id,priorRouteShots:control.priorRoute.length,priorGeometryWon:true,currentGeometryWon:false,currentGeometryBlooms:tightened.game.bloomedCount});
  }
  const strongerOpening=[{angleRadians:-2.029010725916235,rotateId:null},{angleRadians:-1.9660107259162354,rotateId:null}];
  assert.equal(replay(levels[0],strongerOpening,60).game.status,'won','Retain the known stronger two-shot opener');
  report.teachingRoute={id:'moon-1',recordedShots:3,knownStrongerRouteShots:2,knownStrongerRoute:strongerOpening,reason:'Recorded route starts straight up to explicitly teach gate entry; it is not the shortest known solution.'};
  report.simulatedShotsThisRun=simulatedShots;
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(`PASS: six authored boards; geometry; gate-dependent multi-shot solutions; 30/60/144 FPS equality; ${report.levels.reduce((sum,level)=>sum+level.openingSurvey.attempts,0)} sampled openings; one-shot clears only as rare lucky openers on the teaching trial.`);
}
if(require.main===module)main();
module.exports={validateGeometry,solve,replay,candidateAngles,shoot,summary};
