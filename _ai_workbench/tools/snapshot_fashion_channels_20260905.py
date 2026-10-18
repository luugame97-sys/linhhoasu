"""Read-only SSH source/config/catalog snapshot; no game requests or remote files."""
import base64
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko

WB = Path(__file__).resolve().parents[1]
OUT = WB / 'temp' / ('fashion_channels_' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
sys.stdout.reconfigure(encoding='utf-8')

def execute(ssh, command, source):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=60)
    stdin.write(source)
    stdin.channel.shutdown_write()
    data=stdout.read()
    errors=stderr.read()
    code=stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError('Read-only remote script failed (exit %d); no credential output emitted' % code)
    return data

source = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer',files={};
function take(full,rel){const b=fs.readFileSync(full);files[rel]={remote:full,sha256:crypto.createHash('sha256').update(b).digest('hex'),data:b.toString('base64')};}
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&/\.(js|json)$/.test(e.name))take(p,'app/'+path.relative(app,p).split(path.sep).join('/'));}}
walk(app+'/src');
for(const f of ['package.json','package-lock.json'])take(app+'/'+f,'app/'+f);
take('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin','server.bin');
take('/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','client.bin');
take('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin','lang.bin');
take('/linhhoasu/webgame/game/js/main.min_a6195824.js','client/main.js');
take('/linhhoasu/webgame/gm/api/user_api.php','web/user_api.php');
take('/linhhoasu/webgame/gm/assets/item/webshop_catalog.json','web/webshop_catalog.json');
const c=fs.readFileSync('/linhhoasu/webgame/gm/config.php','utf8');
const safe=c.split(/\r?\n/).map(l=>/password|passwd|secret|token|^\$db(?:Host|Port|Name|User|Pass)/i.test(l)?'// [REDACTED_SENSITIVE_LINE]':l).join('\n');
files['web/config.redacted.php']={remote:'/linhhoasu/webgame/gm/config.php',sha256:crypto.createHash('sha256').update(c).digest('hex'),redacted:true,data:Buffer.from(safe).toString('base64')};
console.log(JSON.stringify({generatedAt:new Date().toISOString(),files}));
"""
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
    snapshot=json.loads(execute(ssh,'node -',source))
    OUT.mkdir(parents=True,exist_ok=False)
    for relative,row in snapshot['files'].items():
        target=OUT/relative
        if not target.resolve().is_relative_to(OUT.resolve()):raise RuntimeError('Unsafe snapshot path')
        blob=base64.b64decode(row.pop('data'))
        if not row.get('redacted') and hashlib.sha256(blob).hexdigest()!=row['sha256']:raise RuntimeError('Snapshot hash mismatch')
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(blob)
        local=WB.parent/'linhhoasu/lhs/newServer'/relative.removeprefix('app/')
        row['matchesLocal']=relative.startswith('app/') and local.exists() and hashlib.sha256(local.read_bytes()).hexdigest()==row['sha256']
    web=json.loads(execute(ssh,'php', (WB/'tools/audit_fashion_channels_web_20260905.php').read_text(encoding='utf-8')))
    (OUT/'web_inventory.json').write_text(json.dumps(web,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    snapshot.update(readOnly=True,remoteFilesWritten=0,databaseWrites=0)
    (OUT/'manifest.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'snapshot':str(OUT),'files':len(snapshot['files']),'sourceDifferences':[k for k,v in snapshot['files'].items() if k.startswith('app/') and not v['matchesLocal']], 'webRows':{k:len(v) for k,v in web['tables'].items()},'orderGroups':len(web['orders']),'readOnly':True},ensure_ascii=False))
finally:
    ssh.close()
