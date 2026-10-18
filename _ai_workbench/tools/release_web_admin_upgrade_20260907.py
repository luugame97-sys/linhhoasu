"""Install management UI delta only; no reward config, wallet, or game changes."""
import hashlib,json,posixpath,shlex,stat,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,REMOTE,connect,run
from release_web_multiserver_20260906 import pm2
ROOT=WB/'temp/web_admin_upgrade_20260907';CAND=ROOT/'candidate';STATE=ROOT/'release.json'
FILES=['admin_management.php','web_experience.php','assets/css/web-experience.css','assets/js/web-experience.js','assets/js/admin-management.js','assets/js/admin.js','index.php','login.php','admin/index.php','api/user_api.php','admin/admin_api.php']
def h(b):return hashlib.sha256(b).hexdigest()
def save(s):STATE.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def read(f,p):
    with f.open(p,'rb')as handle:return handle.read()
def replace_config(text):
    needle="function vht6ur_json($status, $message = '', $extra = array()) {"
    if text.count(needle)!=1:raise RuntimeError('CONFIG_SHAPE')
    return text.replace(needle,needle+"\n    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') $message = str_replace('WebGM', 'Web quản lý tài khoản Linh Họa Sư', (string)$message);")
def main():
    sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];ssh=connect();s=json.loads(STATE.read_text())if STATE.exists()else{}
    try:
        if mode=='prepare':
            if s:raise RuntimeError('ALREADY_PREPARED')
            for name in ['backend_tests.json','monitor_tests.json','switch_tests.json']:
                if json.loads((ROOT/name).read_text(encoding='utf-8'))['result']!='PASS':raise RuntimeError('TEST_GATE '+name)
            baseline=json.loads((ROOT/'manifest.json').read_text());stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/web_admin_upgrade_'+stamp
            s={'phase':'preparing','backup':backup,'beforePm2':pm2(ssh),'hashes':{},'baseline':{},'noRewardMutation':True}
            run(ssh,'install -d -m 700 '+backup+'/before '+backup+'/next '+backup+'/ready')
            with ssh.open_sftp()as f:
                for rel in FILES+['config.php']:
                    expected=baseline['configSha256']if rel=='config.php'else baseline['files'].get(rel,{}).get('sha256')
                    try:current=read(f,REMOTE+'/'+rel);a=f.stat(REMOTE+'/'+rel)
                    except FileNotFoundError:current=None;a=None
                    if expected and(current is None or h(current)!=expected):raise RuntimeError('LIVE_DRIFT '+rel)
                    if not expected and current is not None:raise RuntimeError('UNEXPECTED_EXISTING '+rel)
                    for sub in ['before','next','ready']:run(ssh,'install -d -m 700 '+shlex.quote(posixpath.dirname(backup+'/'+sub+'/'+rel)))
                    if current is not None:run(ssh,'cp -p '+shlex.quote(REMOTE+'/'+rel)+' '+shlex.quote(backup+'/before/'+rel));s['baseline'][rel]=h(current)
                    content=replace_config(current.decode()).encode()if rel=='config.php'else(CAND/rel).read_bytes()
                    with f.open(backup+'/next/'+rel,'wb')as out:out.write(content)
                    f.chmod(backup+'/next/'+rel,stat.S_IMODE(a.st_mode)if a else 0o644)
                    if a:f.chown(backup+'/next/'+rel,a.st_uid,a.st_gid)
                    s['hashes'][rel]=h(content)
                    if rel.endswith('.php'):run(ssh,'php -l '+shlex.quote(backup+'/next/'+rel))
                    if rel.endswith('.js'):run(ssh,'node --check '+shlex.quote(backup+'/next/'+rel))
            s['phase']='prepared';save(s)
        elif mode=='deploy':
            if s.get('phase')!='prepared':raise RuntimeError('NOT_PREPARED')
            with ssh.open_sftp()as f:
                for rel,expected in s['baseline'].items():
                    if h(read(f,REMOTE+'/'+rel))!=expected:raise RuntimeError('DRIFT '+rel)
                # Required helpers and assets precede their consumers. Admin API
                # revision rejects old tabs; session lock serializes a switch.
                order=FILES[:6]+['config.php']+FILES[6:]
                for rel in order:
                    ready=s['backup']+'/ready/'+rel
                    run(ssh,'cp -p '+shlex.quote(s['backup']+'/next/'+rel)+' '+shlex.quote(ready))
                    f.posix_rename(ready,REMOTE+'/'+rel)
                    s.setdefault('installed',[]).append(rel);save(s)
            s['phase']='deployed';s['at']=datetime.now(timezone.utc).isoformat();save(s)
        elif mode=='verify':
            if s.get('phase')not in ['deployed','verified']:raise RuntimeError('NOT_DEPLOYED')
            with ssh.open_sftp()as f:
                if any(h(read(f,REMOTE+'/'+rel))!=expected for rel,expected in s['hashes'].items()):raise RuntimeError('HASH_FAILED')
            s['afterPm2']=pm2(ssh)
            if s['beforePm2']!=s['afterPm2']:raise RuntimeError('PM2_CHANGED')
            s['http']={p:run(ssh,'curl -sS --max-time 10 -o /dev/null -w "%{http_code}" '+shlex.quote('http://127.0.0.1:88/'+p)).strip()for p in ['login.php','index.php','admin/index.php','assets/js/admin-management.js','assets/js/web-experience.js','assets/css/web-experience.css']}
            if any(s['http'][p]!='200'for p in ['login.php','assets/js/admin-management.js','assets/js/web-experience.js','assets/css/web-experience.css']):raise RuntimeError('HTTP_FAILED')
            s['ready']={p:run(ssh,'curl -sS --max-time 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:'+str(p)+'/ready').strip()for p in [8080,8083]}
            if any(v!='200'for v in s['ready'].values()):raise RuntimeError('READY_FAILED')
            s['phase']='verified';s['verifiedAt']=datetime.now(timezone.utc).isoformat();save(s)
        else:raise RuntimeError('MODE')
        print(json.dumps({k:v for k,v in s.items()if k not in ['baseline','hashes','beforePm2','afterPm2']},ensure_ascii=False))
    finally:ssh.close()
if __name__=='__main__':main()
