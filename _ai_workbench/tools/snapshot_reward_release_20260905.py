"""Read-only production snapshot for an isolated, hash-guarded reward candidate."""
import hashlib
import json
import shlex
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from deploy_usable_item_fixes_20260905 import run, pm2_state, health

WB=Path(__file__).resolve().parents[1]
TARGET=WB/'temp/reward_release_20260905'
APP='/linhhoasu/lhs/newServer'
sys.stdout.reconfigure(encoding='utf-8')
assert not TARGET.exists(), 'Candidate already exists; preserve it'
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
files={}
try:
    sftp=ssh.open_sftp()
    def get(remote,relative):
        local=TARGET/relative;local.parent.mkdir(parents=True,exist_ok=True)
        sftp.get(remote,str(local));digest=hashlib.sha256(local.read_bytes()).hexdigest()
        remote_digest=run(ssh,'sha256sum '+shlex.quote(remote)).split()[0]
        assert digest==remote_digest, remote
        files[relative]={'remote':remote,'sha256':digest,'bytes':local.stat().st_size}
    def walk(remote,relative):
        for a in sftp.listdir_attr(remote):
            if stat.S_ISDIR(a.st_mode):walk(remote+'/'+a.filename,relative+'/'+a.filename)
            elif a.filename.endswith(('.js','.json')):get(remote+'/'+a.filename,relative+'/'+a.filename)
    walk(APP+'/src','app/src')
    walk(APP+'/scripts','app/scripts')
    for name in ['package.json','package-lock.json']:get(APP+'/'+name,'app/'+name)
    get('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','config.bin')
    get('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin','lang.bin')
    get('/linhhoasu/webgame/game/js/main.min_a6195824.js','client/main.js')
    get('/linhhoasu/webgame/game/update/resource/assets/code/code_bdbbacd8.bin','client/code.bin')
    sftp.close()
    status={'pm2':pm2_state(ssh),'health':[health(ssh,9200),health(ssh,9201)]}
finally:ssh.close()
manifest={'generatedAt':datetime.now(timezone.utc).isoformat(),'files':files,'status':status,'candidate':str(TARGET)}
(TARGET/'baseline.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'result':'PASS','candidate':str(TARGET),'files':len(files),'status':status},ensure_ascii=False))
