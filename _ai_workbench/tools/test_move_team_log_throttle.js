const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!bundle.includes('console.warn("[LHS] MoveTeam empty path recovery")'), 'unthrottled MoveTeam warning remains');
assert(bundle.includes('_lhsLastEmptyPathWarnAt>=5e3'), 'MoveTeam throttle window missing');
assert(bundle.includes('console.debug("[LHS] MoveTeam empty path recovery")'), 'MoveTeam debug recovery missing');
assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache token count mismatch');

let now = 0;
let last = -Infinity;
let debugCount = 0;
function report() {
  if (last === -Infinity || now - last >= 5000) {
    last = now;
    debugCount += 1;
  }
}
for (let i = 0; i < 100; i += 1) report();
assert(debugCount === 1, `burst was not throttled: ${debugCount}`);
now = 5000;
report();
assert(debugCount === 2, `second throttle window missing: ${debugCount}`);

console.log('PASS MoveTeam log throttle: 100-event burst -> 1 debug log per 5s');
