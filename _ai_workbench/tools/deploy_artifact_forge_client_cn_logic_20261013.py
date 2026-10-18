from pathlib import Path
import hashlib, json, shlex
from datetime import datetime, timezone
from release_artifact_quench_fix_20261009 import connect, run, rh

ROOT=Path(__file__).resolve().parents[2]
ADDON='/linhhoasu/webgame/game/js/lhs-artifact-forge-v1.js'; INDEX='/linhhoasu/webgame/game/index.html'
CAND=ROOT/'_ai_workbench/temp/ui_freeze_20261013/lhs-artifact-forge-cn.js'; OUT=CAND.parent
STAMP=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP=f'/linhhoasu/_ai_workbench/backups/artifact_forge_client_cn_logic_20261013_{STAMP}'
STAGE=f'/linhhoasu/_ai_workbench/temp/artifact_forge_client_cn_logic_20261013_{STAMP}'
EXPECTED={'addon':'cc8b875815746e87c780905c67bbc0c766087c425ed62d6948d1dd7a2202d04d','index':'9c14dbeb8bcbd3b7dd53eebfba1561632f93416e549a545e2f0e1cf6f322442a'}
sha=lambda b:hashlib.sha256(b).hexdigest(); q=shlex.quote

def main():
    ssh=connect(); event={'startedAt':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionFileWrites':0,'playerWrites':0,'restarts':0}; published=[]
    try:
        print(run(ssh, 'ls -l -- ' + q(ADDON) + ' ' + q(INDEX)), flush=True)
        with ssh.open_sftp() as sf:
            live_addon=sf.open(ADDON,'rb').read(); live_index=sf.open(INDEX,'rb').read()
        actual={'addon':sha(live_addon),'index':sha(live_index)}
        if actual!=EXPECTED: raise RuntimeError('CAS:'+json.dumps(actual))
        text=live_index.decode('utf-8'); old='js/lhs-artifact-forge-v1.js?v=20261013_forge_v3'; new='js/lhs-artifact-forge-v1.js?v=20261013_forge_cn_logic_v1'
        if text.count(old)!=1: raise RuntimeError('INDEX_MARKER_CHANGED')
        cand={'addon':CAND.read_bytes(),'index':text.replace(old,new).encode('utf-8')}; candidate={k:sha(v) for k,v in cand.items()}
        event.update(expected=actual,candidate=candidate,indexMarker={'old':old,'new':new})
        run(ssh,'install -d -m 700 -- '+q(BACKUP)+' '+q(STAGE))
        for label,target,live in [('addon',ADDON,live_addon),('index',INDEX,live_index)]:
            with ssh.open_sftp() as sf:
                sf.putfo(__import__('io').BytesIO(live),BACKUP+'/'+label); sf.putfo(__import__('io').BytesIO(cand[label]),STAGE+'/'+label)
            if rh(ssh,BACKUP+'/'+label)!=actual[label] or rh(ssh,STAGE+'/'+label)!=candidate[label]: raise RuntimeError('HASH:'+label)
        for label,target in [('addon',ADDON),('index',INDEX)]:
            if rh(ssh,target)!=actual[label]: raise RuntimeError('PUBLISH_CAS:'+label)
            tmp=target+'.artifact_forge_cn.tmp'; run(ssh,'cp -- '+q(STAGE+'/'+label)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
            if rh(ssh,target)!=candidate[label]: raise RuntimeError('FINAL_HASH:'+label)
            published.append((label,target)); event['productionFileWrites']+=1
        event['served']={'addon':run(ssh,"curl -fsS --max-time 30 'https://linhhoasu.lol/js/lhs-artifact-forge-v1.js?v=20261013_forge_cn_logic_v1' | sha256sum | awk '{print $1}'",40).strip(),'index':run(ssh,"curl -fsS --max-time 30 'https://linhhoasu.lol/index.html?forge_cn_logic=20261013' | sha256sum | awk '{print $1}'",40).strip()}
        if event['served']!=candidate: raise RuntimeError('SERVED_HASH_MISMATCH')
        event.update(result='PASS',backup=BACKUP,completedAt=datetime.now(timezone.utc).isoformat())
        (OUT/'forge_cn_deploy.json').write_text(json.dumps(event,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps(event,ensure_ascii=False,indent=2))
    except Exception as exc:
        event['error']=str(exc)
        for label,target in reversed(published):
            try:
                if rh(ssh,target)==event.get('candidate',{}).get(label):
                    tmp=target+'.artifact_forge_cn.rollback'; run(ssh,'cp -- '+q(BACKUP+'/'+label)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
            except Exception as re: event.setdefault('rollbackErrors',[]).append(str(re))
        (OUT/'forge_cn_deploy.json').write_text(json.dumps(event,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); raise
    finally:
        try: run(ssh,'rm -rf -- '+q(STAGE),30)
        except Exception: pass
        ssh.close()
if __name__=='__main__': main()
