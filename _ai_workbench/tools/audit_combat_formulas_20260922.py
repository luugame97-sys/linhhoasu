"""Read-only live formula/config inspection; writes evidence locally only."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
base=Path(__file__).resolve().parents[1]
source=Path(__file__).with_suffix('.js').read_text(encoding='utf-8')
ssh=connect()
try:
    data=json.loads(run(ssh,'cd /linhhoasu/lhs/newServer && node',source))
finally:
    ssh.close()
dest=base/'temp'/'combat_parity_20260922'/'formula_audit.json'
dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'evidence':str(dest),'attrs':data['attrCount'],'linkChecks':len(data['linkChecks']),'mismatchedLinkChecks':sum(bool(x['diff']) for x in data['linkChecks']),'players':[{'name':p['name'],'serverId':p['serverId'],'power':p['power'],'nativeLinksOnlyPower':p['nativeLinksOnly']['power'],'dbSameOnReadback':p['dbSameOnReadback']} for p in data['players']]},ensure_ascii=True))
