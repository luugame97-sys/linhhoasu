"""Read-only scoped runtime snapshot. Never emits environment secrets."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/petsoul_release_20261002'
FILES = {
    'server/pet-soul.js': '/linhhoasu/lhs/newServer/src/handlers/pet-soul.js',
    'server/item.js': '/linhhoasu/lhs/newServer/src/handlers/item.js',
    'server/RandomUsableItemRewardService.js': '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js',
    'server/old-trek.js': '/linhhoasu/lhs/newServer/src/handlers/old-trek.js',
    'server/OldTrekEventService.js': '/linhhoasu/lhs/newServer/src/services/OldTrekEventService.js',
    'server/PlayerService.js': '/linhhoasu/lhs/newServer/src/services/PlayerService.js',
    'server/WSServer.js': '/linhhoasu/lhs/newServer/src/net/WSServer.js',
    'client/index.html': '/linhhoasu/webgame/game/index.html',
    'client/lhs-oldtrek-errors-v1.js': '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js',
    'config.bin': '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
}
PROBE = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const ports=[8080,8083,8084,8085,8086,8087];
function tail(path){try{const fd=fs.openSync(path,'r'),n=fs.fstatSync(fd).size,b=Buffer.alloc(Math.min(n,500000));fs.readSync(fd,b,0,b.length,Math.max(0,n-b.length));fs.closeSync(fd);return b.toString('utf8').split('\n');}catch(e){return [];}}
const nodes=rows.filter(p=>/^lhs-s100[1-6]$/.test(p.name)).map(p=>{
 const e=p.pm2_env,idx=Number(p.name.slice(-1))-1;let ready;
 try{ready=JSON.parse(cp.execFileSync('curl',['--max-time','5','-fsS',`http://127.0.0.1:${ports[idx]}/ready`],{encoding:'utf8'}));}catch(err){ready={error:'READY_FAILED'};}
 const lines=[...tail(e.pm_out_log_path),...tail(e.pm_err_log_path)];
 const match=lines.filter(s=>/OLD_TREK|OldTrek|old-trek|PET_SOUL|pet-soul|ITEM_SAVE|100802|u_Wk_1001_d7b1ec/.test(s));
 return {name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,script:e.pm_exec_path,cwd:e.pm_cwd,ready,logPaths:[e.pm_out_log_path,e.pm_err_log_path],eventEngine:e.OLD_TREK_EVENT_ENGINE_ENABLED||e.env?.OLD_TREK_EVENT_ENGINE_ENABLED,lines:match.slice(-30)};
});
const bundle='/linhhoasu/webgame/game/js/main.min_drop100.js';
console.log(JSON.stringify({at:new Date().toISOString(),nodes,bundleHash:crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'),processes:rows.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))}));
'''

def main():
    args,kw=ssh_config()
    assert args[0]=='103.116.104.165'
    client=paramiko.SSHClient();client.set_missing_host_key_policy(paramiko.AutoAddPolicy());client.connect(*args,**kw)
    report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'files':{},'directPlayerWrites':0}
    try:
        with client.open_sftp() as s:
            for key,remote in FILES.items():
                data=s.open(remote,'rb').read();h=hashlib.sha256(data).hexdigest()
                local=OUT/'baseline'/key
                if local.exists() and hashlib.sha256(local.read_bytes()).hexdigest()!=h: raise RuntimeError('BASELINE_DRIFT:'+key)
                local.parent.mkdir(parents=True,exist_ok=True)
                if not local.exists():local.write_bytes(data)
                st=s.stat(remote)
                report['files'][remote]={'sha256':h,'bytes':len(data),'local':str(local),'uid':st.st_uid,'gid':st.st_gid,'mode':oct(st.st_mode&0o777)}
            i,o,e=client.exec_command('cd /linhhoasu/lhs/newServer && node -',timeout=50);i.write(PROBE);i.channel.shutdown_write()
            out=o.read().decode('utf8');err=e.read().decode('utf8');rc=o.channel.recv_exit_status()
            if rc:raise RuntimeError('PROBE_FAILED:'+err[-700:])
            report['runtime']=json.loads(out)
            bundle=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'
            if hashlib.sha256(bundle.read_bytes()).hexdigest()!=report['runtime']['bundleHash']:
                dest=OUT/'baseline/client/main.min_drop100.js';s.get('/linhhoasu/webgame/game/js/main.min_drop100.js',str(dest));report['bundleLocal']=str(dest)
            else:report['bundleLocal']=str(bundle)
    finally:client.close()
    (OUT/'preflight.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
