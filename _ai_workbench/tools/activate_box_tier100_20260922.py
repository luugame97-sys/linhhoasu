"""Activate already-staged tier-100 files after read-back; no DB/player writes."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'_ai_workbench/temp/box_tier100_20260922/activation.json'
FILES={'/linhhoasu/lhs/newServer/src/config/dropLevel100.js':'8e0adb684f4c8bf5add6befa82c1afaeb0ef372d5608f41f60354c5c598e2c62','/linhhoasu/lhs/newServer/src/handlers/box.js':'3258cbc2f3f88d34330418b64757dd481bd08441ce5b750852bedee9389647ef','/linhhoasu/webgame/game/index.html':'2c9a38c9a6bc750c5bb312d07e89760ca78f91c53281dc2d23758da64695dfd9','/linhhoasu/webgame/game/js/lhs-box-tier100-v1.js':'9f77a7cc4f2c57f7d0f68c46804c941abbf9727a4cc66b145a4e15b34b093af1'}
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def ready(s,p):
    return run(s,f"for i in $(seq 1 90);do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready||true);[ \"$c\" = 200 ]&&echo 200&&exit 0;sleep 1;done;exit 1").strip()
def main():
    s=connect();out={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'files':{},'restartOrder':[],'readiness':{}}
    try:
        for path,expected in FILES.items():
            raw=run(s,'sha256sum '+shlex.quote(path)).split()[0]
            if raw!=expected:raise RuntimeError('HASH_MISMATCH:'+path+':'+raw)
            out['files'][path]={'sha256':raw}
        for name,port in NODES:
            run(s,'pm2 restart '+name+' --update-env');out['restartOrder'].append(name);ready(s,port);out['readiness'][str(port)]=run(s,f'curl -fsS http://127.0.0.1:{port}/ready').strip()
        probe=r'''const cp=require('child_process'),pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[1-5]$/.test(p.name));const rows=[];for(const p of pm){for(const k of ['SERVER_ID','DROP_LEVEL_100_ENABLED']){const v=p.pm2_env[k]??p.pm2_env.env?.[k];if(v!=null)process.env[k]=String(v)}const l=require.resolve('/linhhoasu/lhs/newServer/src/logger');require.cache[l]={id:l,filename:l,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};delete require.cache[require.resolve('/linhhoasu/lhs/newServer/src/services/ConfigService')];const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.get('BoxTierConfig');rows.push({name:p.name,status:p.pm2_env.status,tiers:Object.keys(t).length,tier100:t[100]?.count,terminal:t[100]?.tierUpCost?.length===0});}console.log(JSON.stringify(rows));'''
        out['runtime']=json.loads(run(s,'node',probe))
        if any(r['tiers']!=100 or r['tier100']!=100 or not r['terminal'] for r in out['runtime']):raise RuntimeError('RUNTIME_TIER_CONTRACT_FAILED')
        OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False,indent=2))
    finally:s.close()
if __name__=='__main__':main()
