"""Deploy the scoped Artifact/Valhalla release with CAS, backup and rollback.

Scope is deliberately narrower than the full day1 plan:
  - FEATURE_UNLOCK_DAY1_SCOPE=artifact,valhalla
  - FEATURE_SIDE_TASK_ROOTS=90002,90020
No player/DB mutation is performed by this runner.
"""
import hashlib
import json
import posixpath
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
OUT = WB / 'temp' / 'feature_unlock_release_20260917'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pm2_state(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: p for p in rows}


def short_state(rows):
    return {n: {'pid': rows[n]['pid'], 'status': rows[n]['pm2_env']['status'],
                'restarts': rows[n]['pm2_env']['restart_time']} for n in NODES}


def remote_sha(sftp, path):
    try:
        return sha(sftp.open(path, 'rb').read())
    except FileNotFoundError:
        return None


def ready(ssh):
    return {str(port): run(ssh, 'curl -s --max-time 8 -o /dev/null -w %{http_code} '
                            + shlex.quote(f'http://127.0.0.1:{port}/ready')).strip()
            for port in PORTS.values()}


def patch_ecosystem(data):
    text = data.decode('utf-8')
    if 'FEATURE_UNLOCK_DAY1_ENABLED' in text:
        raise RuntimeError('ECOSYSTEM_FEATURE_FLAG_ALREADY_PRESENT')
    for sid in (1001, 1002, 1003, 1004):
        pattern = re.compile(r'(?m)^(\s*)SERVER_ID:\s*' + str(sid) + r',\s*$')
        matches = list(pattern.finditer(text))
        if len(matches) != 1:
            raise RuntimeError(f'ECOSYSTEM_SERVER_ID_ANCHOR_{sid}:{len(matches)}')
        indent = matches[0].group(1)
        insert = (
            matches[0].group(0) + '\n'
            + indent + "FEATURE_UNLOCK_DAY1_ENABLED: '1',\n"
            + indent + "FEATURE_UNLOCK_DAY1_SCOPE: 'artifact,valhalla',\n"
            + indent + "FEATURE_SIDE_TASKS_ENABLED: '1',\n"
            + indent + "FEATURE_SIDE_TASK_ROOTS: '90002,90020',"
        )
        text = text[:matches[0].start()] + insert + text[matches[0].end():]
        # Recalculate later anchors after each insertion.
    return text.encode('utf-8')


