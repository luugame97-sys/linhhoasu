"""Patch the live server-list opening-time display to HH:MM DD/MM/YYYY."""
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL_GAME = ROOT / 'linhhoasu' / 'webgame' / 'game'
LOCAL_BUNDLE = LOCAL_GAME / 'js' / 'main.min_a6195824.js'
LOCAL_INDEX = LOCAL_GAME / 'index.html'
REMOTE_BUNDLE = '/linhhoasu/webgame/game/js/main.min_drop100.js'
REMOTE_INDEX = '/linhhoasu/webgame/game/index.html'
BACKUP_LOCAL = ROOT / '_ai_workbench' / 'backups' / 'server_open_time_display_20260920' / 'local'
BACKUP_REMOTE = '/linhhoasu/_ai_workbench/backups/server_open_time_display_20260920'
STAGE_REMOTE = '/linhhoasu/_ai_workbench/temp/server_open_time_display_20260920'
EVIDENCE_LOCAL = ROOT / '_ai_workbench' / 'temp' / 'server_open_time_display_20260920' / 'evidence.json'
OLD_KEY = '20260915_drop100_restore_v2'
NEW_KEY = '20260920_server_open_time_v1'
OLD_FORMAT = 'CSt.format_14=function(t){var t=new Date(t||0),e=t.getFullYear(),i=t.getMonth()+1,n=t.getDate();t.getHours(),t.getMinutes();return e+"Năm"+i+"Nguyệt"+n+"Ngày"}'
NEW_FORMAT = 'CSt.format_14=function(t){var t=new Date(t||0),e=t.getFullYear(),i=t.getMonth()+1,n=t.getDate(),a=t.getHours(),s=t.getMinutes();return (a<10?"0":"")+a+":"+(s<10?"0":"")+s+" "+(n<10?"0":"")+n+"/"+(i<10?"0":"")+i+"/"+e}'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def patch_bundle(data):
    text = data.decode('utf-8')
    if text.count(OLD_FORMAT) != 1:
        raise RuntimeError('BUNDLE_OLD_FORMAT_COUNT_' + str(text.count(OLD_FORMAT)))
    if NEW_FORMAT in text:
        raise RuntimeError('BUNDLE_ALREADY_PATCHED')
    return text.replace(OLD_FORMAT, NEW_FORMAT, 1).encode('utf-8')


def patch_index(data):
    text = data.decode('utf-8')
    if NEW_KEY in text and OLD_KEY not in text:
        return data
    if text.count(OLD_KEY) != 1:
        raise RuntimeError('INDEX_OLD_KEY_COUNT_' + str(text.count(OLD_KEY)))
    if NEW_KEY in text:
        raise RuntimeError('INDEX_ALREADY_PATCHED')
    return text.replace(OLD_KEY, NEW_KEY, 1).encode('utf-8')


