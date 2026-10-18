"""Exact rollback of the rejected 00:58:32Z pet release; no player writes."""
import json
import shlex
import time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
from deploy_pet_vusa_port_fast_20260929 import BEFORE, AFTER, NODES

ROOT = Path(__file__).resolve().parents[2]
BACKUP = '/linhhoasu/_ai_workbench/backups/pet_vusa_port_20260929_20260929_005832'
OUT = ROOT / '_ai_workbench/temp/pet_vusa_port_20260929/rollback.json'
INDEX = '/linhhoasu/webgame/game/index.html'

def main():
    report = {'status': 'STARTED', 'backup': BACKUP, 'restored': [], 'restarts': [], 'playerWrites': 0, 'additiveFilesRetained': True}
    ssh = connect()
    try:
        js = r"""
const fs=require('fs'),crypto=require('crypto');
const before=BEFORE_JSON,after=AFTER_JSON,backup=BACKUP_JSON;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h] of Object.entries(before)) {
  if(!p.startsWith('/linhhoasu/'))throw Error('SCOPE');
  if(hash(backup+p)!==h)throw Error('BACKUP_DRIFT:'+p);
  if(![h,after[p]].includes(hash(p)))throw Error('LIVE_DRIFT:'+p);
}
console.log('ROLLBACK_PREFLIGHT_PASS');
""".replace('BEFORE_JSON', json.dumps(BEFORE)).replace('AFTER_JSON', json.dumps(AFTER)).replace('BACKUP_JSON', json.dumps(BACKUP))
        print(run(ssh, 'node -', js), flush=True)
        for remote in [INDEX] + [p for p in BEFORE if p != INDEX]:
            temp = remote + '.pet-rollback-20260929'
            command = ('set -eu; test ! -e ' + shlex.quote(temp)
                       + '; cp -p -- ' + shlex.quote(BACKUP+remote) + ' ' + shlex.quote(temp)
                       + '; mv -f -- ' + shlex.quote(temp) + ' ' + shlex.quote(remote))
            run(ssh, command)
            report['restored'].append(remote)
        print('SOURCE_RESTORED', flush=True)
        for name, port in NODES:
            run(ssh, 'pm2 restart ' + shlex.quote(name))
            ready = False
            for _ in range(15):
                code = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:"+str(port)+"/ready || true").strip()
                if code == '200':
                    ready = True
                    break
                time.sleep(1)
            report['restarts'].append({'name':name,'ready':ready})
            OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
            print(name, 'READY' if ready else 'FAILED', flush=True)
            if not ready:
                raise RuntimeError('RESTORED_NODE_NOT_READY:'+name)
        probe = "const fs=require('fs'),c=require('crypto');const rows="+json.dumps(BEFORE)+";for(const [p,h] of Object.entries(rows)){if(c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)throw Error('RESTORE_HASH:'+p)}console.log('ALL_ORIGINAL_HASHES_PASS')"
        print(run(ssh,'node -',probe),flush=True)
        report['status']='ROLLED_BACK_HASHES_READY_PASS'
    except Exception as exc:
        report['status']='ROLLBACK_NEEDS_ATTENTION'
        report['error']=str(exc)
        raise
    finally:
        ssh.close()
        OUT.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')

if __name__ == '__main__':
    main()
