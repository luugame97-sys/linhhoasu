const assert = require('node:assert/strict');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
process.chdir(serverRoot);

const configService = require(path.join(serverRoot, 'src', 'services', 'ConfigService'));
configService.loadAllTables();
const { BotPopulationService } = require(path.join(serverRoot, 'src', 'services', 'BotPopulationService'));
const preparedNames = require(path.join(serverRoot, 'src', 'services', 'PreparedNameService'));
const playerNames = require(path.join(serverRoot, 'src', 'services', 'PlayerNameService'));
const preparedChat = require(path.join(serverRoot, 'src', 'services', 'PreparedChatService'));
const { runSelfTest } = require(path.join(serverRoot, 'src', 'bots', 'RealBotWorker'));
const { RealBotWorker, applySlotOffset, resolveBotAssignment } = require(path.join(serverRoot, 'src', 'bots', 'RealBotWorker'));
const router = require(path.join(serverRoot, 'src', 'router'));

const nameStats = preparedNames.getStats();
assert.equal(nameStats.names, 492);
assert.equal(nameStats.duplicates, 1);
assert.equal(nameStats.tooLong, 1);
assert.equal(preparedNames.isDefaultGeneratedName('gc__2_abcd'), true);
assert.equal(preparedNames.isDefaultGeneratedName('Vương Lâm'), false);
assert.equal(preparedNames.resolveNewPlayerName('Vương Lâm', { accountId: 'tester' }), 'Vương Lâm');
assert.notEqual(preparedNames.resolveNewPlayerName('gc__2_abcd', { accountId: 'tester' }), 'gc__2_abcd');
assert.equal(playerNames.validatePlayerName('Ác Long@2026!').ok, true);
assert.equal(playerNames.validatePlayerName('Tên có khoảng trắng').ok, true);
assert.equal(playerNames.validatePlayerName('123456').ok, true);
assert.equal(playerNames.validatePlayerName('Tên dài hơn hai mươi bốn ký tự!').ok, false);
assert.equal(playerNames.validatePlayerName('Tên<script>').ok, false);
const chatStats = preparedChat.getStats();
assert.ok(chatStats.characterCount >= 20);
assert.ok(chatStats.phraseCount >= 100);
assert.ok(preparedChat.getPhrasesForName('Vương Lâm').includes('Thuận là phàm, nghịch là tiên, chỉ trong một niệm.'));
assert.ok(preparedChat.getPhrasesForName('Tiêu Viêm').some((line) => line.includes('đừng khinh thiếu niên nghèo')));
assert.equal(preparedChat.getPhrasesForName('Nhân vật không tồn tại').length, 0);
const workerSelfTest = runSelfTest();
assert.equal(workerSelfTest.result, 'ok');
assert.equal(new Set(workerSelfTest.names).size, workerSelfTest.names.length);
const assignmentMaps = Object.keys(configService.get('MapConfig') || {})
  .map((key) => Number(key))
  .filter((id) => Number.isFinite(id) && Number((configService.get('MapConfig') || {})[id]?.type) === 1)
  .sort((left, right) => left - right);
