'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.FEATURE_CANDIDATE_ROOT || path.resolve(__dirname, '../temp/feature_unlock_release_20260917/candidate');
const app = fs.existsSync(path.join(root, 'server/src')) ? path.join(root, 'server') : root;
const validator = require(path.join(app, 'src/services/MineExitValidationService.js'));
const clientPath = process.env.FEATURE_NATIVE_CLIENT || path.resolve(__dirname, '../temp/fashion_current_audit_20260917/client/js/main.min_drop100.js');
const client = fs.readFileSync(clientPath, 'utf8');
function nativeFunction(marker) {
  const start = client.indexOf(marker);
  assert.ok(start >= 0, `native marker ${marker}`);
  const body = client.indexOf('{', start); let depth = 0;
  for (let end = body; end < client.length; end++) {
    if (client[end] === '{') depth++;
    if (client[end] === '}' && --depth === 0) return client.slice(start + marker.indexOf('function'), end + 1);
    if (client[end] === '}' && depth < 0) break;
  }
  throw new Error('native function extraction failed');
}
const blocks = { 1: { shape: [[1], [1], [1], [1]] }, 2: { shape: [[1, 1], [1, 1]] } };
const context = vm.createContext({ Y: { Config: { MineBlockConfig: blocks } }, console });
vm.runInContext(`class Node { constructor(col,meter){this.col=col;this.meter=meter;this.gCost=0;this.hCost=0;this.parent=null;} equal(other){return this.col===other.col&&this.meter===other.meter;} } var _V=Node; var JFe={};`, context);
const astarStart = client.indexOf('JFe.canWalk=function');
const astarEnd = client.indexOf('t(CV=JFe,"MineAStar")', astarStart);
assert.ok(astarStart >= 0 && astarEnd > astarStart);
vm.runInContext(client.slice(astarStart, astarEnd).replace(/,$/, ';'), context);
context.panelNative = vm.runInContext(`(${nativeFunction('f.handlePanelBlockData=function')})`, context);
context.gridNative = vm.runInContext(`(${nativeFunction('f.handleTestDataMap=function')})`, context);
let checks = 0;
const check = (result, message) => { assert.ok(result, message); checks++; };
function fixture(obstacle) {
  return { meter: 40, playerMeter: 39, playerCol: 3, blocks: [
    { uid: 1, id: 1, col: 0, meter: 43, status: 1 },
    ...(obstacle ? [{ uid: 2, id: 2, col: 3, meter: 42, status: 0 }] : []),
  ] };
}
for (const obstacle of [false, true]) {
  const level = fixture(obstacle);
  const model = { _levelData: level, Camera_Block_Meter_count: 12, Visible_Block_Col_Count: 8, getBlocks: () => level.blocks, getMeter: () => level.meter };
  context.panelNative.call(model); context.gridNative.call(model);
  context.map = model._testDataMap;
  for (let col = 0; col < 8; col++) {
    const nativePath = vm.runInContext(`JFe.getPath(new _V(3,39),new _V(${col},45),map).slice().reverse().map(n=>({col:n.col,meter:n.meter}))`, context);
    check(nativePath.length > 0, 'native exit route exists');
    check(validator.validate(level, { deep: 1 }, blocks, nativePath).valid, 'validator accepts native AStar exit path and shape detour');
  }
}
const level = fixture(false);
const direct = Array.from({ length: 7 }, (_, i) => ({ col: 3, meter: 39 + i }));
check(validator.validate(level, { deep: 1 }, blocks, direct).valid, 'direct walked exit');
check(!validator.validate({ ...level, meter: 6 }, { deep: 1 }, blocks, direct).valid, 'reject early finish');
check(!validator.validate(level, { deep: 1 }, blocks, [direct[0], direct[6]]).valid, 'reject coordinate jump');
check(!validator.validate(level, { deep: 1 }, blocks, direct.slice(1)).valid, 'reject forged start');
check(!validator.validate(fixture(true), { deep: 1 }, blocks, direct).valid, 'reject path through obstacle');
check(!validator.validate(level, { deep: 1 }, blocks, direct.slice(0, -1)).valid, 'reject incorrect exit target');
check(!validator.validate(level, {}, blocks, direct).valid, 'reject missing depth config');
console.log(JSON.stringify({ pass: checks, nativeFunctions: ['MineModel.handlePanelBlockData', 'MineModel.handleTestDataMap', 'MineAStar'], handlerEnforcement: false, productionWrites: 0 }));
