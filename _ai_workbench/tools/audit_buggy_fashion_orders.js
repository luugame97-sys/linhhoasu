const fs = require('fs');
const crypto = require('crypto');
const mongo = require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Mail = require('/linhhoasu/lhs/newServer/src/db/models/Mail');

function safeId(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function attachmentCount(mail, itemId) {
  const rows = Array.isArray(mail.attachments) ? mail.attachments : [];
  return rows.reduce((sum, row) => sum + (safeId(row && row.id) === itemId ? safeId(row && row.count) : 0), 0);
}
function anonymize(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12); }

(async () => {
  const orders = JSON.parse(fs.readFileSync('/linhhoasu/_ai_workbench/temp/webshop_fashion_orders.json', 'utf8'));
  await mongo.connect();
  const results = [];
  for (const order of orders) {
    const roleId = String(order.role_id || '').trim();
    const itemId = safeId(order.item_id);
    const quantity = safeId(order.quantity);
    const player = await Player.findOne({ $or: [{ userId: roleId }, { playerId: roleId }, { roleId }] }).lean();
    const userId = player ? String(player.userId || '') : roleId;
    const mails = userId ? await Mail.find({ userId }).sort({ createdAt: 1 }).lean() : [];
    const matching = mails.filter((mail) => attachmentCount(mail, itemId) > 0);
    const claimed = matching.filter((mail) => !!mail.claimed);
    const bagCount = player && player.items && typeof player.items === 'object' ? safeId(player.items[String(itemId)]) : 0;
    const fashionInfo = player && player.fashionInfo && typeof player.fashionInfo === 'object' ? player.fashionInfo : {};
    const owned = !!(fashionInfo.fashions && safeId(fashionInfo.fashions[String(itemId)]) > 0)
      || (Array.isArray(fashionInfo.activateFashion) && fashionInfo.activateFashion.some((id) => safeId(id) === itemId));
    results.push({ orderId: safeId(order.id), roleHash: anonymize(roleId), itemId, quantity, playerFound: !!player, userIdMatchesRoleId: !!player && userId === roleId, matchingMails: matching.length, claimedMails: claimed.length, claimedAttachmentCount: claimed.reduce((sum, mail) => sum + attachmentCount(mail, itemId), 0), bagCount, owned, alreadyRepaired: !!(player && player.repairFlags && player.repairFlags.webshopFashionV1 && player.repairFlags.webshopFashionV1[String(order.id)]) });
  }
  console.log(JSON.stringify({ results, summary: {
    orders: results.length,
    playersFound: results.filter((row) => row.playerFound).length,
    claimedOrders: results.filter((row) => row.claimedMails > 0).length,
    unclaimedOrders: results.filter((row) => row.claimedMails <= 0).length,
    alreadyRepaired: results.filter((row) => row.alreadyRepaired).length,
  } }, null, 2));
})().finally(() => mongo.disconnect());
