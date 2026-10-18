"""Disable the non-official normal-map inner-material drop pool safely."""

import getpass
import hashlib
import json
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
APP = '/linhhoasu/lhs/newServer'
REMOTE = APP + '/src/config/alchemyMaterialDrops.json'
LOCAL_ROOT = Path(__file__).resolve().parents[1].parent
LOCAL = LOCAL_ROOT / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'config' / 'alchemyMaterialDrops.json'
TEST_LOCAL = LOCAL_ROOT / '_ai_workbench' / 'tools' / 'test_alchemy_material_original_sources_20260914.js'
EXPECTED_BEFORE = '47ae2fa93d2b2a6783319b4a4aab311ab3b89f678306ba6413cc21c35be8d190'


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def run(ssh, command: str, timeout: int = 120) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    stdout = out.read().decode('utf-8', 'replace')
    stderr = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'remote command failed ({code}): {command}\n{stderr[-4000:]}\n{stdout[-4000:]}')
    return stdout


def remote_hash(ssh, path: str):
    output = run(ssh, f'sha256sum -- {shlex.quote(path)}', 30).strip()
    return output.split()[0] if output else None


def ready_snapshot(ssh):
    result = {}
    for port in (8080, 8083, 8084):
        result[str(port)] = run(
            ssh,
            f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{port}/ready",
            20,
        ).strip()
    return result


