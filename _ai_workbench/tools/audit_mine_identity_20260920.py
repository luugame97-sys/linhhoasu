"""Read-only module identification and scoped Mine baseline; no gameplay RPC."""
import hashlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

OUT = WB / 'temp/mine_identity_20260920'
APP = '/linhhoasu/lhs/newServer'
CODE = r'''
const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const app='/linhhoasu/lhs/newServer',game='/linhhoasu/webgame/game';
const state=()=>JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status}));
const before=state();
const logger=require.resolve(app+'/src/logger');require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require(app+'/src/services/ConfigService'),tables=config.loadAllTables();
const names=Object.keys(tables).filter(n=>/^Mine/.test(n));
const out={at:new Date().toISOString(),productionWrites:0,gameplayRpcCalls:0,before,files:{},tableNames:names,
 tables:Object.fromEntries(names.map(n=>[n,tables[n]])),
 labels:Object.fromEntries([30035213,30035223,30035230,30035201].map(id=>[id,(tables.LanguageConfig||{})[id]||null])),
 system311:tables.SystemConfig[311]};
for(const rel of ['src/handlers/mine.js','src/services/FeatureMutationService.js','src/handlers/index.js'])out.files[rel]=crypto.createHash('sha256').update(fs.readFileSync(app+'/'+rel)).digest('hex');
const index=fs.readFileSync(game+'/index.html','utf8');out.client=index.match(/main[^"'<>\s]*\.js[^"'<>\s]*/g);
out.mainSha=crypto.createHash('sha256').update(fs.readFileSync(game+'/js/main.min_drop100.js')).digest('hex');
const {MongoClient}=require(app+'/node_modules/mongodb');
(async()=>{const db=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await db.connect();try{
 out.population=[];out.sample=[];
 for(const serverId of [1001,1002,1003,1004]){
  const rows=await db.db('lhs_s'+serverId).collection('players').find({userId:{$not:/^lhs_real_bot_/},'mineInfo.currentLevel':{$type:'object'}},{projection:{_id:0,userId:1,name:1,level:1,mineInfo:1,'items.55':1,'items.58':1,'items.59':1},maxTimeMS:5000}).toArray();
  out.population.push({serverId,withMine:rows.length,unfinished:rows.filter(p=>!p.mineInfo.currentLevel.finish).length});
  const sample=rows.find(p=>p.name==='Hứa Thanh')||rows[0];if(sample)out.sample.push({serverId,...sample});
 }
}finally{await db.close()}
out.after=state();out.processesUnchanged=JSON.stringify(before)===JSON.stringify(out.after);console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        result = json.loads(run(ssh, 'node -', CODE))
        with ssh.open_sftp() as sftp:
            for rel, expected in result['files'].items():
                data = sftp.open(APP + '/' + rel, 'rb').read()
                if hashlib.sha256(data).hexdigest() != expected:
                    raise RuntimeError('SOURCE_CHANGED:' + rel)
                target = OUT / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    finally:
        ssh.close()
    (OUT / 'audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['at','productionWrites','gameplayRpcCalls','processesUnchanged','tableNames','labels','system311','mainSha','population']}, ensure_ascii=True))

if __name__ == '__main__':
    main()
