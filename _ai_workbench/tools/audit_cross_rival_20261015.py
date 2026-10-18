"""Read-only CrossRival audit transport; never writes to the VPS."""
from pathlib import Path
import hashlib
import json
import shlex
import sys

from auction_ops_20261015 import connect, run

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/cross_rival_20261015'
APP = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    client = connect()
    try:
        if sys.argv[1] in ('snapshot', 'snapshot-current', 'snapshot-integration', 'snapshot-native', 'snapshot-deployed'):
            with client.open_sftp() as sftp:
                for relative in sys.argv[2:]:
                    if '..' in relative.split('/') or relative.startswith('/'):
                        raise ValueError(relative)
                    remote = WEB + '/' + relative[4:] if relative.startswith('web/') else APP + '/' + relative
                    folder = {'snapshot': 'baseline', 'snapshot-current': 'baseline-current', 'snapshot-integration': 'baseline-integration', 'snapshot-native': 'baseline-native', 'snapshot-deployed': 'baseline-deployed'}[sys.argv[1]]
                    target = TASK / folder / relative
                    with sftp.open(remote, 'rb') as source:
                        data = source.read()
                    if target.exists() and target.read_bytes() != data:
                        raise RuntimeError('Baseline drift: ' + relative)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    stat = sftp.stat(remote)
                    print(json.dumps({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mtime': stat.st_mtime}))
        elif sys.argv[1] == 'probe':
            source = 'const auditPart=' + json.dumps(sys.argv[4] if len(sys.argv) > 4 else 'all') + ';\n' + Path(sys.argv[2]).read_text(encoding='utf-8')
            output = run(client, 'cd ' + shlex.quote(APP) + " && timeout 50s node - <<'CROSS_RIVAL_AUDIT_NODE'\n" + source + '\nCROSS_RIVAL_AUDIT_NODE', timeout=55)
            TASK.mkdir(parents=True, exist_ok=True)
            output_name = sys.argv[3] if len(sys.argv) > 3 else 'live-audit.json'
            if Path(output_name).name != output_name or not output_name.endswith('.json'):
                raise ValueError('Expected a JSON basename')
            parsed = json.loads(output)
            (TASK / output_name).write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'saved': str(TASK / output_name), 'keys': list(parsed)}, ensure_ascii=False))
        else:
            raise ValueError('Expected snapshot or probe')
    finally:
        client.close()


if __name__ == '__main__':
    main()
