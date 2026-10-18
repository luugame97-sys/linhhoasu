"""Deploy urgent power refresh hotfix; narrow files, remote CAS and checks."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'power_hotfix_20260913'
BACKUP = '/linhhoasu/_ai_workbench/backups/power_hotfix_20260913_pre'
FILES = {
  'lhs/newServer/src/net/WSServer.js': 'b4eb1fe1e5a9bc083395e0a3b3bd5ca17db71e2478b13315397d39abc72bc164',
  'webgame/game/js/lhs-power-display-v1.js': '81606c2bc7bafdee5f446ebc4a1eeca37645459af56201602c502cadd4b6e8b1',
}
PROCS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = [8080, 8083, 8084]

def sha(data): return hashlib.sha256(data).hexdigest()

def main():
  OUT.mkdir(parents=True, exist_ok=True)
  ssh = connect(); ev = {'startedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'restarted': []}
  try:
    with ssh.open_sftp() as sftp:
      for rel, expected in FILES.items():
        local = ROOT / 'linhhoasu' / rel
        data = sftp.open('/linhhoasu/' + rel, 'rb').read()
        actual = sha(data)
        if actual != expected: raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{expected}')
        b = OUT / 'remote' / rel; b.parent.mkdir(parents=True, exist_ok=True); b.write_bytes(data)
        ev['files'].append({'file': rel, 'remoteBefore': actual, 'localCandidate': sha(local.read_bytes())})
    run(ssh, 'mkdir -p ' + shlex.quote(BACKUP + '/lhs/newServer/src/net') + ' ' + shlex.quote(BACKUP + '/webgame/game/js'))
    for rel in FILES:
      src = '/linhhoasu/' + rel; dst = BACKUP + '/' + rel
      run(ssh, 'if [ -f ' + shlex.quote(src) + ' ]; then cp -p ' + shlex.quote(src) + ' ' + shlex.quote(dst) + '; fi')
    with ssh.open_sftp() as sftp:
      for rel in FILES:
        local = ROOT / 'linhhoasu' / rel; target = '/linhhoasu/' + rel; temp = target + '.power_hotfix_tmp_20260913'
        sftp.put(str(local), temp)
        if hasattr(sftp, 'posix_rename'): sftp.posix_rename(temp, target)
        else: sftp.rename(temp, target)
    run(ssh, 'node --check /linhhoasu/lhs/newServer/src/net/WSServer.js')
    for proc in PROCS:
      run(ssh, 'pm2 restart ' + proc + ' --update-env'); ev['restarted'].append(proc)
    ev['ready'] = {str(p): int(run(ssh, f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done").strip()) for p in PORTS}
    with ssh.open_sftp() as sftp:
      for row in ev['files']:
        row['remoteAfter'] = sha(sftp.open('/linhhoasu/' + row['file'], 'rb').read())
    ev['served'] = {
      'indexMarker': '20260913_power_display_v2' in run(ssh, 'curl -sS --max-time 15 http://127.0.0.1:81/index.html'),
      'hudHttp': int(run(ssh, "curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:81/js/lhs-power-display-v1.js").strip()),
      'hudSha256': run(ssh, "curl -sS --max-time 15 http://127.0.0.1:81/js/lhs-power-display-v1.js | sha256sum | awk '{print $1}'").strip(),
    }
    ev['processes'] = [{'name': p['name'], 'pid': p.get('pid'), 'status': (p.get('pm2_env') or {}).get('status'), 'restarts': (p.get('pm2_env') or {}).get('restart_time')} for p in json.loads(run(ssh, 'pm2 jlist')) if p.get('name') in PROCS]
    ev['newErrors'] = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module.*(PowerDisplay|NativeBonus)|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
  finally: ssh.close()
  ev['finishedAt'] = datetime.now(timezone.utc).isoformat()
  ev['result'] = 'PASS' if ev.get('ready') == {'8080': 200, '8083': 200, '8084': 200} and all(p['status'] == 'online' for p in ev.get('processes', [])) and ev.get('served', {}).get('indexMarker') and ev.get('served', {}).get('hudHttp') == 200 and ev.get('served', {}).get('hudSha256') == ev['files'][1]['localCandidate'] and not ev.get('newErrors') and all(x['remoteAfter'] == x['localCandidate'] for x in ev.get('files', [])) else 'HOLD'
  path = OUT / 'deploy.json'; path.write_text(json.dumps(ev, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
  print(json.dumps({'result': ev['result'], 'evidence': str(path), 'ready': ev.get('ready'), 'served': ev.get('served')}, ensure_ascii=False))

if __name__ == '__main__': main()
