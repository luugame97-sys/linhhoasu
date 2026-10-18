"""Build a source-only delivery package; exclude credentials, player data and dumps."""
import hashlib
import json
from pathlib import Path
import zipfile
WB=Path(__file__).resolve().parents[1];REL=WB/'temp/reward_release_20260905'
d=json.loads((REL/'deploy_20260905_063510.json').read_text(encoding='utf-8'))
target=REL/'reward_release_source_20260905.zip'
manifest={'release':'20260905_063510','sourceFiles':{},'status':'partial_verified_release','remainingItemIds':114,
          'nativeVisualAcceptance':False,'historicalPlayerRepairApplied':False,'clientChanged':False}
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for name,expected in d['installedHashes'].items():
        f=REL/'app'/name
        digest=hashlib.sha256(f.read_bytes()).hexdigest()
        assert digest==expected
        z.write(f,'newServer/'+name);manifest['sourceFiles'][name]=digest
    for name in ['test_reward_release_20260905.js','test_reward_cash_recovery_20260905.js','preload_reward_test_20260905.js']:
        z.write(WB/'tools'/name,'_ai_workbench/tools/'+name)
    for name in ['reward_release_20260905.md','reward_release_20260905.html','reward_release_remaining_20260905.txt']:
        z.write(WB/'reports'/name,'_ai_workbench/reports/'+name)
    z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    assert not any(any(s in n.lower() for s in ['credential','password','visual_account','repair_preview','.env']) for n in z.namelist())
result={'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(manifest['sourceFiles'])}
(REL/'package_manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
