"""Deploy event contract behind disabled feature flag; no player mutation."""
import hashlib, json, shlex, sys, time
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/lhs/newServer/src/handlers/old-trek.js'
REMOTE = '/linhhoasu/lhs/newServer/src/handlers/old-trek.js'
EXPECTED_BEFORE = '3d5afc1b3338fd68cffca8d1da7c7be694dd2a43f25ea25983402b40c4819d35'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
READY = [8080, 8083, 8084, 8085, 8086]

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def rh(ssh, path):
    out = run(ssh, f'sha256sum {shlex.quote(path)} 2>/dev/null || true').strip()
    return out.split()[0] if out else None

def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_phase3_event_contract_{stamp}'
    stage = f'/tmp/oldtrek_phase3_{stamp}'
    candidate = sha(LOCAL)
    ssh = connect(); sftp = ssh.open_sftp()
    report = {'at': datetime.now().isoformat(), 'backup': backup, 'candidate': candidate,
              'featureFlag': 'OLD_TREK_EVENT_ENGINE_ENABLED is not set/0', 'productionWrites': 0, 'playerWrites': 0}
    try:
        before = rh(ssh, REMOTE)
        if before != EXPECTED_BEFORE: raise RuntimeError(f'CAS_PRECONDITION_FAILED:{before}')
        run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(stage)} && cp -p {shlex.quote(REMOTE)} {shlex.quote(backup)}/old-trek.js.bak')
        staged = f'{stage}/old-trek.js'; sftp.put(str(LOCAL), staged)
        if rh(ssh, staged) != candidate: raise RuntimeError('STAGE_HASH_FAILED')
        run(ssh, f'node --check {shlex.quote(staged)}')
        if rh(ssh, REMOTE) != EXPECTED_BEFORE: raise RuntimeError('CAS_DRIFT_BEFORE_SWAP')
        run(ssh, f'mv -f {shlex.quote(staged)} {shlex.quote(REMOTE)}')
        if rh(ssh, REMOTE) != candidate: raise RuntimeError('LIVE_HASH_FAILED')
        report['liveHash'] = rh(ssh, REMOTE)
        report['nodes'] = []
        for node in NODES:
            run(ssh, f'pm2 restart {node}'); time.sleep(2)
            rows = json.loads(run(ssh, 'pm2 jlist')); row = next(x for x in rows if x.get('name') == node)
            if row.get('pm2_env', {}).get('status') != 'online': raise RuntimeError(f'PM2_NOT_ONLINE:{node}')
            report['nodes'].append({'name': node, 'pid': row.get('pid'), 'restart': row.get('pm2_env', {}).get('restart_time')})
        probe = r'''const h=require('/linhhoasu/lhs/newServer/src/handlers/old-trek');const p={userId:'phase3_probe',playerId:'phase3_probe',name:'phase3',level:100,items:{321:1000},currencies:{gold:0,silver:0,diamond:0},other_attr_info:{}};const i=h.ensureOldTrekInfo(p);console.log(JSON.stringify({engineFlag:String(process.env.OLD_TREK_EVENT_ENGINE_ENABLED||''),revision:i.stateRevision,handler:typeof h.handleOldTrekAction==='function',playerWrites:0}));'''
        out = run(ssh, 'node -e ' + shlex.quote(probe)); report['probe'] = json.loads(out[out.index('{'):])
        if report['probe']['engineFlag'] != '': raise RuntimeError('EVENT_ENGINE_FLAG_UNEXPECTEDLY_ENABLED')
        for port in READY:
            code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 8 http://127.0.0.1:{port}/ready").strip()
            if code != '200': raise RuntimeError(f'READY_FAILED:{port}:{code}')
        report['readiness'] = {str(p): 200 for p in READY}
        run(ssh, f'rm -rf {shlex.quote(stage)}')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        sftp.close(); ssh.close()

if __name__ == '__main__': main()
