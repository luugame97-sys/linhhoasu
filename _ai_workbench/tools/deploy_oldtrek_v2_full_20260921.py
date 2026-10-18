"""Deploy full OldTrek v2 candidate with CAS, backup, rolling restart and readiness."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu/lhs/newServer'
FILES = ['src/handlers/old-trek.js', 'src/handlers/index.js', 'src/app.js', 'src/services/PlayerService.js',
         'src/services/RechargeRewardResolver.js', 'src/services/RechargeBenefitService.js', 'src/handlers/recharge.js',
         'src/handlers/compat.js', 'ecosystem.config.js', 'src/services/OldTrekPassService.js',
         'src/services/OldTrekLedgerService.js', 'src/services/OldTrekEventService.js', 'src/services/OldTrekProgressService.js',
         'src/services/OldTrekArenaService.js', 'src/services/OldTrekPuzzleService.js', 'src/services/OldTrekScheduleService.js',
         'src/services/OldTrekSettlementService.js', 'src/config/oldTrekGameplayPolicy.json']
BASELINE = {
 'src/handlers/old-trek.js':'9b4cda8aa0efa0bfe678c2f56457740275a3684ce405117ce3d0097e059031d7',
 'src/handlers/index.js':'68493a0e6542f527e9383d42ecb4a4fd298de4624b37d4f4776933d8a6aa0c7b',
 'src/app.js':'66c20b49656fdc1461cad92afd835115a05a5c06d458d2dde90b2f95e48e4bfc',
 'src/services/PlayerService.js':'08cbef51f43e27dd03dac8670501f200ea059d8d1b2aa308a63548c5e8347e87',
 'src/services/RechargeRewardResolver.js':'d54222a3d52f3f6e057a7d38b81b9e580b4ce2fd2e666a50af0abb960abf337e',
'src/services/RechargeBenefitService.js':'71dce3fe541dab948fd7194fbf20ceeb6df264c60f0cde05b7593ff753c52c6d',
 'src/handlers/recharge.js':'c88e6852df7ad112dc8aceb2d9b200c3fddc79ae994c1d2031f6862916fbfb19',
 'src/handlers/compat.js':'adc70ada84957e3f417143396fa00ccab46f2883d1433923590f8538f04eb8ad',
 'ecosystem.config.js':'b443a55f4a6692583f8973a57279fa465b015903b2abe686d71551f2e2766df0',
 'src/services/OldTrekScheduleService.js':'0f86a90b2775ed9f00e492534e21fc502c17c8bac11c15841bee9e92461ef2fd'}
def sha_bytes(data): return hashlib.sha256(data).hexdigest()
def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_v2_full_{stamp}'
    stage = f'/tmp/oldtrek_v2_full_{stamp}'
    ssh = connect(); sftp = ssh.open_sftp()
    report = {'at': datetime.now(timezone.utc).isoformat(), 'backup': backup, 'productionWrites': 0, 'playerWrites': 0, 'restarts': 0, 'files': []}
    try:
        run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(stage)}')
        for rel in FILES:
            local = (ROOT / 'linhhoasu/lhs/newServer' / rel).read_bytes(); remote = REMOTE + '/' + rel
            try: before = sha_bytes(sftp.open(remote, 'rb').read())
            except FileNotFoundError: before = None
            if rel in BASELINE and before != BASELINE[rel]: raise RuntimeError(f'CAS:{rel}:{before}')
            if rel not in BASELINE and before is not None: raise RuntimeError(f'NEW_FILE_EXISTS:{rel}:{before}')
            if before is not None: run(ssh, f'cp -p {shlex.quote(remote)} {shlex.quote(backup + "/" + rel.replace("/", "_"))}')
            staged = stage + '/' + rel; run(ssh, 'mkdir -p ' + shlex.quote(staged.rsplit('/', 1)[0])); sftp.put(str(ROOT / 'linhhoasu/lhs/newServer' / rel), staged)
            if sha_bytes(sftp.open(staged, 'rb').read()) != sha_bytes(local): raise RuntimeError('STAGE_HASH:' + rel)
            if rel.endswith('.js'): run(ssh, 'node --check ' + shlex.quote(staged))
            run(ssh, 'mv -f ' + shlex.quote(staged) + ' ' + shlex.quote(remote))
            if sha_bytes(sftp.open(remote, 'rb').read()) != sha_bytes(local): raise RuntimeError('LIVE_HASH:' + rel)
            report['files'].append({'path': rel, 'before': before, 'after': sha_bytes(local)})
        run(ssh, 'node --check ' + REMOTE + '/src/handlers/old-trek.js && node --check ' + REMOTE + '/src/app.js')
        for node in ['lhs-s1001','lhs-s1002','lhs-s1003','lhs-s1004','lhs-s1005']:
            run(ssh, f'OLD_TREK_EVENT_ENGINE_ENABLED=1 OLD_TREK_SETTLEMENT_ENABLED=1 OLD_TREK_SETTLEMENT_ACTIVATION_AT=1789956000000 pm2 restart {node} --update-env'); time.sleep(2)
            rows = json.loads(run(ssh, 'pm2 jlist')); row = next(x for x in rows if x.get('name') == node)
            if row.get('pm2_env', {}).get('status') != 'online': raise RuntimeError('PM2:' + node)
            report['restarts'] += 1
        report['readiness'] = {}
        for port in [8080,8083,8084,8085,8086]:
            code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 8 http://127.0.0.1:{port}/ready").strip(); report['readiness'][str(port)] = int(code)
            if code != '200': raise RuntimeError('READY:' + str(port))
        run(ssh, 'rm -rf ' + shlex.quote(stage))
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        sftp.close(); ssh.close()
if __name__ == '__main__': main()
