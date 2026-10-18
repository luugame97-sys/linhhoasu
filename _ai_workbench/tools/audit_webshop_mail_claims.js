/* Read-only correlation of target Webshop orders with Mongo mails/player state. */
const fs = require('fs');
const path = require('path');

process.chdir('/linhhoasu/lhs/newServer');
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Mail = require('/linhhoasu/lhs/newServer/src/db/models/Mail');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const rewardGrant = require('/linhhoasu/lhs/newServer/src/services/RewardGrantService');
const { isEquipTemplateItem } = require('/linhhoasu/lhs/newServer/src/services/EquipService');

const targetIds = [
  25011,25012,25013,25014,25021,25022,25023,25024,25031,25032,25033,25034,25041,25042,25043,25044,25051,25052,25053,25054,
  90014,90015,90016,90034,90036,90042,90043,90064,90065,100005,100006,100043,
];
const targetSet = new Set(targetIds);

function hash(value) {
  return require('crypto').createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function getRow(tableName, id) {
  const table = config.get(tableName) || {};
  return table[id] || table[String(id)] || null;
}

async function main() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const originalLog = console.log;
  console.log = () => {};
  config.loadAllTables();
  console.log = originalLog;
  const mails = await Mail.find({ 'attachments.id': { $in: targetIds } }).sort({ createdAt: 1 }).lean();
  const userIds = [...new Set(mails.map((row) => row.userId))];
  const players = await Player.find({ userId: { $in: userIds } }).lean();
  const playerMap = new Map(players.map((row) => [row.userId, row]));
  const rows = [];
  for (const mail of mails) {
    const player = playerMap.get(mail.userId) || {};
    const attachments = (mail.attachments || []).filter((row) => targetSet.has(Number(row && row.id)));
    for (const attachment of attachments) {
      const id = Number(attachment.id);
      rows.push({
        mail_ref: hash(mail._id),
        user_ref: hash(mail.userId),
        item_id: id,
        count: Number(attachment.count) || 0,
        title: String(mail.title || ''),
        claimed: !!mail.claimed,
        read: !!mail.read,
        created_at: mail.createdAt,
        event_key: mail.eventKey ? hash(mail.eventKey) : '',
        reward_kind: rewardGrant.getRewardKind(id),
        equip_template: isEquipTemplateItem(id),
        asset_type: Number((getRow('AssetsConfig', id) || {}).type) || 0,
        item_bag_count: Number((player.items || {})[id] || 0),
        mail_ledger: Array.isArray(player.mailClaimLedger) && player.mailClaimLedger.map(String).includes(String(mail._id)),
        config_presence: {
          assets: !!getRow('AssetsConfig', id),
          gem: !!getRow('GemConfig', id),
          pet: !!getRow('PetConfig', id),
          petSoul: !!getRow('PetSoulConfig', id),
          sword: !!getRow('SwordConfig', id),
          bloodline: !!getRow('BloodlineConfig', id),
          valhalla: !!getRow('ValhallaConfig', id),
          optional: !!getRow('OptionalGiftConfig', id),
          random: !!getRow('RandomGiftConfig', id),
          gift: !!getRow('GiftConfig', id),
        },
      });
    }
  }
  console.log(JSON.stringify({ mail_count: mails.length, rows }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
