"""Read-only release/config/aggregate audit. No RPC, player saves, or remote files."""
import hashlib
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = '/linhhoasu/lhs/newServer'
SOURCES = ['src/handlers/old-trek.js', 'src/services/OldTrekScheduleService.js',
           'src/services/OldTrekEventService.js', 'src/services/OldTrekArenaService.js',
           'src/services/OldTrekProgressService.js', 'src/services/OldTrekSettlementService.js',
           'src/services/OldTrekLedgerService.js', 'src/services/OldTrekPassService.js',
           'src/config/oldTrekGameplayPolicy.json', 'src/services/PlayerService.js']
NODE = r'''
const cp=require('child_process'),crypto=require('crypto');
const pms=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[1-6]$/.test(p.name));
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},debug(){},error(){}}};
const cfg=require('./src/services/ConfigService'),schedule=require('./src/services/OldTrekScheduleService').getSchedule(),mongoose=require('mongoose');
const names=['OldTrekBaseConfig','OldTrekDestinationConfig','OldTrekCommonEventConfig','OldTrekSailorConfig','OldTrekSailorLevelUpConfig','OldTrekTaskConfig','OldTrekSailorStarUpConfig','OldTrekArenaScoreConfig','OldTrekTaskRewardConfig','OldTrekPassConfig'];
(async()=>{const dbs=[];
for(const pm of pms){
 const env=pm.pm2_env;const conn=await mongoose.createConnection(env.MONGO_URI||env.env?.MONGO_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:5000}).asPromise();
 try {
 const rows=await conn.db.collection('players').find({'other_attr_info.oldTrekInfo':{$exists:true},isBot:{$ne:true},managedBot:{$ne:true}},{projection:{_id:0,userId:1,oldTrekArenaScore:1,'other_attr_info.oldTrekInfo':1},maxTimeMS:10000}).toArray();
 const out={server:pm.name,players:rows.length,seasons:{},sailing:0,pendingEvents:0,pendingOver24h:0,partialSailingFormation:0,archivedJourneys:0,archivedCargoRows:0,taskBigEventPositive:0,travelerSailorCountersZero:0,settlements:[]};
 for(const p of rows){const i=p.other_attr_info.oldTrekInfo;out.seasons[i.season||0]=(out.seasons[i.season||0]||0)+1;
  if(i.sailing){out.sailing++; const lines=i.setMap?.[i.sailSetId]||[];if(lines.filter(l=>(l.slots||[]).some(x=>x>0)).length<3)out.partialSailingFormation++;}
  const ev=i.sailInfo?.currentEvent;if(ev){out.pendingEvents++;if(Date.now()-Number(ev.createdAt||0)>86400000)out.pendingOver24h++;}
  for(const a of Object.values(i.seasonArchives||{})){if(a.sailInfo?.trekData)out.archivedJourneys++;out.archivedCargoRows+=(a.sailInfo?.cabin||[]).length;}
  if(Object.entries(i.taskRecord||{}).some(([k,v])=>Number(k)%100===3&&v>0))out.taskBigEventPositive++;
  if(i.totalDistance>0 && (i.sailorList||[]).length && (i.sailorList||[]).every(s=>!s.task?.[2]&&!s.task?.[3]))out.travelerSailorCountersZero++;
 }
 const col=require('./src/db/models/EventRewardSettlement').collection.name;
 out.settlements=await conn.db.collection(col).find({'event.kind':'oldtrek'},{projection:{_id:1,state:1,'event.season':1,'event.arena':1,completedAt:1},maxTimeMS:5000}).limit(30).toArray();
 dbs.push(out);
 } finally {await conn.close();}
}
console.log(JSON.stringify({at:new Date().toISOString(),schedule,processes:pms.map(p=>({name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,uptime:p.pm2_env.pm_uptime,eventEngine:p.pm2_env.OLD_TREK_EVENT_ENGINE_ENABLED,settlement:p.pm2_env.OLD_TREK_SETTLEMENT_ENABLED})),tableHashes:Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(JSON.stringify(cfg.get(n))).digest('hex')])),dbs}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

def main():
    ssh = connect()
    result = {'readOnly': True, 'productionWrites': 0, 'playerWrites': 0, 'files': {}}
    try:
        pairs = [(APP + '/' + r, ROOT / 'linhhoasu/lhs/newServer' / r) for r in SOURCES]
        pairs += [('/linhhoasu/webgame/game/' + r, ROOT / 'linhhoasu/webgame/game' / r) for r in
                  ['index.html','js/main.min_drop100.js','js/lhs-oldtrek-errors-v1.js','js/lhs-oldtrek-minigames-v1.js']]
        with ssh.open_sftp() as sftp:
            for remote, local in pairs:
                with sftp.open(remote, 'rb') as f:
                    live = hashlib.sha256(f.read()).hexdigest()
                sha = hashlib.sha256(local.read_bytes()).hexdigest()
                result['files'][remote] = {'live':live, 'local':sha, 'equal':live==sha}
        result['runtime'] = json.loads(run(ssh, 'cd ' + APP + ' && node', NODE))
        result['servedIndex'] = run(ssh, "curl -fsS --max-time 10 http://127.0.0.1:81/ | sha256sum").split()[0]
        out = ROOT / '_ai_workbench/temp/oldtrek_deep_audit_20260927/live.json'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result,ensure_ascii=True,indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
