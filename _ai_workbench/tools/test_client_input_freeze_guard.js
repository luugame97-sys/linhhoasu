const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('client bundle path required');
const source = fs.readFileSync(sourcePath, 'utf8');

assert.match(source, /if\(e\.disposed\)return t\(\)/, 'disposed track fast-path missing');
assert.match(source, /_lhsActiveTracks/, 'active track registry missing');
assert.match(source, /lhsLandDone/, 'land mask watchdog missing');
assert.match(source, /lhsMineDone/, 'mine mask watchdog missing');
assert.equal((source.match(/20260831_input_freeze_guard1/g) || []).length, 0,
  'cache token belongs in index.html, not the JS bundle');

function between(left, right) {
  const start = source.indexOf(left);
  if (start < 0) throw new Error(`missing left anchor: ${left}`);
  const end = source.indexOf(right, start);
  if (end < 0) throw new Error(`missing right anchor: ${right}`);
  return source.slice(start, end);
}

// Exercise the patched active-track handoff without loading Egret/Spine.
const playSource = between('l.play=function(n,t,e)', ',l.findEventInAnimation') + ';';
const context = { l: {}, FRt: function () { return { onInterrupt() {} }; } };
vm.runInNewContext(playSource, context);
let interrupted = 0;
const oldTrack = { onInterrupt() { interrupted += 1; } };
const owner = { commonFunc: {}, _lhsActiveTracks: { 0: oldTrack } };
const newTrack = context.l.play.call(owner, 'a_1', 1, 0);
assert.equal(interrupted, 1, 'replacing a track did not interrupt old waiters');
assert.equal(owner._lhsActiveTracks[0], newTrack, 'new track was not registered');

// A waiter created after disposal must settle synchronously and must not create
// a timer/listener that can later spam the console.
const waitSource = between('TPt.waitPlayEnd=function', '},TPt.waitLoopStart=function') + '}';
const waitContext = { TPt: {}, clearTimeout, setTimeout, console: { warn() {} } };
vm.runInNewContext(waitSource, waitContext);
let settled = false;
waitContext.TPt.waitPlayEnd.call({ disposed: true }).then(() => { settled = true; });
setImmediate(() => {
  assert.equal(settled, true, 'disposed waitPlayEnd did not settle');
  console.log(JSON.stringify({ result: 'ok', activeTrackInterrupt: true, disposedFastPath: true, landMaskGuard: true, mineMaskGuard: true }));
});