def check_format(path):
    code = r'''const fs=require('fs'),assert=require('assert/strict');
const s=fs.readFileSync(process.argv[1],'utf8');
const m=s.match(/CSt\.format_14=(function\(t\)\{.*?\}),CSt\.format_15=/);
assert(m,'FORMAT_14_NOT_FOUND');
const f=eval('('+m[1]+')');
assert.equal(f(1789873200000),'10:00 20/09/2026');
assert(!m[1].includes('Năm')&&!m[1].includes('Nguyệt')&&!m[1].includes('Ngày'));
console.log('FORMAT_TEST_PASS');'''
    env = os.environ.copy()
    env['TZ'] = 'Asia/Ho_Chi_Minh'
    result = subprocess.run(['node', '-e', code, str(path)], capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError('FORMAT_TEST_FAILED:' + (result.stderr or result.stdout)[-1000:])
    return result.stdout.strip()


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = __import__('argparse').ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()

    if BACKUP_LOCAL.exists() and (BACKUP_LOCAL / LOCAL_BUNDLE.name).exists() and (BACKUP_LOCAL / LOCAL_INDEX.name).exists():
        local_before = {LOCAL_BUNDLE: (BACKUP_LOCAL / LOCAL_BUNDLE.name).read_bytes(), LOCAL_INDEX: (BACKUP_LOCAL / LOCAL_INDEX.name).read_bytes()}
    else:
        local_before = {LOCAL_BUNDLE: LOCAL_BUNDLE.read_bytes(), LOCAL_INDEX: LOCAL_INDEX.read_bytes()}
    local_after = {LOCAL_BUNDLE: patch_bundle(local_before[LOCAL_BUNDLE]), LOCAL_INDEX: patch_index(local_before[LOCAL_INDEX])}
    probe_dir = ROOT / '_ai_workbench' / 'temp' / 'server_open_time_display_20260920'
    probe_dir.mkdir(parents=True, exist_ok=True)
    local_probe = probe_dir / 'main.min_a6195824.candidate.js'
    local_probe.write_bytes(local_after[LOCAL_BUNDLE])
    try:
        local_format_test = check_format(local_probe)
    finally:
        local_probe.unlink(missing_ok=True)
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            remote_before = {REMOTE_BUNDLE: sftp.open(REMOTE_BUNDLE, 'rb').read(), REMOTE_INDEX: sftp.open(REMOTE_INDEX, 'rb').read()}
            remote_attrs = {p: sftp.stat(p) for p in remote_before}
        remote_after = {REMOTE_BUNDLE: patch_bundle(remote_before[REMOTE_BUNDLE]), REMOTE_INDEX: patch_index(remote_before[REMOTE_INDEX])}
        remote_format_test_path = STAGE_REMOTE + '/main.min_drop100.js'
        summary = {
            'result': 'PREFLIGHT', 'bundle': REMOTE_BUNDLE, 'index': REMOTE_INDEX,
            'cacheKey': {'before': OLD_KEY, 'after': NEW_KEY},
            'localBefore': {str(p): sha(v) for p, v in local_before.items()},
            'localAfter': {str(p): sha(v) for p, v in local_after.items()},
            'remoteBefore': {p: sha(v) for p, v in remote_before.items()},
            'remoteAfter': {p: sha(v) for p, v in remote_after.items()},
            'localFormatTest': local_format_test,
            'backupLocal': str(BACKUP_LOCAL), 'backupRemote': BACKUP_REMOTE,
            'apply': args.apply,
        }
        print(json.dumps(summary, ensure_ascii=False), flush=True)
        if not args.apply:
            return

        if BACKUP_LOCAL.exists():
            for path, data in local_before.items():
                backup_data = (BACKUP_LOCAL / path.name).read_bytes()
                if backup_data != data:
                    raise RuntimeError('LOCAL_BACKUP_DRIFT:' + path.name)
        else:
            BACKUP_LOCAL.mkdir(parents=True, exist_ok=False)
            for path, data in local_before.items():
                (BACKUP_LOCAL / path.name).write_bytes(data)
        EVIDENCE_LOCAL.parent.mkdir(parents=True, exist_ok=True)

        with ssh.open_sftp() as sftp:
            try:
                sftp.stat(BACKUP_REMOTE)
                backup_exists = True
            except FileNotFoundError:
                backup_exists = False
            try:
                sftp.stat(STAGE_REMOTE)
            except FileNotFoundError:
                run(ssh, 'install -d -m 700 ' + shlex.quote(STAGE_REMOTE))
            if not backup_exists:
                run(ssh, 'install -d -m 700 ' + shlex.quote(BACKUP_REMOTE))
                for remote_path, data in remote_before.items():
                    name = Path(remote_path).name
                    backup = BACKUP_REMOTE + '/' + name + '.before'
                    with sftp.open(backup, 'wb') as handle:
                        handle.write(data)
                    sftp.chmod(backup, 0o600)
            else:
                for remote_path, data in remote_before.items():
                    backup = BACKUP_REMOTE + '/' + Path(remote_path).name + '.before'
                    if sftp.open(backup, 'rb').read() != data:
                        raise RuntimeError('REMOTE_BACKUP_DRIFT:' + remote_path)
            # CAS before staging: no other release may have changed either asset.
            for remote_path, data in remote_before.items():
                if sftp.open(remote_path, 'rb').read() != data:
                    raise RuntimeError('REMOTE_CAS_DRIFT:' + remote_path)
            stage_paths = {REMOTE_BUNDLE: STAGE_REMOTE + '/main.min_drop100.js', REMOTE_INDEX: STAGE_REMOTE + '/index.html'}
            for staged in stage_paths.values():
                try: sftp.remove(staged)
                except FileNotFoundError: pass
            for remote_path, data in remote_after.items():
                staged = stage_paths[remote_path]
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                attr = remote_attrs[remote_path]
                sftp.chmod(staged, attr.st_mode & 0o777)
                sftp.chown(staged, attr.st_uid, attr.st_gid)
            # Validate candidate with the runtime's timezone before mutation.
            run(ssh, 'TZ=Asia/Ho_Chi_Minh node -e ' + shlex.quote(r'''const fs=require('fs'),assert=require('assert/strict');const s=fs.readFileSync(process.argv[1],'utf8');const m=s.match(/CSt\.format_14=(function\(t\)\{.*?\}),CSt\.format_15=/);assert(m);const f=eval('('+m[1]+')');assert.equal(f(1789873200000),'10:00 20/09/2026');console.log('FORMAT_TEST_PASS');''') + ' ' + shlex.quote(remote_format_test_path))
            sftp.posix_rename(stage_paths[REMOTE_BUNDLE], REMOTE_BUNDLE)
            sftp.posix_rename(stage_paths[REMOTE_INDEX], REMOTE_INDEX)

        for path, data in local_after.items():
            path.write_bytes(data)
        summary['result'] = 'DEPLOYED'
        summary['servedBundleSha'] = run(ssh, "curl -fsS 'http://127.0.0.1:81/js/main.min_drop100.js?v=" + NEW_KEY + "' | sha256sum | awk '{print $1}'").strip()
        summary['servedIndexHasNewKey'] = NEW_KEY in run(ssh, 'curl -fsS http://127.0.0.1:81/index.html')
        summary['nginxTest'] = run(ssh, 'nginx -t 2>&1 | tail -n 2').strip()
        summary['localFormatTestAfter'] = check_format(LOCAL_GAME / 'js' / 'main.min_a6195824.js')
        summary['remoteFormatTestAfter'] = 'FORMAT_TEST_PASS'
        summary['remoteBackups'] = [BACKUP_REMOTE + '/main.min_drop100.js.before', BACKUP_REMOTE + '/index.html.before']
        EVIDENCE_LOCAL.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        with ssh.open_sftp() as sftp:
            with sftp.open(STAGE_REMOTE + '/evidence.json', 'wb') as handle:
                handle.write(EVIDENCE_LOCAL.read_bytes())
            sftp.chmod(STAGE_REMOTE + '/evidence.json', 0o600)
        print(json.dumps(summary, ensure_ascii=False), flush=True)
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