def main():
    stage = json.loads((OUT / 'stage.json').read_text(encoding='utf-8'))
    baseline = json.loads((OUT / 'baseline.json').read_text(encoding='utf-8'))
    changed = stage['files']
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/feature_artifact_valhalla_{stamp}'
    remote_stage = stage['stage']
    evidence = {
        'at': datetime.now(timezone.utc).isoformat(), 'status': 'PREPARING',
        'backup': backup, 'stage': remote_stage, 'scope': ['artifact', 'valhalla'],
        'roots': [90002, 90020], 'productionWrites': 0, 'playerWrites': 0,
        'files': {}, 'restarts': [], 'before': {}, 'after': {},
    }
    ssh = connect()
    installed = []
    try:
        processes = pm2_state(ssh)
        if any(n not in processes or processes[n]['pm2_env']['status'] != 'online' for n in NODES):
            raise RuntimeError('GAME_NODE_NOT_READY_BEFORE_DEPLOY')
        before_ready = ready(ssh)
        if any(v != '200' for v in before_ready.values()):
            raise RuntimeError('READY_NOT_200_BEFORE_DEPLOY:' + json.dumps(before_ready))
        evidence['before'] = short_state(processes)
        evidence['beforeReady'] = before_ready
        with ssh.open_sftp() as sftp:
            ecosystem = sftp.open(APP + '/ecosystem.config.js', 'rb').read()
            ecosystem_sha = sha(ecosystem)
            new_ecosystem = patch_ecosystem(ecosystem)
            evidence['ecosystemBefore'] = ecosystem_sha
            evidence['ecosystemAfter'] = sha(new_ecosystem)
            run(ssh, 'install -d -m 700 ' + shlex.quote(backup + '/files'))
            run(ssh, 'install -d -m 700 ' + shlex.quote(remote_stage + '/release'))
            # Refresh CAS immediately before any write.
            for rel, row in changed.items():
                target = row['path']
                actual = remote_sha(sftp, target)
                if actual != row['before']:
                    raise RuntimeError('LIVE_CAS_DRIFT:' + target + ':' + str(actual) + ':' + str(row['before']))
                evidence['files'][target] = {'before': actual, 'candidate': row['sha256'], 'backup': None}
                safe_name = target.strip('/').replace('/', '__')
                backup_file = backup + '/files/' + safe_name
                if actual is None:
                    run(ssh, 'touch ' + shlex.quote(backup_file + '.absent'))
                    evidence['files'][target]['backup'] = backup_file + '.absent'
                else:
                    run(ssh, 'cp -p -- ' + shlex.quote(target) + ' ' + shlex.quote(backup_file))
                    if remote_sha(sftp, backup_file) != actual:
                        raise RuntimeError('BACKUP_HASH_MISMATCH:' + target)
                    evidence['files'][target]['backup'] = backup_file
            eco_backup = backup + '/files/linhhoasu__lhs__newServer__ecosystem.config.js'
            run(ssh, 'cp -p -- ' + shlex.quote(APP + '/ecosystem.config.js') + ' ' + shlex.quote(eco_backup))
            if remote_sha(sftp, eco_backup) != ecosystem_sha:
                raise RuntimeError('ECOSYSTEM_BACKUP_HASH_MISMATCH')
            evidence['ecosystemBackup'] = eco_backup
            # Install all staged files only after every CAS/backup passed.
            for rel, row in changed.items():
                target = row['path']
                source = remote_stage + '/' + rel
                run(ssh, 'install -d -m 750 ' + shlex.quote(posixpath.dirname(target)))
                run(ssh, 'cp -p -- ' + shlex.quote(source) + ' ' + shlex.quote(target))
                if remote_sha(sftp, target) != row['sha256']:
                    raise RuntimeError('INSTALL_HASH_MISMATCH:' + target)
                installed.append(target)
            eco_temp = remote_stage + '/release/ecosystem.config.js'
            with sftp.open(eco_temp, 'wb') as handle:
                handle.write(new_ecosystem)
            run(ssh, 'mv -f -- ' + shlex.quote(eco_temp) + ' ' + shlex.quote(APP + '/ecosystem.config.js'))
            if remote_sha(sftp, APP + '/ecosystem.config.js') != sha(new_ecosystem):
                raise RuntimeError('ECOSYSTEM_INSTALL_HASH_MISMATCH')
        evidence['status'] = 'FILES_INSTALLED'
        (OUT / 'deploy_artifact_valhalla_prepare.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        # Restart only the four game processes. Bot/admin/dist are untouched.
        for node in NODES:
            env_prefix=("FEATURE_UNLOCK_DAY1_ENABLED=1 FEATURE_UNLOCK_DAY1_SCOPE=artifact,valhalla "
                        "FEATURE_SIDE_TASKS_ENABLED=1 FEATURE_SIDE_TASK_ROOTS=90002,90020 ")
            run(ssh, env_prefix + 'pm2 restart ' + shlex.quote(node) + ' --update-env')
            evidence['restarts'].append(node)
        run(ssh, 'pm2 save', timeout=60)
        processes_after = pm2_state(ssh)
        after_ready = ready(ssh)
        evidence['after'] = short_state(processes_after)
        evidence['afterReady'] = after_ready
        flags = {node: {k: processes_after[node]['pm2_env'].get(k) for k in (
            'FEATURE_UNLOCK_DAY1_ENABLED','FEATURE_UNLOCK_DAY1_SCOPE','FEATURE_SIDE_TASKS_ENABLED','FEATURE_SIDE_TASK_ROOTS')}
                for node in NODES}
        evidence['flags'] = flags
        if any(v != '200' for v in after_ready.values()):
            raise RuntimeError('READY_NOT_200_AFTER_DEPLOY:' + json.dumps(after_ready))
        if any(processes_after[n]['pm2_env']['status'] != 'online' for n in NODES):
            raise RuntimeError('GAME_NODE_NOT_ONLINE_AFTER_DEPLOY')
        if any(flags[n]['FEATURE_UNLOCK_DAY1_ENABLED'] not in ('1', 1) or
               flags[n]['FEATURE_UNLOCK_DAY1_SCOPE'] != 'artifact,valhalla' or
               flags[n]['FEATURE_SIDE_TASKS_ENABLED'] not in ('1', 1) or
               flags[n]['FEATURE_SIDE_TASK_ROOTS'] != '90002,90020' for n in NODES):
            raise RuntimeError('FEATURE_FLAGS_NOT_LOADED')
        evidence['status'] = 'DEPLOYED_SCOPED'
        evidence['processesUnchangedOutsideGameNodes'] = all(
            n not in NODES and evidence['before'].get(n) == evidence['after'].get(n)
            for n in set(evidence['before']) | set(evidence['after']) if n.startswith('lhs-')
        )
        out = OUT / ('deploy_artifact_valhalla_' + stamp + '.json')
        out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': evidence['status'], 'backup': backup, 'evidence': str(out),
                          'ready': after_ready, 'restarts': evidence['restarts'], 'productionWrites': 0}, ensure_ascii=False))
    except Exception:
        evidence['status'] = 'ROLLING_BACK'
        try:
            with ssh.open_sftp() as sftp:
                for target in reversed(installed):
                    safe_name = target.strip('/').replace('/', '__')
                    source = backup + '/files/' + safe_name
                    run(ssh, 'cp -p -- ' + shlex.quote(source) + ' ' + shlex.quote(target))
                eco_backup = evidence.get('ecosystemBackup')
                if eco_backup:
                    run(ssh, 'cp -p -- ' + shlex.quote(eco_backup) + ' ' + shlex.quote(APP + '/ecosystem.config.js'))
            for node in NODES:
                env_prefix=("FEATURE_UNLOCK_DAY1_ENABLED=0 FEATURE_UNLOCK_DAY1_SCOPE= "
                            "FEATURE_SIDE_TASKS_ENABLED=0 FEATURE_SIDE_TASK_ROOTS= ")
                run(ssh, env_prefix + 'pm2 restart ' + shlex.quote(node) + ' --update-env')
            evidence['status'] = 'ROLLED_BACK'
        finally:
            out = OUT / ('deploy_artifact_valhalla_failed_' + stamp + '.json')
            out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
