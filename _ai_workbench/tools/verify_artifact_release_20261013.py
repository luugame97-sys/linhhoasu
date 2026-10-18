"""Read-only final receipt verification. No authenticated gameplay RPCs."""
import importlib.util
import json
import shlex
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
SCRIPT = r'''
const cp=require('child_process');
const processes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{
 const results=[];
 for(const name of ['lhs-s1002','lhs-s1006','lhs-s1007']) {
  const proc=processes.find(p=>p.name===name);
  const env=proc.pm2_env.env||{};
  if(!env.MONGO_URI) throw Error('MISSING_URI:'+name);
  const client=new MongoClient(env.MONGO_URI);
  try {
   await client.connect();
   const rows=await client.db().collection('players').find({'other_attr_info.artifactRefreshCleanup.cleanupId':/^artifact_refresh_cleanup_20261013_/},{projection:{artifactInfo:1,other_attr_info:1}}).toArray();
   const markers=rows.flatMap(p=>(p.other_attr_info.artifactRefreshCleanup||[]).filter(m=>String(m.cleanupId).startsWith('artifact_refresh_cleanup_20261013_')).map(m=>({cleanupId:m.cleanupId,uid:m.uid,cacheCleared:(p.artifactInfo.artifacts||[]).some(a=>Number(a.uid)===Number(m.uid)&&a.refreshCache==null)})));
   if(markers.length!==1||!markers[0].cacheCleared) throw Error('MARKER_READBACK:'+name);
   results.push({server:name,markers});
  } finally {await client.close();}
 }
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
'''

def main():
    ssh=helper.connect()
    try:
        result={'at':datetime.now(timezone.utc).isoformat(),'mode':'read-only','nativeE2E':False}
        result['markers']=json.loads(helper.run(ssh,'node -e '+shlex.quote(SCRIPT),60))
        result['ready']={name:json.loads(helper.run(ssh,f'curl -fsS --max-time 10 http://127.0.0.1:{port}/ready',15)) for name,port in helper.NODES}
        assert all(r['status']=='ok' and r['checks']['mongo'] and r['checks']['redis'] for r in result['ready'].values())
        manifest=json.loads((OUT/'deploy.json').read_text(encoding='utf-8'))
        result['hashes']={}
        for rel,row in manifest['staged'].items():
            actual=helper.rh(ssh,row['target'])
            assert actual==row['candidate'], rel
            result['hashes'][rel]=actual
        result['served']={}
        for rel,url in [('client/lhs-artifact-forge-v1.js','js/lhs-artifact-forge-v1.js'),('client/index.html','index.html')]:
            pipeline='curl -fsS --max-time 30 '+shlex.quote('https://linhhoasu.lol/'+url)+' | sha256sum'
            actual=helper.run(ssh,'bash -o pipefail -c '+shlex.quote(pipeline),40).split()[0]
            assert actual==result['hashes'][rel],rel
            result['served'][rel]=actual
        result['result']='PASS'
        (OUT/'final_verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'result':'PASS','ready':len(result['ready']),'markers':result['markers'],'served':result['served'],'nativeE2E':False}))
    finally: ssh.close()

if __name__=='__main__': main()
