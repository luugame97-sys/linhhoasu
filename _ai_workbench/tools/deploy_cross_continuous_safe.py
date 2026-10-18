"""Deploy the approved continuous 7-day Cross Rival/CrossArena schedule safely."""
import datetime as dt
import hashlib
import io
import json
import shlex
import time
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json'
OUT = ROOT / '_ai_workbench/temp/cross_continuous_safe_20261003'
OUT.mkdir(parents=True, exist_ok=True)
candidate = LOCAL.read_bytes()
candidate_hash = hashlib.sha256(candidate).hexdigest()
old_hash = 'c18bdb7b0eb37a83ce0658c3eacd0537dc1ecefff3477633eebf55748cd371e4'
stamp = dt.datetime.now().strftime('%Y%m%d_%H%M%S')
remote = '/linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json'
backup = f'/linhhoasu/_ai_workbench/backups/cross_continuous_safe_{stamp}'

def sha(data):
    return hashlib.sha256(data).hexdigest()

with connect() as client:
    # Preflight and non-overwriting backup.
    current = client.open_sftp().open(remote, 'rb').read()
    if sha(current) != old_hash:
        raise RuntimeError(f'CAS_MISMATCH:{sha(current)}')
    mkdir_cmd = f"install -d -m 700 {shlex.quote(backup)}"
    run(client, mkdir_cmd)
    sftp = client.open_sftp()
    with sftp.open(f'{backup}/crossServerEventSchedule.json', 'wb') as handle:
        handle.write(current)
    with sftp.open(f'{backup}/preflight.json', 'wb') as handle:
        handle.write(json.dumps({
            'at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'remote': remote,
            'oldSha256': old_hash,
            'candidateSha256': candidate_hash,
            'candidate': json.loads(candidate.decode('utf-8-sig')),
        }, ensure_ascii=False, indent=2).encode())
    sftp.chmod(f'{backup}/crossServerEventSchedule.json', 0o600)
    sftp.chmod(f'{backup}/preflight.json', 0o600)
    stage = f'{remote}.stage_{stamp}'
    with sftp.open(stage, 'wb') as handle:
        handle.write(candidate)
    sftp.chmod(stage, 0o640)
    sftp.close()
    stage_js = json.dumps(stage)
    run(client, f"node -e 'const fs=require(\"fs\");const x=JSON.parse(fs.readFileSync({stage_js},\"utf8\"));if(!x.enabled||x.periodDays!==7||JSON.stringify(x.rotation)!==JSON.stringify([\"crossRival\"])||!x.independent?.crossArena||x.independent.crossArena.periodDays!==7)process.exit(2)' ")
    run(client, f"test \"$(sha256sum {shlex.quote(remote)} | awk '{{print $1}}')\" = {old_hash}")
    run(client, f"mv -f -- {shlex.quote(stage)} {shlex.quote(remote)}")
    after_hash = run(client, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
    if after_hash != candidate_hash:
        raise RuntimeError(f'POST_HASH_MISMATCH:{after_hash}')

    # Restart only game nodes, one at a time, and wait for each readiness endpoint.
    ports = {f'lhs-s100{i}': 8080 if i == 1 else 8080 + i for i in range(1, 8)}
    # Actual configured ports are 8080, 8083..8088.
    ports = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084,
             'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087,
             'lhs-s1007': 8088}
    restarts = []
    for name, port in ports.items():
        run(client, f"pm2 restart {shlex.quote(name)} --update-env >/dev/null",)
        ready = False
        last = ''
        for _ in range(60):
            last = run(client, f"curl -sS --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
            try:
                body = json.loads(last)
                ready = body.get('status') == 'ok' and body.get('mongo') is True and body.get('redis') is True
            except Exception:
                ready = False
            if ready:
                break
            time.sleep(1)
        if not ready:
            raise RuntimeError(f'READINESS_FAILED:{name}:{last[:500]}')
        restarts.append({'name': name, 'port': port, 'ready': True})

    runtime = json.loads(run(client, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const a=JSON.parse(s).filter(x=>/^lhs-s100[1-7]$/.test(x.name));console.log(JSON.stringify(a.map(x=>({name:x.name,status:x.pm2_env.status,pid:x.pid,restarts:x.pm2_env.restart_time,cross:x.pm2_env.env.CROSS_EVENT_ENABLED||\"\"}))))})'"))
    cycle = json.loads(run(client, "node -e 'const s=require(\"/linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json\"),D=86400000,n=Date.now(),a=Date.parse(s.anchor),i=Math.floor((n-a)/(s.periodDays*D)); const c={crossRival:{index:i,event:s.rotation[i%s.rotation.length]},crossArena:{index:Math.floor((n-Date.parse(s.independent.crossArena.anchor))/(s.independent.crossArena.periodDays*D)),event:\"crossArena\"}}; console.log(JSON.stringify({rotation:s.rotation,periodDays:s.periodDays,graceMs:s.settlementGraceMs,cycles:c}))'"))
    result = {'result': 'DEPLOYED_VERIFIED', 'backup': backup, 'candidateSha256': candidate_hash,
              'oldSha256': old_hash, 'restarts': restarts, 'runtime': runtime, 'cycle': cycle}
    (OUT / 'deployment.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
