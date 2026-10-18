"""Deploy pet-core validation/atomicity fix with CAS, canary and rollback."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/lhs/newServer/src/handlers/pet.js'
REMOTE = '/linhhoasu/lhs/newServer/src/handlers/pet.js'
BEFORE = '224a0fda10f9aaf219a99aa588f1349bb2f7e6672352c4cc39d3b675e79789d8'
NODES = [('lhs-s1002', 8083), ('lhs-s1001', 8080), ('lhs-s1003', 8084), ('lhs-s1004', 8085), ('lhs-s1005', 8086)]

def sha(b): return hashlib.sha256(b).hexdigest()

def main():
    payload = LOCAL.read_bytes(); after = sha(payload)
    if after == BEFORE: raise RuntimeError('LOCAL_CANDIDATE_EQUALS_BASELINE')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/pet_core_fix_20260923_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/pet_core_fix_20260923_{stamp}/pet.js'
    report = {'at': datetime.now(timezone.utc).isoformat(), 'status': 'STARTED', 'backup': backup, 'stage': stage, 'directPlayerWrites': 0, 'file': {'path': REMOTE, 'before': BEFORE, 'after': after}, 'restarts': []}
    ssh = connect(); swapped = False; restarted = []
    try:
        with ssh.open_sftp() as sf:
            current = sf.open(REMOTE, 'rb').read(); current_hash = sha(current)
            if current_hash != BEFORE: raise RuntimeError('REMOTE_CAS_DRIFT:' + current_hash)
            run(ssh, 'mkdir -p ' + shlex.quote(backup) + ' ' + shlex.quote(stage.rsplit('/', 1)[0]))
            with sf.open(backup + '/pet.js.before', 'wb') as f: f.write(current)
            with sf.open(stage, 'wb') as f: f.write(payload)
            run(ssh, 'chmod 644 ' + shlex.quote(stage)); run(ssh, 'node --check ' + shlex.quote(stage))
            if sha(sf.open(backup + '/pet.js.before', 'rb').read()) != BEFORE: raise RuntimeError('BACKUP_HASH_MISMATCH')
            if sha(sf.open(stage, 'rb').read()) != after: raise RuntimeError('STAGE_HASH_MISMATCH')
            if sha(sf.open(REMOTE, 'rb').read()) != BEFORE: raise RuntimeError('PRE_SWAP_CAS_DRIFT')
            sf.posix_rename(stage, REMOTE); swapped = True
            if sha(sf.open(REMOTE, 'rb').read()) != after: raise RuntimeError('LIVE_HASH_MISMATCH')
        for name, port in NODES:
            run(ssh, 'pm2 restart ' + shlex.quote(name) + ' --update-env'); restarted.append(name); report['restarts'].append(name)
            code = ''
            for _ in range(20):
                code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == '200': break
                time.sleep(2)
            report.setdefault('readiness', {})[str(port)] = code
            if code != '200': raise RuntimeError('READY_FAILED:' + name)
        status_js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))));"
        report['processes'] = json.loads(run(ssh, 'pm2 jlist | node -e ' + shlex.quote(status_js)))
        if any(p.get('status') != 'online' for p in report['processes']): raise RuntimeError('NODE_NOT_ONLINE')
        run(ssh, 'pm2 save'); report['status'] = 'DEPLOYED'
    except Exception as e:
        report['error'] = str(e); report['status'] = 'FAILED'
        if swapped:
            try:
                run(ssh, 'cp -p ' + shlex.quote(backup + '/pet.js.before') + ' ' + shlex.quote(REMOTE))
                for name, _port in NODES:
                    try: run(ssh, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                    except Exception: pass
                report['rollback'] = 'restored_and_restarted'
            except Exception as re: report['rollbackError'] = str(re)
        raise
    finally:
        try: run(ssh, 'rm -f -- ' + shlex.quote(stage))
        except Exception: pass
        ssh.close()
        out = ROOT / '_ai_workbench/temp/pet_core_fix_20260923/release.json'; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'); print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)

if __name__ == '__main__': main()
