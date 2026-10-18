"""Deploy the reviewed forge candidate with exact-hash CAS and rolling readiness."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shlex
import sys
import time
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '_ai_workbench/temp/artifact_forge_20261013/baseline'
CAND = ROOT / '_ai_workbench/temp/artifact_forge_20261013/candidate'
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)

REMOTE_ROOT = helper.REMOTE_ROOT
NODES = helper.NODES
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = f'/linhhoasu/_ai_workbench/backups/artifact_forge_fix_20261013_{STAMP}'
STAGE = f'/linhhoasu/_ai_workbench/temp/artifact_forge_fix_20261013_{STAMP}'
EXPECTED_LIVE = {
    'server/artifact.js': 'a7ed535cb4b4a5d533b198656b3a1287e369ff642895efc2bdabafe26255ead9',
    'server/WSServer.js': '211e17b92653d183242d8801aa1f90fabd7886272fa65deec6d05c17497d9b63',
    'client/lhs-artifact-forge-v1.js': '0ea98f96953a71b438e83fec3ef7dc406ea319a0f01e1896bfa06fb0ab0a1bee',
    'client/index.html': '1c0a94c4b5adb0643224ddfa99873de52ce00b42c0394092a8f045b99c4f54f4',
}

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def q(value): return shlex.quote(value)

def main():
    ssh = helper.connect()
    changed_nodes = []
    event = {'startedAt': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionFileWrites': 0, 'playerWrites': 0, 'backup': BACKUP}
    files = [
        ('server/artifact.js', CAND / 'artifact.js', BASE / 'artifact.js', REMOTE_ROOT + '/src/handlers/artifact.js'),
        ('server/WSServer.js', CAND / 'WSServer.js', BASE / 'WSServer.js', REMOTE_ROOT + '/src/net/WSServer.js'),
        ('client/lhs-artifact-forge-v1.js', CAND / 'lhs-artifact-forge-v1.js', None, '/linhhoasu/webgame/game/js/lhs-artifact-forge-v1.js'),
        ('client/index.html', CAND / 'index.html', BASE / 'index.html', '/linhhoasu/webgame/game/index.html'),
    ]
    try:
        helper.run(ssh, 'install -d -m 700 -- ' + q(BACKUP) + ' ' + q(STAGE))
        event['pre'] = {'processes': helper.procs(ssh), 'ready': {name: helper.ready(ssh, port) for name, port in NODES}}
        if len(event['pre']['processes']) != 8 or any(row.get('status') != 'online' for row in event['pre']['processes']): raise RuntimeError('PROCESS_BASELINE')
        if any(value != '200' for value in event['pre']['ready'].values()): raise RuntimeError('READY_BASELINE')
        staged = {}
        for rel, local, expected_local, target in files:
            if expected_local and digest(local) == digest(expected_local):
                raise RuntimeError('CANDIDATE_EQUALS_BASELINE:' + rel)
            expected = EXPECTED_LIVE.get(rel)
            if expected:
                actual = helper.rh(ssh, target)
                if actual != expected: raise RuntimeError(f'CAS:{target}:{actual}:{expected}')
            else:
                actual = helper.run(ssh, 'test ! -e ' + q(target) + ' && echo ABSENT || sha256sum -- ' + q(target) + " | awk '{print $1}'").strip()
                if actual != 'ABSENT': raise RuntimeError(f'NEW_TARGET_EXISTS:{target}:{actual}')
            staged_path = STAGE + '/' + rel.replace('/', '_')
            with ssh.open_sftp() as sf: sf.put(str(local), staged_path)
            candidate_hash = digest(local)
            if helper.rh(ssh, staged_path) != candidate_hash: raise RuntimeError('STAGE_HASH:' + rel)
            staged[rel] = {'target': target, 'candidate': candidate_hash, 'expected': expected, 'stage': staged_path}
            if expected:
                backup_path = BACKUP + '/' + rel.replace('/', '_')
                helper.run(ssh, 'cp -p -- ' + q(target) + ' ' + q(backup_path))
                if helper.rh(ssh, backup_path) != staged[rel]['expected']: raise RuntimeError('BACKUP_HASH:' + rel)
        event['staged'] = staged
        for rel, row in staged.items():
            if rel.endswith('.js'):
                helper.run(ssh, 'node --check ' + q(row['stage']), 30)
            if helper.rh(ssh, row['target']) != row['expected']: raise RuntimeError('PREINSTALL_CAS:' + rel)
        # Publish only server files first, then restart each node and verify.
        for rel in ['server/artifact.js', 'server/WSServer.js']:
            row = staged[rel]
            if row['candidate'] == row['expected']: continue
            if helper.rh(ssh, row['target']) != row['expected']: raise RuntimeError('PUBLISH_CAS:' + rel)
            tmp = row['target'] + '.artifact_forge_20261013.tmp'
            helper.run(ssh, 'cp -- ' + q(row['stage']) + ' ' + q(tmp))
            helper.run(ssh, 'chmod --reference=' + q(row['target']) + ' ' + q(tmp) + ' && chown --reference=' + q(row['target']) + ' ' + q(tmp))
            if helper.rh(ssh, tmp) != row['candidate']: raise RuntimeError('TEMP_HASH:' + rel)
            helper.run(ssh, 'mv -f -- ' + q(tmp) + ' ' + q(row['target']))
            event['productionFileWrites'] += 1
            if helper.rh(ssh, row['target']) != row['candidate']: raise RuntimeError('FINAL_HASH:' + rel)
        event['serverHashes'] = {rel: helper.rh(ssh, staged[rel]['target']) for rel in ['server/artifact.js', 'server/WSServer.js']}
        for name, port in NODES:
            changed_nodes.append((name, port))
            helper.run(ssh, 'pm2 restart ' + q(name), 120)
            deadline = time.time() + 90; code = '000'
            while time.time() < deadline:
                code = helper.ready(ssh, port)
                if code == '200': break
                time.sleep(1)
            if code != '200': raise RuntimeError(f'READY:{name}:{code}')
            print(json.dumps({'node': name, 'ready': code}), flush=True)
        syntax = helper.run(ssh, 'node --check ' + q(staged['server/artifact.js']['target']) + ' && node --check ' + q(staged['server/WSServer.js']['target']), 60)
        event['syntax'] = 'PASS'
        # Publish shared client after every server is ready.
        for rel in ['client/lhs-artifact-forge-v1.js', 'client/index.html']:
            row = staged[rel]; target = row['target']; tmp = target + '.artifact_forge_20261013.tmp'
            if row['candidate'] == row['expected']: continue
            if helper.rh(ssh, target) != row['expected']: raise RuntimeError('PUBLISH_CAS:' + rel)
            helper.run(ssh, 'cp -- ' + q(row['stage']) + ' ' + q(tmp))
            if rel.endswith('index.html'): helper.run(ssh, 'chmod --reference=' + q(target) + ' ' + q(tmp) + ' && chown --reference=' + q(target) + ' ' + q(tmp))
            else: helper.run(ssh, 'chmod 640 ' + q(tmp) + ' && chown root:www ' + q(tmp))
            if helper.rh(ssh, tmp) != row['candidate']: raise RuntimeError('CLIENT_TEMP_HASH:' + rel)
            helper.run(ssh, 'mv -f -- ' + q(tmp) + ' ' + q(target))
            event['productionFileWrites'] += 1
            if helper.rh(ssh, target) != row['candidate']: raise RuntimeError('CLIENT_FINAL_HASH:' + rel)
        event['clientHashes'] = {rel: helper.rh(ssh, staged[rel]['target']) for rel in ['client/lhs-artifact-forge-v1.js', 'client/index.html']}
        event['post'] = {'processes': helper.procs(ssh), 'ready': {name: helper.ready(ssh, port) for name, port in NODES}}
        if any(value != '200' for value in event['post']['ready'].values()): raise RuntimeError('POST_READY')
        event['served'] = {rel: helper.run(ssh, 'set -o pipefail; curl -fsS --max-time 30 ' + q('https://linhhoasu.lol/' + ('js/lhs-artifact-forge-v1.js' if rel.endswith('.js') else 'index.html')) + " | sha256sum | awk '{print $1}'", 40).strip() for rel in ['client/lhs-artifact-forge-v1.js', 'client/index.html']}
        for rel, served_hash in event['served'].items():
            if served_hash != staged[rel]['candidate']: raise RuntimeError('SERVED_HASH:' + rel)
        event['result'] = 'PASS'; event['completedAt'] = datetime.now(timezone.utc).isoformat()
        (OUT / 'deploy.json').write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (OUT / ('deploy-' + STAMP + '.json')).write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'result': 'PASS', 'backup': BACKUP, 'serverHashes': event['serverHashes'], 'clientHashes': event['clientHashes'], 'served': event['served'], 'ready': event['post']['ready'], 'productionFileWrites': event['productionFileWrites'], 'playerWrites': 0}, ensure_ascii=False), flush=True)
    except Exception as error:
        event['error'] = str(error); event['rollbackAttempted'] = True
        # Restore only targets that were published, guarded by candidate hash.
        for rel in ['server/artifact.js', 'server/WSServer.js', 'client/index.html', 'client/lhs-artifact-forge-v1.js']:
            row = locals().get('staged', {}).get(rel)
            if not row or not row['expected'] or row['candidate'] == row['expected']: continue
            try:
                if helper.rh(ssh, row['target']) == row['candidate']:
                    backup_path = BACKUP + '/' + rel.replace('/', '_')
                    helper.run(ssh, 'cp -- ' + q(backup_path) + ' ' + q(row['target'] + '.artifact_forge_rollback.tmp'))
                    helper.run(ssh, 'chmod --reference=' + q(row['target']) + ' ' + q(row['target'] + '.artifact_forge_rollback.tmp') + ' && chown --reference=' + q(row['target']) + ' ' + q(row['target'] + '.artifact_forge_rollback.tmp'))
                    helper.run(ssh, 'mv -f -- ' + q(row['target'] + '.artifact_forge_rollback.tmp') + ' ' + q(row['target']))
            except Exception as rollback_error: event.setdefault('rollbackErrors', []).append(str(rollback_error))
        for name, _port in changed_nodes:
            try: helper.run(ssh, 'pm2 restart ' + q(name), 120)
            except Exception as restart_error: event.setdefault('rollbackErrors', []).append(str(restart_error))
        (OUT / 'deploy.json').write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        raise
    finally:
        try: helper.run(ssh, 'rm -rf -- ' + q(STAGE), 30)
        except Exception: pass
        ssh.close()

if __name__ == '__main__': main()
