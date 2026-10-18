import getpass
import json

import paramiko


HOST = "103.116.105.154"
AUDIT = r"""
const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
(async()=>{await mongo.connect();const rows=await Player.find({'artifactInfo.artifacts.0':{$exists:true}},{userId:1,name:1,level:1,currencies:1,items:1,artifactInfo:1,updatedAt:1,_id:0}).lean();console.log('AUDIT_JSON='+JSON.stringify(rows.map(p=>({userId:p.userId,name:p.name,level:p.level,currencies:p.currencies,items:{1:p.items&&p.items['1'],2:p.items&&p.items['2'],6:p.items&&p.items['6'],52:p.items&&p.items['52'],53:p.items&&p.items['53'],54:p.items&&p.items['54'],191:p.items&&p.items['191'],192:p.items&&p.items['192'],193:p.items&&p.items['193'],199:p.items&&p.items['199'],200:p.items&&p.items['200'],205:p.items&&p.items['205'],206:p.items&&p.items['206']},artifacts:(p.artifactInfo.artifacts||[]).map(a=>({uid:a.uid,id:a.id,level:a.attr&&a.attr.level,value:a.attr&&a.attr.value,count:a.count,quenchLv:a.quenchLv,lock:a.lock})),equipMap:p.artifactInfo.equipMap,orbInfo:p.artifactInfo.orbInfo}),null,2));})().finally(()=>mongo.disconnect());
"""
WRAP = r"""
const cp=require('child_process');const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const p=pm2.find(x=>x.name==='lhs-s1001');const c=p&&p.pm2_env&&p.pm2_env.env||{};const env={...process.env};for(const k of ['MONGO_URI','CONFIG_BIN_PATH','SERVER_ID'])if(c[k]!=null)env[k]=c[k];const r=cp.spawnSync(process.execPath,process.argv.slice(2),{env,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status==null?1:r.status);
"""


def run(s, c):
    _, o, e = s.exec_command(c)
    out = o.read().decode("utf8", "replace")
    err = e.read().decode("utf8", "replace")
    if o.channel.recv_exit_status():
        raise RuntimeError(err[-2000:] or out[-2000:])
    return out


def main():
    s = paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    s.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
    a = "/linhhoasu/_ai_workbench/temp/audit_artifact_players.js"; w = "/linhhoasu/_ai_workbench/temp/audit_artifact_players_wrap.js"
    try:
        sf = s.open_sftp()
        try:
            with sf.file(a, "w") as f: f.write(AUDIT)
            with sf.file(w, "w") as f: f.write(WRAP)
        finally: sf.close()
        raw = run(s, f"node {w} {a}")
        for line in raw.splitlines():
            if line.startswith("AUDIT_JSON="):
                print(json.dumps(json.loads(line[len("AUDIT_JSON="):]), ensure_ascii=False, indent=2))
    finally:
        try: run(s, f"rm -f -- {a} {w}")
        except Exception: pass
        s.close()


if __name__ == "__main__": main()
