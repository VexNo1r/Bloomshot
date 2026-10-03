'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Game}=require('../engine.js'),{levels}=require('../moon.js');
const level=levels[0],rect={x:8,y:177,width:374,height:504.625};
function angleFor(x,y){const px=(x-rect.x)/rect.width*420,py=(y-rect.y)/rect.height*560;return Math.max(-Math.PI+.16,Math.min(-.16,Math.atan2(Math.min(-35,py-498),px-210)));}
function clone(game){const next=new Game(level);Object.assign(next,JSON.parse(JSON.stringify(game)));next.events=[];return next;}
function shot(game,angle,fps=60){const next=clone(game);assert(next.fire(Math.cos(angle),Math.sin(angle)));for(let i=0;i<fps*11&&next.status==='flying';i++){next.step(1/fps);next.events=[];}assert.notEqual(next.status,'flying');return next;}
const first=shot(new Game(level),-Math.PI/2);
assert.equal(first.bloomedCount,2);
const intended=-1.387998742226947,original=[];
for(let x=251;x<=254;x++)for(let y=309;y<=312;y++){const angle=angleFor(x,y);original.push({x,y,angle,bloomsAfterSecondShot:shot(first,angle).bloomedCount});}
assert.equal(shot(first,intended).bloomedCount,11);
assert.equal(original.find(p=>p.x===253&&p.y===310).bloomsAfterSecondShot,5);
const point={x:176,y:189},angle=angleFor(point.x,point.y),neighbors=[];
for(let x=175;x<=177;x++)for(let y=188;y<=190;y++){const actualAngle=angleFor(x,y),result=shot(first,actualAngle);neighbors.push({x,y,angle:actualAngle,status:result.status,blooms:result.bloomedCount,score:result.score,stars:result.stars});}
const fpsReplays=[];
for(const fps of [30,60,144]){const result=shot(shot(new Game(level),-Math.PI/2,fps),angle,fps);assert.equal(result.status,'won');fpsReplays.push({fps,blooms:result.bloomedCount,score:result.score,stars:result.stars});}
assert.deepEqual(fpsReplays.map(({fps,...outcome})=>outcome),Array(3).fill({blooms:12,score:3200,stars:3}));
const report={generatedAt:new Date().toISOString(),runtimeUnchanged:true,canvasCssRect:rect,launcherLogical:{x:210,y:498},mapping:'Same canvas coordinates and aimAt clamp used by app.js; clicks away from the rotatable petal.',
 sourceHashes:Object.fromEntries(['engine.js','moon.js','app.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')])),
 integrationProofRoute:[{action:'Restart Moon1; Space',angle:-Math.PI/2,bloomsAfter:2},{action:'Click/release integer canvas screen point',...point,angle,bloomsAfter:12}],fpsReplays,
 integerRouteNeighborhood:{radiusCssPixels:1,gridPoints:neighbors.length,clearingPoints:neighbors.filter(p=>p.status==='won').length,points:neighbors},
 originalRouteSensitivity:{fractionalPoint:{x:252.6150831659607,y:310.3651785714286},intendedAngle:intended,intendedBloomsAfter:11,roundedPoint:{x:253,y:310},roundedBloomsAfter:5,neighborGrid:original},
 searchLimits:'A conservative 486-point beam search requiring identical flower outcomes for all9neighbor pixels found no5-shot route. A broader state-set search was stopped before completion. Neither establishes that a robust route is impossible.',
 conclusion:'The specific fractional ricochet solution is sensitive to integer pointer rounding. The exact integer route proves integration, but only1/9adjacent pixels clears it in two shots. This is not validated fun, novice difficulty, or a physical-device test.',
 nextPassRecommendation:'Reduce first-trial precision sensitivity through readable wider gate-to-flower and return routes, then validate ordinary pointer aiming with small pixel perturbations. Do not treat an exact-angle solver win as an approachable tutorial.'};
fs.writeFileSync(path.join(__dirname,'moon-pointer-sensitivity.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: integer route clears at30/60/144FPS; ${report.integerRouteNeighborhood.clearingPoints}/9neighboring pixels clear in two shots; original rounded click reproduces5blooms rather than11. Runtime unchanged.`);
