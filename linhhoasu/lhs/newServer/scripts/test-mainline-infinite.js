'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.SERVER_ID = '1001';
const config = require('../src/services/ConfigService');
const infinite = require('../src/config/infiniteMainline');
const battle = require('../src/services/BattleService');
const raid = require('../src/handlers/raid');
const payload = require('../src/handlers/playerPayload');

const tables = config.loadAllTables();
const nativeLast = tables.LevelConfig[1310];
assert(nativeLast, 'native mainline must end at 1310');
const generated = infinite.resolveLevel(1311, tables.LevelConfig);
assert.equal(generated.infinite, true);
assert.equal(generated.id, 1311);
assert.equal(generated.monsterId, infinite.MONSTER_BASE + 1311);
assert.deepEqual(generated.reward, [{ id: 4, count: 40 }, { id: 6, count: 10 }]);

const attrs = battle.getMonsterAttrs(generated.monsterId);
assert(Number.isSafeInteger(attrs[1]) && attrs[1] > 0, 'generated monster HP must be finite');
assert(Number.isSafeInteger(attrs[2]) && attrs[2] > 0, 'generated monster ATK must be finite');

const player = { level: 1305, exp: 0, roleInfo: {}, raidInfo: { chapter: 23, level: 1310 } };
raid.advanceLevel(player, 1310);
assert.equal(player.raidInfo.level, 1311);
assert.equal(player.raidInfo.chapter, 24);
assert.equal(player.raidInfo.maxClearedLevel, 1310);
raid.advanceLevel(player, 1311);
assert.equal(player.raidInfo.level, 1312);
assert.equal(player.raidInfo.chapter, 24);
assert.equal(player.raidInfo.maxClearedLevel, 1311);

const wire = payload.buildPlayer500Data(player);
assert.equal(wire.raidInfo.level, 1312);
assert.equal(wire.raidInfo.maxClearedLevel, 1311);

const clone = value => JSON.parse(JSON.stringify(value));
const extended = clone(tables);
assert(infinite.ensure(extended, 1510));
assert(extended.LevelConfig[1510]);
assert(extended.ChapterConfig[25]);
assert(extended.MonsterConfig[infinite.MONSTER_BASE + 1510]);
assert(extended.TaskConfig[infinite.TASK_BASE + 24]);
assert.equal(extended.TaskConfig[10406].nextId, infinite.TASK_BASE + 24);
assert(extended.LanguageConfig[39804024]);

const browserData = fs.readFileSync(path.resolve(__dirname, '../../../webgame/game/js/lhs-mainline-infinite-data-v1.js'), 'utf8');
const serverData = fs.readFileSync(path.resolve(__dirname, '../src/config/infiniteMainline.js'), 'utf8');
assert.equal(browserData, serverData, 'server/browser infinite generator bytes must match');

const clientContext = { console: { info() {}, error() {} }, setTimeout() {}, GlobalManager: { Config: clone(tables) } };
clientContext.window = clientContext;
vm.createContext(clientContext);
vm.runInContext(browserData, clientContext);
function ClientPlayer() {}
ClientPlayer.prototype.onPlayerInfo = function (value) { this.seen = value; };
clientContext.PlayerInfoModel = ClientPlayer;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../webgame/game/js/lhs-mainline-infinite-v1.js'), 'utf8'), clientContext);
const clientPlayer = new clientContext.PlayerInfoModel();
clientPlayer.onPlayerInfo({ raidInfo: { level: 1311, maxClearedLevel: 1310 } });
assert(clientContext.GlobalManager.Config.LevelConfig[1811], 'client bootstrap must install a generated horizon');

console.log(JSON.stringify({ result: 'PASS', version: infinite.VERSION, nativeLast: 1310,
  generated: 1311, chapter: 24, horizon: 1510, productionWrites: 0, networkAttempts: 0 }));
