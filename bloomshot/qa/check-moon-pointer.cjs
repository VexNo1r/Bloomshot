'use strict';
// Finger-aim tolerance for the Moon chapter. A careful simulated player picks
// the most forgiving angle, then fires with 3 degrees of Gaussian aim error
// (roughly a fingertip on a phone). The teaching trials must be forgiving and
// the chapter must ramp up without any trial becoming a pixel hunt.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { run, levels } = require('./aim-tolerance.cjs');
const floors = [.9, .8, .7, .45, .45, .35];
const results = levels.map((level, i) => ({ id: level.id, ...run(level, 3, 40), floor: floors[i] }));
for (const r of results) assert(r.clearRate >= r.floor, `${r.id}: clear rate ${r.clearRate} under 3° aim error is below ${r.floor}`);
fs.writeFileSync(path.join(__dirname, 'moon-pointer-sensitivity.json'), JSON.stringify({ generatedAt: new Date().toISOString(), aimErrorDegrees: 3, runsPerTrial: 40, results }, null, 2) + '\n');
console.log('PASS: Moon aim tolerance at 3° error: ' + results.map(r => `${r.id} ${Math.round(r.clearRate * 100)}%`).join(', '));
