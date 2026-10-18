"""Rebase one additive script include onto the latest live index, read-only remote."""
import difflib
import hashlib
import json
import sys
from pathlib import Path
sys.dont_write_bytecode=True
WB=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(WB/'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect
OUT=WB/'temp/feature_unlock_release_20260917'
target='/linhhoasu/webgame/game/index.html'
ssh=connect()
try:
    with ssh.open_sftp() as sftp: data=sftp.open(target,'rb').read()
finally:ssh.close()
index=OUT/'candidate/client/index.html'
old=index.read_bytes()
include=b'\t\t"js/lhs-feature-day1-v1.js?v=20260917_feature_day1_v1",'
anchor=b'\t\t"js/main.min_drop100.js?v=20260915_drop100_restore_v2",'
if data.count(anchor)!=1 or b'lhs-feature-day1-v1.js' in data:
    raise SystemExit('INDEX_ANCHOR_OR_NEW_ADDON_CHANGED')
nl=b'\r\n' if b'\r\n' in data else b'\n'
rebased=data.replace(anchor,anchor+nl+include,1)
print(''.join(difflib.unified_diff(old.decode('utf-8').splitlines(True),rebased.decode('utf-8').splitlines(True),
                                  fromfile='previous-candidate',tofile='current-live-plus-addon'))[:6000])
(OUT/'index.current-baseline.html').write_bytes(data)
index.write_bytes(rebased)
manifest_path=OUT/'baseline.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
previous=manifest['files'][target]['sha256']
manifest['files'][target]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'kind':'client'}
manifest.setdefault('baselineRefreshes',[]).append({'path':target,'previous':previous,'current':manifest['files'][target]['sha256'],
 'reason':'Preserve concurrent live index change; candidate adds exactly one script include'})
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'productionWrites':0,'indexBaselineRefreshed':True,'newHash':manifest['files'][target]['sha256']}))
