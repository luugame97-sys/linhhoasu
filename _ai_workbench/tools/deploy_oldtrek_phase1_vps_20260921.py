"""Deploy OldTrek phase-1 gate/checkpoint fix with CAS, backup and read-only smoke."""
import base64
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    ('linhhoasu/lhs/newServer/src/handlers/old-trek.js', '/linhhoasu/lhs/newServer/src/handlers/old-trek.js'),
]
EXPECTED = {
    '/linhhoasu/lhs/newServer/src/handlers/old-trek.js': '9a4e83e34a3ee597a826090d706cf5c4d8e84a8a2962fa68bd74d5eced81789b',
}
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
READY = [8080, 8083, 8084, 8085, 8086]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def remote_hash(ssh, path):
    out = run(ssh, f'sha256sum {shlex.quote(path)} 2>/dev/null || true').strip()
    return out.split()[0] if out else None

def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_phase1_deploy_{stamp}'
    stage = f'/tmp/oldtrek_phase1_{stamp}'
    report = {'at': datetime.now().isoformat(), 'backup': backup, 'stage': stage,
              'productionWrites': 0, 'playerWrites': 0, 'files': [], 'nodes': []}
    ssh = connect()
    sftp = ssh.open_sftp()
    try:
        run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(stage)}')
        for local_rel, remote in FILES:
            local = ROOT / local_rel
            before = remote_hash(ssh, remote)
            report['files'].append({'path': remote, 'before': before, 'expectedBefore': EXPECTED[remote], 'candidate': sha(local)})
            if before != EXPECTED[remote]:
                raise RuntimeError(f'CAS_PRECONDITION_FAILED:{remote}:{before}')
            backup_file = f'{backup}/{Path(remote).name}.bak'
            run(ssh, f'cp -p {shlex.quote(remote)} {shlex.quote(backup_file)}')
            staged = f'{stage}/{Path(remote).name}'
            sftp.put(str(local), staged)
            staged_hash = remote_hash(ssh, staged)
            if staged_hash != sha(local):
                raise RuntimeError(f'STAGE_HASH_FAILED:{remote}')
            run(ssh, f'node --check {shlex.quote(staged)}')
            # Atomic same-filesystem replacement after the fresh CAS check.
            current = remote_hash(ssh, remote)
            if current != EXPECTED[remote]:
                raise RuntimeError(f'CAS_DRIFT_BEFORE_SWAP:{remote}:{current}')
            run(ssh, f'mv -f {shlex.quote(staged)} {shlex.quote(remote)}')
            after = remote_hash(ssh, remote)
            if after != sha(local):
                raise RuntimeError(f'LIVE_HASH_FAILED:{remote}:{after}')
            report['files'][-1].update({'backup': backup_file, 'after': after})

        run(ssh, 'node --check /linhhoasu/lhs/newServer/src/handlers/old-trek.js')
        for node in NODES:
            run(ssh, f'pm2 restart {shlex.quote(node)}')
            time.sleep(2)
            status = json.loads(run(ssh, "pm2 jlist"))
            row = next((x for x in status if x.get('name') == node), None)
            if not row or row.get('pm2_env', {}).get('status') != 'online':
                raise RuntimeError(f'PM2_NOT_ONLINE:{node}')
            report['nodes'].append({'name': node, 'status': row['pm2_env']['status'], 'pid': row.get('pid'),
                                    'restart': row.get('pm2_env', {}).get('restart_time')})

        probe = r'''
const s=require('/linhhoasu/lhs/newServer/src/services/OldTrekScheduleService');
const h=require('/linhhoasu/lhs/newServer/src/handlers/old-trek');
const p={userId:'oldtrek_phase1_live_probe',playerId:'oldtrek_phase1_live_probe',name:'phase1',level:100,currencies:{gold:0,silver:0,diamond:0},items:{321:1000},other_attr_info:{}};
const i=h.ensureOldTrekInfo(p), q=s.getSchedule(); console.log(JSON.stringify({schedule:q,info:{stage:i.stage,revision:i.stateRevision,sailing:i.sailing},validations:{stage:q.stage===2,depart:q.isDepartAllowed===true,handler:typeof h.handleOldTrekAction==='function',revision:Number.isInteger(i.stateRevision)}}));
'''
        raw = run(ssh, 'node -e ' + shlex.quote(probe))
        result = json.loads(raw[raw.index('{'):])
        report['probe'] = result
        if not all(result['validations'].values()):
            raise RuntimeError('PROBE_FAILED')
        run(ssh, f'rm -rf {shlex.quote(stage)}')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        sftp.close()
        ssh.close()

if __name__ == '__main__':
    main()
