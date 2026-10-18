const assert = require('node:assert/strict');
const path = require('node:path');

const serverRoot = path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer');
process.chdir(serverRoot);

const {
  BotConversationService,
  _debug,
} = require(path.join(serverRoot, 'src', 'services', 'BotConversationService'));
const {
  BotPopulationService,
  buildBotChatDbid,
} = require(path.join(serverRoot, 'src', 'services', 'BotPopulationService'));
const WSServer = require(path.join(serverRoot, 'src', 'net', 'WSServer'));
const WebSocket = require(path.join(serverRoot, 'node_modules', 'ws'));
const preparedChat = require(path.join(serverRoot, 'src', 'services', 'PreparedChatService'));
const configService = require(path.join(serverRoot, 'src', 'services', 'ConfigService'));
const runtimeBus = require(path.join(serverRoot, 'src', 'services', 'RuntimeBus'));
const basic = require(path.join(serverRoot, 'src', 'handlers', 'basic'));
const chatHandler = require(path.join(serverRoot, 'src', 'handlers', 'chat'));
const { applyManagedBotProfile } = require(path.join(serverRoot, 'src', 'services', 'ManagedBotProfileService'));

function bot(id, name, mapId = 10024) {
  return {
    id,
    mapId,
    line: 0,
    player: {
      _id: buildBotChatDbid(id),
      isBot: true,
      userId: id,
      playerId: id,
      name,
      level: 60,
      roleInfo: { kungfuId: 4, subJob: 0, stage: 6 },
      items: {},
    },
  };
}

