"""Run only on the VPS panel Python. Use existing ACME client, scoped file auth."""
import os,sys,json,re
from pathlib import Path
import OpenSSL,dns.resolver  # Preflight dependencies; do not auto-install.
os.chdir('/www/server/panel');sys.path.insert(0,'class');sys.path.insert(0,'.')
from acme_v2 import acme_v2
ROOT=Path('/linhhoasu/_ai_workbench/temp/domain_lol_acme')
BACK=Path('/linhhoasu/_ai_workbench/backups/domain_linhhoasu_lol_https_20260929')
class ScopedACME(acme_v2):
    def write_auth_file(self,auth_to,token,content,index):
        assert auth_to==str(ROOT) and re.fullmatch(r'[A-Za-z0-9_-]+',token)
        target=ROOT/'.well-known/acme-challenge'/token
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('w') as f:f.write(content)
        target.chmod(0o644)
        return True
    def clear_auth_file(self,index):
        # Keep tiny challenge evidence; never glob-delete shared challenges.
        return True
a=ScopedACME()
r=a.apply_cert(['linhhoasu.lol','www.linhhoasu.lol'],'http',str(ROOT))
if not r.get('status'):
    print(json.dumps({'status':False,'message':r.get('msg')},ensure_ascii=True));raise SystemExit(1)
orders=[(k,v) for k,v in a._config['orders'].items() if set(v.get('domains',[]))=={'linhhoasu.lol','www.linhhoasu.lol'}]
safe={'status':True,'orders':[{'index':k,'path':v.get('save_path'),'status':v.get('status')} for k,v in orders]}
(BACK/'certificate.json').write_text(json.dumps(safe,indent=2))
print(json.dumps(safe))
