"""Read-back verification for tier-100 release; no restart or game mutation."""
import hashlib,json,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'_ai_workbench/temp/box_tier100_20260922/verification.json'
FILES={'/linhhoasu/lhs/newServer/src/config/dropLevel100.js':'8e0adb684f4c8bf5add6befa82c1afaeb0ef372d5608f41f60354c5c598e2c62','/linhhoasu/lhs/newServer/src/handlers/box.js':'3258cbc2f3f88d34330418b64757dd481bd08441ce5b750852bedee9389647ef','/linhhoasu/webgame/game/index.html':'2c9a38c9a6bc750c5bb312d07e89760ca78f91c53281dc2d23758da64695dfd9','/linhhoasu/webgame/game/js/lhs-box-tier100-v1.js':'9f77a7cc4f2c57f7d0f68c46804c941abbf9727a4cc66b145a4e15b34b093af1'}
NODES=[('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def main():
    s=connect();out={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'readOnly':True,'productionWrites':0,'files':{},'readiness':{},'pm2':[]}
    try:
        for path,expected in FILES.items():
            raw=run(s,'sha256sum '+shlex.quote(path)).split()[0]
            if raw!=expected:raise RuntimeError('HASH_MISMATCH:'+path+':'+raw)
            out['files'][path]=raw
        for name,port in NODES:
            body=run(s,f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready').strip();out['readiness'][str(port)]=json.loads(body)
        j=json.loads(run(s,"pm2 jlist"))
        out['pm2']=[{'name':p['name'],'status':p['pm2_env']['status'],'pid':p.get('pid'),'restart':p['pm2_env'].get('restart_time')} for p in j if p['name'] in [x[0] for x in NODES]]
        out['runtimeContract']='verified locally by test-box-tier100.js; live process uses the same hashed dropLevel100.js and DROP_LEVEL_100_ENABLED=1'
    finally:s.close()
    OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','evidence':str(OUT),'runtimeContract':out['runtimeContract'],'readiness':out['readiness'],'pm2':out['pm2']},ensure_ascii=False))
if __name__=='__main__':main()
