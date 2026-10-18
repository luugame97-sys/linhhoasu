"""Read-only recovery/post-check; never re-runs a deployment."""
import json,hashlib,shlex
from datetime import datetime,timezone
from deploy_formation_grade1000_20260913 import FILES,STAGE,PROCS,PORTS,rp
from snapshot_web_multiserver_20260906 import connect,run

ssh=connect()
ev={'at':datetime.now(timezone.utc).isoformat(),'readOnly':True,'files':[]}
try:
    with ssh.open_sftp() as s:
        for rel,local in FILES.items():
            expected=hashlib.sha256(local.read_bytes()).hexdigest()
            actual=hashlib.sha256(s.open(rp(rel),'rb').read()).hexdigest()
            assert expected==actual,rel
            ev['files'].append({'file':rel,'sha256':actual})
    ev['ready']={sid:run(ssh,f"curl -fsS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready").strip() for sid,p in PORTS.items()}
    idx=run(ssh,'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
    assert '20260913_formation_grade1000_v1' in idx
    ev['served']={}
    for rel in FILES:
        if not rel.startswith('webgame/game/'):continue
        url='http://127.0.0.1:81/'+rel[len('webgame/game/'):]
        actual=run(ssh,'curl -fsS --max-time 20 '+shlex.quote(url)+' | sha256sum').split()[0]
        assert actual==hashlib.sha256(FILES[rel].read_bytes()).hexdigest(),rel
        ev['served'][rel]=actual
    code="const fs=require('fs'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');const t=c.decodeTables(fs.readFileSync('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'));console.log(JSON.stringify({rows:Object.keys(t.FormationGradeConfig).length,last:t.FormationGradeConfig[1000]}));"
    ev['config']=json.loads(run(ssh,'node -e '+shlex.quote(code)))
    assert ev['config']['rows']==1000
    ps=json.loads(run(ssh,'pm2 jlist'))
    ev['processes']=[{'name':p['name'],'pid':p['pid'],'status':p['pm2_env']['status'],'restarts':p['pm2_env']['restart_time']} for p in ps]
    assert len([p for p in ev['processes'] if p['name'] in PROCS and p['status']=='online'])==3
    ev['errorMarkers']=run(ssh,"for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -80 \"$f\" 2>/dev/null | grep -Ei 'CONFIG_DECODE_FAILED|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
    assert set(ev['ready'].values())=={'200'}
    ev['result']='DEPLOY_VERIFIED' if not ev['errorMarkers'] else 'HOLD'
finally: ssh.close()
(STAGE/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'result':ev['result'],'ready':ev['ready'],'configRows':ev['config']['rows'],'evidence':str(STAGE/'deploy.json')}))
