"""Read-only live audit of OldTrek profile power/HP and main player attrs."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = TOOLS.parents[1]
OUT = ROOT / "_ai_workbench" / "temp" / "oldtrek_power_live_20260921.json"

TARGETED_REMOTE = r'''
const cp=require('child_process'), fs=require('fs'), crypto=require('crypto');
const pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).find(p=>p.name==='lhs-s1001');
if(!pm) throw Error('SERVER_NOT_FOUND');
for(const key of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH']) {
 const value=pm.pm2_env[key]??pm.pm2_env.env?.[key]; if(value!=null) process.env[key]=String(value);
}
const quiet={info(){},warn(){},error(){},debug(){}};
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:quiet};
const mongoose=require('mongoose');mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
const service=require('./src/services/PlayerService');let blockedWrites=0;
for(const key of ['savePlayer','createPlayer']) service[key]=()=>{blockedWrites++;throw Error('AUDIT_WRITE_BLOCKED');};
const cfg=require('./src/services/ConfigService'),battle=require('./src/services/BattleService');
const basic=require('./src/handlers/basic'),payload=require('./src/handlers/playerPayload'),old=require('./src/services/OldTrekArenaService');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const conn=await mongoose.createConnection(pm.pm2_env.MONGO_URI||pm.pm2_env.env?.MONGO_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:5000}).asPromise();
 try {
  const col=conn.db.collection('players'),result={at:new Date().toISOString(),readOnly:true,productionPlayerWrites:0,probe:'full-document isolated builders, not intercepted live socket',server:pm.name,cwd:pm.pm2_env.pm_cwd,rows:[],sourceHashes:{}};
  const langPath='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';
  const langRaw=fs.readFileSync(langPath), langTables=cfg.decodeTables(langRaw), lang=langTables.LanguageConfig||{};
  result.liveLanguage={sha256:hash(langRaw),bytes:langRaw.length,units:{}};
  for(const id of [30090590,30020170,30020171,30020322]) result.liveLanguage.units[id]=lang[id]||lang[String(id)]||null;
  for(const rel of ['src/services/BattleService.js','src/services/OldTrekArenaService.js','src/handlers/basic.js','src/handlers/playerPayload.js','src/config/dropLevel100.js'])result.sourceHashes[rel]=hash(fs.readFileSync(rel));
  for(const name of ['Talo','FoxPlayer']) {
   const probe=await col.findOne({name},{projection:{specSpiritInfo:1,'other_attr_info.specSpiritInfo':1},maxTimeMS:5000});
   const full=await col.findOne({name},{maxTimeMS:5000});
   if(!full){result.rows.push({name,missing:true});continue;}
   Object.assign(full,{specSpiritInfo:probe?.specSpiritInfo, _auditOtherSpecSpiritInfo:probe?.other_attr_info?.specSpiritInfo});
   const p=full;
   const before=hash(JSON.stringify(p)),attrs=battle.calcPlayerPower(clone(p));
   const detail=basic.buildOtherPlayerDetail(p,{serverId:1001,dbid:String(p._id)}),login=payload.buildPlayer500Data(p);
   const excluded=clone(p);delete excluded.other_attr_info.oldTrekInfo;
   const withoutOld=battle.calcPlayerPower(excluded);
   const eq=Object.values(p.equipInfo?.equipSetMap?.[p.equipInfo?.curIndex||0]||{});
   const oldProfile=old.profile(p),after=await col.findOne({_id:p._id},{maxTimeMS:5000});
   result.rows.push({name:p.name,serverId:p.serverId,level:p.level,boxLevel:p.boxInfo?.level,
    rawCalculated:{hp:attrs[1],atk:attrs[2],def:attrs[3],spd:attrs[4]},
    otherProfile:{hp:detail.totalAttr[1],atk:detail.totalAttr[2],power:detail.power,powerScore:detail.powerScore,powerUnit:detail.powerUnit},
    login:{power:login.power,equipSlots:Object.keys(login.equipInfo?.equipSetMap?.[login.equipInfo?.curIndex||0]||{})},
    equipment:{count:eq.length,drop100Count:eq.filter(e=>e.id>=200000000&&e.id<=209999999).length,hpRawSum:eq.reduce((s,e)=>s+Number(e.attrs?.[1]||0),0)},
    oldTrek:{hp:oldProfile.hp,power:oldProfile.sailPower,shipSkins:p.other_attr_info?.oldTrekInfo?.shipSkins,mainHpWithoutOldTrek:withoutOld[1],mainHpDeltaFromOldTrek:attrs[1]-withoutOld[1]},
    specSpirit:{topLevel:p.specSpiritInfo||null,nested:p._auditOtherSpecSpiritInfo||null},
    suppliedDocMutated:hash(JSON.stringify(p))!==before,dbSameOnReadback:hash(JSON.stringify(after))===before});
  }
  result.blockedWriteAttempts=blockedWrites;console.log(JSON.stringify(result));
 } finally {await conn.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
'''


REMOTE = r'''
const cp = require('child_process');
const mongoose = require('mongoose');
const ConfigService = require('./src/services/ConfigService');
const BattleService = require('./src/services/BattleService');
const OldTrekArena = require('./src/services/OldTrekArenaService');
const cfg = name => ConfigService.get(name) || {};
const pm = JSON.parse(cp.execSync('pm2 jlist', {encoding:'utf8'}))
  .filter(x => /^lhs-s100[1-5]$/.test(x.name));
const num = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const attrsPower = attrs => Object.entries(attrs || {}).reduce((sum,[k,v]) => {
  const row = cfg('AttrConfig')[k] || cfg('AttrConfig')[String(k)];
  return sum + (row && num(row.power) > 0 ? num(v) * num(row.power) : 0);
}, 0);
const safe = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
const pick = p => ({
  _id: String(p._id || ''), userId: p.userId, playerId: p.playerId, name: p.name,
  serverId: p.serverId, level: p.level, stage: p.stage,
  oldTrek: {
    season: p.other_attr_info?.oldTrekInfo?.season,
    sailing: p.other_attr_info?.oldTrekInfo?.sailing,
    sailSetId: p.other_attr_info?.oldTrekInfo?.sailSetId,
    arenaSetId: p.other_attr_info?.oldTrekInfo?.arenaSetId,
    sailorCount: Array.isArray(p.other_attr_info?.oldTrekInfo?.sailorList) ? p.other_attr_info.oldTrekInfo.sailorList.length : 0,
    slots: safe(p.other_attr_info?.oldTrekInfo?.sailorSlotList),
  },
});
(async () => {
  const out = { at: new Date().toISOString(), readOnly: true, productionPlayerWrites: 0, servers: [], formulas: {} };
  out.formulas.clientRelevant = 'OldTrekPowerItem renders data.power; OldTrek rank/profile uses sailPower and hp from OldTrek profile';
  out.formulas.main = 'BattleService.calcPlayerPower -> attr[1] HP; AttrConfig weighted sum';
  out.formulas.oldTrek = 'OldTrekArenaService.profile -> team attrs from sailors/common attrs; hp=sum line attrs[1]; sailPower=sum attrs*OldTrekAttrConfig.power';
  for (const proc of pm) {
    const uri = proc.pm2_env.MONGO_URI || proc.pm2_env.env?.MONGO_URI;
    if (!uri) { out.servers.push({server: proc.name, error:'MONGO_URI_MISSING'}); continue; }
    const conn = await mongoose.createConnection(uri, {autoIndex:false, autoCreate:false, serverSelectionTimeoutMS:5000}).asPromise();
    const col = conn.db.collection('players');
    const docs = await col.find({ 'other_attr_info.oldTrekInfo': {$exists:true}, isBot: {$ne:true}, managedBot: {$ne:true} }, {
      projection: { _id:1, userId:1, playerId:1, name:1, serverId:1, serverName:1, level:1, stage:1, power:1, powerScore:1,
        roleInfo:1, equipInfo:1, swordInfo:1, petInfo:1, gemInfo:1, formationInfo:1, spiritInfo:1, artifactInfo:1,
        fashionInfo:1, fateInfo:1, fishInfo:1, homelandInfo:1, itemUseRecords:1, other_attr_info:1 },
    }).toArray();
    const rows = [];
    for (const p of docs) {
      const attrs = BattleService.calcPlayerPower(p);
      const old = OldTrekArena.profile(p, true);
      const sail = OldTrekArena.profile(p, false);
      rows.push({
        identity: pick(p),
        main: { hp: num(attrs[1]), atk: num(attrs[2]), def: num(attrs[3]), speed: num(attrs[4]), nativePower: Math.ceil(attrsPower(attrs)), calcPowerScore: BattleService.calcPowerScore(attrs), attrKeys: Object.keys(attrs).length },
        oldTrekArena: { hp: num(old.hp), maxHp: num(old.maxHp), sailPower: num(old.sailPower), score: num(old.score), sailorLines: old.sailors.length, commonAttr: safe(old.commonAttr) },
        oldTrekSail: { hp: num(sail.hp), maxHp: num(sail.maxHp), sailPower: num(sail.sailPower), score: num(sail.score), sailorLines: sail.sailors.length },
        stored: { power: p.power ?? null, powerScore: p.powerScore ?? null },
      });
    }
    const byName = rows.filter(r => /talo|nicky|vanduc|hungyen/i.test(String(r.identity.name || '')));
    const maxMainHp = rows.slice().sort((a,b)=>b.main.hp-a.main.hp).slice(0,5);
    const maxOldHp = rows.slice().sort((a,b)=>b.oldTrekArena.hp-a.oldTrekArena.hp).slice(0,5);
    out.servers.push({ server: proc.name, process: {pid:proc.pid,status:proc.pm2_env.status,restarts:proc.pm2_env.restart_time,cwd:proc.pm2_env.pm_cwd}, count: rows.length, named: byName, maxMainHp, maxOldHp });
    await conn.close();
  }
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
'''


def main():
    ssh = connect()
    try:
        targeted = "--targeted" in sys.argv
        if not targeted:
            raise RuntimeError("USE_TARGETED_MODE: inventory projection omitted boxInfo and did not replay PM2 config; do not use its main-attribute values")
        raw = run(ssh, "cd /linhhoasu/lhs/newServer && node", TARGETED_REMOTE if targeted else REMOTE)
        try:
            # ConfigService logs one informational line before the JSON payload.
            payload = raw[raw.find("{"):] if raw.find("{") >= 0 else raw
            data = json.loads(payload)
        except json.JSONDecodeError:
            print("REMOTE_RAW_PREFIX=" + raw[:4000].encode("unicode_escape").decode("ascii"))
            raise
        data["local"] = {}
        for rel in [
            "linhhoasu/lhs/newServer/src/services/OldTrekArenaService.js",
            "linhhoasu/lhs/newServer/src/handlers/old-trek.js",
            "linhhoasu/lhs/newServer/src/services/BattleService.js",
            "linhhoasu/webgame/game/js/lhs-power-cells-full-v1.js",
        ]:
            path = ROOT / rel
            data["local"][rel] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}
        dest = OUT.with_name("character_stats_targeted_20260921.json") if targeted else OUT
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if targeted:
            print(json.dumps({"output":str(dest), **data}, ensure_ascii=False, indent=2))
            return
        print(json.dumps({
            "output": str(OUT), "at": data.get("at"), "readOnly": data.get("readOnly"),
            "productionPlayerWrites": data.get("productionPlayerWrites"),
            "servers": [{"server": s.get("server"), "count": s.get("count"), "named": s.get("named"), "maxMainHp": s.get("maxMainHp"), "maxOldHp": s.get("maxOldHp")} for s in data.get("servers", [])],
        }, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
