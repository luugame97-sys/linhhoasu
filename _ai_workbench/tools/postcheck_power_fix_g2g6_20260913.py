"""Read-only post-deploy evidence for the scoped power fix."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'power_fix_g2g6_20260913' / 'postcheck.json'
FILES = [
    'lhs/newServer/src/services/BattleService.js',
    'lhs/newServer/src/services/PowerDisplayService.js',
    'lhs/newServer/src/services/NativeBonusService.js',
    'lhs/newServer/src/handlers/playerPayload.js', 'lhs/newServer/src/handlers/basic.js',
    'lhs/newServer/src/handlers/arena.js', 'lhs/newServer/src/handlers/chat.js',
    'lhs/newServer/src/handlers/activity.js', 'lhs/newServer/src/handlers/cross-rival.js',
    'lhs/newServer/src/handlers/farm.js', 'lhs/newServer/src/handlers/guild.js',
    'lhs/newServer/src/handlers/island.js', 'lhs/newServer/src/handlers/temple.js',
    'lhs/newServer/src/handlers/dungeon.js', 'lhs/newServer/src/handlers/tower.js',
    'webgame/game/index.html', 'webgame/game/js/lhs-power-display-v1.js',
]


def main():
    evidence = {'readOnly': True, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'files': []}
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                data = sftp.open('/linhhoasu/' + rel, 'rb').read()
                evidence['files'].append({'file': rel, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        evidence['processes'] = [
            {'name': p.get('name'), 'pid': p.get('pid'), 'status': (p.get('pm2_env') or {}).get('status'), 'restarts': (p.get('pm2_env') or {}).get('restart_time')}
            for p in json.loads(run(ssh, 'pm2 jlist')) if p.get('name') in ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
        ]
        evidence['ready'] = {str(port): int(run(ssh, f"curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()) for port in [8080, 8083, 8084]}
        index = run(ssh, 'curl -sS --max-time 15 http://127.0.0.1:81/index.html')
        evidence['served'] = {
            'indexMarker': '20260913_power_display_v2' in index,
            'hudHttp': int(run(ssh, "curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-power-display-v1.js").strip()),
            'hudSha256': run(ssh, "curl -sS --max-time 15 http://127.0.0.1:81/js/lhs-power-display-v1.js | sha256sum | awk '{print $1}'").strip(),
        }
        evidence['errorMarkers'] = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -300 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module.*(PowerDisplay|NativeBonus)|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
    finally:
        ssh.close()
    evidence['result'] = 'PASS' if evidence['ready'] == {'8080': 200, '8083': 200, '8084': 200} and all(p['status'] == 'online' for p in evidence['processes']) and evidence['served']['indexMarker'] and evidence['served']['hudHttp'] == 200 and not evidence['errorMarkers'] else 'HOLD'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'result': evidence['result'], 'evidence': str(OUT), 'ready': evidence['ready'], 'served': evidence['served']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
