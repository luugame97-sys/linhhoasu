"""Finalize read-back for the Homeland dependency publication."""
import hashlib
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/missing_homeland_guard_20261017'
RECEIPT = OUT / 'deployment.json'
REMOTE = '/linhhoasu/webgame/game/js/lhs-homeland-guard-v1.js'
INDEX = '/linhhoasu/webgame/game/index.html'


def rh(client, path):
    return run(client, 'sha256sum ' + shlex.quote(path)).split()[0]


def main():
    receipt = json.loads(RECEIPT.read_text(encoding='utf-8'))
    with connect() as client:
        live = rh(client, REMOTE)
        backup_index = rh(client, receipt['backup'] + '/index.html')
        index = rh(client, INDEX)
        public = run(client, 'curl -fsS --connect-timeout 3 --max-time 15 https://linhhoasu.lol/js/lhs-homeland-guard-v1.js?v=20261017_homeland_guard | sha256sum').split()[0]
        if live != receipt['candidate'] or public != receipt['candidate']:
            raise RuntimeError('HOMELAND_HASH_MISMATCH')
        index_text = run(client, 'cat ' + shlex.quote(INDEX)).replace('\r', '')
        refs = list(dict.fromkeys(re.findall(r'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"', index_text)))
        missing = []
        for ref in refs:
            path = ref.split('?', 1)[0]
            code = run(client, 'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 10 https://linhhoasu.lol/' + shlex.quote(path)).strip()
            if code != '200':
                missing.append({'path': path, 'http': code})
        if missing:
            raise RuntimeError('REFERENCED_SCRIPT_GAPS:' + json.dumps(missing, ensure_ascii=False))
        receipt.update({
            'status': 'DEPLOYED', 'result': 'PASS', 'targetAfter': live,
            'publicHash': public, 'indexAfter': index,
            'backupIndexHash': backup_index, 'referencedScripts': len(refs),
            'missingReferencedScripts': missing,
            'verifiedAt': datetime.now(timezone.utc).isoformat(),
        })
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
