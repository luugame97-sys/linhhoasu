const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
const Mail = require(path.join(process.cwd(), 'src/db/models/Mail'));
const Player = require(path.join(process.cwd(), 'src/db/models/Player'));
const config = require(path.join(process.cwd(), 'src/services/ConfigService'));

const ordersPath = process.argv[2];
const backupDir = process.argv[3];
const commit = process.argv.includes('--commit');
if (!ordersPath || !backupDir) throw new Error('usage: node repair_webshop_reward_orders.js <orders.json> <backupDir> [--commit]');

const GEM_IDS = new Set([
  25011, 25012, 25013, 25014, 25021, 25022, 25023, 25024, 25031, 25032, 25033, 25034,
  25041, 25042, 25043, 25044, 25051, 25052, 25053, 25054,
]);
const ARTIFACT_CONTAINER_IDS = new Set([90042, 90043, 100043]);

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : 0;
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) return value.map((row) => ({ id: n(row && row.id), count: n(row && row.count) })).filter((row) => row.id > 0 && row.count > 0);
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map((id) => ({ id: n(id), count: n(value[id]) })).filter((row) => row.id > 0 && row.count > 0);
}

function parseMysqlLocalTime(value) {
  const text = String(value || '').trim().replace(' ', 'T');
  const timestamp = Date.parse(`${text}+07:00`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventKey(orderId) {
  return `webshop-reward-fix-v2-order-${n(orderId)}`;
}

function allowedArtifactRewards(itemId) {
  const useCfg = config.get('AssetsUseConfig') || {};
  const row = useCfg[itemId] || useCfg[String(itemId)] || null;
  return (Array.isArray(row && row.rewards) ? row.rewards : [])
    .map((reward) => n(reward && reward.id))
    .filter((id) => id > 0 && !!((config.get('ArtifactConfig') || {})[id]));
}

(async () => {
  config.loadAllTables();
  const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
  if (!Array.isArray(orders) || orders.length !== 16) throw new Error(`expected 16 pre-fix orders, got ${Array.isArray(orders) ? orders.length : 'invalid'}`);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001', { serverSelectionTimeoutMS: 5000 });

  const plans = [];
  const backup = { generatedAt: new Date().toISOString(), commit, orders, mailSnapshots: [], playerSnapshots: [] };
  const snapshottedUsers = new Set();

  for (const order of orders) {
    const orderId = n(order.id);
    const itemId = n(order.item_id);
    const count = Math.max(1, n(order.quantity));
    const userId = String(order.role_id || '').trim();
    if (orderId <= 0 || itemId <= 0 || !userId) throw new Error(`invalid order row ${JSON.stringify(order)}`);

    const existed = await Mail.findOne({ userId, eventKey: eventKey(orderId) }).lean();
    if (existed) {
      plans.push({ orderId, itemId, userId, action: 'already-compensated', eventKey: eventKey(orderId) });
      continue;
    }

    const orderTime = parseMysqlLocalTime(order.created_at);
    const nearby = orderTime > 0
      ? await Mail.find({ userId, createdAt: { $gte: new Date(orderTime - 15000), $lte: new Date(orderTime + 15000) } }).lean()
      : [];
    const originalMail = nearby.find((mail) => normalizeAttachments(mail.attachments || mail.rewardData).some((row) => row.id === itemId));
    const player = await Player.findOne({ userId }).lean();
    const bagCount = n(player && player.items && player.items[itemId]);
    let action = 'no-compensation';
    let reason = 'reward-was-usable-or-still-available';
    let attachment = null;

    if (originalMail && !originalMail.claimed) {
      reason = 'original-mail-unclaimed-and-now-fixed';
    } else if (GEM_IDS.has(itemId)) {
      action = 'send-compensation-mail';
      reason = originalMail ? 'claimed-as-bag-item-instead-of-native-gem' : 'original-mail-missing';
      attachment = { id: itemId, count };
    } else if (ARTIFACT_CONTAINER_IDS.has(itemId)) {
      if (bagCount >= count) {
        reason = 'original-container-still-in-bag-and-now-usable';
      } else if (itemId === 90042 || itemId === 90043) {
        const selectedId = allowedArtifactRewards(itemId).find((id) => n(player && player.items && player.items[id]) > 0) || 0;
        action = 'send-compensation-mail';
        reason = selectedId > 0 ? 'selected-artifact-was-stored-as-bag-item' : (originalMail ? 'claimed-container-produced-no-native-artifact' : 'original-mail-missing');
        attachment = { id: selectedId || itemId, count };
      } else {
        action = 'send-compensation-mail';
        reason = originalMail ? 'random-artifact-container-was-consumed-without-reward' : 'original-mail-missing';
        attachment = { id: itemId, count };
      }
    }

    plans.push({
      orderId,
      itemId,
      userId,
      originalMailId: originalMail ? String(originalMail._id) : '',
      originalClaimed: originalMail ? !!originalMail.claimed : null,
      bagCount,
      action,
      reason,
      attachment,
      eventKey: action === 'send-compensation-mail' ? eventKey(orderId) : '',
    });

    if (originalMail) backup.mailSnapshots.push(originalMail);
    if (player && !snapshottedUsers.has(userId)) {
      backup.playerSnapshots.push(player);
      snapshottedUsers.add(userId);
    }

    if (commit && action === 'send-compensation-mail') {
      await Mail.create({
        userId,
        title: 'Bù lỗi WebShop',
        content: `Bù vật phẩm cho đơn WebShop #${orderId} sau khi sửa lỗi nhận thưởng.`,
        text: `Bù vật phẩm cho đơn WebShop #${orderId} sau khi sửa lỗi nhận thưởng.`,
        sender: '0',
        attachments: [attachment],
        targetType: 'user',
        targetServerId: 1001,
        batchId: `webshop_reward_fix_v2_${orderId}`,
        createdBy: 'webshop-reward-fix-v2',
        eventKey: eventKey(orderId),
        read: false,
        claimed: false,
      });
    }
  }

  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, commit ? 'commit_snapshot.json' : 'dry_run_snapshot.json'), JSON.stringify({ ...backup, plans }, null, 2), { mode: 0o600 });
  const created = commit ? await Mail.find({ eventKey: { $in: orders.map((order) => eventKey(order.id)) } }).lean() : [];
  const expectedCreates = plans.filter((plan) => plan.action === 'send-compensation-mail').length;
  const result = { result: 'ok', commit, orderCount: orders.length, expectedCreates, createdCount: created.length, actions: plans };
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error.stack || error.message || String(error));
  try { await mongoose.disconnect(); } catch (_err) {}
  process.exitCode = 1;
});
