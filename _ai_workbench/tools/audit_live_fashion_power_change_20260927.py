"""Read-only live audit: simulate outfit changes on cloned players only."""
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run

BASE = Path(__file__).resolve().parents[1]
REMOTE = r'''
'use strict';
const { MongoClient } = require('mongodb');
const config = require('./src/services/ConfigService');
const battle = require('./src/services/BattleService');
const appearance = require('./src/services/RoleAppearanceService');
const fashion = require('./src/handlers/fashion');
const playerService = require('./src/services/PlayerService');
const powerSync = require('./src/services/PowerDisplaySyncService');
const tables = config.loadAllTables();
const clone = x => JSON.parse(JSON.stringify(x));
function power(p) { const attrs = battle.calcPlayerPower(p); return { attrs, power: require('./src/services/ArenaReadModelService').displayPower(attrs) }; }
function parts(dressId, color = 0) {
  const d = tables.FashionDressConfig[dressId];
  if (!d) return [];
  const tableName = ['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit];
  const rows = tables[tableName] && tables[tableName][dressId];
  const row = d.isSuit === 4 ? rows : rows && rows[color];
  return row && Array.isArray(row.fashionIds) ? row.fashionIds.map(Number) : [];
}
function candidateSuits(p) {
  const owned = new Set((p.fashionInfo && Array.isArray(p.fashionInfo.activateFashion) ? p.fashionInfo.activateFashion : []).map(Number));
  const out = [];
  for (const [key, d] of Object.entries(tables.FashionDressConfig || {})) {
    const id = Number(key); if (!id || id === 28000 || ![1,2,3,4].includes(Number(d.isSuit))) continue;
    const ids = parts(id, 0); if (ids.length && ids.every(x => owned.has(x))) out.push({ id, ids });
    if (out.length >= 3) break;
  }
  return out;
}
(async()=>{
  const oldSave = playerService.savePlayer;
  playerService.savePlayer = async (_u, p) => p;
  const result = [];
  try {
    for (const serverId of [1001,1002,1003,1004,1005]) {
      const mongo = new MongoClient(`mongodb://127.0.0.1:27017/lhs_s${serverId}`, {serverSelectionTimeoutMS:7000});
      await mongo.connect();
      try {
        const docs = await mongo.db().collection('players').find({isBot:{$ne:true}, 'fashionInfo.activateFashion.4':{$exists:true}}).project({_id:0}).limit(5).toArray();
        for (const original of docs) {
          const p = clone(original); appearance.ensureRoleAppearance(p); const before = power(p); const suits = candidateSuits(p);
          const row = {serverId, name:String(p.name||''), playerId:String(p.playerId||''), activatedCount:Array.isArray(p.fashionInfo.activateFashion)?p.fashionInfo.activateFashion.length:0, before:before.power, suits:[]};
          for (const suit of suits) {
            const q = clone(p); const session = {userId:String(q.userId||''), serverId, player:q};
            powerSync.packet(session, 6000, true);
            const reply = await fashion.handleChangeSuit({id:suit.id,color:0,set:0},session,7000+suit.id);
            const ack = (Array.isArray(reply)?reply:[reply]).find(x=>Number(x&&x.tag)===1802);
            const after = power(session.player);
            const afterPacket = powerSync.packet(session, 8000+suit.id, false);
            row.suits.push({id:suit.id, parts:suit.ids, result:ack&&ack.data&&ack.data.result, after:after.power, delta:after.power-before.power, packetAfter:afterPacket ? {tag:afterPacket.tag,power:afterPacket.data.power} : null});
          }
          result.push(row);
        }
      } finally { await mongo.close(); }
    }
  } finally { playerService.savePlayer = oldSave; }
  console.log(JSON.stringify({readOnly:true, productionWrites:0, rows:result}, null, 2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
'''

ssh = connect()
try:
    raw = run(ssh, 'cd /linhhoasu/lhs/newServer && node -', REMOTE)
finally:
    ssh.close()

out = BASE / 'temp' / 'fashion_power_live_20260927'
out.mkdir(parents=True, exist_ok=True)
(out / 'audit.json').write_text(raw, encoding='utf-8')
start = raw.find('{')
if start < 0:
    raise RuntimeError('REMOTE_JSON_NOT_FOUND')
data, _ = json.JSONDecoder().raw_decode(raw[start:])
rows = data.get('rows', [])
checks = [s for r in rows for s in r.get('suits', []) if s.get('result') == 0]
print(json.dumps({
    'evidence': str(out / 'audit.json'), 'readOnly': data.get('readOnly'),
    'productionWrites': data.get('productionWrites'), 'players': len(rows),
    'suitChecks': len(checks), 'nonZeroDeltas': sum(1 for s in checks if s.get('delta') != 0),
    'sample': rows[:3],
}, ensure_ascii=False))
