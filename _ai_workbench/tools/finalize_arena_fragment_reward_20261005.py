"""Finalize/re-verify a staged Arena reward deployment after upload succeeded."""
import hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'arena_fragment_ticket_20261005'
WORK = OUT / 'remote_candidate'
STAGE = '/linhhoasu/_ai_workbench/temp/arena_fragment_reward_20261005_20261005_104537_stage'
BACKUP = '/linhhoasu/_ai_workbench/backups/arena_fragment_reward_20261005_20261005_104537_pre'
FILES = [
    ('lhs_e5.bin', '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'),
    ('lhs_fashion.bin', '/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'),
    ('web_e5.bin', '/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
    ('web_fashion.bin', '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'),
    ('index.html', '/linhhoasu/webgame/game/index.html'),
]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088]
PROCS = [f'lhs-s{sid}' for sid in range(1001, 1008)]

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def ready(s):
    out = {}
    for port in PORTS:
        obj = json.loads(run(s, f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready'))
        out[str(port)] = {'http': 200, 'status': obj.get('status'), 'mongo': obj.get('checks', {}).get('mongo'), 'redis': obj.get('checks', {}).get('redis')}
    return out

def main():
    result = {'startedAt': datetime.now(timezone.utc).isoformat(), 'backup': BACKUP, 'stage': STAGE, 'scope': 'ArenaBaseConfig.arenaReward[item7] 2->20', 'realPlayerWrites': 0, 'restarted': []}
    with connect() as s:
        for name, remote in FILES:
            expected = sha(WORK / name)
            actual = run(s, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
            if actual != expected: raise RuntimeError(f'CURRENT_HASH_MISMATCH:{name}:{actual}:{expected}')
        for proc, port in zip(PROCS, PORTS):
            run(s, f'pm2 restart {shlex.quote(proc)} --update-env')
            result['restarted'].append(proc); time.sleep(1)
            run(s, f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready >/dev/null')
        result['readiness'] = ready(s)
        runtime = run(s, "cd /linhhoasu/lhs/newServer && node - <<'NODE'\nconst c=require('./src/services/ConfigService'); c.reload(); const a=c.get('ArenaBaseConfig'); const x=a.arenaReward.map(s=>s.find(r=>Number(r.id)===7).count); if(JSON.stringify(x)!==JSON.stringify([20,20,20,20])) process.exit(21); console.log(JSON.stringify({item7:x}));\nNODE").splitlines()[-1]
        result['runtimeConfig'] = json.loads(runtime)
        result['publicFashionSha256'] = run(s, "curl -fsS --max-time 15 http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin | sha256sum | awk '{print $1}'").strip()
        result['publicIndexHasVersion'] = '20261005_arena_fragment_reward_v1' in run(s, "curl -fsS --max-time 15 http://127.0.0.1:81/index.html")
        result['result'] = 'DEPLOY_VERIFIED' if all(v['http'] == 200 and v['status'] == 'ok' and v['mongo'] is True and v['redis'] is True for v in result['readiness'].values()) and result['publicIndexHasVersion'] else 'HOLD'
    result['finishedAt'] = datetime.now(timezone.utc).isoformat()
    (OUT / 'deployment.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
if __name__ == '__main__': main()
