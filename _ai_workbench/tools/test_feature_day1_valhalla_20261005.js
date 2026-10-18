'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '../..');
const app = process.env.FEATURE_APP || path.join(root, 'linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const handler = process.env.VALHALLA_HANDLER || path.join(root, '_ai_workbench/temp/feature_day1_20261005/valhalla/valhalla.live.js');
let saves = 0;
const tables = {};
const sandbox = { module: { exports: {} }, process: { env: {} }, require(name) {
  if (name === '../services/ConfigService') return { get: key => tables[key] || config.get(key) };
  if (name === '../services/PlayerService') return { savePlayer: async () => { saves++; } };
  if (name === '../services/FeatureMutationService') return { wrap: fn => fn, save: async () => { saves++; } };
  if (name === '../services/SideTaskProgressService') return { recordProgress: () => {} };
  if (name === '../services/CurrencySync') return { buildClientItemList: () => [] };
  if (name === './task') return {};
  throw Error(name);
} };
vm.runInNewContext(fs.readFileSync(handler, 'utf8') + '\nmodule.exports._gate = isSlotUnlockedForPlayer;', sandbox);
const api = sandbox.module.exports;
const fields = config.get('ValhallaFieldConfig');
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
function player(level = 285) { const p = { level, currencies: {}, items: {} }; api.ensureValhallaInfo(p); Object.defineProperty(p, 'valhallaInfo', { get: () => p.other_attr_info.valhallaInfo }); return p; }
async function equip(p, params) { return api.handleValhallaEquip(params, { player: p, userId: 'RAM_FIXTURE' }, 1); }
(async () => {
  await check('all36 live field rows already day1', () => {
    assert.strictEqual(Object.keys(fields).length, 36);
    Object.values(fields).forEach(row => assert.strictEqual(row.openDay, 1));
  });
  await check('every field keeps level threshold at serverday1', () => {
    Object.values(fields).forEach(row => {
      assert.strictEqual(api._gate({ level: row.playerLevel - 1 }, row.id - 1), false);
      assert.strictEqual(api._gate({ level: row.playerLevel }, row.id - 1), true);
    });
  });
  await check('day gate remains effective when configured above1; zero/negative sentinel retains min1', () => {
    tables.ValhallaFieldConfig = JSON.parse(JSON.stringify(fields));
    tables.ValhallaFieldConfig[36].openDay = 57;
    assert.strictEqual(api._gate({ level: 285 }, 35), false);
    tables.ValhallaFieldConfig[36].openDay = 1;
    assert.strictEqual(api._gate({ level: 285 }, 35), true);
    sandbox.process.env.SERVER_OPEN_DAY = '-2';
    assert.strictEqual(api._gate({ level: 285 }, 35), true);
    delete sandbox.process.env.SERVER_OPEN_DAY;
    delete tables.ValhallaFieldConfig;
  });
  await check('actual4101 accepts owned hero in final field at sufficient level', async () => {
    const p = player(), uid = p.valhallaInfo.valhalla[0].uid;
    await equip(p, { uid, index: 35, set: true });
    assert.strictEqual(p.valhallaInfo.planInfo[0].equippedMap['35'], uid);
  });
  await check('actual4101 rejects low level and unowned hero', async () => {
    const p = player(284), uid = p.valhallaInfo.valhalla[0].uid;
    await equip(p, { uid, index: 35, set: true });
    assert.strictEqual(p.valhallaInfo.planInfo[0].equippedMap['35'], undefined);
    const q = player(); await equip(q, { uid: 987654321, index: 35, set: true });
    assert.strictEqual(q.valhallaInfo.planInfo[0].equippedMap['35'], undefined);
  });
  await check('out of range batch slot does not equip', async () => {
    const p = player(), uid = p.valhallaInfo.valhalla[0].uid;
    await equip(p, { uids: [uid], slots: [36] });
    assert.strictEqual(p.valhallaInfo.planInfo[0].equippedMap['36'], undefined);
  });
  console.log(JSON.stringify({ checks, mode: 'RAM_ONLY', mockedSaves: saves, playerWrites: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
