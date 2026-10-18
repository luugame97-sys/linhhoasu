"""Read current OldTrek sources/config and the screenshot-related role; no remote writes."""
from pathlib import Path
import hashlib
import json
import sys
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/oldtrek_fix_20261001'
APP='/linhhoasu/lhs/newServer'
sys.stdout.reconfigure(encoding='utf8',errors='replace')
SOURCES=['src/handlers/old-trek.js','src/services/OldTrekEventService.js','src/services/OldTrekProgressService.js',
 'src/services/OldTrekLedgerService.js','src/services/OldTrekScheduleService.js','src/services/OldTrekArenaService.js',
 'src/services/OldTrekPuzzleService.js','src/services/PlayerService.js','src/services/PlayerMutationService.js',
 'src/services/CurrencySync.js','src/config/oldTrekGameplayPolicy.json']
JS=r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),{MongoClient}=require('mongodb');
const envFile=require('dotenv').parse(fs.readFileSync('.env'));
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:5e6})).filter(p=>/^lhs-s100[1-6]$/.test(p.name));
(async()=>{const found=[];for(const p of procs){const env={...envFile,...p.pm2_env};const c=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:5000,socketTimeoutMS:10000,maxPoolSize:1});
 try{await c.connect();const projection={_id:0,userId:1,playerId:1,name:1,level:1,items:1,currencies:1,'other_attr_info.oldTrekInfo':1};
 const rows=await c.db().collection('players').find({name:{$in:['Talo','talo']}},{projection,maxTimeMS:5000}).limit(4).toArray();
 found.push({node:p.name,eventEngine:env.OLD_TREK_EVENT_ENGINE_ENABLED,rows});
 }finally{await c.close();}}
 console.log(JSON.stringify({at:new Date().toISOString(),playerWrites:0,found}));
})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1;});
'''

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    args,kw=ssh_config();assert args[0]=='103.116.104.165'
    ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(*args,**kw)
    try:
        manifest={}
        with ssh.open_sftp() as sf:
            pairs=[(APP+'/'+rel,'server/'+rel) for rel in SOURCES]+[
              ('/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js','client/lhs-oldtrek-errors-v1.js'),
              ('/linhhoasu/webgame/game/js/lhs-oldtrek-minigames-v1.js','client/lhs-oldtrek-minigames-v1.js'),
              ('/linhhoasu/webgame/game/index.html','client/index.html'),
              ('/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin','config.bin')]
            for remote,rel in pairs:
                dest=OUT/'baseline'/rel
                if dest.exists(): raise RuntimeError('SNAPSHOT_ALREADY_EXISTS:'+rel)
                dest.parent.mkdir(parents=True,exist_ok=True)
                sf.get(remote,str(dest),max_concurrent_prefetch_requests=8)
                b=dest.read_bytes();h=hashlib.sha256(b).hexdigest()
                local=(ROOT/'linhhoasu/lhs/newServer'/rel[7:]) if rel.startswith('server/') else None
                local_data=local.read_bytes() if local and local.exists() else None
                manifest[rel]={'remote':remote,'sha256':h,'bytes':len(b),'sameTextAsLocal':local_data is not None and b.decode('utf8','replace').replace('\r','')==local_data.decode('utf8','replace').replace('\r','')}
        (OUT/'snapshot.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
        i,o,e=ssh.exec_command('cd /linhhoasu/lhs/newServer && timeout 30s node -',timeout=35);i.write(JS);i.channel.shutdown_write()
        out=o.read().decode('utf8');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
        if rc: raise RuntimeError('FOCUS_FAILED:'+str(rc)+':'+err[-500:])
        focus=json.loads(out);(OUT/'focus.json').write_text(json.dumps(focus,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({'snapshot':manifest,'focus':[{'node':r['node'],'eventEngine':r['eventEngine'],'roles':[{'name':p['name'],'level':p['level'],'stateRevision':p.get('other_attr_info',{}).get('oldTrekInfo',{}).get('stateRevision'),'event':p.get('other_attr_info',{}).get('oldTrekInfo',{}).get('sailInfo',{}).get('currentEvent')} for p in r['rows']]} for r in focus['found']]},ensure_ascii=False,indent=2))
    finally:ssh.close()

if __name__=='__main__':main()
