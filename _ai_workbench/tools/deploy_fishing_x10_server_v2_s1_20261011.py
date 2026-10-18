from __future__ import annotations
import hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('h', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
REMOTE = '/linhhoasu/lhs/newServer'
BASE = ROOT / '_ai_workbench/temp/fishing_x10_v2_20261011/candidate/server/src'
FILES = [('handlers/fish.js', 'fish.js'), ('services/FishingX10Service.js', 'FishingX10Service.js'), ('services/PlayerService.js', 'PlayerService.js')]
def q(x): return shlex.quote(x)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    s = h.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/fishing_x10_server_v2_s1_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/fishing_x10_server_v2_s1_{stamp}'
    ev = {'at':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionWrites':0,'playerWrites':0}
    try:
        proc = next(x for x in h.procs(s) if x['name']=='lhs-s1001'); pre_ready=h.ready(s,8080)
        if proc['status']!='online' or pre_ready!='200': raise RuntimeError('S1_BASELINE')
        expected = {rel:h.rh(s,REMOTE+'/src/'+rel) for rel,_ in FILES}
        candidates = {rel:sha(BASE/rel) for rel,name in FILES}
        ev.update({'preProcess':proc,'preReady':pre_ready,'expectedHashes':expected,'candidateHashes':candidates})
        h.run(s,'install -d -m 700 '+q(stage)+' '+q(backup))
        for rel,name in FILES:
            target=REMOTE+'/src/'+rel; rb=backup+'/src/'+rel; rs=stage+'/src/'+rel
            h.run(s,'install -d -m 700 '+q(rs.rsplit('/',1)[0])+' '+q(rb.rsplit('/',1)[0]))
            h.run(s,'cp -p -- '+q(target)+' '+q(rb))
            if h.rh(s,rb)!=expected[rel]: raise RuntimeError('BACKUP:'+rel)
            with s.open_sftp() as sf: sf.put(str(BASE/rel),rs)
            if h.rh(s,rs)!=candidates[rel]: raise RuntimeError('STAGE:'+rel)
        for rel,_ in FILES:
            target=REMOTE+'/src/'+rel; rs=stage+'/src/'+rel; tmp=target+'.fishing_x10_v2.tmp'
            if h.rh(s,target)!=expected[rel]: raise RuntimeError('CAS:'+rel)
            h.run(s,'cp -- '+q(rs)+' '+q(tmp)+' && chmod --reference='+q(target)+' '+q(tmp)+' && chown --reference='+q(target)+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(target))
            if h.rh(s,target)!=candidates[rel]: raise RuntimeError('FINAL:'+rel)
        syntax=h.run(s,'for f in /linhhoasu/lhs/newServer/src/handlers/fish.js /linhhoasu/lhs/newServer/src/services/FishingX10Service.js /linhhoasu/lhs/newServer/src/services/PlayerService.js; do node --check "$f"; done; echo PASS',60).strip()
        if syntax!='PASS': raise RuntimeError('SYNTAX')
        h.run(s,'pm2 restart lhs-s1001',120); deadline=time.time()+90; ready='000'
        while time.time()<deadline:
            ready=h.ready(s,8080)
            if ready=='200': break
            time.sleep(1)
        if ready!='200': raise RuntimeError('POST_READY:'+ready)
        ev.update({'installedHashes':{rel:h.rh(s,REMOTE+'/src/'+rel) for rel,_ in FILES},'postReady':ready,'postProcess':next(x for x in h.procs(s) if x['name']=='lhs-s1001'),'syntax':'PASS','backup':backup,'result':'PASS','verifiedAt':datetime.now(timezone.utc).isoformat()})
    except Exception as e: ev['error']=str(e); raise
    finally:
        (ROOT/'_ai_workbench/temp/fishing_x10_v2_20261011/server_release.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        try:h.run(s,'rm -rf -- '+q(stage),30)
        except Exception:pass
        s.close()
    print(json.dumps(ev,ensure_ascii=False))
if __name__=='__main__':main()
