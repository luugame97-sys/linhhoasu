"""Publish only the legacy chest client routes after isolated contract checks."""
import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
WEB = '/linhhoasu/webgame/game'
ADDON = WEB + '/js/lhs-select-legacy-boxes-v1.js'
INDEX = WEB + '/index.html'
OLD = {
    ADDON: '0cdc79c560f083b2c74692c616c4b6950e503d031df76317946b36815770cb30',
    INDEX: '3f432914bf4f4480a668a96a4ecb301e6b0a93a6b6e88f561b02371ab71e883b',
}
OUT = ROOT / '_ai_workbench/temp/remaining_boxes_20261014/client_deployment.json'
TEST = (ROOT / '_ai_workbench/tools/test_select_addon_20261014.js').read_text(encoding='utf-8')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    report = {'playerWrites': 0, 'files': {}, 'restarts': []}
    swapped = []
    with connect() as client:
        sftp = client.open_sftp()
        def read(path):
            with sftp.open(path, 'rb') as f:
                return f.read()
        def write(path, data, stat):
            with sftp.open(path, 'wb') as f:
                f.write(data)
            sftp.chmod(path, stat.st_mode & 0o777)
            sftp.chown(path, stat.st_uid, stat.st_gid)
            if sha(read(path)) != sha(data):
                raise RuntimeError('WRITE_HASH:' + path)
        def check(output):
            result = next(json.loads(line.split('=', 1)[1]) for line in output.splitlines()
                          if line.startswith('SELECT_ADDON_RESULT='))
            assert result['randomRoutes'] == 26 and result['selectionCases'] == 30
            assert result['rewardCount'] == 10 and result['networkAttempts'] == result['writeAttempts'] == 0
            return result
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup = '/linhhoasu/_ai_workbench/backups/remaining_boxes_client_' + stamp
        stages = {p: p + '.legacy_' + stamp + ('.js' if p == ADDON else '.html') for p in OLD}
        try:
            before = {p: read(p) for p in OLD}
            for p, data in before.items():
                assert sha(data) == OLD[p], 'CAS_PREFLIGHT:' + p
            needle = b'lhs-select-legacy-boxes-v1.js?v=20261014_select_legacy_boxes_v1'
            assert before[INDEX].count(needle) == 1
            payloads = {
                ADDON: (ROOT / 'linhhoasu/webgame/game/js/lhs-select-legacy-boxes-v1.js').read_bytes(),
                INDEX: before[INDEX].replace(needle, b'lhs-select-legacy-boxes-v1.js?v=20261014_legacy_boxes_v2'),
            }
            # Reconstruct the first release's index preimage and verify its exact
            # recorded hash before filling its missing selective rollback file.
            original_index = before[INDEX].replace(b'\t\t"js/' + needle + b'",\n', b'')
            assert sha(original_index) == '58c0b214a9fefae472dc0e020ef59e1789fb55e329a66e9358ebaa5f90162828'
            old_index_backup = '/linhhoasu/_ai_workbench/backups/remaining_boxes_20261014_213404/index.html'
            try:
                assert sha(read(old_index_backup)) == sha(original_index)
            except FileNotFoundError:
                write(old_index_backup, original_index, sftp.stat(INDEX))
            report['firstReleaseIndexBackupVerified'] = True
            run(client, 'mkdir -m 700 -- ' + shlex.quote(backup))
            report['backupDir'] = backup
            for p, data in payloads.items():
                old_path = backup + '/' + Path(p).name
                run(client, 'cp -p -- ' + shlex.quote(p) + ' ' + shlex.quote(old_path))
                assert sha(read(old_path)) == OLD[p]
                write(stages[p], data, sftp.stat(p))
                report['files'][p] = {'before': OLD[p], 'after': sha(data)}
            run(client, 'node --check ' + shlex.quote(stages[ADDON]))
            source = "globalThis.ADDON_SOURCE=require('fs').readFileSync(" + json.dumps(stages[ADDON]) + ",'utf8');\n" + TEST
            report['preSwapTest'] = check(run(client, 'node -', source))
            for p in OLD:
                assert sha(read(p)) == OLD[p], 'CAS_BEFORE_SWAP:' + p
            for p in OLD:
                run(client, 'mv -f -- ' + shlex.quote(stages[p]) + ' ' + shlex.quote(p))
                swapped.append(p)
                assert sha(read(p)) == report['files'][p]['after']
            report['postLiveTest'] = check(run(client, 'node -', TEST))
            # Hash the actual HTTP bytes; curl errors cannot become empty hashes.
            report['served'] = {}
            for p, url in [(ADDON, 'https://linhhoasu.lol/js/lhs-select-legacy-boxes-v1.js?v=20261014_legacy_boxes_v2'),
                           (INDEX, 'https://linhhoasu.lol/?legacy_boxes_verify=' + stamp)]:
                command = 'python3 -c ' + shlex.quote(
                    'import subprocess,hashlib; data=subprocess.check_output(['
                    "'curl','-fsS','--max-time','20'," + repr(url) + ']); print(hashlib.sha256(data).hexdigest())')
                actual = run(client, command).strip()
                assert actual == report['files'][p]['after'], 'SERVED_HASH:' + p + ':' + actual
                report['served'][p] = actual
            report['result'] = 'DEPLOYED'
        except Exception as error:
            report['result'] = 'FAILED'
            report['error'] = str(error)
            for p in reversed(swapped):
                assert sha(read(p)) == report['files'][p]['after'], 'ROLLBACK_CAS:' + p
                rollback = p + '.rollback_' + stamp
                run(client, 'cp -p -- ' + shlex.quote(backup + '/' + Path(p).name) + ' ' + shlex.quote(rollback))
                run(client, 'mv -f -- ' + shlex.quote(rollback) + ' ' + shlex.quote(p))
                assert sha(read(p)) == OLD[p]
            report['rollback'] = 'RESTORED' if swapped else 'NOT_NEEDED'
            raise
        finally:
            report['at'] = dt.datetime.now(dt.timezone.utc).isoformat()
            OUT.parent.mkdir(parents=True, exist_ok=True)
            OUT.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            for p in stages.values():
                try:
                    sftp.remove(p)
                except FileNotFoundError:
                    pass
            sftp.close()
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
