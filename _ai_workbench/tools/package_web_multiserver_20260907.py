"""Create a credential-free delta bundle and verify every ZIP member + hash."""
import hashlib,json,zipfile
from snapshot_web_multiserver_20260906 import OUT,WB

state=json.loads((OUT/'release.json').read_text())
if state['phase']!='open':raise RuntimeError('ONLY_VERIFIED_OPEN_RELEASE')
files={}
for rel,expected in state['hashes'].items():
    if rel=='config.php':continue
    src=OUT/'candidate'/rel
    if hashlib.sha256(src.read_bytes()).hexdigest()!=expected:raise RuntimeError('Candidate drift '+rel)
    files['source/'+rel]=src
for name in ['web_daily_schema_20260906.sql','web_delivery_schema_20260906.sql']:
    files['migrations/'+name]=WB/'tools'/name
files['tools/web_multiserver_config_context_patch.py']=WB/'tools/web_multiserver_config_context_patch.py'
files['README.md']=WB/'notes/web_multiserver_deployment_20260907.md'
manifest={'releaseOpenedAt':state['openedAt'],'baselineConfigSha256':state['baselineConfig'],'installedConfigSha256':state['hashes']['config.php'],'credentialFree':True,'files':{name:hashlib.sha256(path.read_bytes()).hexdigest()for name,path in files.items()}}
dest=OUT/'WebGM_MultiServer_20260907.zip'
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED)as z:
    for name,path in files.items():z.write(path,name)
    z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(dest)as z:
    assert z.testzip()is None
    for name,expected in manifest['files'].items():assert hashlib.sha256(z.read(name)).hexdigest()==expected
result={'package':str(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,'entries':len(files)+1,'crc':'PASS','noCredentials':True}
(OUT/'package.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