def pm2_snapshot(ssh):
    raw = run(ssh, 'pm2 jlist', 30)
    rows = json.loads(raw)
    wanted = {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-real-bots', 'lhs-real-bots-s2', 'lhs-real-bots-s3'}
    return [
        {
            'name': row.get('name'),
            'status': row.get('pm2_env', {}).get('status'),
            'pid': row.get('pid'),
            'restarts': row.get('pm2_env', {}).get('restart_time'),
        }
        for row in rows
        if row.get('name') in wanted
    ]


def assert_ready(snapshot):
    if any(value != '200' for value in snapshot.values()):
        raise RuntimeError('READINESS_PRECHECK_FAILED:' + json.dumps(snapshot))


def run_policy_test(ssh, test_remote: str):
    output = run(ssh, f'APP_ROOT={shlex.quote(APP)} node {shlex.quote(test_remote)}', 90)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError('POLICY_TEST_EMPTY_OUTPUT')
    result = json.loads(lines[-1])
    if result.get('result') != 'PASS':
        raise RuntimeError('POLICY_TEST_FAILED:' + json.dumps(result, ensure_ascii=False))
    return result


def main():
    if not LOCAL.is_file() or not TEST_LOCAL.is_file():
        raise FileNotFoundError('local candidate or test missing')
    local_hash = digest_file(LOCAL)
    local_test_hash = digest_file(TEST_LOCAL)
    json.loads(LOCAL.read_text(encoding='utf-8'))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/alchemy_material_restore_20260914_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/alchemy_material_restore_20260914_{stamp}'
    candidate_remote = stage + '/alchemyMaterialDrops.json'
    test_remote = stage + '/test.js'
    manifest_path = LOCAL_ROOT / '_ai_workbench' / 'temp' / f'alchemy_material_restore_20260914_{stamp}.json'
    manifest = {
        'status': 'PREFLIGHT',
        'host': HOST,
        'target': REMOTE,
        'candidateHash': local_hash,
        'testHash': local_test_hash,
        'backup': backup,
        'stage': stage,
        'restarted': [],
        'playerDataRepair': False,
        'compensation': False,
    }
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    installed = False
    try:
        before_ready = ready_snapshot(ssh)
        assert_ready(before_ready)
        before_pm2 = pm2_snapshot(ssh)
        before_hash = remote_hash(ssh, REMOTE)
        if before_hash != EXPECTED_BEFORE:
            raise RuntimeError(f'LIVE_POLICY_CAS_MISMATCH:{before_hash}')
        manifest.update({'beforeHash': before_hash, 'beforeReady': before_ready, 'beforePm2': before_pm2})

        run(ssh, f'mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}', 30)
        run(ssh, f'cp -p -- {shlex.quote(REMOTE)} {shlex.quote(backup + "/alchemyMaterialDrops.json")}', 30)
        if remote_hash(ssh, backup + '/alchemyMaterialDrops.json') != before_hash:
            raise RuntimeError('BACKUP_HASH_MISMATCH')

        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), candidate_remote)
            sftp.put(str(TEST_LOCAL), test_remote)
        finally:
            sftp.close()
        if remote_hash(ssh, candidate_remote) != local_hash:
            raise RuntimeError('STAGE_HASH_MISMATCH')
        run(
            ssh,
            "node -e " + shlex.quote(
                "const fs=require('fs');const p=process.argv[1];const x=JSON.parse(fs.readFileSync(p,'utf8'));"
                "if(x.enabled!==false||x.version!=='20260914_restore_original_sources_v1')throw Error('CANDIDATE_POLICY_INVALID');"
                "console.log('POLICY_JSON_PASS')"
            ) + ' ' + shlex.quote(candidate_remote),
            30,
        )
        manifest['stageTest'] = run_policy_test(ssh, test_remote)

        install_js = (
            "const fs=require('fs'),c=require('crypto');const a=JSON.parse(process.argv[1]);"
            "const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');"
            "if(h(a.source)!==a.after||h(a.target)!==a.before)throw Error('INSTALL_CAS_FAILURE');"
            "const t=a.target+'.restore-20260914-next';if(fs.existsSync(t))throw Error('TEMP_EXISTS');"
            "fs.copyFileSync(a.source,t);fs.chmodSync(t,0o644);fs.renameSync(t,a.target);"
            "if(h(a.target)!==a.after)throw Error('POST_INSTALL_HASH_FAILURE');console.log('INSTALL_PASS');"
        )
        args = json.dumps({'source': candidate_remote, 'target': REMOTE, 'before': before_hash, 'after': local_hash})
        run(ssh, 'node -e ' + shlex.quote(install_js) + ' ' + shlex.quote(args), 30)
        installed = True
        after_hash = remote_hash(ssh, REMOTE)
        if after_hash != local_hash:
            raise RuntimeError('LIVE_HASH_MISMATCH')
        manifest['afterHash'] = after_hash

        for name, port in [('lhs-s1001', 8080), ('lhs-s1002', 8083), ('lhs-s1003', 8084)]:
            run(ssh, f'pm2 restart {shlex.quote(name)} --update-env', 180)
            manifest['restarted'].append(name)
            deadline = time.time() + 90
            while time.time() < deadline:
                code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready", 15).strip()
                if code == '200':
                    break
                time.sleep(1)
            else:
                raise RuntimeError(f'READY_TIMEOUT:{name}:{port}')

        manifest['postReady'] = ready_snapshot(ssh)
        assert_ready(manifest['postReady'])
        manifest['postTest'] = run_policy_test(ssh, test_remote)
        manifest['afterPm2'] = pm2_snapshot(ssh)
        manifest['status'] = 'DEPLOYED'
        manifest['at'] = datetime.now(timezone.utc).isoformat()
        # Ensure only the three game processes changed restart counters.
        before_by_name = {row['name']: row for row in before_pm2}
        after_by_name = {row['name']: row for row in manifest['afterPm2']}
        for name in before_by_name:
            if name not in after_by_name:
                raise RuntimeError('PM2_PROCESS_MISSING:' + name)
            if name in {'lhs-s1001', 'lhs-s1002', 'lhs-s1003'}:
                if after_by_name[name]['status'] != 'online' or after_by_name[name]['restarts'] != before_by_name[name]['restarts'] + 1:
                    raise RuntimeError('PM2_RESTART_INVARIANT:' + name)
            elif after_by_name[name] != before_by_name[name]:
                raise RuntimeError('UNRELATED_PROCESS_CHANGED:' + name)
    except Exception as error:
        manifest['error'] = str(error)
        if installed:
            try:
                restore_js = (
                    "const fs=require('fs'),c=require('crypto');const a=JSON.parse(process.argv[1]);"
                    "const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');"
                    "if(h(a.target)!==a.after)throw Error('ROLLBACK_CAS_FAILURE');"
                    "const t=a.target+'.restore-20260914-rollback';fs.copyFileSync(a.source,t);fs.chmodSync(t,0o644);"
                    "fs.renameSync(t,a.target);if(h(a.target)!==a.before)throw Error('ROLLBACK_HASH_FAILURE');console.log('ROLLBACK_PASS');"
                )
                args = json.dumps({'source': backup + '/alchemyMaterialDrops.json', 'target': REMOTE, 'after': local_hash, 'before': before_hash})
                run(ssh, 'node -e ' + shlex.quote(restore_js) + ' ' + shlex.quote(args), 30)
                for name, port in [('lhs-s1001', 8080), ('lhs-s1002', 8083), ('lhs-s1003', 8084)]:
                    if name in manifest['restarted']:
                        run(ssh, f'pm2 restart {shlex.quote(name)} --update-env', 180)
                        run(ssh, f"for i in $(seq 1 90); do c=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && exit 0; sleep 1; done; exit 1", 150)
                manifest['status'] = 'ROLLED_BACK_AFTER_FAILURE'
            except Exception as rollback_error:
                manifest['rollbackError'] = str(rollback_error)
                manifest['status'] = 'ROLLBACK_REQUIRES_ATTENTION'
        else:
            manifest['status'] = 'NOT_INSTALLED'
        raise
    finally:
        try:
            run(ssh, f'rm -rf -- {shlex.quote(stage)}', 30)
        except Exception as cleanup_error:
            manifest['cleanupError'] = str(cleanup_error)
        ssh.close()
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'manifest': str(manifest_path), **manifest}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
