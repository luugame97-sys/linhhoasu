process.env.NODE_ENV = 'production';
process.env.SPIRIT_LEVEL_FAIL_OPEN = '1';
process.env.SPIRIT_GRADE_FAIL_OPEN = '1';
process.env.SPIRIT_CLIENT_MATERIAL_FAIL_OPEN = '1';

const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(root, 'linhhoasu', 'lhs', 'newServer');
const playerService = require(path.join(serverRoot, 'src', 'services', 'PlayerService'));
let savedSnapshot = null;
playerService.savePlayer = async (_userId, player) => {
  savedSnapshot = JSON.parse(JSON.stringify(player));
  return player;
};

const spirit = require(path.join(serverRoot, 'src', 'handlers', 'spirit'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makePlayer(item60) {
  return {
    userId: 'contract-spirit',
    playerId: 'contract-spirit-player',
    name: 'Contract Spirit',
    level: 100,
    exp: 0,
    items: { 60: item60, 61: 10 },
    currencies: { diamond: 982, silver: 5000, gold: 10000 },
    spiritInfo: {
      id: 24001,
      equippedId: 24001,
      owns: [24001],
      rank: 3,
      level: 1,
      exp: 0,
      attrs: {},
    },
    equipInfo: { curIndex: 0, setInfoMap: { 0: { spirit: 24001 } } },
    taskInfo: { tasks: {}, tasksMap: {} },
    roleInfo: {},
  };
}

(async () => {
  const player = makePlayer(100);
  const result = await spirit.handleSpiritUpgrade(
    { upgradeAll: false },
    { userId: player.userId, player },
    77,
  );
  const packets = Array.isArray(result) ? result : [result];
  const itemPacket = packets.find((packet) => packet && packet.tag === 1202);
  const spiritPacket = packets.find((packet) => packet && packet.tag === 3600);

  assert(spiritPacket && spiritPacket.data.result === 0, 'one valid upgrade did not succeed');
  assert(player.items[60] === 83, `expected item60=83, got ${player.items[60]}`);
  assert(player.currencies.diamond === 982, `diamond mutated to ${player.currencies.diamond}`);
  assert(savedSnapshot && savedSnapshot.items[60] === 83, 'persisted snapshot does not contain item60=83');
  assert(savedSnapshot.currencies.diamond === 982, 'persisted snapshot mutated diamond');
  assert(itemPacket, 'missing tag 1202 cost packet');
  assert(JSON.stringify(itemPacket.data.items) === JSON.stringify([{ id: 60, count: -17 }]), `unexpected item deltas ${JSON.stringify(itemPacket.data.items)}`);
  assert(JSON.stringify(itemPacket.data.changed) === JSON.stringify([{ id: 60, count: 83 }]), `unexpected absolute balance ${JSON.stringify(itemPacket.data.changed)}`);

  savedSnapshot = null;
  const poorPlayer = makePlayer(15);
  const blocked = await spirit.handleSpiritUpgrade(
    { upgradeAll: false },
    { userId: poorPlayer.userId, player: poorPlayer },
    78,
  );
  const blockedPackets = Array.isArray(blocked) ? blocked : [blocked];
  const blockedSpirit = blockedPackets.find((packet) => packet && packet.tag === 3600);
  assert(blockedSpirit && blockedSpirit.data.result === 2, 'insufficient material was not rejected');
  assert(poorPlayer.items[60] === 15, 'insufficient request consumed item60');
  assert(poorPlayer.spiritInfo.level === 1, 'production fail-open upgraded without materials');
  assert(savedSnapshot === null, 'blocked request unexpectedly persisted a mutation');

  console.log('PASS Spirit handler: 100->83 persisted, diamond=982, item60=-17, insufficient blocked');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
