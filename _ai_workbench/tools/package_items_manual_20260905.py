"""Package only verified deployed touched source, test helpers, and handoff docs."""
import hashlib,json,zipfile
from pathlib import Path
WB=Path(__file__).resolve().parents[1];SOURCE=WB.parent/'linhhoasu/lhs/newServer'
manifest=json.loads((WB/'temp/items_manual_handoff_health_20260905.json').read_text(encoding='utf-8'))
archive=WB/'temp/items_manual_source_20260905.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:
 for relative,digest in manifest['sourceHashes'].items():
  payload=(SOURCE/relative).read_bytes()
  # Files restored through patches may differ only in line endings from VPS.
  if hashlib.sha256(payload).hexdigest()!=digest:
   old=WB/'temp/reward_release_20260905/app'/relative
   assert old.exists() and hashlib.sha256(old.read_bytes()).hexdigest()==digest
   assert old.read_text(encoding='utf-8')==(SOURCE/relative).read_text(encoding='utf-8')
   payload=old.read_bytes()
  z.writestr('newServer/'+relative,payload)
 for name in ['items_manual_test_20260905.md','items_manual_test_20260905.html','items_followup_fix_20260905.md','items_followup_fix_20260905.html','items_remaining_manual_20260905.txt']:
  z.write(WB/'reports'/name,'_ai_workbench/reports/'+name)
 for name in ['test_gem_family_corrected_20260905.js','test_fixed_items_20260905.js']:
  z.write(WB/'tools'/name,'_ai_workbench/tools/'+name)
 z.writestr('manifest.json',json.dumps({'status':'partial_implemented_user_acceptance_pending','remainingBlockedIds':105,'gem5ItemId':100085,'nativeVisualTest':'user','sourceHashes':manifest['sourceHashes']},indent=2))
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
result={'path':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'sourceFiles':len(manifest['sourceHashes'])}
(WB/'temp/items_manual_package_manifest_20260905.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
