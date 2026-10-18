from pathlib import Path
import hashlib, json, shlex
from datetime import datetime, timezone
from release_artifact_quench_fix_20261009 import connect, run, rh

ROOT=Path(__file__).resolve().parents[2]
ADDON='/linhhoasu/webgame/game/js/lhs-artifact-forge-v1.js'
INDEX='/linhhoasu/webgame/game/index.html'
CAND=ROOT/'_ai_workbench/temp/ui_freeze_20261013/lhs-artifact-forge-v3.js'
OUT=ROOT/'_ai_workbench/temp/ui_freeze_20261013'
STAMP=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP=f'/linhhoasu/_ai_workbench/backups/artifact_forge_client_v3_20261013_{STAMP}'
STAGE=f'/linhhoasu/_ai_workbench/temp/artifact_forge_client_v3_20261013_{STAMP}'
EXPECTED_ADDON='80cdf868e80ef7183e817fd135f974fdd20ce1e0d6b1ff22b7794c626024838f'
sha=lambda b:hashlib.sha256(b).hexdigest(); q=shlex.quote

def main():
    ssh=connect(); event={'startedAt':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionFileWrites':0,'playerWrites':0,'restarts':0}
    published=[]
    try:
        with ssh.open_sftp() as sftp:
            live_addon=sftp.open(ADDON,'rb').read(); live_index=sftp.open(INDEX,'rb').read()
        if sha(live_addon)!=EXPECTED_ADDON: raise RuntimeError('ADDON_CAS:' + sha(live_addon))
        text=live_index.decode('utf-8')
        old='js/lhs-artifact-forge-v1.js?v=20261013_forge_v2'; new='js/lhs-artifact-forge-v1.js?v=20261013_forge_v3'
        if text.count(old)!=1: raise RuntimeError('INDEX_FORGE_MARKER_CHANGED')
        cand_index=text.replace(old,new).encode('utf-8'); cand_addon=CAND.read_bytes()
        expected={'addon':sha(live_addon),'index':sha(live_index)}; candidate={'addon':sha(cand_addon),'index':sha(cand_index)}
        event.update(expected=expected,candidate=candidate)
        run(ssh,'install -d -m 700 -- '+q(BACKUP)+' '+q(STAGE))
        for label,target,live,cand in [('addon',ADDON,live_addon,cand_addon),('index',INDEX,live_index,cand_index)]:
            with ssh.open_sftp() as sftp:
                sftp.putfo(__import__('io').BytesIO(live),BACKUP+'/'+label)
                sftp.putfo(__import__('io').BytesIO(cand),STAGE+'/'+label)
            if rh(ssh,BACKUP+'/'+label)!=expected[label] or rh(ssh,STAGE+'/'+label)!=candidate[label]: raise RuntimeError('HASH_MISMATCH:'+label)
        for label,target in [('addon',ADDON),('index',INDEX)]:
            if rh(ssh,target)!=expected[label]: raise RuntimeError('PUBLISH_CAS:'+label)
            tmp=target+'.artifact_forge_v3.tmp'; run(ssh,'cp -- '+q(STAGE+'/'+label)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
            if rh(ssh,target)!=candidate[label]: raise RuntimeError('FINAL_HASH:'+label)
            published.append((label,target)); event['productionFileWrites']+=1
        event['served']={'addon':run(ssh,"curl -fsS --max-time 30 'https://linhhoasu.lol/js/lhs-artifact-forge-v1.js?v=20261013_forge_v3' | sha256sum | awk '{print $1}'",40).strip(),'index':run(ssh,"curl -fsS --max-time 30 'https://linhhoasu.lol/index.html?forge_v3=20261013' | sha256sum | awk '{print $1}'",40).strip()}
        if event['served']!=candidate: raise RuntimeError('SERVED_HASH_MISMATCH')
        event.update(result='PASS',backup=BACKUP,completedAt=datetime.now(timezone.utc).isoformat())
        (OUT/'forge_v3_deploy.json').write_text(json.dumps(event,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps(event,ensure_ascii=False,indent=2))
    except Exception as exc:
        event['error']=str(exc)
        for label,target in reversed(published):
            try:
                if rh(ssh,target)==event.get('candidate',{}).get(label):
                    tmp=target+'.artifact_forge_v3_rollback.tmp'; run(ssh,'cp -- '+q(BACKUP+'/'+label)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
            except Exception as re: event.setdefault('rollbackErrors',[]).append(str(re))
        (OUT/'forge_v3_deploy.json').write_text(json.dumps(event,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); raise
    finally:
        try: run(ssh,'rm -rf -- '+q(STAGE),30)
        except Exception: pass
        ssh.close()
if __name__=='__main__': main()
