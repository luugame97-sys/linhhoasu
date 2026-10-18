"""Deploy the current-tier-only monster material policy with CAS/rollback guards."""

import getpass
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = '103.116.105.154'
APP = '/linhhoasu/lhs/newServer'
LOCAL_ROOT = Path(__file__).resolve().parents[1].parent
FILES = {
    'policy': {
        'local': LOCAL_ROOT / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'config' / 'alchemyMaterialDrops.json',
        'remote': APP + '/src/config/alchemyMaterialDrops.json',
        'before': '47ae2fa93d2b2a6783319b4a4aab311ab3b89f678306ba6413cc21c35be8d190',
    },
    'service': {
        'local': LOCAL_ROOT / 'linhhoasu' / 'lhs' / 'newServer' / 'src' / 'services' / 'AlchemyMaterialDropService.js',
        'remote': APP + '/src/services/AlchemyMaterialDropService.js',
        'before': '9f4f8d58bde84c986d125f7426729defceb48330f8fe281b1a50b714b0cc4095',
    },
}
TEST_LOCAL = LOCAL_ROOT / '_ai_workbench' / 'tools' / 'test_alchemy_material_original_sources_20260914.js'
EXPECTED_VERSION = '20260914_current_tier_only_v1'


def digest_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh, command: str, timeout: int = 120, check: bool = True) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    stdout = out.read().decode('utf-8', 'replace')
    stderr = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'remote command failed ({code}): {command}\n{stderr[-4000:]}\n{stdout[-4000:]}')
    return stdout


def remote_hash(ssh, path: str):
    output = run(ssh, f'sha256sum -- {shlex.quote(path)}', 30, check=False).strip()
    return output.split()[0] if output else None


def readiness(ssh):
    result = {}
    for port in (8080, 8083, 8084):
        result[str(port)] = run(
            ssh,
            f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{port}/ready",
            20,
        ).strip()
    return result


def assert_ready(value):
    if any(code != '200' for code in value.values()):
        raise RuntimeError('READINESS_FAILED:' + json.dumps(value))


