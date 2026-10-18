"""Read back the already-published farm auth guard; never mutates player data."""
import hashlib
import json
import shlex
from pathlib import Path
from urllib.request import Request, urlopen

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/farm_auth_guard_20261017'
RECEIPT = OUT / 'deployment.json'


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def main():
    receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
    candidate = receipt['candidate']
    backup = receipt['backup']
    files = receipt['files']
    remote = '/linhhoasu/webgame/game'
    final = {}
    backup_hashes = {}
    served = {}
    with connect() as client:
        for rel in files:
            target = remote + '/' + rel
            final[rel] = run(client, 'sha256sum ' + shlex.quote(target)).split()[0]
            backup_hashes[rel] = run(client, 'sha256sum ' + shlex.quote(backup + '/' + rel)).split()[0]
            if final[rel] != candidate[rel]:
                raise RuntimeError('LIVE_HASH_MISMATCH:' + rel)
            if backup_hashes[rel] != receipt['before'][rel]:
                raise RuntimeError('BACKUP_HASH_MISMATCH:' + rel)
        run(client, 'node --check ' + shlex.quote(remote + '/js/lhs-farm-alchemy-v2.js'))
        for rel in files:
            url = '/' + rel
            served['127.0.0.1' + url] = run(client, 'curl -fsS --connect-timeout 3 --max-time 8 http://127.0.0.1:81' + shlex.quote(url) + ' | sha256sum').split()[0]
            if served['127.0.0.1' + url] != candidate[rel]:
                raise RuntimeError('LOCAL_HTTP_HASH_MISMATCH:' + rel)
        ready = {}
        for port in [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090]:
            code = run(client, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 8 http://127.0.0.1:' + str(port) + '/ready').strip()
            ready[str(port)] = int(code)
        if any(code != 200 for code in ready.values()):
            raise RuntimeError('READY_GATE:' + json.dumps(ready))
    for rel in files:
        request = Request('https://linhhoasu.lol/' + rel, headers={'Cache-Control': 'no-cache'})
        with urlopen(request, timeout=15) as response:
            body = response.read()
        served['public/' + rel] = sha_bytes(body)
        if served['public/' + rel] != candidate[rel]:
            raise RuntimeError('PUBLIC_HTTP_HASH_MISMATCH:' + rel)
    receipt.update({
        'result': 'PASS', 'status': 'DEPLOYED', 'final': final,
        'backupHashes': backup_hashes, 'served': served, 'ready': ready,
        'verifiedAt': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    })
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
