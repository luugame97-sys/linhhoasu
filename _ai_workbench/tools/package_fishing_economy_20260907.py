"""Package verified delta only, omitting credentials, snapshots and QA identities."""
import hashlib,json,zipfile
from stage_fishing_economy_20260907 import ROOT,APP,GAME,FILES
from snapshot_web_multiserver_20260906 import WB
state=json.loads((ROOT/'deploy.json').read_text());assert state['result']=='DEPLOYED'
entries={}
for rel in FILES:entries['server/'+rel]=ROOT/'app'/rel
entries.update({'server-config/config_e5ac72c2.bin':ROOT/'server.bin','client/update/resource/assets/excel/config_e5ac72c2.bin':ROOT/'client.bin','client/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':ROOT/'lang.bin','client/index.html':ROOT/'index.fixed.html','REPORT.md':WB/'reports/fishing_economy_release_20260907.md'})
for rel in FILES:assert hashlib.sha256((ROOT/'app'/rel).read_bytes()).hexdigest()==state['expected'][APP+'/'+rel]
manifest={k:hashlib.sha256(v.read_bytes()).hexdigest()for k,v in entries.items()}
output=ROOT/'Fishing_Economy_20260907.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED)as z:
 for rel,p in entries.items():z.write(p,rel)
 z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
 z.writestr('README.txt','Verified delta from live baseline; NOT a full installer. Backup and hash-check current source/config before applying. Server config was loaded from /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin. Publish client config/lang/index together. Preserve unrelated local SystemConfig changes. Do not replay purchases or grant historical compensation. See REPORT.md. No credentials included.\n')
with zipfile.ZipFile(output)as z:
 assert z.testzip()is None
 for rel,digest in manifest.items():assert hashlib.sha256(z.read(rel)).hexdigest()==digest
result={'path':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'entries':len(entries)+2,'crc':'PASS'}
(ROOT/'package.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
