"""Transport/snapshot for the scoped WebGM giftcode release. Never prints secrets."""
import sys, json, hashlib, stat, shlex, time
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/giftcode_bridge_20261010'
REMOTE = '/linhhoasu/_ai_workbench/backups/giftcode_bridge_20261010_164924'
FILES = {
    'config.php': '/linhhoasu/webgame/gm/config.php',
    'reward_delivery.php': '/linhhoasu/webgame/gm/reward_delivery.php',
    'user_api.php': '/linhhoasu/webgame/gm/api/user_api.php',
    'admin_api.php': '/linhhoasu/webgame/gm/admin/admin_api.php',
    'activity.js': '/linhhoasu/lhs/newServer/src/handlers/activity.js',
    'HTTPServer.js': '/linhhoasu/lhs/newServer/src/net/HTTPServer.js',
    'index.html': '/linhhoasu/webgame/game/index.html',
    'admin-users.html': '/linhhoasu/lhs/newServer/admin-users.html',
    'bridge.php': '/linhhoasu/webgame/gm/api/internal_giftcode_claim.php',
    'bridge.js': '/linhhoasu/lhs/newServer/src/services/WebGmGiftcodeBridgeService.js',
}

def connect():
    args, kw = ssh_config()
    assert args[0] == '103.116.104.165'
    s = paramiko.SSHClient(); s.load_system_host_keys()
    s.set_missing_host_key_policy(paramiko.RejectPolicy()); s.connect(*args, **kw)
    return s

def run(s, cmd, body=None, timeout=55):
    i,o,e = s.exec_command(cmd, timeout=timeout)
    if body is not None: i.write(body); i.channel.shutdown_write()
    out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace')
    if o.channel.recv_exit_status(): raise RuntimeError('remote command failed: ' + err[-800:])
    return out

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
    s=connect()
    try:
        mode=sys.argv[1]
        if mode=='snapshot':
            (OUT/'baseline').mkdir(parents=True,exist_ok=True)
            receipt={}
            with s.open_sftp() as sf:
                for key,path in FILES.items():
                    try:
                        a=sf.stat(path)
                        sf.get(path, str(OUT/'baseline'/key))
                    except IOError:
                        receipt[key]={'path':path,'absent':True}; continue
                    data=(OUT/'baseline'/key).read_bytes()
                    receipt[key]={'path':path,'sha256':sha(data),'mode':stat.S_IMODE(a.st_mode),'uid':a.st_uid,'gid':a.st_gid}
                    run(s,'cp -an '+shlex.quote(path)+' '+shlex.quote(REMOTE+'/'+key+'.bridge_baseline'))
            (OUT/'baseline.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
            print(json.dumps(receipt,indent=2))
        elif mode=='run':
            print(run(s,sys.stdin.read()))
        elif mode=='php':
            print(run(s,'cd /linhhoasu/webgame/gm && runuser -u www -- php',sys.stdin.read()))
        elif mode=='node':
            print(run(s,'cd /linhhoasu/lhs/newServer && node',sys.stdin.read()))
        elif mode=='install':
            key,relative=sys.argv[2:4]; baseline=json.loads((OUT/'baseline.json').read_text())
            meta=baseline[key]; path=meta['path']; candidate=ROOT/relative
            with s.open_sftp() as sf:
                before=sf.open(path,'rb').read()
                if sha(before)!=meta['sha256']: raise RuntimeError('CAS mismatch: '+key)
                tmp=path+'.giftbridge.tmp'
                sf.put(str(candidate),tmp)
                sf.chown(tmp,meta['uid'],meta['gid']);sf.chmod(tmp,meta['mode'])
                # Validate staged source before atomic promotion.
                if path.endswith('.php'): run(s,'php -l '+shlex.quote(tmp))
                elif path.endswith('.js'): run(s,'node --check < '+shlex.quote(tmp))
                run(s,'mv -f '+shlex.quote(tmp)+' '+shlex.quote(path))
                after=sf.open(path,'rb').read(); assert sha(after)==sha(candidate.read_bytes())
                meta['installed_sha256']=sha(after)
            install=OUT/'installed.json'; rows=json.loads(install.read_text()) if install.exists() else {}
            rows[key]=meta;install.write_text(json.dumps(rows,indent=2),encoding='utf-8')
            print(key,meta['installed_sha256'])
        elif mode=='upload':
            local,target=sys.argv[2:4]
            assert target.startswith(('/linhhoasu/_ai_workbench/', '/linhhoasu/lhs/newServer/src/services/', '/linhhoasu/webgame/game/js/'))
            with s.open_sftp() as sf:
                try:sf.stat(target);raise RuntimeError('Target already exists')
                except FileNotFoundError:pass
                sf.put(str(ROOT/local),target);sf.chmod(target,0o644)
            print(target,sha((ROOT/local).read_bytes()))
    finally:s.close()

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8',errors='replace');main()
