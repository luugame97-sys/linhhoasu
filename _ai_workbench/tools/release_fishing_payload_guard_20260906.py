"""Stage and release only the missing-fishing-state payload guard, S2 then S1."""
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready, digest

WB = Path(__file__).resolve().parents[1]
ROOT = WB / 'temp/fishing_full_candidate_20260906'
APP = '/linhhoasu/lhs/newServer'
REL = 'src/services/FishingEventSchedule.js'


def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    action = sys.argv[1]
    assert action in ['stage', 'deploy']
    deployed = json.loads((ROOT / 'deploy-full.json').read_text(encoding='utf-8'))
    expected = deployed['expected']
    candidate = ROOT / 'app' / REL
    new_hash = digest(candidate)
    assert new_hash != expected[APP + '/' + REL], 'ALREADY_INSTALLED_OR_NO_CHANGE'
    creds = (WB / 'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(creds[0].strip(), username='root', password=creds[2], look_for_keys=False, allow_agent=False, timeout=20)
    installed = False
    restarted = []
    report = {}
    try:
        assert hashes(ssh, list(expected)) == expected, 'SOURCE_DRIFT'
        assert pm2(ssh) == deployed['afterPm2'], 'PROCESS_DRIFT'
        assert ready(ssh) == {'8080': 200, '8083': 200}
        if action == 'stage':
            stage = json.loads((ROOT / 'stage-full.json').read_text())['stage'] + '/payload-guard'
            run(ssh, f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
            sftp = ssh.open_sftp()
            try:
                sftp.put(str(candidate), stage + '/app/' + REL)
                sftp.put(str(ROOT / 'server.bin'), stage + '/server.bin')
                for name in ['test_fishing_event_payload_guard_20260906.js', 'test_fishing_gameplay_events_20260906.js', 'qa_fishing_full_live_20260906.js']:
                    sftp.put(str(WB / 'tools' / name), stage + '/tools/' + name)
            finally:
                sftp.close()
            env = f'NODE_PATH={APP}/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin'
            run(ssh, f'node --check {stage}/app/{REL}')
            core = json.loads(run(ssh, f'cd {stage}/app && {env} timeout 55s node scripts/test-core-gameplay-contract.js', timeout=60))
            assert core['result'] == 'ok'
            tests = {}
            for name, tool in [('guard', 'test_fishing_event_payload_guard_20260906.js'), ('gameplay_events', 'test_fishing_gameplay_events_20260906.js')]:
                tests[name] = json.loads(run(ssh, f'{env} timeout 55s node {stage}/tools/{tool} {stage}', timeout=60))
                assert tests[name]['result'] == 'PASS'
            assert hashes(ssh, list(expected)) == expected
            assert pm2(ssh) == deployed['afterPm2']
            report = {'result': 'STAGED', 'stage': stage, 'sha256': new_hash, 'expectedBefore': expected, 'coreContract': core, 'tests': tests, 'productionWrites': 0}
            write('stage-payload-guard.json', report)
            print(json.dumps({'result': report['result'], 'core': core['result'], 'tables': core['tables'], 'tests': {k: v['count'] for k, v in tests.items()}}))
            return
        staging = json.loads((ROOT / 'stage-payload-guard.json').read_text())
        assert staging['result'] == 'STAGED' and staging['sha256'] == new_hash
        assert staging['expectedBefore'] == expected
        stage = staging['stage']
        assert hashes(ssh, [stage + '/app/' + REL])[stage + '/app/' + REL] == new_hash
        backup = deployed['backup'] + '/payload-guard'
        run(ssh, f'install -d -m 700 {backup}; cp -a {APP}/{REL} {backup}/FishingEventSchedule.before.js')
        report = {'result': 'INSTALLING', 'startedAt': datetime.now(timezone.utc).isoformat(), 'beforePm2': pm2(ssh), 'backup': backup, 'liveQa': {}}
        installed = True
        run(ssh, f'install -m 644 {stage}/app/{REL} {APP}/{REL}.guard-next; mv -f {APP}/{REL}.guard-next {APP}/{REL}')
        for name, port, sid in [('lhs-s1002', 8083, 1002), ('lhs-s1001', 8080, 1001)]:
            restarted.append(name)
            print(json.dumps({'step': 'restart', 'name': name}), flush=True)
            run(ssh, 'pm2 restart ' + name, timeout=60)
            wait_ready(ssh, port)
            qa = json.loads(run(ssh, f'node {stage}/tools/qa_fishing_full_live_20260906.js {sid}', timeout=60))
            assert qa['result'] == 'PASS'
            report['liveQa'][str(sid)] = qa
            print(json.dumps({'step': 'qa-pass', 'server': sid}), flush=True)
        after = pm2(ssh)
        assert all(next(q for q in after if q['name'] == p['name']) == p for p in report['beforePm2'] if p['name'] not in restarted)
        expected_after = {**expected, APP + '/' + REL: new_hash}
        assert hashes(ssh, list(expected_after)) == expected_after
        report.update(result='DEPLOYED', finishedAt=datetime.now(timezone.utc).isoformat(), afterPm2=after, sha256=new_hash, expectedAfter=expected_after, ready=ready(ssh))
        write('deploy-payload-guard.json', report)
        # Keep the original release evidence. Update the current expected state for safe verification.
        for name in ['deploy-full.json', 'deploy-prepared.json']:
            target = ROOT / name
            saved = WB / 'backups/fishing_payload_guard_20260906' / name
            assert not saved.exists(), 'BACKUP_EXISTS_' + name
            saved.write_bytes(target.read_bytes())
        deployed.update(expected=expected_after, afterPm2=after, lastUpdatedAt=report['finishedAt'], payloadGuard='deploy-payload-guard.json')
        write('deploy-full.json', deployed)
        prepared = json.loads((ROOT / 'deploy-prepared.json').read_text())
        prepared['serverHashes'][REL] = new_hash
        prepared['payloadGuard'] = 'deploy-payload-guard.json'
        write('deploy-prepared.json', prepared)
        print(json.dumps({'result': 'DEPLOYED', 'sha256': new_hash, 'ready': report['ready']}))
    except Exception as error:
        report.update(result='FAIL', error=str(error))
        if installed:
            run(ssh, f'install -m 644 {report["backup"]}/FishingEventSchedule.before.js {APP}/{REL}')
            for name in restarted:
                run(ssh, 'pm2 restart ' + name, timeout=60)
                wait_ready(ssh, 8083 if name == 'lhs-s1002' else 8080)
            report['rollbackReady'] = ready(ssh)
        write('payload-guard-error.json', report)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
