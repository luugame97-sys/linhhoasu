import json
import sys
from pathlib import Path
from release_artifact_quench_fix_20261009 import connect, run

ROOT=Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8')
remote='/linhhoasu/_ai_workbench/temp/audit_forge_account_20261013.js'
wrapper='/linhhoasu/_ai_workbench/temp/audit_forge_account_wrap_20261013.js'
code=r"""
const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
(async()=>{await mongo.connect();const rows=await Player.find({name:/Talo/i}).select('accountId userId serverId name artifactInfo updatedAt').lean();console.log(JSON.stringify(rows.map(p=>({accountId:p.accountId,userId:p.userId,serverId:p.serverId,name:p.name,updatedAt:p.updatedAt,artifacts:(p.artifactInfo&&p.artifactInfo.artifacts||[]).map(a=>({uid:a.uid,id:a.id,count:a.count,skillGroup:a.skillGroup,skillLv:a.skillLv,forgeTime:a.forgeTime,quenchLv:a.quenchLv,attr:a.attr,sourceSpecialArtifactId:a.sourceSpecialArtifactId})),equipMap:p.artifactInfo&&p.artifactInfo.equipMap})),null,2));})().finally(()=>mongo.disconnect());
"""
wrap=r"""const cp=require('child_process');const pm2=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const p=pm2.find(x=>x.name==='lhs-s1001');const c=p&&p.pm2_env&&p.pm2_env.env||{};const env={...process.env};for(const k of ['MONGO_URI','CONFIG_BIN_PATH','SERVER_ID'])if(c[k]!=null)env[k]=c[k];const r=cp.spawnSync(process.execPath,process.argv.slice(2),{env,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status==null?1:r.status);"""
def main():
    ssh=connect()
    try:
        with ssh.open_sftp() as sf:
            with sf.open(remote,'w') as f:f.write(code)
            with sf.open(wrapper,'w') as f:f.write(wrap)
        raw=run(ssh,f'node {wrapper} {remote}',60)
        print(raw)
    finally:
        try:run(ssh,f'rm -f -- {remote} {wrapper}',30)
        except Exception:pass
        ssh.close()
if __name__=='__main__':main()
