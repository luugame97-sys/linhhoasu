"""Selective CAS cleanup of the three expired artifact refresh caches."""
from pathlib import Path
import importlib.util
import json
import re
import shlex
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)

STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'/linhhoasu/_ai_workbench/backups/artifact_refresh_cleanup_20261013_{STAMP}'
REMOTE = f'/linhhoasu/_ai_workbench/temp/artifact_refresh_cleanup_20261013_{STAMP}.js'
WRAP_PATH = REMOTE + '.wrap'
ONLY_SERVER = __import__('os').environ.get('CLEANUP_ONLY_SERVER')
SCRIPT = r'''const mongo=require('/linhhoasu/lhs/newServer/src/db/mongo');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');const fs=require('fs');
const server=process.env.SERVER_ID||process.env.SERVER_NAME||'unknown';const backup=process.env.CLEANUP_BACKUP;const apply=process.env.CLEANUP_APPLY==='1';const now=Date.now();const staleMs=600000;
function clone(v){return JSON.parse(JSON.stringify(v));}function stale(c){const age=now-Number(c&&c.ts);return !Number.isFinite(age)||age<0||age>staleMs;}
(async()=>{await mongo.connect();const rows=await Player.find({'artifactInfo.artifacts.refreshCache':{$exists:true}},{userId:1,artifactInfo:1,other_attr_info:1,_id:1}).lean();const targets=[];for(const row of rows){const arts=Array.isArray(row.artifactInfo&&row.artifactInfo.artifacts)?row.artifactInfo.artifacts:[];const expired=arts.map((a,i)=>({a,i})).filter(x=>x.a&&x.a.refreshCache&&stale(x.a.refreshCache));if(expired.length)targets.push({row,expired});}
const summary={server,at:new Date().toISOString(),apply,found:targets.reduce((n,x)=>n+x.expired.length,0),documents:targets.length,items:[]};if(backup)fs.mkdirSync(backup,{recursive:true});
for(const {row,expired} of targets){const original=clone(row.artifactInfo||{}),other=clone(row.other_attr_info||{}),next=clone(original);const markers=[];for(const {a} of expired){const marker={cleanupId:`artifact_refresh_cleanup_20261013_${server}_${a.uid}_${String(a.refreshCache&&a.refreshCache.ts||'invalid')}`,server,uid:Number(a.uid)||0,cacheTs:a.refreshCache&&a.refreshCache.ts||null,at:summary.at,reason:'expired_or_malformed'};markers.push(marker);const n=next.artifacts.find(x=>Number(x&&x.uid)===Number(a.uid));if(n)n.refreshCache=null;}
const preimage={_id:String(row._id),artifactInfo:original,other_attr_info:other};const item={userHash:require('crypto').createHash('sha256').update(String(row.userId||'')).digest('hex').slice(0,12),uid:markers.map(x=>x.uid),markers};summary.items.push(item);if(backup)fs.writeFileSync(`${backup}/${server}_${String(row._id)}.json`,JSON.stringify(preimage));
if(apply){const markerList=Array.isArray(other.artifactRefreshCleanup)?other.artifactRefreshCleanup.concat(markers).slice(-64):markers;const result=await Player.updateOne({_id:row._id,artifactInfo:original,other_attr_info:other},{$set:{artifactInfo:next,other_attr_info:{...other,artifactRefreshCleanup:markerList}}});item.matched=Number(result.matchedCount||result.n||0);item.modified=Number(result.modifiedCount||result.nModified||0);if(item.matched!==1||item.modified!==1)throw new Error(`CAS_CONFLICT:${server}:${String(row._id)}`);}}
console.log(JSON.stringify(summary));})().finally(()=>mongo.disconnect());'''
WRAP_SCRIPT = r'''const cp=require('child_process');const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const p=ps.find(x=>x.name===process.argv[2]);const c=p&&p.pm2_env&&p.pm2_env.env||{},env={...process.env};for(const k of ['MONGO_URI','CONFIG_BIN_PATH','SERVER_ID','SERVER_NAME'])if(c[k]!=null)env[k]=c[k];const r=cp.spawnSync(process.execPath,process.argv.slice(3),{env,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status==null?1:r.status);'''

def run_remote(ssh, server_name, apply):
    env = f'CLEANUP_BACKUP={shlex.quote(BACKUP)} CLEANUP_APPLY={1 if apply else 0}'
    command = f'{env} node {shlex.quote(WRAP_PATH)} {shlex.quote(server_name)} {shlex.quote(REMOTE)}'
    raw = helper.run(ssh, command, 180)
    (OUT / f'cleanup_{server_name}.raw').write_text(raw, encoding='utf-8')
    matches = re.findall(r'\{"server".*?\}', raw)
    if not matches: raise RuntimeError(f'NO_SUMMARY:{server_name}:{raw[-1000:]}')
    # JSON has nested objects; use the final line, which is the script's JSON output.
    line = next((x for x in raw.splitlines() if x.startswith('{"server"')), None)
    if not line: raise RuntimeError(f'NO_JSON:{server_name}')
    return json.loads(line)

def main():
    ssh = helper.connect(); results=[]
    try:
        helper.run(ssh, 'install -d -m 700 -- ' + shlex.quote(BACKUP))
        with ssh.open_sftp() as sf:
            with sf.open(REMOTE, 'w') as f: f.write(SCRIPT)
            with sf.open(WRAP_PATH, 'w') as f: f.write(WRAP_SCRIPT)
        # First pass is a strict read-only count across all nodes.
        nodes = [row for row in helper.NODES if not ONLY_SERVER or row[0] == ONLY_SERVER]
        for name,_port in nodes: results.append(run_remote(ssh, name, False))
        total = sum(x['found'] for x in results)
        expected_total = 1 if ONLY_SERVER else 3
        if total != expected_total: raise RuntimeError(f'EXPECTED_EXPIRED_CACHES:{expected_total}:{total}')
        target_names = {ONLY_SERVER} if ONLY_SERVER else {'lhs-s1002','lhs-s1006','lhs-s1007'}
        if {f"lhs-s{x['server']}" for x in results if x['found']} != target_names: raise RuntimeError('UNEXPECTED_TARGET_SERVERS')
        # Backup + apply only the three known target nodes, each guarded by the preimage CAS.
        applied=[]
        for name in sorted(target_names): applied.append(run_remote(ssh, name, True))
        summary={'result':'PASS','at':datetime.now(timezone.utc).isoformat(),'backup':BACKUP,'productionWrites':sum(x['found'] for x in applied),'playerWrites':sum(x['found'] for x in applied),'preflight':results,'applied':applied}
        (OUT/'refresh_cache_cleanup.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False))
    finally:
        try: helper.run(ssh,'rm -f -- '+shlex.quote(REMOTE)+' '+shlex.quote(WRAP_PATH),30)
        finally: ssh.close()

if __name__=='__main__': main()