def pm2_snapshot(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist', 30))
    names = {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-real-bots', 'lhs-real-bots-s2', 'lhs-real-bots-s3'}
    return {
        row['name']: {
            'status': row.get('pm2_env', {}).get('status'),
            'pid': row.get('pid'),
            'restarts': row.get('pm2_env', {}).get('restart_time'),
        }
        for row in rows if row.get('name') in names
    }


def run_live_test(ssh, test_remote: str):
    output = run(ssh, f'APP_ROOT={shlex.quote(APP)} node {shlex.quote(test_remote)}', 90)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError('ALCHEMY_TEST_EMPTY')
    result = json.loads(lines[-1])
    if result.get('result') != 'PASS':
        raise RuntimeError('ALCHEMY_TEST_FAILED:' + json.dumps(result, ensure_ascii=False))
    return result


def install_file(ssh, source: str, target: str, before: str, after: str, suffix: str):
    script = (
        "const fs=require('fs'),c=require('crypto');const a=JSON.parse(process.argv[1]);"
        "const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');"
        "if(h(a.source)!==a.after||h(a.target)!==a.before)throw Error('INSTALL_CAS_FAILURE');"
        "const t=a.target+'.'+a.suffix;if(fs.existsSync(t))throw Error('TEMP_EXISTS');"
        "fs.copyFileSync(a.source,t);fs.chmodSync(t,0o644);fs.renameSync(t,a.target);"
        "if(h(a.target)!==a.after)throw Error('POST_INSTALL_HASH_FAILURE');console.log('INSTALL_PASS');"
    )
    args = json.dumps({'source': source, 'target': target, 'before': before, 'after': after, 'suffix': suffix})
    run(ssh, 'node -e ' + shlex.quote(script) + ' ' + shlex.quote(args), 30)


def restore_file(ssh, source: str, target: str, current: str, before: str, suffix: str):
    script = (
        "const fs=require('fs'),c=require('crypto');const a=JSON.parse(process.argv[1]);"
        "const h=p=>c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');"
        "if(h(a.target)!==a.current)throw Error('ROLLBACK_CAS_FAILURE');"
        "const t=a.target+'.'+a.suffix;if(fs.existsSync(t))throw Error('TEMP_EXISTS');"
        "fs.copyFileSync(a.source,t);fs.chmodSync(t,0o644);fs.renameSync(t,a.target);"
        "if(h(a.target)!==a.before)throw Error('ROLLBACK_HASH_FAILURE');console.log('ROLLBACK_PASS');"
    )
    args = json.dumps({'source': source, 'target': target, 'current': current, 'before': before, 'suffix': suffix})
    run(ssh, 'node -e ' + shlex.quote(script) + ' ' + shlex.quote(args), 30)


def main():
    for entry in FILES.values():
        if not entry['local'].is_file():
            raise FileNotFoundError(entry['local'])
    if not TEST_LOCAL.is_file():
        raise FileNotFoundError(TEST_LOCAL)
    local_hashes = {name: digest_file(entry['local']) for name, entry in FILES.items()}
    policy = json.loads(FILES['policy']['local'].read_text(encoding='utf-8'))
    if policy.get('version') != EXPECTED_VERSION or policy.get('enabled') is not True or policy.get('currentTierWeightBps') != 10000:
        raise RuntimeError('LOCAL_POLICY_INVALID')

    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/alchemy_material_current_tier_20260914_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/alchemy_material_current_tier_20260914_{stamp}'
    test_remote = stage + '/test.js'
    manifest_path = LOCAL_ROOT / '_ai_workbench' / 'temp' / f'alchemy_material_current_tier_20260914_{stamp}.json'
    manifest = {
        'status': 'PREFLIGHT', 'host': HOST, 'backup': backup, 'stage': stage,
        'candidateHashes': local_hashes, 'restarted': [],
        'playerDataRepair': False, 'compensation': False,
    }
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    installed = []
    restarted = []
    try:
        before_ready = readiness(ssh)
        assert_ready(before_ready)
        before_pm2 = pm2_snapshot(ssh)
        before_hashes = {name: remote_hash(ssh, entry['remote']) for name, entry in FILES.items()}
        for name, entry in FILES.items():
            if before_hashes[name] != entry['before']:
                raise RuntimeError(f'LIVE_CAS_MISMATCH:{name}:{before_hashes[name]}')
        manifest.update({'beforeReady': before_ready, 'beforePm2': before_pm2, 'beforeHashes': before_hashes})

        run(ssh, f'mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage)}', 30)
        sftp = ssh.open_sftp()
        try:
            for name, entry in FILES.items():
                backup_path = backup + '/' + name + ('.json' if name == 'policy' else '.js')
                run(ssh, f'cp -p -- {shlex.quote(entry["remote"])} {shlex.quote(backup_path)}', 30)
                if remote_hash(ssh, backup_path) != entry['before']:
                    raise RuntimeError('BACKUP_HASH_MISMATCH:' + name)
                stage_path = stage + '/' + name + ('.json' if name == 'policy' else '.js')
                sftp.put(str(entry['local']), stage_path)
            sftp.put(str(TEST_LOCAL), test_remote)
        finally:
            sftp.close()

        for name, entry in FILES.items():
            stage_path = stage + '/' + name + ('.json' if name == 'policy' else '.js')
            if remote_hash(ssh, stage_path) != local_hashes[name]:
                raise RuntimeError('STAGE_HASH_MISMATCH:' + name)
            if name == 'service':
                run(ssh, f'node --check {shlex.quote(stage_path)}', 30)
            else:
                check = "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(x.enabled!==true||x.currentTierWeightBps!==10000||x.version!==" + json.dumps(EXPECTED_VERSION) + ")throw Error('POLICY_INVALID');console.log('POLICY_PASS')"
                run(ssh, 'node -e ' + shlex.quote(check) + ' ' + shlex.quote(stage_path), 30)
        manifest['staged'] = True

        # Install both files atomically and re-check their hashes before any restart.
        for name, entry in FILES.items():
            stage_path = stage + '/' + name + ('.json' if name == 'policy' else '.js')
            install_file(ssh, stage_path, entry['remote'], entry['before'], local_hashes[name], 'alchemy-material-20260914-next')
            installed.append(name)
        if {name: remote_hash(ssh, entry['remote']) for name, entry in FILES.items()} != local_hashes:
            raise RuntimeError('LIVE_HASH_MISMATCH_AFTER_INSTALL')
        run(ssh, f'node --check {shlex.quote(FILES["service"]["remote"])}', 30)

        for name, port in [('lhs-s1002', 8083), ('lhs-s1001', 8080), ('lhs-s1003', 8084)]:
            run(ssh, f'pm2 restart {shlex.quote(name)} --update-env', 180)
            restarted.append(name)
            manifest['restarted'] = restarted[:]
            run(ssh, f"for i in $(seq 1 90); do c=$(curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true); [ \"$c\" = 200 ] && exit 0; sleep 1; done; exit 1", 150)

        manifest['postTest'] = run_live_test(ssh, test_remote)
        manifest['postReady'] = readiness(ssh)
        assert_ready(manifest['postReady'])
        manifest['afterHashes'] = {name: remote_hash(ssh, entry['remote']) for name, entry in FILES.items()}
        manifest['afterPm2'] = pm2_snapshot(ssh)
        before_by_name = before_pm2
        after_by_name = manifest['afterPm2']
        for name, before in before_by_name.items():
            after = after_by_name.get(name)
            if not after:
                raise RuntimeError('PM2_PROCESS_MISSING:' + name)
            if name in {'lhs-s1001', 'lhs-s1002', 'lhs-s1003'}:
                if after['status'] != 'online' or after['restarts'] != before['restarts'] + 1:
                    raise RuntimeError('PM2_RESTART_INVARIANT:' + name)
            elif after != before:
                raise RuntimeError('UNRELATED_PROCESS_CHANGED:' + name)
        manifest['status'] = 'DEPLOYED'
        manifest['at'] = datetime.now(timezone.utc).isoformat()
    except Exception as error:
        manifest['error'] = str(error)
        if installed:
            try:
                for name in reversed(installed):
                    entry = FILES[name]
                    current = remote_hash(ssh, entry['remote'])
                    if current != digest_file(entry['local']):
                        raise RuntimeError('ROLLBACK_TARGET_DRIFT:' + name)
                    restore_file(
                        ssh,
                        backup + '/' + name + ('.json' if name == 'policy' else '.js'),
                        entry['remote'],
                        current,
                        entry['before'],
                        'alchemy-material-20260914-rollback',
                    )
                for name, port in [('lhs-s1002', 8083), ('lhs-s1001', 8080), ('lhs-s1003', 8084)]:
                    if name in restarted:
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
