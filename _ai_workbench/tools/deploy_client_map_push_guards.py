import getpass, hashlib, os, posixpath
from datetime import datetime, timezone
import paramiko

HOST='103.116.105.154'; LOCAL_ROOT=r'I:\Linhhoasu\server\server\linhhoasu\webgame\game'; REMOTE_ROOT='/linhhoasu/webgame/game'
MAIN_REL='js/main.min_a6195824.js'; INDEX_REL='index.html'
EXPECTED='bc58aa68eb3e7ce687a8355fadb67c51a8cc4d350214b693e9d6128b52cf1cf7'
OLD=b'20260830_freeze_guard4'; NEW=b'20260830_freeze_guard5'; stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
def sha(x): return hashlib.sha256(x).hexdigest()
def read(p):
    with open(p,'rb') as f:return f.read()
def run(s,c,check=True):
    _,o,e=s.exec_command(c);t=o.read().decode('utf8','replace');code=o.channel.recv_exit_status()
    if check and code: raise RuntimeError(f'command failed {code}: '+e.read().decode('utf8','replace')[-3000:])
    return t
main=read(os.path.join(LOCAL_ROOT,MAIN_REL.replace('/',os.sep))); index=read(os.path.join(LOCAL_ROOT,INDEX_REL))
if b'if(!l||!l.GetEntity)return' not in main or NEW not in index: raise RuntimeError('local guard payload missing')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    rm=f'{REMOTE_ROOT}/{MAIN_REL}';ri=f'{REMOTE_ROOT}/{INDEX_REL}';sf=s.open_sftp()
    try:
        with sf.open(rm,'rb') as f:om=f.read()
        with sf.open(ri,'rb') as f:oi=f.read()
    finally:sf.close()
    if sha(om)!=EXPECTED:raise RuntimeError('remote main precondition failed '+sha(om))
    if OLD not in oi or NEW in oi:raise RuntimeError('remote index precondition failed')
    ni=oi.replace(OLD,NEW);backup=f'/linhhoasu/_ai_workbench/backups/client_map_push_before_{stamp}';run(s,f'mkdir -p {backup}')
    mt=f'{rm}.deploy-{stamp}.js';it=f'{ri}.deploy-{stamp}.html';sf=s.open_sftp()
    try:
        with sf.open(posixpath.join(backup,'main.min_a6195824.js'),'wb') as f:f.write(om)
        with sf.open(posixpath.join(backup,'index.html'),'wb') as f:f.write(oi)
        with sf.open(mt,'wb') as f:f.write(main)
        with sf.open(it,'wb') as f:f.write(ni)
    finally:sf.close()
    run(s,f'node --check {mt}');run(s,f'mv {mt} {rm}; mv {it} {ri}; chmod 644 {rm} {ri}')
    print('BACKUP='+backup);print('REMOTE_MAIN_HASH='+run(s,f'sha256sum {rm}|cut -d" " -f1').strip());print('REMOTE_INDEX_HASH='+run(s,f'sha256sum {ri}|cut -d" " -f1').strip());print('SERVED_MARKER='+run(s,"curl -sS http://127.0.0.1:81/index.html|grep -o '20260830_freeze_guard5'|head -1||true",False).strip())
finally:s.close()