const assignmentRows = Array.from({ length: assignmentMaps.length * 3 }, (_, index) => resolveBotAssignment(index, assignmentMaps));
assert.equal(assignmentRows.length, 174);
assert.equal(new Set(assignmentRows.map((row) => row.mapId)).size, 58);
for (const mapId of assignmentMaps) {
  const rows = assignmentRows.filter((row) => row.mapId === mapId);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => `${row.x},${row.y}`)).size, Math.min(3, rows[0].points.length || 1));
}
const workerConfig = new RealBotWorker({ enabled: false, count: 174, mapIds: 'all' });
assert.equal(workerConfig.mapIds.length, 58);
assert.equal(workerConfig.farmEnabled, false);
const sameWaypoint = [0, 1, 2, 3, 4].map((slot) => applySlotOffset({ x: 1029, y: 1374 }, slot));
assert.equal(new Set(sameWaypoint.map((point) => `${point.x},${point.y}`)).size, 5);
const deniedBotAction = router.route(1200, 91, { id: 1 }, {
  _isBot: true,
  userId: 'lhs_real_bot_contract',
  player: { playerId: 'lhs_real_bot_contract' },
});
assert.equal(deniedBotAction.data.result, -1);
assert.equal(deniedBotAction.data.msg, 'bot action denied');
assert.ok(router.BOT_ALLOWED_TAGS.has(1600));
assert.ok(!router.BOT_ALLOWED_TAGS.has(1200));
assert.equal(preparedNames.buildManagedBotName('Nguyên Mẫu Phu Nhân', 0), 'Nguyên Mẫu Phu Nhân');
assert.equal(preparedNames.buildManagedBotName('Nguyên Mẫu Phu Nhân', 1), 'Nguyên Mẫu Phu Nhân·2');
assert.ok(preparedNames.buildManagedBotName('Tên nhân vật rất dài vượt giới hạn', 49).length <= 24);

const sent = [];
const fakeWsServer = {
  hasRealPlayersOnMap: () => true,
  hasMapObservers: () => true,
  broadcastMap: (...args) => {
    sent.push(args);
    return 2;
  },
};

const service = new BotPopulationService({
  enabled: true,
  chatEnabled: true,
  chatScope: 'map',
  mapIds: [10001],
  line: 0,
  countPerMap: 2,
  maxTotal: 2,
  moveIntervalMs: 5000,
  chatMinIntervalMs: 60000,
  chatMaxIntervalMs: 60000,
});

const stats = service.start(fakeWsServer);
assert.equal(stats.enabled, true);
assert.equal(stats.botCount, 2);

const rows = service.getVisiblePlayers(10001, 0);
assert.equal(rows.length, 2);
assert.ok(rows.every((row) => row.id.startsWith('bot_map_10001_')));
assert.ok(rows.every((row) => row.showInfo && row.showInfo.fashionMap));

const detail = service.getBotPlayer(rows[0].id);
assert.equal(detail.isBot, true);
assert.equal(detail.playerId, rows[0].id);

for (const bot of service.bots) {
  bot.nextMoveAt = 0;
  bot.nextChatAt = 0;
}
service._tick();

assert.equal(sent.filter((args) => args[2] === 1403).length, 2);
assert.equal(sent.filter((args) => args[2] === 1601).length, 2);
assert.ok(sent.every((args) => args[0] === 10001 && args[1] === 0));
assert.equal(service.getStats().movePacketsSent, 4);
assert.equal(service.getStats().chatPacketsSent, 4);
assert.equal(require(path.join(serverRoot, 'src', 'handlers', 'chat')).getChatHistory(0, 10).length, 0);

service.stop();

const allMapsService = new BotPopulationService({
  enabled: true,
  chatEnabled: false,
  mapIds: 'all',
  countPerMap: 5,
  maxTotal: 290,
});
const allStats = allMapsService.start(fakeWsServer);
assert.equal(allStats.mapIds.length, 58);
assert.equal(allStats.botCount, 290);
assert.ok(allStats.mapIds.includes(990008));
assert.equal(new Set(allMapsService.bots.map((bot) => bot.player.name)).size, 290);
allMapsService.stop();

const spreadService = new BotPopulationService({
  enabled: true,
  chatEnabled: false,
  mapIds: [10001],
  countPerMap: 20,
  maxTotal: 20,
});
spreadService.start(fakeWsServer);
const spreadRows = spreadService.getVisiblePlayers(10001, 0);
assert.equal(spreadRows.length, 20);
assert.equal(new Set(spreadRows.map((row) => `${row.x},${row.y}`)).size, 20);
for (const bot of spreadService.bots) bot.nextMoveAt = 0;
spreadService._tick();
assert.equal(new Set(spreadService.bots.map((bot) => `${bot.x},${bot.y}`)).size, 20);
spreadService.stop();

console.log(JSON.stringify({ result: 'ok', stats, visibleRows: rows.length, movementPackets: 2, chatPackets: 2 }));
