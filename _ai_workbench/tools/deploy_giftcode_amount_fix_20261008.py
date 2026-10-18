"""Deploy the giftcode amount validator fix with CAS, backup and readback."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
WEB = '/linhhoasu/webgame/gm'
STAMP = 'giftcode_amount_fix_20261008'
BACKUP = f'/linhhoasu/_ai_workbench/backups/{STAMP}_pre'
STAGE = f'/linhhoasu/_ai_workbench/temp/{STAMP}'
LOCAL = ROOT / '_ai_workbench/temp' / STAMP
FILES = {
    'admin/admin_api.php': ROOT / '_ai_workbench/temp/giftcode_amount_fix_20261008/candidate/admin/admin_api.php',
    'assets/js/admin.js': ROOT / '_ai_workbench/temp/giftcode_amount_fix_20261008/candidate/assets/js/admin.js',
}
BASELINE = {
    'admin/admin_api.php': '4984132ccfb785e125a591b72acf2f1d9835d06691c17b99717a992796928e90',
    'assets/js/admin.js': '1b9537499c506250d05bd3a480b3ff951b9e9fa161947ff40f9417e4f6be5801',
}

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    candidate = {rel: path.read_bytes() for rel, path in FILES.items()}
    candidate_hashes = {rel: sha(data) for rel, data in candidate.items()}
    with connect() as ssh:
        if run(ssh, f'test -e {shlex.quote(BACKUP)} && echo yes || echo no').strip() != 'no': raise RuntimeError('backup exists')
        for rel, expected in BASELINE.items():
            actual = run(ssh, f"sha256sum {shlex.quote(WEB+'/'+rel)} | awk '{{print $1}}'").strip()
            if actual != expected: raise RuntimeError('CAS mismatch '+rel+': '+actual)
        with ssh.open_sftp() as sftp:
            for rel, data in candidate.items():
                staged = STAGE + '/app/' + rel
                run(ssh, 'mkdir -p '+shlex.quote(staged.rsplit('/',1)[0]))
                with sftp.open(staged, 'wb') as f: f.write(data)
                if run(ssh, f"sha256sum {shlex.quote(staged)} | awk '{{print $1}}'").strip() != candidate_hashes[rel]: raise RuntimeError('stage drift '+rel)
        for rel in FILES:
            run(ssh, 'php -l '+shlex.quote(STAGE+'/app/'+rel)) if rel.endswith('.php') else run(ssh, 'node --check '+shlex.quote(STAGE+'/app/'+rel))
        # Safe parser boundary test against staged PHP and production catalog.
        probe = r'''<?php require '/linhhoasu/webgame/gm/config.php'; $p=file_get_contents('/linhhoasu/_ai_workbench/temp/giftcode_amount_fix_20261008/app/admin/admin_api.php');$a=strpos($p,'function admin_parse_reward_json');$b=strpos($p,'function admin_server_view',$a);eval(substr($p,$a,$b-$a));$ids=array(1,2,3,4,6,36,60,61,65,1001);$out=array();foreach($ids as $id){$k=(string)$id;$out[$id]=array('one'=>admin_parse_reward_json(json_encode(array($k=>1))),'million'=>admin_parse_reward_json(json_encode(array($k=>1000000))));}echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);?>'''
        probe_result = json.loads(run(ssh, 'php', probe))
        for id in ('1','2','6','60','61'):
            if not probe_result[id]['million']: raise RuntimeError('special item still rejected '+id)
        for id in ('3','4','36','65','1001'):
            if probe_result[id]['million']: raise RuntimeError('ordinary item cap widened '+id)
        run(ssh, 'mkdir -p '+shlex.quote(BACKUP))
        for rel in FILES:
            remote=WEB+'/'+rel; backup=BACKUP+'/'+rel; run(ssh, 'mkdir -p '+shlex.quote(backup.rsplit('/',1)[0])+' && cp -p '+shlex.quote(remote)+' '+shlex.quote(backup))
            tmp=remote+'.giftcode-amount-fix'; run(ssh,'cp '+shlex.quote(STAGE+'/app/'+rel)+' '+shlex.quote(tmp)+' && mv '+shlex.quote(tmp)+' '+shlex.quote(remote))
        post={rel:sha(ssh.open_sftp().open(WEB+'/'+rel,'rb').read()) for rel in FILES}
        http_js=run(ssh,"curl -fsS --max-time 8 http://127.0.0.1:88/assets/js/admin.js | sha256sum").split()[0]
        result={'at':datetime.now(timezone.utc).isoformat(),'backup':BACKUP,'stage':STAGE,'candidate_hashes':candidate_hashes,'post_hashes':post,'probe':probe_result,'http_js_sha256':http_js,'result':'DEPLOY_VERIFIED' if post==candidate_hashes and http_js==candidate_hashes['assets/js/admin.js'] else 'HOLD'}
        (LOCAL/'deploy.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
