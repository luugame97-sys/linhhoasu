from pathlib import Path
import importlib.util
import json
import shlex
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
REMOTE = '/linhhoasu/_ai_workbench/temp/artifact_refresh_cache_audit_20261013.js'
SCRIPT = r'''const crypto=require('crypto');const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
(async()=>{await mongo.connect();const rows=await Player.find({'artifactInfo.artifacts.refreshCache':{$exists:true}},{userId:1,artifactInfo:1,_id:0}).lean();const now=Date.now(),out={rows:rows.length,cache:0,expired:0,malformed:0,users:[],at:new Date().toISOString()};for(const p of rows){let n=0,e=0,m=0;for(const a of (p.artifactInfo&&p.artifactInfo.artifacts)||[]){if(!a||!a.refreshCache)continue;n++;const c=a.refreshCache,age=now-Number(c.ts);if(!Number.isFinite(age)||age<0||age>600000)m++;if(Number.isFinite(age)&&age>600000)e++;}if(n){out.cache+=n;out.expired+=e;out.malformed+=m;out.users.push(crypto.createHash('sha256').update(String(p.userId||'')).digest('hex').slice(0,12));}}out.users.sort();console.log(JSON.stringify(out));})().finally(()=>mongo.disconnect());'''
WRAP = r'''const cp=require('child_process');const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));for(const p of ps.filter(x=>/^lhs-s100[1-8]$/.test(x.name))){const c=p.pm2_env&&p.pm2_env.env||{},env={...process.env};for(const k of ['MONGO_URI','CONFIG_BIN_PATH','SERVER_ID'])if(c[k]!=null)env[k]=c[k];const r=cp.spawnSync(process.execPath,process.argv.slice(2),{env,encoding:'utf8'});process.stdout.write(p.name+' '+(r.stdout||''));process.stderr.write(r.stderr||'');if(r.status)process.exitCode=1;}'''

def main():
    ssh=helper.connect()
    try:
        with ssh.open_sftp() as sf:
            sf.put(__file__, '/tmp/unused') if False else None
            with sf.open(REMOTE,'w') as f:f.write(SCRIPT)
            with sf.open(REMOTE+'.wrap','w') as f:f.write(WRAP)
        raw=helper.run(ssh, 'node '+shlex.quote(REMOTE+'.wrap')+' '+shlex.quote(REMOTE), 120)
        (ROOT/'_ai_workbench/temp/artifact_forge_20261013/refresh_cache_raw.txt').write_text(raw, encoding='utf-8')
        results=[]
        for match in re.finditer(r'(lhs-s100[1-8]).*?(\{"rows".*?\})', raw, re.S):
            results.append({'server': match.group(1), **json.loads(match.group(2))})
        out=ROOT/'_ai_workbench/temp/artifact_forge_20261013/refresh_cache_audit.json'; out.write_text(json.dumps({'result':'READ_ONLY','productionWrites':0,'servers':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'result':'READ_ONLY','productionWrites':0,'servers':results},ensure_ascii=False))
    finally:
        try:helper.run(ssh,'rm -f -- '+shlex.quote(REMOTE)+' '+shlex.quote(REMOTE+'.wrap'),30)
        finally:ssh.close()

if __name__=='__main__':main()
