'use strict';
// Build candidates from exact live preimages captured in the audit folder.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '_ai_workbench/temp/petsoul_fix_20261006/candidate');
const src = path.join(root, '_ai_workbench/temp/petsoul_contract_audit_20261006/source/src');
fs.mkdirSync(path.join(out, 'handlers'), { recursive: true });
fs.mkdirSync(path.join(out, 'services'), { recursive: true });
function read(rel) { return fs.readFileSync(path.join(src, rel), 'utf8'); }
function write(rel, value) { const target = path.join(out, rel); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value, 'utf8'); }

let service = read('services/RechargeBenefitService.js');
service = service.replace("const KNOWN_MONTH_CARD_IDS = new Set([11000001, 11000002, 11000007, 11000009, 11000012]);", "const KNOWN_MONTH_CARD_IDS = new Set([11000001, 11000002, 11000007, 11000009, 11000012]);\nconst PET_SOUL_WISH_PAY_ID = 11000021;\nconst PET_SOUL_WISH_PRIVILEGE_ID = 44;");
service = service.replace("  addRechargeRecord(info, recordId, multi);", "  const petSoulWishUpdate = recordId === PET_SOUL_WISH_PAY_ID\n    ? { type: PET_SOUL_WISH_PRIVILEGE_ID, endTime: -1 } : null;\n  if (petSoulWishUpdate) info.privilegeItem[String(PET_SOUL_WISH_PRIVILEGE_ID)] = -1;\n\n  addRechargeRecord(info, recordId, multi);");
if (service.includes('topArenaPassUpdate,')) service = service.replace("    topArenaPassUpdate,\n  };", "    topArenaPassUpdate,\n    petSoulWishUpdate,\n  };");
else service = service.replace("    oldTrekPassUpdate,\n  };", "    oldTrekPassUpdate,\n    petSoulWishUpdate,\n  };");
write('services/RechargeBenefitService.js', service);

let recharge = read('handlers/recharge.js');
recharge = recharge.replace("  const monthCardPackets = buildMonthCardUpdatePackets(benefits.monthCardUpdates);", "  const monthCardPackets = buildMonthCardUpdatePackets(benefits.monthCardUpdates);\n  const petSoulWishPackets = benefits.petSoulWishUpdate ? [{ tag: 1212, msgUid: 0, data: benefits.petSoulWishUpdate }] : [];");
recharge = recharge.replace("      activationPassUpdate: benefits.activationPassUpdate || null,\n      appliedAt:", "      activationPassUpdate: benefits.activationPassUpdate || null,\n      petSoulWishUpdate: benefits.petSoulWishUpdate || null,\n      appliedAt:");
recharge = recharge.replace("    monthCardPackets.forEach((packet) => wsServer.pushToUser(userId, packet.tag, packet.data));", "    monthCardPackets.forEach((packet) => wsServer.pushToUser(userId, packet.tag, packet.data));\n    petSoulWishPackets.forEach((packet) => wsServer.pushToUser(userId, packet.tag, packet.data));");
write('handlers/recharge.js', recharge);

