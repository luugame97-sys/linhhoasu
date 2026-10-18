"""Read-only exact path/hash inventory before a scoped economy rollout."""
import json,hashlib,shlex
from snapshot_web_multiserver_20260906 import WB,connect,run
from stage_fishing_economy_20260907 import ROOT,BASE,APP,GAME,FILES
from release_huyenvu_daily_20260906 import hashes,pm2,ready
s=connect()
try:
    manifest=json.loads((BASE/'manifest.json').read_text());expected={APP+'/'+rel:manifest['files'].get('app/'+rel,{}).get('sha256')for rel in FILES}
    for name in ['server.bin','client.bin','lang.bin','main.js']:
        row=manifest['files'][name];expected[row['remote']]=row['sha256']
    assert hashes(s,list(expected))==expected,'LIVE_BASELINE_DRIFT'
    paths=[APP+'/../LHS-re/update/resource/assets/excel/config_e5ac72c2.bin',APP+'/../update/resource/assets/excel/config_e5ac72c2.bin']
    candidates=hashes(s,paths);chosen=next((p for p in paths if candidates[p]),None)
    assert chosen and candidates[chosen]==manifest['files']['server.bin']['sha256'],'RUNTIME_CONFIG_UNVERIFIED'
    with s.open_sftp()as f:
        with f.open(GAME+'/index.html','rb')as r:index=r.read()
    (ROOT/'index.before.html').write_bytes(index);expected[GAME+'/index.html']=hashlib.sha256(index).hexdigest()
    result={'expected':expected,'configResolved':chosen,'processes':pm2(s),'ready':ready(s)}
    (ROOT/'preflight.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'files':len(expected),'configResolved':chosen,'ready':result['ready'],'baselinePass':True}))
finally:s.close()
