'use strict';

const crypto = require('node:crypto');
const { MongoClient } = require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

const client = new MongoClient('mongodb://127.0.0.1:27017');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function row(table, id) {
  return object(table)[id] || object(table)[String(id)] || null;
}

function anonymous(dbName, value) {
  return crypto.createHash('sha256')
    .update(`lhs-suit-dye-audit-v1|${dbName}|${String(value || '')}`)
    .digest('hex').slice(0, 16);
}

function ownedSet(player) {
  const info = object(player.fashionInfo);
  const result = new Set(array(info.activateFashion).map(number).filter((id) => id > 0));
  Object.keys(object(info.fashions)).forEach((id) => {
    if (number(info.fashions[id]) > 0) result.add(number(id));
  });
  return result;
}

function variantOwned(owned, variant) {
  const ids = array(variant && variant.fashionIds).map(number).filter((id) => id > 0);
  return ids.length > 0 && ids.every((id) => owned.has(id));
}

function variantPartial(owned, variant) {
  const ids = array(variant && variant.fashionIds).map(number).filter((id) => id > 0);
  const count = ids.filter((id) => owned.has(id)).length;
  return count > 0 && count < ids.length;
}

function currentVariant(info, variants, fashionConfig) {
  const current = object(info.fashion);
  for (const [color, variant] of Object.entries(object(variants))) {
    const ids = array(variant && variant.fashionIds).map(number).filter((id) => id > 0);
    if (ids.length <= 0) continue;
    const match = ids.every((id) => {
      const fashion = row(fashionConfig, id);
      const type = number(fashion && fashion.type);
      return type > 0 && number(current[String(type)]) === id;
    });
    if (match) return number(color, -1);
  }
  return -1;
}

async function main() {
  config.loadAllTables();
  const dressConfig = object(config.get('FashionDressConfig'));
  const colorConfig = object(config.get('FashionColorConfig'));
  const fashionConfig = object(config.get('FashionConfig'));
  const normalSuitIds = Object.values(dressConfig)
    .filter((dress) => number(dress && dress.isSuit) === 0 && number(dress && dress.id) !== 28000)
    .map((dress) => number(dress.id)).filter((id) => id > 0).sort((a, b) => a - b);
  await client.connect();
  const databases = {};
  try {
    for (const dbName of ['lhs_s1001', 'lhs_s1002']) {
      const players = await client.db(dbName).collection('players').find({}, {
        projection: { userId: 1, playerId: 1, isBot: 1, level: 1, fashionInfo: 1 },
      }).toArray();
      const affected = [];
      const suitCounts = {};
      const exact29030 = [];
      for (const player of players) {
        const owned = ownedSet(player);
        const info = object(player.fashionInfo);
        const issues = [];
        for (const suitId of normalSuitIds) {
          const variants = object(row(colorConfig, suitId));
          const baseOwned = variantOwned(owned, variants['0']);
          const ownedColors = Object.entries(variants)
            .filter(([, variant]) => variantOwned(owned, variant))
            .map(([color]) => number(color)).sort((a, b) => a - b);
          const partialColors = Object.entries(variants)
            .filter(([, variant]) => variantPartial(owned, variant))
            .map(([color]) => number(color)).sort((a, b) => a - b);
          const currentColor = currentVariant(info, variants, fashionConfig);
          if (ownedColors.some((color) => color > 0) && !baseOwned) {
            issues.push({ type: 'COLORED_VARIANT_OWNED_BASE_LOCKED', suitId, ownedColors, currentColor });
          }
          if (partialColors.length > 0) issues.push({ type: 'PARTIAL_VARIANT_OWNERSHIP', suitId, partialColors, currentColor });
          if (currentColor > 0 && !baseOwned) {
            issues.push({ type: 'WEARING_COLORED_VARIANT_BASE_CARD_LOCKED', suitId, ownedColors, currentColor });
          }
          if (suitId === 29030 && (ownedColors.length > 0 || currentColor >= 0 || partialColors.length > 0)) {
            exact29030.push({
              subject: anonymous(dbName, player.userId || player.playerId),
              isBot: player.isBot === true,
              level: number(player.level),
              baseOwned,
              ownedColors,
              partialColors,
              currentColor,
              storedSuitColors: array(object(info.suitColors)['29030']).map(number),
            });
          }
        }
        if (issues.length > 0) {
          affected.push({
            subject: anonymous(dbName, player.userId || player.playerId),
            isBot: player.isBot === true,
            level: number(player.level),
            issues,
          });
          issues.forEach((issue) => {
            const key = `${issue.type}:${issue.suitId}`;
            suitCounts[key] = (suitCounts[key] || 0) + 1;
          });
        }
      }
      databases[dbName] = {
        playerCount: players.length,
        humanCount: players.filter((player) => player.isBot !== true).length,
        affectedCount: affected.length,
        humanAffectedCount: affected.filter((player) => !player.isBot).length,
        suitCounts,
        exact29030,
        affected,
      };
    }
  } finally {
    await client.close();
  }
  console.log('SUIT_DYE_AUDIT=' + JSON.stringify({
    result: 'PASS', generatedAt: new Date().toISOString(), normalSuitIds, databases,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
