"""Read-only live comparison of the power sources used by HUD and profile."""
import json
import sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

BASE = Path(__file__).resolve().parents[1]
REMOTE = r'''
'use strict';
const { MongoClient } = require('mongodb');
const battle = require('./src/services/BattleService');
const read = require('./src/services/ArenaReadModelService');
const appearance = require('./src/services/RoleAppearanceService');
const basic = require('./src/handlers/basic');
const payload = require('./src/handlers/playerPayload');
const sync = require('./src/services/PowerDisplaySyncService');

function clone(value) { return JSON.parse(JSON.stringify(value == null ? {} : value)); }
function calc(player) {
  const attrs = battle.calcPlayerPower(player);
  return { attrs, native: read.displayPower(attrs), legacy: battle.calcPowerScore(attrs) };
}
function diffAttrs(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return [...keys].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    .filter((key) => Number((left || {})[key] || 0) !== Number((right || {})[key] || 0))
    .map((key) => ({ id: key, raw: Number((left || {})[key] || 0), normalized: Number((right || {})[key] || 0) }));
}

(async () => {
  const mongo = new MongoClient('mongodb://127.0.0.1:27017/lhs_s1001', { serverSelectionTimeoutMS: 7000 });
  await mongo.connect();
  try {
    const docs = await mongo.db().collection('players').find({ name: 'Talo' }).limit(10).toArray();
    const rows = docs.map((doc) => {
      const raw = calc(doc);
      const normalizedPlayer = clone(doc);
      appearance.ensureRoleAppearance(normalizedPlayer);
      const normalized = calc(normalizedPlayer);
      const detail = basic.buildOtherPlayerDetail(doc, { serverId: 1001 }, 0);
      const self500 = payload.buildPlayer500Data(doc);
      const fakeSession = { player: doc, userId: String(doc.userId || ''), serverId: 1001 };
      const packet = sync.packet(fakeSession, 0, true);
      return {
        playerId: String(doc.playerId || ''),
        userId: String(doc.userId || ''),
        level: Number(doc.level || 0),
        updatedAt: doc.updatedAt || null,
        raw: { native: raw.native, legacy: raw.legacy },
        normalized: { native: normalized.native, legacy: normalized.legacy },
        detail: { native: Number(detail.power || 0), legacy: Number(detail.powerScore || 0), unit: detail.powerUnit || null },
        player500: { native: Number(self500.power || 0), legacy: Number(self500.powerScore || 0), unit: self500.powerUnit || null },
        packet: packet && packet.data ? { native: Number(packet.data.power || 0), legacy: Number(packet.data.powerScore || 0), revision: Number(packet.data.revision || 0) } : null,
        rawVsNormalizedAttrs: diffAttrs(raw.attrs, normalized.attrs),
        detailMatchesRaw: Number(detail.power || 0) === raw.native,
        detailMatchesNormalized: Number(detail.power || 0) === normalized.native,
        packetMatchesRaw: !!packet && Number(packet.data.power || 0) === raw.native,
        packetMatchesNormalized: !!packet && Number(packet.data.power || 0) === normalized.native,
      };
    });
    console.log(JSON.stringify({ readOnly: true, serverId: 1001, count: rows.length, rows }, null, 2));
  } finally {
    await mongo.close();
  }
})().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
'''

ssh = connect()
try:
    raw = run(ssh, 'cd /linhhoasu/lhs/newServer && node -', REMOTE)
finally:
    ssh.close()

out = BASE / 'temp' / 'power_sync_talo_20260927'
out.mkdir(parents=True, exist_ok=True)
(out / 'audit.json').write_text(raw, encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
print(raw)