let soul = read('handlers/pet-soul.js');
const ensureNeedle = "  info.wishId = normalizeNumericMap(info.wishId);\n  info.wishCount = normalizeNumericMap(info.wishCount);";
const ensureReplacement = "  info.wishId = normalizeNumericMap(info.wishId);\n  info.wishCount = normalizeNumericMap(info.wishCount);\n  // Older live builds stored the two native wish slots as 1/2.\n  // Migrate them once to the quality keys the client actually reads.\n  if (info.wishId['7'] == null && info.wishId['1'] != null) info.wishId['7'] = info.wishId['1'];\n  if (info.wishId['6'] == null && info.wishId['2'] != null) info.wishId['6'] = info.wishId['2'];\n  if (info.wishCount['7'] == null && info.wishCount['1'] != null) info.wishCount['7'] = info.wishCount['1'];\n  if (info.wishCount['6'] == null && info.wishCount['2'] != null) info.wishCount['6'] = info.wishCount['2'];";
if (!soul.includes(ensureNeedle)) throw Error('ENSURE_WISH_ANCHOR_MISSING');
soul = soul.replace(ensureNeedle, ensureReplacement);
const pickNeedle = "    const soulId = pickPetSoulIdByQuality(quality);\n    summon.push({ pos, id: soulId, state: 0, round: 0 });";
const pickReplacement = "    let soulId = pickPetSoulIdByQuality(quality);\n    const wishMax = (player.rechargeInfo && player.rechargeInfo.privilegeItem &&\n      (player.rechargeInfo.privilegeItem['44'] === -1 || Number(player.rechargeInfo.privilegeItem['44']) > Date.now())) ? 1 : 0;\n    const wishedId = toSafeInt(info.wishId[String(quality)], 0);\n    const wishedSoul = wishedId > 0 ? findPetSoul(info, wishedId) : null;\n    const wishUsed = toSafeInt(info.wishCount[String(quality)], 0);\n    if (wishMax > wishUsed && wishedSoul && getPetSoulConfig()[wishedId] &&\n      toSafeInt(getPetSoulConfig()[wishedId].quality, 0) === quality) {\n      soulId = wishedId;\n      info.wishCount[String(quality)] = wishUsed + 1;\n    }\n    summon.push({ pos, id: soulId, state: 0, round: 0 });";
if (!soul.includes(pickNeedle)) throw Error('SUMMON_WISH_ANCHOR_MISSING');
soul = soul.replace(pickNeedle, pickReplacement);
const wishStart = soul.indexOf('async function handlePetSoulSetWish');
const wishEnd = soul.indexOf('\n}\n\nmodule.exports', wishStart);
if (wishStart < 0 || wishEnd < 0) throw Error('SET_WISH_ANCHOR_MISSING');
const wishReplacement = `async function handlePetSoulSetWish(params, session, msgUid) {
  const player = session.player;
  if (!player) return { tag: 6922, msgUid, data: { result: -1, code: 'PET_SOUL_SESSION_REQUIRED', wishId: {} } };
  const info = ensurePetSoulInfo(player);
  const privilege = player.rechargeInfo && player.rechargeInfo.privilegeItem && player.rechargeInfo.privilegeItem['44'];
  if (!(privilege === -1 || Number(privilege) > Date.now())) {
    return { tag: 6922, msgUid, data: { result: -1, code: 'PET_SOUL_WISH_PRIVILEGE_REQUIRED', wishId: clonePlain(info.wishId) } };
  }
  const ids = uniqueInts(Array.isArray(params && params.ids) ? params.ids : []);
  const nextWishId = {};
  const nextWishCount = {};
  for (const id of ids) {
    const soul = findPetSoul(info, id);
    const quality = toSafeInt(getPetSoulConfig()[id] && getPetSoulConfig()[id].quality, 0);
    if (!soul || ![6, 7].includes(quality) || nextWishId[String(quality)] != null) {
      return { tag: 6922, msgUid, data: { result: -1, code: 'PET_SOUL_WISH_SELECTION_INVALID', wishId: clonePlain(info.wishId) } };
    }
    nextWishId[String(quality)] = id;
    nextWishCount[String(quality)] = Math.max(0, toSafeInt(info.wishCount[String(quality)], 0));
  }
  if (Object.keys(nextWishId).length !== 2) {
    return { tag: 6922, msgUid, data: { result: -1, code: 'PET_SOUL_WISH_SELECTION_REQUIRED', wishId: clonePlain(info.wishId) } };
  }
  info.wishId = nextWishId;
  info.wishCount = nextWishCount;
  await savePlayer(session);
  return { tag: 6922, msgUid, data: { result: 0, wishId: clonePlain(info.wishId), wishCount: clonePlain(info.wishCount) } };
}`;
soul = soul.slice(0, wishStart) + wishReplacement + soul.slice(wishEnd + 2);
write('handlers/pet-soul.js', soul);
console.log(JSON.stringify({ files: ['handlers/pet-soul.js', 'handlers/recharge.js', 'services/RechargeBenefitService.js'] }));
