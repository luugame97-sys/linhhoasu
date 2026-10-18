from __future__ import annotations
import hashlib, json, shlex, re
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('h',ROOT/'_ai_workbench/tools/release_artifact_quench_fix_20261009.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
REMOTE='/linhhoasu/webgame/game'; BASE=ROOT/'_ai_workbench/temp/fishing_x10_v2_20261011/baseline'; ADDON=ROOT/'_ai_workbench/temp/fishing_x10_v2_20261011/candidate/lhs-fishing-x10-v2.js'
GOOD='fd9611f0b4b046167c22c3850e87ecfdb0452543748527c260eefa00999b4f32'
def q(x):return shlex.quote(x)
def main():
 s=h.connect();stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhoasu/_ai_workbench/backups/fishing_x10_client_v2_s1_{stamp}';stage=f'/linhoasu/_ai_workbench/temp/fishing_x10_client_v2_s1_{stamp}';ev={'at':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionWrites':0,'playerWrites':0}
 try:
  idx=BASE/'index.html';data=idx.read_bytes();marker=b'"js/lhs-feature-day1-v1.js?v=20261009_level_unlock_v2",';
  if data.count(marker)!=1:raise RuntimeError('BASELINE_MARKER')
  candidate=data.replace(marker,marker+b'\r\n\t\t"js/lhs-fishing-x10-v2.js?v=20261011_fishing_x10_v2",',1);ih=hashlib.sha256(candidate).hexdigest();ah=hashlib.sha256(ADDON.read_bytes()).hexdigest()
  current=h.rh(s,REMOTE+'/index.html');oldaddon=h.run(s,'test -e '+q(REMOTE+'/js/lhs-fishing-x10-v2.js')+' && echo EXISTS || echo MISSING').strip()
  if current!=GOOD or oldaddon!='MISSING':raise RuntimeError('CLIENT_CAS:'+current+':'+oldaddon)
  refs=list(dict.fromkeys(re.findall(rb'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"',candidate)))
  missing=[]
  with s.open_sftp() as sf:
   for ref in refs:
    try:sf.stat(REMOTE+'/'+ref.decode().split('?')[0])
    except FileNotFoundError:
     if ref.decode().split('?')[0] != 'js/lhs-fishing-x10-v2.js': missing.append(ref.decode())
  if missing:raise RuntimeError('MISSING:'+','.join(missing))
  h.run(s,'install -d -m 700 '+q(stage)+' '+q(backup)+' '+q(backup+'/webgame/game'))
  h.run(s,'cp -p -- '+q(REMOTE+'/index.html')+' '+q(backup+'/webgame/game/index.html'))
  with s.open_sftp() as sf:
   with sf.open(stage+'/index.html','wb') as f:f.write(candidate)
   with sf.open(stage+'/lhs-fishing-x10-v2.js','wb') as f:f.write(ADDON.read_bytes())
  h.run(s,'cp -- '+q(stage+'/lhs-fishing-x10-v2.js')+' '+q(backup+'/webgame/game/lhs-fishing-x10-v2.js'))
  if h.rh(s,stage+'/index.html')!=ih or h.rh(s,stage+'/lhs-fishing-x10-v2.js')!=ah:raise RuntimeError('STAGE_HASH')
  tmp=REMOTE+'/index.html.x10v2.tmp';h.run(s,'cp -- '+q(stage+'/index.html')+' '+q(tmp)+' && chmod --reference='+q(REMOTE+'/index.html')+' '+q(tmp)+' && chown --reference='+q(REMOTE+'/index.html')+' '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(REMOTE+'/index.html'))
  tmp=REMOTE+'/js/lhs-fishing-x10-v2.js.x10v2.tmp';h.run(s,'cp -- '+q(stage+'/lhs-fishing-x10-v2.js')+' '+q(tmp)+' && chmod 644 '+q(tmp)+' && chown root:www '+q(tmp)+' && mv -f -- '+q(tmp)+' '+q(REMOTE+'/js/lhs-fishing-x10-v2.js'))
  if h.rh(s,REMOTE+'/index.html')!=ih or h.rh(s,REMOTE+'/js/lhs-fishing-x10-v2.js')!=ah:raise RuntimeError('READBACK')
  syntax=h.run(s,'node --check '+q(REMOTE+'/js/lhs-fishing-x10-v2.js')+' >/dev/null && echo PASS').strip();
  if syntax!='PASS':raise RuntimeError('SYNTAX')
  ev.update({'result':'PASS','backup':backup,'beforeIndexHash':current,'indexHash':ih,'addonHash':ah,'scriptCount':len(refs),'missingFiles':missing,'syntax':syntax,'verifiedAt':datetime.now(timezone.utc).isoformat()})
 except Exception as e:ev['error']=str(e);raise
 finally:
  (ROOT/'_ai_workbench/temp/fishing_x10_v2_20261011/client_release.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  try:h.run(s,'rm -rf -- '+q(stage),30)
  except Exception:pass
  s.close()
 print(json.dumps(ev,ensure_ascii=False))
if __name__=='__main__':main()
