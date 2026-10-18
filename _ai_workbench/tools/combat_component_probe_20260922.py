"""Read-only component delta probe; historical reader is evaluated only in RAM."""
import json
import sys
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/combat_parity_20260922'
bonus=(ROOT/'_ai_workbench/backups/power_rollback_20260913_pre/lhs/newServer/src/services/NativeBonusService.js').read_text(encoding='utf-8')
script='const bonusSource='+json.dumps(bonus)+';\n'+r'''
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),crypto=require('crypto');
const pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).find(p=>p.name==='lhs-s1001');
for(const k of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED']) if(pm.pm2_env[k]!=null)process.env[k]=String(pm.pm2_env[k]);
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const cfg=require('./src/services/ConfigService'),battle=require('./src/services/BattleService'),power=require('./src/services/ArenaReadModelService').displayPower;
const bonusModule={exports:{}};vm.runInNewContext(bonusSource,{module:bonusModule,exports:bonusModule.exports,require:()=>cfg});const bonus=bonusModule.exports;
const bp=require.resolve('./src/services/BattleService'),req=require('module').createRequire(bp),mod={exports:{}};
let captured;
const source=fs.readFileSync(bp,'utf8').replace('  applyPercentLinkedAttrs(base);','  capture({...base});\n  applyPercentLinkedAttrs(base);');
vm.runInNewContext(source,{module:mod,exports:mod.exports,require:req,capture:x=>{captured=x;}});
const clone=x=>JSON.parse(JSON.stringify(x));
const {MongoClient}=require('mongodb');
(async()=>{const m=new MongoClient(pm.pm2_env.MONGO_URI||pm.pm2_env.env?.MONGO_URI,{serverSelectionTimeoutMS:5000});await m.connect();
try{const c=m.db().collection('players'),rows=[];
for(const name of ['Talo','FoxPlayer']){
 const p=await c.findOne({name},{maxTimeMS:5000});if(!p)continue;
 const before=mod.exports.calcPlayerPower(clone(p)),raw=clone(captured),extra=bonus.valhallaFormation(p),spec=bonus.specSpirit(p);
 const plus=clone(raw);for(const part of [extra,spec])for(const [k,v]of Object.entries(part))plus[k]=(plus[k]||0)+v;
 const next=bonus.applyLinkedAttrs(plus),linkedOnly=bonus.applyLinkedAttrs(clone(raw));
 const mount=p.swordInfo?.data?.find(r=>r.uid===p.swordInfo.equippedUid),q=cfg.get('AssetsConfig')[mount?.id]?.quality;
 const ml=cfg.get('SwordLevelConfig')[q]?.[mount?.level]?.attrs,ms=cfg.get('SwordStarLevelConfig')[q]?.[mount?.star]?.attrs;
 rows.push({name,level:p.level,before:{hp:before[1],power:power(before)},mount:mount?{id:mount.id,level:mount.level,star:mount.star,cached:mount.attrs,levelAttrs:ml,starAttrs:ms}:null,formationAttrs:extra,specAttrs:spec,raw:{hp:raw[1],power:power(raw)},nativeLinksOnly:{hp:linkedOnly[1],power:power(linkedOnly)},withHistoricalBonusReader:{hp:next[1],power:power(next)},formationKeys:Object.keys(p.other_attr_info?.valhallaFormationInfo||{}),curiosCount:p.other_attr_info?.curiosInfo?.curiosData?.length||0});
}
console.log(JSON.stringify({at:new Date().toISOString(),productionPlayerWrites:0,rows,notes:'historical bonus reader is a hypothesis probe, not deployed or certified'}));
}finally{await m.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
'''
s=connect()
try:
 data=json.loads(run(s,'cd /linhhoasu/lhs/newServer && node',script))
 OUT.mkdir(parents=True,exist_ok=True)
 (OUT/'component_probe.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(data,ensure_ascii=False,indent=2))
finally:s.close()
