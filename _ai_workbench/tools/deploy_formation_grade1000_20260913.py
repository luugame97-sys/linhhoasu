"""Deploy FormationGradeConfig 1..1000 to server and client with CAS."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / '_ai_workbench' / 'temp' / 'formation_grade1000_20260913'
OUT = STAGE
REMOTE_ROOT = '/linhhoasu'
BACKUP = REMOTE_ROOT + '/_ai_workbench/backups/formation_grade1000_20260913_pre'
FILES = {
    'lhs/update/resource/assets/excel/config_e5ac72c2.bin': STAGE / 'server.next.bin',
    'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin': STAGE / 'client.next.bin',
    'webgame/game/update/resource/assets/excel/config_fashion_20260909.bin': STAGE / 'client-fashion.next.bin',
    'webgame/game/index.html': STAGE / 'index.next.html',
}
EXPECTED = {
    'lhs/update/resource/assets/excel/config_e5ac72c2.bin': '6e357dfc321709aa0fcd8cdcb36e624522d1aa65fb71abd0e711c3f209d03fd6',
    'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin': '9a405adfbd064e74afaf25819b005d826590fdbbed31542f8653b013c6111c7b',
    'webgame/game/update/resource/assets/excel/config_fashion_20260909.bin': 'd8991c2ce6d16f8e92cf87fe7ee7e6c26a3c503dde5ed0f227eefc4a2126b420',
    'webgame/game/index.html': '1c8113173e11801c594b7a42950a9abf47044be848e4fa64f9daff167606926f',
}
PROCS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = {'1001': 8080, '1002': 8083, '1003': 8084}

def sha(data): return hashlib.sha256(data).hexdigest()
def rp(rel): return REMOTE_ROOT + '/' + rel

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cand = {rel: {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size} for rel, path in FILES.items()}
    ssh = connect(); ev = {'startedAt': datetime.now(timezone.utc).isoformat(), 'scope': 'FormationGradeConfig grades 1-1000', 'files': [], 'restarted': []}
    try:
        if run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && echo yes || echo no').strip() != 'no': raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                data = sftp.open(rp(rel), 'rb').read(); actual = sha(data)
                if actual != EXPECTED[rel]: raise RuntimeError(f'CAS_MISMATCH:{rel}:{actual}:{EXPECTED[rel]}')
                before = OUT / 'remote_before' / rel; before.parent.mkdir(parents=True, exist_ok=True); before.write_bytes(data)
                ev['files'].append({'file': rel, 'remoteBefore': actual, 'localCandidate': cand[rel]['sha256']})
        for rel in FILES:
            dst = BACKUP + '/' + rel
            run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(rp(rel)) + ' ' + shlex.quote(dst))
        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                target = rp(rel); tmp = target + '.formation_grade1000_tmp_20260913'; sftp.put(str(path), tmp)
                if hasattr(sftp, 'posix_rename'): sftp.posix_rename(tmp, target)
                else: sftp.rename(tmp, target)
        js = "const fs=require('fs'),c=require('/linhhoasu/lhs/newServer/src/services/ConfigService'); for(const p of process.argv.slice(1)){const t=c.decodeTables(fs.readFileSync(p)),r=t.FormationGradeConfig;if(!r||Object.keys(r).length!==1000||r[1000].level!==278600||r[1000].exp!==4995)process.exit(2); console.log(p+':'+Object.keys(r).length+':'+r[1000].level+':'+r[1000].exp)}"
        paths = [rp('lhs/update/resource/assets/excel/config_e5ac72c2.bin'), rp('webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'), rp('webgame/game/update/resource/assets/excel/config_fashion_20260909.bin')]
        run(ssh, 'node -e ' + shlex.quote(js) + ' ' + ' '.join(shlex.quote(p) for p in paths))
        for name in PROCS:
            run(ssh, 'pm2 restart ' + shlex.quote(name) + ' --update-env'); ev['restarted'].append(name)
        ev['ready'] = {}
        for sid, port in PORTS.items():
            cmd = f"for i in $(seq 1 12); do c=$(curl -sS --max-time 10 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && echo $c && break; sleep 2; done"
            ev['ready'][sid] = int(run(ssh, cmd).strip())
        ev['processesAfter'] = [{'name':p.get('name'),'pid':p.get('pid'),'status':(p.get('pm2_env') or {}).get('status'),'restarts':(p.get('pm2_env') or {}).get('restart_time')} for p in json.loads(run(ssh,'pm2 jlist')) if p.get('name') in PROCS]
        idx = run(ssh, 'curl -sS --max-time 20 http://127.0.0.1:81/index.html')
        ev['served'] = {
            'indexMarker': '20260913_formation_grade1000_v1' in idx,
            'serverConfigSha256': run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin?v=20260913_formation_grade1000_v1 | sha256sum | awk '{print $1}'").strip(),
            'clientConfigSha256': run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin?v=20260913_formation_grade1000_v1 | sha256sum | awk '{print $1}'").strip(),
            'serverCandidateSha256': cand['webgame/game/update/resource/assets/excel/config_e5ac72c2.bin']['sha256'],
            'clientCandidateSha256': cand['webgame/game/update/resource/assets/excel/config_fashion_20260909.bin']['sha256'],
        }
        ev['recentErrors'] = run(ssh, "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log /root/.pm2/logs/lhs-s1003-error.log; do tail -120 \"$f\" 2>/dev/null | grep -Ei 'Cannot find module|SyntaxError|ReferenceError|uncaughtException|unhandledRejection' || true; done")
        with ssh.open_sftp() as sftp:
            for row in ev['files']: row['remoteAfter'] = sha(sftp.open(rp(row['file']),'rb').read())
    finally: ssh.close()
    ev['finishedAt'] = datetime.now(timezone.utc).isoformat()
    ev['result'] = 'PASS' if ev.get('ready') == {'1001':200,'1002':200,'1003':200} and all(p['status']=='online' for p in ev.get('processesAfter',[])) and ev.get('served',{}).get('indexMarker') and ev.get('served',{}).get('serverConfigSha256') == ev.get('served',{}).get('serverCandidateSha256') and ev.get('served',{}).get('clientConfigSha256') == ev.get('served',{}).get('clientCandidateSha256') and not ev.get('recentErrors') and all(r.get('remoteAfter') == r.get('localCandidate') for r in ev.get('files',[])) else 'HOLD'
    (OUT/'deploy.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'result':ev['result'],'evidence':str(OUT/'deploy.json'),'ready':ev.get('ready'),'restarted':ev.get('restarted')},ensure_ascii=False))

if __name__ == '__main__': main()
