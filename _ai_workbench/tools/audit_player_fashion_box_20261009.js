'use strict';

const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');

const userId = 'u_Wk_1007_d84fcc_1791030460756';
const serverId = 1007;

function safeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compactMail(row) {
  return {
    id: String(row._id),
    title: row.title || '',
    eventKey: row.eventKey || '',
    batchId: row.batchId || '',
    createdBy: row.createdBy || '',
    attachments: row.attachments || [],
    claimed: !!row.claimed,
    read: !!row.read,
    createdAt: row.createdAt || null,
  };
}

(async () => {
  const mongo = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 7000 });
  await mongo.connect();
  try {
    const db = mongo.db('lhs_s1007');
    const players = db.collection('players');
    const mails = db.collection('mails');
    const player = await players.findOne(
      { userId },
      {
        projection: {
          _id: 0, userId: 1, playerId: 1, name: 1, serverId: 1, level: 1,
          createdAt: 1, updatedAt: 1, items: 1, currencies: 1, fashionInfo: 1,
          moderation: 1, mailClaimLedger: 1, itemUseRecords: 1, other_attr_info: 1,
        },
      },
    );

    const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
    const tables = config.loadAllTables();
    const assets = tables.AssetsConfig || {};
    const uses = tables.AssetsUseConfig || {};
    const dresses = tables.FashionDressConfig || {};
    const language = tables.LanguageConfig || {};
    const candidates = [];

    for (const [idRaw, asset] of Object.entries(assets)) {
      const id = Number(idRaw);
      const use = uses[id] || uses[String(id)];
      const dress = dresses[id] || dresses[String(id)];
      if (!use || !dress) continue;
      const assetType = Number(asset.type);
      const useType = Number(asset.useType || use.useType || use.type);
      if (![100, 1].includes(assetType) || ![101, 105].includes(useType)) continue;
      candidates.push({
        id,
        nameId: asset.name,
        cn: language[asset.name]?.cn || null,
        assetType,
        useType,
        useTypeCfg: Number(use.type || 0),
        dressType: Number(dress.isSuit || 0),
        rewards: Array.isArray(use.rewards) ? use.rewards.slice(0, 12) : [],
        itemCount: safeCount(player?.items?.[id]),
      });
    }
    candidates.sort((a, b) => a.id - b.id);
    const candidateIds = new Set(candidates.map((row) => row.id));
    const itemCounts = Object.entries(player?.items || {})
      .map(([id, count]) => ({ id: Number(id), count: safeCount(count) }))
      .filter((row) => candidateIds.has(row.id) && row.count > 0);

    const records = {
      itemUseRecords: Object.fromEntries(
        Object.entries(player?.itemUseRecords || {})
          .filter(([id]) => candidateIds.has(Number(id))),
      ),
      otherAttrRecord: Object.fromEntries(
        Object.entries(player?.other_attr_info?.record || {})
          .filter(([id]) => candidateIds.has(Number(id))),
      ),
    };

    const active = Array.isArray(player?.fashionInfo?.activateFashion)
      ? player.fashionInfo.activateFashion.map(Number)
      : [];
    const ownedFashionBox = {};
    for (const id of [29040, 29041, 29042, 29043, 29049]) {
      ownedFashionBox[id] = {
        items: safeCount(player?.items?.[id]),
        active: active.includes(id),
        fashion: safeCount(player?.fashionInfo?.fashions?.[id] || player?.fashionInfo?.fashions?.[String(id)]),
      };
    }

    const from = Date.parse('2026-10-09T10:45:00Z');
    const to = Date.parse('2026-10-09T12:30:00Z');
    const recent = await mails.find(
      { userId, createdAt: { $gte: new Date(from), $lte: new Date(to) } },
      { projection: { _id: 1, title: 1, eventKey: 1, batchId: 1, createdBy: 1, attachments: 1, claimed: 1, read: 1, createdAt: 1 } },
    ).sort({ createdAt: 1 }).toArray();
    const allMail = await mails.find(
      { userId },
      { projection: { _id: 1, title: 1, eventKey: 1, batchId: 1, createdBy: 1, attachments: 1, claimed: 1, read: 1, createdAt: 1 } },
    ).sort({ createdAt: -1 }).limit(100).toArray();

    const output = {
      at: new Date().toISOString(),
      readOnly: true,
      productionWrites: 0,
      identity: {
        accountId: 'ntl291188',
        requestedName: 'Rainy Nguyễn',
        storedName: player?.name || null,
        userId,
        playerId: player?.playerId || null,
        serverId: player?.serverId || serverId,
        level: player?.level || null,
        updatedAt: player?.updatedAt || null,
      },
      candidatesCount: candidates.length,
      candidates,
      itemCounts,
      records,
      ownedFashionBox,
      recentMail: recent.map(compactMail),
      recentMailCount: recent.length,
      allMail: allMail.map(compactMail),
      mailLedgerCount: Array.isArray(player?.mailClaimLedger) ? player.mailClaimLedger.length : 0,
      moderationKeys: Object.keys(player?.moderation || {}),
    };
    console.log(JSON.stringify(output));
  } finally {
    await mongo.close();
  }
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});

