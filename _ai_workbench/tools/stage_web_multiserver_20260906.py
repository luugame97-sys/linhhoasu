"""Stage whitelisted PHP source, without live config/env or production writes."""
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import OUT, WB, REMOTE, connect, run


def main():
    ssh = connect()
    stage_file = OUT / 'stage.json'
    if stage_file.exists():
        stage = json.loads(stage_file.read_text())['stage']
    else:
        stage = '/linhhoasu/_ai_workbench/temp/web_multiserver_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    if not stage.startswith('/linhhoasu/_ai_workbench/temp/web_multiserver_'):
        raise RuntimeError('STAGE_PATH_REJECTED')
    result = {'stage': stage, 'liveSourceMutated': False, 'lint': {}, 'hashes': {}}
    try:
        run(ssh, 'install -d -m 700 ' + shlex.quote(stage + '/gm') + ' ' + shlex.quote(stage + '/tools'))
        with ssh.open_sftp() as sftp:
            for source in sorted((OUT / 'candidate').rglob('*')):
                if not source.is_file():
                    continue
                rel = source.relative_to(OUT / 'candidate').as_posix()
                if not source.suffix in ['.php', '.js', '.css']:
                    continue
                if 'config' in rel.lower() or '.env' in rel.lower():
                    raise RuntimeError('CONFIG_MUST_NOT_BE_STAGED')
                dest = stage + '/gm/' + rel
                run(ssh, 'install -d -m 700 ' + shlex.quote(posixpath.dirname(dest)))
                sftp.put(str(source), dest)
                result['hashes'][rel] = hashlib.sha256(source.read_bytes()).hexdigest()
                command = ('php -l ' if source.suffix == '.php' else 'node --check ') if source.suffix in ['.php', '.js'] else None
                if command:
                    result['lint'][rel] = run(ssh, command + shlex.quote(dest)).strip() or 'PASS'
        stage_file.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'stage': stage, 'lintFiles': len(result['lint']), 'liveSourceMutated': False}))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
