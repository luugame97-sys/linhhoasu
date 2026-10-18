"""Bounded read-only evidence for the OldTrek repair plan; no RPC or live writes."""
import datetime as dt
import hashlib
import json
import re
import shlex
from pathlib import Path

import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_stuck_plan_20261002'
APP = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'
FILES = {
    APP + '/src/handlers/old-trek.js': 'old-trek.js',
    APP + '/src/services/OldTrekEventService.js': 'OldTrekEventService.js',
    APP + '/src/services/OldTrekLedgerService.js': 'OldTrekLedgerService.js',
    APP + '/src/config/oldTrekGameplayPolicy.json': 'oldTrekGameplayPolicy.json',
    WEB + '/js/lhs-oldtrek-errors-v1.js': 'lhs-oldtrek-errors-v1.js',
    WEB + '/js/lhs-farm-alchemy-v2.js': 'lhs-farm-alchemy-v2.js',
    WEB + '/index.html': 'index.html',
}
NODE = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),{MongoClient}=require('mongodb');
const envBase=require('dotenv').parse(fs.readFileSync('.env'));
const procs=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-6]$/.test(p.name));
const C=require('./src/services/ConfigService');
const schedule=require('./src/services/OldTrekScheduleService').getSchedule();
const policy=require('./src/config/oldTrekGameplayPolicy.json');
const now=Date.now(),dest=C.get('OldTrekDestinationConfig')||{};
function digest(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,12)}
function logs(file,max){
  try {
    const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,len=Math.min(max,size),b=Buffer.alloc(len);
    fs.readSync(fd,b,0,len,size-len);fs.closeSync(fd);
    let rows=b.toString('utf8').split('\n');if(size>len)rows.shift();
    const dated=rows.filter(l=>/^\[2026-10-02 (?:22|23):/.test(l));
    const relevant=dated.filter(l=>/OLD_TREK|OldTrek|old-trek|tag[=: ]+70\d\d|\[70\d\d\]/.test(l));
    const scrub=l=>l.replace(/u_[A-Za-z0-9_]+/g,m=>'u#'+digest(m)).replace(/(?:token|password|secret|authorization)\s*[=:]\s*\S+/ig,'[REDACTED]');
    return {bytesRead:len,fileSize:size,coverageStart:rows.find(l=>/^\[20/.test(l))?.slice(0,21),coverageEnd:dated.at(-1)?.slice(0,21),windowLines:dated.length,relevantCount:relevant.length,oldTrekCodes:Object.fromEntries([...new Set(relevant.flatMap(l=>l.match(/OLD_TREK_[A-Z_]+/g)||[]))].map(code=>[code,relevant.filter(l=>l.includes(code)).length])),sample:relevant.slice(-16).map(scrub)};
  }catch(e){return {error:e.code||e.name}}
}
(async()=>{
  const nodes=[];
  for(const proc of procs){
    const env={...envBase,...proc.pm2_env,...proc.pm2_env.env};
    const node={name:proc.name,status:proc.pm2_env.status,pid:proc.pid,restarts:proc.pm2_env.restart_time,uptime:proc.pm2_env.pm_uptime,flags:{engine:env.OLD_TREK_EVENT_ENGINE_ENABLED,settlement:env.OLD_TREK_SETTLEMENT_ENABLED},logs:{out:logs(proc.pm2_env.pm_out_log_path,2*1024*1024),error:logs(proc.pm2_env.pm_err_log_path,512*1024)}};
    const db=new MongoClient(env.MONGO_URI,{serverSelectionTimeoutMS:4000,socketTimeoutMS:8000,maxPoolSize:1});
    try{
      await db.connect();
      const rows=await db.db().collection('players').find({'other_attr_info.oldTrekInfo.sailing':true},{projection:{_id:0,userId:1,'other_attr_info.oldTrekInfo.season':1,'other_attr_info.oldTrekInfo.stage':1,'other_attr_info.oldTrekInfo.stateRevision':1,'other_attr_info.oldTrekInfo.endCache':1,'other_attr_info.oldTrekInfo.sailInfo.trekData':1,'other_attr_info.oldTrekInfo.sailInfo.currentEvent':1},maxTimeMS:6000}).limit(101).toArray();
      node.sailingRows=rows.length;node.truncated=rows.length===101;
      node.sailing=rows.slice(0,100).map(p=>{const i=p.other_attr_info.oldTrekInfo,t=i.sailInfo?.trekData,e=i.sailInfo?.currentEvent,cfg=dest[t?.id]?.[t?.diff];return{identity:digest(p.userId),season:i.season,stage:i.stage,revision:i.stateRevision,endCache:!!i.endCache,trek:t&&{uid:t.uid,id:t.id,diff:t.diff,dist:t.dist,targetDistance:cfg?.distance,arrivedByStoredDistance:Number(t.dist)>=Number(cfg?.distance),lastUpdateTime:t.lastUpdateTime,encounterCount:t.encounterCount,nextEventDistance:t.nextEventDistance},event:e&&{id:e.id,uid:e.uid,trekUid:e.trekUid,eventSeason:e.season,createdAt:e.createdAt,deadline:e.deadline,expired:Number(e.deadline)>0&&Number(e.deadline)<now,miniGameType:e.miniGameType,miniGameLevel:e.miniGameLevel,policyVersion:e.policyVersion,chainStep:e.chainStep}}});
    }catch(e){node.dbError=e.name+':'+String(e.message).replace(/mongodb:\/\/[^ ]+/g,'[URI]')}
    finally{await db.close();}
    nodes.push(node);
  }
  console.log(JSON.stringify({at:new Date(now).toISOString(),readOnly:true,directPlayerWrites:0,authenticatedRpc:0,schedule,policyVersion:policy.version,miniGameMaxElapsedMs:policy.miniGameMaxElapsedMs,nodes}));
})().catch(e=>{console.error(e.name+':'+e.message);process.exitCode=1});
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    args, kw = ssh_config()
    assert args[0] == '103.116.104.165'
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(*args, **kw)
    def run(command, input_text=None, timeout=55):
        i,o,e=c.exec_command(command,timeout=timeout)
        if input_text is not None:
            i.write(input_text);i.channel.shutdown_write()
        out=o.read();err=e.read();rc=o.channel.recv_exit_status()
        if rc:raise RuntimeError(f'READ_FAILED:{rc}:'+err.decode('utf8','replace')[-700:])
        return out
    report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'readOnly':True,'remoteFileWrites':0,'directPlayerWrites':0,'files':{}}
    try:
        with c.open_sftp() as s:
            for remote,name in FILES.items():
                with s.open(remote,'rb') as f:data=f.read()
                (OUT/name).write_bytes(data)
                report['files'][name]={'remote':remote,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
        main_path=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'
        remote_main=run('sha256sum -- '+shlex.quote(WEB+'/js/main.min_drop100.js')).decode().split()[0]
        report['mainBundle']={'live':remote_main,'local':hashlib.sha256(main_path.read_bytes()).hexdigest()}
        index=(OUT/'index.html').read_text(encoding='utf8')
        report['scriptRefs']=re.findall(r'js/[^"\s]+(?:oldtrek|farm-alchemy)[^"\s]*',index)
        # Extract refs directly by script filename too, because the prefix regex
        # does not include filenames beginning immediately with lhs-oldtrek.
        report['scriptRefs']=re.findall(r'js/(?:lhs-oldtrek[^"\s]+|lhs-farm-alchemy[^"\s]+|main\.min_drop100[^"\s]+)',index)
        ref=next(x for x in report['scriptRefs'] if x.startswith('js/lhs-oldtrek-errors-v1.js'))
        public=run('curl --compressed --connect-timeout 5 --max-time 20 -fsS '+shlex.quote('https://linhhoasu.lol/'+ref),timeout=25)
        report['publicGuard']={'url':'https://linhhoasu.lol/'+ref,'sha256':hashlib.sha256(public).hexdigest(),'matchesDisk':public==(OUT/'lhs-oldtrek-errors-v1.js').read_bytes()}
        raw=run('cd '+shlex.quote(APP)+' && timeout 50s node -',NODE).decode('utf8','replace')
        report['runtime']=json.loads(next(line for line in reversed(raw.splitlines()) if line.startswith('{')))
        (OUT/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print(json.dumps({'at':report['runtime']['at'],'files':report['files'],'mainBundle':report['mainBundle'],'scriptRefs':report['scriptRefs'],'publicGuard':report['publicGuard'],'schedule':report['runtime']['schedule'],'nodes':[{'name':n['name'],'status':n['status'],'flags':n['flags'],'sailingRows':n.get('sailingRows'),'expired':sum(bool(x.get('event',{}).get('expired')) for x in n.get('sailing',[]) if x.get('event')),'arrived':sum(bool(x.get('trek',{}).get('arrivedByStoredDistance')) for x in n.get('sailing',[]) if x.get('trek')),'dbError':n.get('dbError'),'logs':n['logs']} for n in report['runtime']['nodes']]},ensure_ascii=False,indent=2))
    finally:c.close()


if __name__=='__main__':main()
