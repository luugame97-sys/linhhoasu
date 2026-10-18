"""Whitelist source-only patch package; no credentials, config dumps or players."""
import hashlib,json,zipfile
from pathlib import Path
WB=Path(__file__).resolve().parents[1];REL=WB/'temp/fashion_fix_20260905';stage=json.loads((REL/'stage.json').read_text())
entries={r:WB.parent/'linhhoasu/lhs/newServer'/r for r in stage['files']}
for name in['test_fashion_writer_20260905.js','test_fashion_repair_20260905.js','audit_fashion_channels_fixture_20260905.js']:
    entries['tests/'+name]=WB/'tools'/name
entries['tools/FashionInventoryRepairService.js']=REL/'app/src/services/FashionInventoryRepairService.js'
for name in['fashion_fix_release_20260905.md','fashion_fix_release_20260905.html']:entries['reports/'+name]=WB/'reports'/name
manifest={'release':'fashion_fix_20260905','deployedServers':[1001,1002],'standaloneServer':False,'repairAlreadyApplied':True,'warning':'Source patch only. Do not repeat repair. Tests need workspace config snapshots/dependencies. No player or credential data included.','files':{name:hashlib.sha256(file.read_bytes()).hexdigest()for name,file in entries.items()}}
for rel in stage['files']:assert manifest['files'][rel]==stage['candidateHashes'][rel]
target=WB/'temp/fashion_fix_source_20260905.zip'
if target.exists():
    assert hashlib.sha256(target.read_bytes()).hexdigest()=='f088235c3289cc5278033862571d033f3ad8980f55918cf5eeaed53b324555f4','Preserve unexpected existing package'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED)as z:
    for name,file in entries.items():
        assert not any(x in name.lower()for x in['.env','credential','preimage','.ejson','runtime.json','web_inventory'])
        z.write(file,name)
    z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(target)as z:
    assert z.testzip()is None
    for name,expected in manifest['files'].items():assert hashlib.sha256(z.read(name)).hexdigest()==expected
result={'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'files':len(entries)+1,'crc':'PASS'}
(REL/'package.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
