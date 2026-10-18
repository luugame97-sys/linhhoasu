"""Scoped power-display baseline helper. No production writes in snapshot mode."""
import hashlib
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'power_display_20260913'
FILES = [
    'webgame/game/index.html', 'webgame/game/js/main.min_a6195824.js',
    'webgame/game/js/lhs-power-relogin-v1.js',
    'lhs/newServer/src/handlers/basic.js', 'lhs/newServer/src/handlers/playerPayload.js',
    'lhs/newServer/src/handlers/arena.js', 'lhs/newServer/src/handlers/chat.js',
    'lhs/newServer/src/handlers/guild.js', 'lhs/newServer/src/services/BotPopulationService.js',
    'lhs/newServer/src/services/ArenaReadModelService.js',
    'lhs/newServer/src/services/BattleService.js', 'lhs/newServer/src/net/WSServer.js',
]

def snapshot():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'baseline.json'
    if manifest_path.exists():
        raise RuntimeError('BASELINE_ALREADY_EXISTS_DO_NOT_OVERWRITE')
    ssh = connect()
    try:
        rows = []
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                target = OUT / 'baseline' / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                sftp.get('/linhhoasu/' + rel, str(target))
                local = ROOT / 'linhhoasu' / rel
                rows.append({'file': rel, 'remote': hashlib.sha256(target.read_bytes()).hexdigest(),
                             'local': hashlib.sha256(local.read_bytes()).hexdigest()})
        script = '''const cp=require('child_process');const a=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));console.log(JSON.stringify(a.map(x=>({name:x.name,pid:x.pid,restarts:x.pm2_env.restart_time,status:x.pm2_env.status,cwd:x.pm2_env.pm_cwd}))))'''
        result = {'readOnly': True, 'at': run(ssh, "date -u '+%FT%TZ'"),
                  'files': rows, 'processes': json.loads(run(ssh, 'node -', script))}
        manifest_path.write_text(json.dumps(result, indent=2), encoding='utf8')
        print(json.dumps({'baseline': str(manifest_path), 'files': len(rows),
                          'mismatches': [r['file'] for r in rows if r['local'] != r['remote']],
                          'processes': result['processes']}))
    finally:
        ssh.close()

if __name__ == '__main__':
    snapshot()
