"""Release bounded RPC queue, sale reconciliation, player-name and HUD health layout."""
import hashlib
import json
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
WB = ROOT / '_ai_workbench'
APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
TARGETS = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084}

FILES = {
    APP + '/src/net/WSServer.js': ROOT / 'linhhoasu/lhs/newServer/src/net/WSServer.js',
    APP + '/src/services/EquipService.js': ROOT / 'linhhoasu/lhs/newServer/src/services/EquipService.js',
    APP + '/src/handlers/item.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/item.js',
    GAME + '/js/lhs-auto-sale-reconcile-v1.js': ROOT / 'linhhoasu/webgame/game/js/lhs-auto-sale-reconcile-v1.js',
    GAME + '/js/lhs-player-healthbar-v1.js': ROOT / 'linhhoasu/webgame/game/js/lhs-player-healthbar-v1.js',
    GAME + '/js/lhs-formation-fix-v1.js': ROOT / 'linhhoasu/webgame/game/js/lhs-formation-fix-v1.js',
    GAME + '/js/lhs-mount-fix-v1.js': ROOT / 'linhhoasu/webgame/game/js/lhs-mount-fix-v1.js',
}
EXPECTED = {
    APP + '/src/net/WSServer.js': 'b4eb1fe1e5a9bc083395e0a3b3bd5ca17db71e2478b13315397d39abc72bc164',
    APP + '/src/services/EquipService.js': 'f7a2b702d9767c028c3c49c3d508093a21e6fc842f3a9e69c7a857165b8646c6',
    APP + '/src/handlers/item.js': 'af25253175d8a311dea33b2b30d99c2c736952c1dd44b7eee7954413ca98fa9c',
    GAME + '/js/lhs-auto-sale-reconcile-v1.js': None,
    GAME + '/js/lhs-player-healthbar-v1.js': 'cc7aa3d81fe0c8610f650ea7017f54ad6c49a049884ee296bfca2546ec042658',
    GAME + '/js/lhs-formation-fix-v1.js': 'b98f99420f851d38dcdf17570b51a5623ffec7afd6dca87e2fe250ddc39a1c23',
    GAME + '/js/lhs-mount-fix-v1.js': '6427019a5552d092b2f8c509ce752954414bb6a60117cb1bdfc058a33360111c',
    GAME + '/index.html': '8a298a357a9b6cf579a8e62c58feffee5b66d9b259e70c250a5f27bd642fd7d1',
    GAME + '/js/main.min_drop100.js': '9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def processes(ssh):
    code = (
        "const cp=require('child_process');console.log(JSON.stringify("
        "JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).map(p=>"
        "({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))));"
    )
    return json.loads(run(ssh, 'node -e ' + shlex.quote(code)))


def ready(ssh, port):
    for _ in range(20):
        try:
            if run(ssh, f"curl -fsS --max-time 3 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() == '200':
                return '200'
        except RuntimeError:
            pass
        time.sleep(1)
    return '000'


def build_index(before):
    text = before.decode('utf-8')
    # Never carry a stale local/main bundle reference into a release. The
    # level100 client is the authoritative bundle for the current server data.
    stale = 'js/main.min_a6195824.js'
    active = 'js/main.min_drop100.js'
    if text.count(stale) > 1 or text.count(active) > 1:
        raise RuntimeError('INDEX_MAIN_REFERENCE_AMBIGUOUS')
    if text.count(stale) == 1:
        text = text.replace(
            'js/main.min_a6195824.js?v=20260914_minigame_open_v1',
            'js/main.min_drop100.js?v=20260915_drop100_restore_v2',
        )
    if text.count(active) != 1:
        raise RuntimeError('INDEX_MAIN_DROP100_REQUIRED')
    changes = [
        (
            '\t\t"js/main.min_drop100.js?v=20260914_drop100_v1",\n',
            '\t\t"js/main.min_drop100.js?v=20260914_drop100_v1",\n'
            '\t\t"js/lhs-auto-sale-reconcile-v1.js?v=20260915_auto_sale_reconcile_v1",\n',
        ),
        ('js/lhs-formation-fix-v1.js?v=20260913_formation_fix_v2',
         'js/lhs-formation-fix-v1.js?v=20260915_formation_singleflight_v3'),
        ('js/lhs-mount-fix-v1.js?v=20260913_mount_fix_v1',
         'js/lhs-mount-fix-v1.js?v=20260915_mount_singleflight_v2'),
        ('js/lhs-player-healthbar-v1.js?v=20260915_player_healthbar_v3',
         'js/lhs-player-healthbar-v1.js?v=20260915_player_healthbar_hud_v4'),
    ]
    for old, new in changes:
        if text.count(old) != 1:
            raise RuntimeError('INDEX_ANCHOR_MISMATCH:' + old)
        text = text.replace(old, new)
    return text.encode('utf-8')


def main():
    local_tests = [
        'test_auto_sale_reconcile_20260915.js',
        'test_ws_singleflight_20260915.js',
        'test_player_healthbar_20260915.js',
        'test_formation_client_fix_20260913.js',
        'test_mount_client_singleflight_20260915.js',
        'test_auto_delegate_sell_fix_20260914.js',
    ]
    for name in local_tests:
        subprocess.run(['node', str(WB / 'tools' / name)], cwd=ROOT, check=True, timeout=45)
    for path in FILES.values():
        subprocess.run(['node', '--check', str(path)], check=True, timeout=30)

    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage = f'/linhhoasu/_ai_workbench/temp/auto_sale_hud_{stamp}'
    backup = f'/linhhoasu/_ai_workbench/backups/auto_sale_hud_{stamp}'
    evidence = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'stage': stage,
        'backup': backup,
        'realPlayerWrites': 0,
        'testsNetworkAttempts': 0,
        'applied': [],
    }
    ssh = connect()
    index_candidate = None
    before_bytes = {}
    candidates = {remote: path.read_bytes() for remote, path in FILES.items()}
    try:
        evidence['beforeProcesses'] = processes(ssh)
        with ssh.open_sftp() as sftp:
            for remote, expected in EXPECTED.items():
                try:
                    data = sftp.open(remote, 'rb').read()
                    actual = sha(data)
                except FileNotFoundError:
                    data, actual = None, None
                if actual != expected:
                    raise RuntimeError(f'CAS_BASELINE:{remote}:{actual}:{expected}')
                before_bytes[remote] = data
        index_candidate = build_index(before_bytes[GAME + '/index.html'])
        if 'js/main.min_a6195824.js' in index_candidate.decode('utf-8'):
            raise RuntimeError('STALE_MAIN_REFERENCE_REJECTED')
        candidates[GAME + '/index.html'] = index_candidate

        run(ssh, 'mkdir -p ' + shlex.quote(stage) + ' ' + shlex.quote(backup))
        with ssh.open_sftp() as sftp:
            for remote, data in candidates.items():
                name = remote.rsplit('/', 1)[-1]
                with sftp.open(stage + '/' + name, 'wb') as handle:
                    handle.write(data)
                prior = before_bytes.get(remote)
                if prior is not None:
                    with sftp.open(backup + '/' + name + '.before', 'wb') as handle:
                        handle.write(prior)
            for name in local_tests:
                sftp.put(str(WB / 'tools' / name), stage + '/' + name)
            fixture = WB / 'temp/auto_delegate_sell_fix_20260914'
            for name in ['main.js', 'main.js.before', 'functions.json']:
                sftp.put(str(fixture / name), stage + '/' + name)

        for remote in candidates:
            if remote.endswith('.js'):
                run(ssh, 'node --check ' + shlex.quote(stage + '/' + remote.rsplit('/', 1)[-1]))

        env = 'LHS_APP_ROOT=' + shlex.quote(APP)
        test_commands = {
            'wsFlood': env + ' WS_CANDIDATE_PATH=' + shlex.quote(stage + '/WSServer.js')
                + ' node ' + shlex.quote(stage + '/test_ws_singleflight_20260915.js'),
            'saleServer': 'AUTO_SELL_APP=' + shlex.quote(APP)
                + ' AUTO_SELL_ITEM_PATH=' + shlex.quote(stage + '/item.js')
                + ' AUTO_SELL_EQUIP_PATH=' + shlex.quote(stage + '/EquipService.js')
                + ' AUTO_SELL_FIXTURE=' + shlex.quote(stage)
                + ' AUTO_SELL_FUNCTIONS=' + shlex.quote(stage + '/functions.json')
                + ' CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
                + ' node ' + shlex.quote(stage + '/test_auto_delegate_sell_fix_20260914.js'),
            'saleClient': 'AUTO_SALE_RECONCILE_SCRIPT=' + shlex.quote(stage + '/lhs-auto-sale-reconcile-v1.js')
                + ' node ' + shlex.quote(stage + '/test_auto_sale_reconcile_20260915.js'),
            'healthHud': 'PLAYER_HEALTHBAR_SCRIPT=' + shlex.quote(stage + '/lhs-player-healthbar-v1.js')
                + ' PLAYER_HEALTHBAR_BUNDLE=/linhhoasu/webgame/game/js/main.min_drop100.js'
                + ' node ' + shlex.quote(stage + '/test_player_healthbar_20260915.js'),
            'formationClient': 'FORMATION_CLIENT_SCRIPT=' + shlex.quote(stage + '/lhs-formation-fix-v1.js')
                + ' node ' + shlex.quote(stage + '/test_formation_client_fix_20260913.js'),
            'mountClient': 'MOUNT_CLIENT_SCRIPT=' + shlex.quote(stage + '/lhs-mount-fix-v1.js')
                + ' node ' + shlex.quote(stage + '/test_mount_client_singleflight_20260915.js'),
        }
        evidence['stagedTests'] = {}
        for name, command in test_commands.items():
            output = run(ssh, 'cd ' + shlex.quote(APP) + ' && ' + command)
            result = json.loads(output.strip().splitlines()[-1])
            if str(result.get('result', '')).upper() not in ('PASS', 'OK'):
                raise RuntimeError('STAGED_TEST_FAILED:' + name)
            evidence['stagedTests'][name] = result
        core_output = run(ssh, 'cd ' + shlex.quote(APP) + ' && npm run test:core-contract')
        evidence['coreContract'] = json.loads(core_output.strip().splitlines()[-1])
        if evidence['coreContract'].get('result') != 'ok' or evidence['coreContract'].get('tables') != 714:
            raise RuntimeError('CORE_CONTRACT_FAILED')

        # Recheck every preimage immediately before the first swap.
        with ssh.open_sftp() as sftp:
            for remote, expected in EXPECTED.items():
                try:
                    actual = sha(sftp.open(remote, 'rb').read())
                except FileNotFoundError:
                    actual = None
                if actual != expected:
                    raise RuntimeError('CAS_CHANGED:' + remote)
            for remote, data in candidates.items():
                tmp = remote + '.auto_sale_hud_tmp'
                with sftp.open(tmp, 'wb') as handle:
                    handle.write(data)
                if sha(sftp.open(tmp, 'rb').read()) != sha(data):
                    raise RuntimeError('STAGED_HASH_MISMATCH:' + remote)
                sftp.posix_rename(tmp, remote)
                evidence['applied'].append(remote)

        evidence['ready'] = {}
        for name in ['lhs-s1002', 'lhs-s1001', 'lhs-s1003']:
            run(ssh, 'pm2 restart ' + name + ' --update-env')
            evidence['ready'][name] = ready(ssh, PORTS[name])
            if evidence['ready'][name] != '200':
                raise RuntimeError('READY_FAILED:' + name)

        with ssh.open_sftp() as sftp:
            evidence['liveHashes'] = {
                remote: sha(sftp.open(remote, 'rb').read()) for remote in candidates
            }
        expected_after = {remote: sha(data) for remote, data in candidates.items()}
        if evidence['liveHashes'] != expected_after:
            raise RuntimeError('POST_HASH_MISMATCH')

        served = {}
        for remote in [
            GAME + '/js/lhs-auto-sale-reconcile-v1.js',
            GAME + '/js/lhs-player-healthbar-v1.js',
            GAME + '/js/lhs-formation-fix-v1.js',
            GAME + '/js/lhs-mount-fix-v1.js',
        ]:
            url = 'http://127.0.0.1:81/' + remote[len(GAME) + 1:] + '?v=20260915'
            served[remote] = sha(run(ssh, 'curl -fsS --max-time 15 ' + shlex.quote(url)).encode('utf-8'))
            if served[remote] != expected_after[remote]:
                raise RuntimeError('SERVED_HASH_MISMATCH:' + remote)
        evidence['servedHashes'] = served
        served_index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        markers = [
            '20260915_auto_sale_reconcile_v1', '20260915_formation_singleflight_v3',
            '20260915_mount_singleflight_v2', '20260915_player_healthbar_hud_v4',
        ]
        evidence['indexMarkers'] = {marker: served_index.count(marker) for marker in markers}
        if any(count != 1 for count in evidence['indexMarkers'].values()):
            raise RuntimeError('INDEX_MARKER_MISMATCH')

        evidence['afterProcesses'] = processes(ssh)
        prior = {row['name']: row for row in evidence['beforeProcesses']}
        for row in evidence['afterProcesses']:
            if row['name'] in TARGETS:
                if row['status'] != 'online':
                    raise RuntimeError('TARGET_OFFLINE:' + row['name'])
            elif row['name'] in prior and row['pid'] != prior[row['name']]['pid']:
                raise RuntimeError('UNRELATED_PID_CHANGED:' + row['name'])
        evidence['recentErrors'] = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log "
            "/root/.pm2/logs/lhs-s1003-error.log; do tail -60 \"$f\" | "
            "grep -Ei 'SyntaxError|ReferenceError|TypeError|uncaughtException|unhandledRejection' || true; done"
        )
        if evidence['recentErrors'].strip():
            raise RuntimeError('RECENT_ERROR_MARKERS')
        evidence['result'] = 'DEPLOY_VERIFIED'
    except Exception as error:
        evidence['result'] = 'FAILED'
        evidence['error'] = str(error)
        if evidence['applied']:
            with ssh.open_sftp() as sftp:
                for remote in reversed(evidence['applied']):
                    current = sftp.open(remote, 'rb').read()
                    if sha(current) != sha(candidates[remote]):
                        raise RuntimeError('ROLLBACK_CAS_CHANGED:' + remote) from error
                    prior = before_bytes.get(remote)
                    if prior is None:
                        sftp.remove(remote)
                    else:
                        tmp = remote + '.auto_sale_hud_rollback'
                        with sftp.open(tmp, 'wb') as handle:
                            handle.write(prior)
                        sftp.posix_rename(tmp, remote)
            for name in TARGETS:
                run(ssh, 'pm2 restart ' + name + ' --update-env')
            evidence['rollbackReady'] = {name: ready(ssh, PORTS[name]) for name in TARGETS}
        raise
    finally:
        evidence['finishedAt'] = datetime.now(timezone.utc).isoformat()
        payload = (json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        try:
            with ssh.open_sftp() as sftp:
                with sftp.open(stage + '/release.json', 'wb') as handle:
                    handle.write(payload)
        except Exception:
            pass
        ssh.close()
        out = WB / 'temp/auto_sale_hud_20260915'
        out.mkdir(parents=True, exist_ok=True)
        (out / 'release.json').write_bytes(payload)
    print(json.dumps({'result': evidence['result'], 'stage': stage, 'backup': backup, 'ready': evidence.get('ready')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
