"""Deploy the scoped Võ Đạo Hội fragment reward change with remote CAS."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '_ai_workbench' / 'temp' / 'arena_fragment_ticket_20261005' / 'remote_candidate'
OUT = ROOT / '_ai_workbench' / 'temp' / 'arena_fragment_ticket_20261005'
REMOTE_APP = '/linhhoasu/lhs/newServer'
REMOTE_GAME = '/linhhoasu/webgame/game'
STAMP = 'arena_fragment_reward_20261005_'
FILES = [
    ('lhs_e5.bin', '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),
    ('lhs_fashion.bin', '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'),
    ('web_e5.bin', '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
    ('web_fashion.bin', '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'),
    ('index.html', '/linhhoasu/webgame/game/index.html'),
]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088]
PROCS = [f'lhs-s{sid}' for sid in range(1001, 1008)]


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    return sha_bytes(path.read_bytes())


def ready(ssh):
    result = {}
    for port in PORTS:
        raw = run(ssh, f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready').strip()
        parsed = json.loads(raw)
        result[str(port)] = {
            'http': 200,
            'status': parsed.get('status'),
            'mongo': parsed.get('checks', {}).get('mongo'),
            'redis': parsed.get('checks', {}).get('redis'),
        }
    return result


def pm2_state(ssh):
    return json.loads(run(ssh, 'pm2 jlist'))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    receipt = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'scope': 'ArenaBaseConfig.arenaReward[item7] 2->20',
        'files': [], 'restarted': [], 'realPlayerWrites': 0,
    }
    with connect() as ssh:
        before_pm2 = pm2_state(ssh)
        receipt['beforePm2'] = [{k: p.get(k) for k in ('name', 'pid', 'pm2_env')} for p in before_pm2 if p.get('name') in PROCS]
        remote_before = {}
        for name, remote in FILES:
            actual = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
            remote_before[remote] = actual
            local = WORK / name
            candidate_hash = sha_file(local)
            receipt['files'].append({'name': name, 'remote': remote, 'beforeSha256': actual,
                                     'candidateSha256': candidate_hash, 'bytes': local.stat().st_size})
        receipt['remoteBefore'] = remote_before
        (OUT / 'deploy_preflight.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

        backup = f'/linhhoasu/_ai_workbench/backups/{STAMP}{datetime.now().strftime("%Y%m%d_%H%M%S")}_pre'
        stage = f'/linhhoasu/_ai_workbench/temp/{STAMP}{datetime.now().strftime("%Y%m%d_%H%M%S")}_stage'
        receipt['backup'] = backup
        receipt['stage'] = stage
        run(ssh, f'mkdir -p {shlex.quote(backup)} {shlex.quote(stage)}')
        with ssh.open_sftp() as sftp:
            for name, remote in FILES:
                local = WORK / name
                staged = f'{stage}/{name}'
                with sftp.open(staged, 'wb') as handle:
                    handle.write(local.read_bytes())
                staged_sha = run(ssh, f"sha256sum {shlex.quote(staged)} | awk '{{print $1}}'").strip()
                if staged_sha != sha_file(local):
                    raise RuntimeError(f'STAGE_HASH_MISMATCH:{name}')

        # Final CAS check before backup/install. No file is changed if any
        # remote preimage moved since the initial inventory.
        for name, remote in FILES:
            actual = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
            if actual != remote_before[remote]:
                raise RuntimeError(f'CAS_MISMATCH:{remote}:{actual}:{remote_before[remote]}')

        for name, remote in FILES:
            backup_file = f'{backup}/{name}'
            run(ssh, f'cp -p {shlex.quote(remote)} {shlex.quote(backup_file)}')
            staged = f'{stage}/{name}'
            temp = remote + '.arena-fragment-reward.tmp'
            run(ssh, f'cp {shlex.quote(staged)} {shlex.quote(temp)} && '
                    f'chown --reference={shlex.quote(remote)} {shlex.quote(temp)} && '
                    f'chmod --reference={shlex.quote(remote)} {shlex.quote(temp)} && '
                    f'mv -f {shlex.quote(temp)} {shlex.quote(remote)}')
            final_sha = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
            expected = sha_file(WORK / name)
            if final_sha != expected:
                raise RuntimeError(f'FINAL_HASH_MISMATCH:{remote}')
            receipt['files'][next(i for i, row in enumerate(receipt['files']) if row['name'] == name)]['afterSha256'] = final_sha

        for proc, port in zip(PROCS, PORTS):
            run(ssh, f'pm2 restart {shlex.quote(proc)} --update-env', timeout=60)
            receipt['restarted'].append(proc)
            time.sleep(1)
            run(ssh, f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready >/dev/null')

        receipt['readiness'] = ready(ssh)
        receipt['runtimeConfig'] = json.loads(run(ssh, "cd /linhhoasu/lhs/newServer && node - <<'NODE'\nconst c=require('./src/services/ConfigService'); c.reload(); const a=c.get('ArenaBaseConfig'); if(!a || JSON.stringify(a.arenaReward.map(s=>s.find(r=>Number(r.id)===7).count)) !== JSON.stringify([20,20,20,20])) process.exit(21); console.log(JSON.stringify({item7:a.arenaReward.map(s=>s.find(r=>Number(r.id)===7).count)}));\nNODE").splitlines()[-1])
        receipt['publicFashionSha256'] = run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin | sha256sum | awk '{print $1}'").strip()
        receipt['publicIndexHasVersion'] = '20261005_arena_fragment_reward_v1' in run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/index.html")
        receipt['afterPm2'] = [{k: p.get(k) for k in ('name', 'pid', 'pm2_env')} for p in pm2_state(ssh) if p.get('name') in PROCS]
        receipt['result'] = 'DEPLOY_VERIFIED' if all(x['http'] == 200 and x['status'] == 'ok' and x['mongo'] is True and x['redis'] is True for x in receipt['readiness'].values()) and receipt['publicIndexHasVersion'] else 'HOLD'
    receipt['finishedAt'] = datetime.now(timezone.utc).isoformat()
    (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