async function run() {
  configService.loadAllTables();
  const ordinalParser = require(path.join(serverRoot, 'src', 'services', 'ManagedBotProfileService'));
  assert.equal(ordinalParser.getBotOrdinal('lhs_real_bot_001_s1001'), 0);
  assert.equal(ordinalParser.getBotOrdinal('lhs_real_bot_024_s1001'), 23);
  assert.equal(ordinalParser.getBotOrdinal('lhs_real_bot_580_s1001'), 579);
  assert.equal(_debug.extractPlainChatText({ content: '{"content":"xin chào bot"}' }), 'xin chào bot');
  const redacted = _debug.redactSensitiveText('mail a@b.com số 0912 345 678 xem https://x.vn');
  assert.equal(redacted.includes('a@b.com'), false);
  assert.equal(redacted.includes('0912'), false);
  assert.equal(redacted.includes('https://'), false);
  assert.equal(_debug.classifyIntent('bot có nhặt đồ xịn không?'), 'bot');
  assert.equal(_debug.classifyIntent('trang bị nào tăng lực chiến?'), 'gear');
  assert.equal(_debug.classifyIntent('tài khoản đăng nhập bị lỗi'), 'support');

  const local = _debug.buildLocalResponse({
    text: 'xin chào bot',
    playerName: 'Người Chơi',
    speakerId: 'bot_map_10024_1',
    random: () => 0,
  });
  assert.equal(local.intent, 'bot');
  assert.ok(local.reply.length > 10 && local.reply.length <= 120);

  const broadcasts = [];
  const population = new BotPopulationService({
    enabled: false,
    chatEnabled: true,
    conversationManaged: true,
  });
  population.wsServer = {
    broadcastMap(mapId, line, tag, data) {
      broadcasts.push({ mapId, line, tag, data });
      return 2;
    },
  };
  population.bots = [
    bot('bot_map_10024_1', 'An Nhiên'),
    bot('bot_map_10024_2', 'Mặc Vũ'),
  ];
  assert.equal(population.getStats().legacyRandomChatActive, false);
  assert.equal(population.getChatSpeakers(10024, 0).length, 2);
  const directSend = population.sendChatAs('bot_map_10024_1', 'Cày chung cho vui nhé.', { source: 'test' });
  assert.equal(directSend.sent, 2);
  assert.equal(broadcasts[0].tag, 1601);
  assert.equal(JSON.parse(broadcasts[0].data.data.content).content, 'Cày chung cho vui nhé.');
  assert.equal(broadcasts[0].data.data.summary.dbid.length, 24);
  assert.equal(broadcasts[0].data.data.summary.name, 'An Nhiên');

  const realPlayer = {
    _id: '0123456789abcdef01234567',
    isBot: true,
    userId: 'lhs_real_bot_024',
    playerId: 'p_lhs_real_bot_024',
    name: 'Hàn Lập',
    level: 90,
    roleInfo: { kungfuId: 4, subJob: 0, stage: 9 },
    items: {},
  };
  const secondProfilePlayer = JSON.parse(JSON.stringify(realPlayer));
  secondProfilePlayer._id = 'abcdef0123456789abcdef01';
  secondProfilePlayer.playerId = 'p_lhs_real_bot_025';
  secondProfilePlayer.userId = 'lhs_real_bot_025';
  const firstProfile = applyManagedBotProfile(realPlayer, 'lhs_real_bot_024');
  const secondProfile = applyManagedBotProfile(secondProfilePlayer, 'lhs_real_bot_025');
  assert.equal(firstProfile.changed, true);
  assert.equal(secondProfile.changed, true);
  assert.notEqual(firstProfile.profile.avatar, secondProfile.profile.avatar);
  assert.ok(firstProfile.profile.avatar > 0);
  assert.ok(Object.keys(firstProfile.profile.fashionMap).length >= 4);
  const realSession = {
    _isBot: true,
    userId: realPlayer.userId,
    player: realPlayer,
    _mapId: 10024,
    _mapLine: 0,
  };
  const realBroadcasts = [];
  const realServerContract = {
    clients: new Map([
      [24, { ws: { id: 'bot', readyState: WebSocket.OPEN }, session: realSession }],
      [25, { ws: { id: 'human-map-10024', readyState: WebSocket.OPEN }, session: { _isBot: false, _mapId: 10024, player: { playerId: 'human-1' } } }],
      [26, { ws: { id: 'human-map-10016', readyState: WebSocket.OPEN }, session: { _isBot: false, _mapId: 10016, player: { playerId: 'human-2' } } }],
    ]),
    _sendSingle(ws, packet) {
      realBroadcasts.push({ wsId: ws.id, packet });
    },
    broadcastPlayers: WSServer.prototype.broadcastPlayers,
  };
  const realSpeakers = WSServer.prototype.getRealBotChatSpeakers.call(realServerContract, 10024, 0);
  assert.equal(realSpeakers.length, 1);
  assert.equal(realSpeakers[0].kind, 'real');
  assert.equal(realSpeakers[0].dbid.length, 24);
  const realSend = WSServer.prototype.sendRealBotChatAs.call(
    realServerContract,
    realSpeakers[0].id,
    'Tại hạ đang cày map.',
    { source: 'test' },
  );
  assert.equal(realSend.sent, 2);
  assert.deepEqual(realBroadcasts.map((row) => row.wsId).sort(), ['human-map-10016', 'human-map-10024']);
  assert.equal(realBroadcasts.every((row) => row.packet.tag === 1601), true);
  assert.equal(realSend.entry.summary.name, 'Hàn Lập');
  assert.equal(realSend.entry.summary.dbid, realPlayer._id);
  assert.equal(realSend.entry.summary.dbid.length, 24);
  assert.equal(realSend.entry.summary.avatar, firstProfile.profile.avatar);
  const worldHistory = chatHandler.getChatHistory(0, 1);
  assert.equal(worldHistory.length, 1);
  assert.equal(worldHistory[0].summary.dbid, realPlayer._id);
  realServerContract.getRealBotPlayer = (id) => WSServer.prototype.getRealBotPlayer.call(realServerContract, id);
  assert.equal(realServerContract.getRealBotPlayer(realPlayer._id), realPlayer);
  runtimeBus.setWsServer(realServerContract);
  const detailPacket = await basic.handleGetPlayerDetail({ playerId: realPlayer._id }, { player: {} }, 77);
  runtimeBus.setWsServer(null);
  assert.equal(detailPacket.tag, 500);
  assert.equal(detailPacket.data.result, 0);
  assert.equal(detailPacket.data.name, 'Hàn Lập');
  assert.equal(detailPacket.data.avatar, firstProfile.profile.avatar);

  const realConversationMessages = [];
  const wsServer = {
    hasMapObservers(mapId, line) {
      return mapId === 10024 && line === 0;
    },
    getHumanMapStats() {
      return { totalHumans: 1, maps: [{ mapId: 10024, line: 0, count: 1 }] };
    },
    getRealBotChatSpeakers() {
      return [
        { kind: 'real', id: 'p_lhs_real_bot_024', dbid: realPlayer._id, name: 'Hàn Lập', mapId: 10024, line: 0 },
        { kind: 'real', id: 'p_lhs_real_bot_082', dbid: 'abcdef0123456789abcdef01', name: 'Vương Lâm', mapId: 10024, line: 0 },
      ];
    },
    sendRealBotChatAs(id, content) {
      realConversationMessages.push({ id, content });
      return { sent: 1 };
    },
  };
  const service = new BotConversationService({
    enabled: true,
    providerEnabled: false,
    responseChancePercent: 100,
    secondBotChancePercent: 0,
    legacyQuoteChancePercent: 100,
    responseDelayMinMs: 500,
    responseDelayMaxMs: 500,
    mapCooldownMs: 5000,
    playerCooldownMs: 10000,
    ambientMinMs: 60000,
    ambientMaxMs: 60000,
    random: () => 0,
  });
  service.start(wsServer, population);
  const decision = service.observePlayerMessage({ content: 'chào mọi người' }, {
    _isBot: false,
    _mapId: 10024,
    _mapLine: 0,
    userId: 'human-1',
    player: { playerId: 'human-player-1', name: 'Kiếm Khách' },
  });
  assert.equal(decision.accepted, true);
  assert.equal(service.observePlayerMessage({ content: 'legacy bot line' }, {
    _isBot: true,
    _mapId: 10024,
    _mapLine: 0,
  }).reason, 'bot_message');
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(service.getStats().metrics.responses, 1);
  assert.equal(service.getStats().metrics.localResponses, 1);
  assert.equal(realConversationMessages.length, 1);
  assert.equal(realConversationMessages[0].id, 'p_lhs_real_bot_024');
  const contextualText = realConversationMessages[0].content;
  assert.ok(contextualText.includes('Kiếm Khách') || contextualText.includes('Chào'));
  const ambientState = service._getState(10024, 0);
  assert.equal(service._runAmbientDialogue(ambientState, wsServer.getRealBotChatSpeakers()), true);
  assert.equal(service.getStats().metrics.legacyQuoteDialogues, 1);
  assert.ok(preparedChat.getPhrasesForName('Vương Lâm').includes(realConversationMessages[1].content));
  service.stop();

  let requestBody = null;
  let requestAuthorization = '';
  const provider = new BotConversationService({
    enabled: true,
    providerEnabled: true,
    apiUrl: 'https://ai.invalid/v1/chat/completions',
    apiKey: 'test-secret-not-real',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      requestAuthorization = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Mình đang cày map, vào đánh chung nhé!' } }] }),
      };
    },
  });
  const providerState = provider._getState(10024, 0);
  providerState.messages.push({ role: 'player', name: 'Bạn A', text: 'đang làm gì?', at: Date.now() });
  const providerReply = await provider._generateProviderReply(
    providerState,
    providerState.messages[0],
    { id: 'bot_map_10024_1', name: 'An Nhiên' },
  );
  assert.equal(providerReply, 'Mình đang cày map, vào đánh chung nhé!');
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestAuthorization.startsWith('Bearer '), true);
  assert.equal(provider.getStats().metrics.providerSuccess, 1);

  console.log(JSON.stringify({
    result: 'ok',
    localIntent: local.intent,
    localReply: contextualText,
    providerReply,
    mapBroadcasts: broadcasts.length,
    realBotDbid: realSend.entry.summary.dbid,
    realBotName: realSend.entry.summary.name,
    realBotAvatar: realSend.entry.summary.avatar,
    secondRealBotAvatar: secondProfile.profile.avatar,
    detailLookup: detailPacket.data.name,
    realConversationMessages: realConversationMessages.length,
    legacyQuote: realConversationMessages[1].content,
    privacyRedaction: true,
    legacyLoopSuppressed: true,
    providerNetworkUsed: false,
  }));
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
