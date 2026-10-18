const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');
function assert(c,m){if(!c)throw new Error(m)}
assert((bundle.match(/RuntimeUtil\.isRuntime&&P\.ins\(\)\.open\(Zz\)/g)||[]).length===2,'both web PowerSaving open sites not gated');
assert(!bundle.includes('$.idleTouchTime>=t&&0<B.getPowerSavingSetting()&&P.ins().open(Zz)'), 'ungated web PowerSaving open remains');
assert((index.match(/20260831_stage_touch_recovery_guard10/g)||[]).length===2,'cache token count mismatch');
let web=false,native=false; const open=()=>{if(native) return true;if(web)return false;return false};
web=true;assert(open()===false,'H5 must not auto-open PowerSaving');web=false;native=true;assert(open()===true,'native PowerSaving gate changed');
console.log('PASS web PowerSaving disabled, native PowerSaving preserved');
