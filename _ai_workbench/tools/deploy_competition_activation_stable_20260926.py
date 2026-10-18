"""Deploy durable Arena activation handling with a scoped rollback path."""
import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'linhhoasu/lhs/newServer'
REMOTE_ROOT = '/linhhoasu/lhs/newServer'
BACKUP = '/linhhoasu/_ai_workbench/backups/competition_activation_stable_20260926'
STAGE = '/linhhoasu/_ai_workbench/temp/competition_activation_stable_20260926'
FILES = ['src/app.js', 'src/config/competitionsRelease.js']
EXPECTED_REMOTE = {
    'src/app.js': '20d816a46e77f8d20f7d54c541ab1f05d2b86dc4f5cfbdd88ef687df0d0bb667',
    'src/config/competitionsRelease.js': 'b21df68a1bc103c01fe5baa442232350b4757c17d0386b3eafa12d70daad4f6e',
}
S5_ENV = 'ARENA_SETTLEMENT_ENABLED=1 ARENA_SETTLEMENT_APPROVED=1 ARENA_SETTLEMENT_ACTIVATION_AT=1789873200000'
NODES = [('lhs-s1005', 8086), ('lhs-s1001', 8080), ('lhs-s1002', 8083), ('lhs-s1003', 8084), ('lhs-s1004', 8085)]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    payload = {rel: (APP / rel).read_bytes() for rel in FILES}
    if sha(payload['src/app.js']) != 'b1831ed0766be3661e35ee9c37fd4415e9c4b9c7c582924d5e97ea1795f78366':
        raise RuntimeError('LOCAL_APP_HASH_UNEXPECTED')
    if sha(payload['src/config/competitionsRelease.js']) != '3a2124ead4bf7e60433d0957cec94298f053fafe583bf48672709700de01922b':
        raise RuntimeError('LOCAL_RELEASE_HASH_UNEXPECTED')

    ssh = connect()
    stage = f'{STAGE}_{int(time.time())}'
    swapped = []
    restarted = []
    readiness = {}
    try:
        with ssh.open_sftp() as sftp:
            remote = {rel: sftp.open(f'{REMOTE_ROOT}/{rel}', 'rb').read() for rel in FILES}
            attrs = {rel: sftp.stat(f'{REMOTE_ROOT}/{rel}') for rel in FILES}
            for rel in FILES:
                if sha(remote[rel]) != EXPECTED_REMOTE[rel]:
                    raise RuntimeError(f'REMOTE_CAS_DRIFT:{rel}')
            run(ssh, f'install -d -m 700 {shlex.quote(BACKUP)} {shlex.quote(stage)}')
            for rel in FILES:
                bp = f'{BACKUP}/{Path(rel).name}.before'
                try:
                    old = sftp.open(bp, 'rb').read()
                except FileNotFoundError:
                    with sftp.open(bp, 'wb') as handle:
                        handle.write(remote[rel])
                    sftp.chmod(bp, 0o600)
                else:
                    if old != remote[rel]:
                        raise RuntimeError(f'BACKUP_DRIFT:{rel}')
            dump = '/root/.pm2/dump.pm2'
            dump_backup = f'{BACKUP}/dump.pm2.before'
            try:
                old_dump = sftp.open(dump_backup, 'rb').read()
            except FileNotFoundError:
                with sftp.open(dump, 'rb') as source, sftp.open(dump_backup, 'wb') as target:
                    target.write(source.read())
                sftp.chmod(dump_backup, 0o600)
            for rel, data in payload.items():
                target = f'{stage}/{rel}'
                run(ssh, f'install -d -m 700 {shlex.quote(str(Path(target).parent).replace(chr(92), chr(47)))}')
                with sftp.open(target, 'wb') as handle:
                    handle.write(data)
                sftp.chmod(target, attrs[rel].st_mode & 0o777)
            for rel in FILES:
                run(ssh, f'node --check {shlex.quote(stage + "/" + rel)}')
            for rel in FILES:
                src = f'{REMOTE_ROOT}/{rel}'
                staged = f'{stage}/{rel}'
                if sftp.open(src, 'rb').read() != remote[rel]:
                    raise RuntimeError(f'PRE_SWAP_CAS_DRIFT:{rel}')
                sftp.posix_rename(staged, src)
                swapped.append(src)

        for name, port in NODES:
            command = f'{S5_ENV} pm2 restart {shlex.quote(name)} --update-env' if name == 'lhs-s1005' else f'pm2 restart {shlex.quote(name)} --update-env'
            run(ssh, command)
            restarted.append(name)
            code = ''
            for _ in range(20):
                code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == '200':
                    break
                time.sleep(2)
            readiness[name] = code
            if code != '200':
                raise RuntimeError(f'READY_FAILED:{name}:{code}')
        run(ssh, 'pm2 save')
        state_js = r'''const cp=require('child_process'),fs=require('fs'),crypto=require('crypto');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).filter(p=>/^lhs-s100[1-5]$/.test(p.name));
const saved=JSON.parse(fs.readFileSync('/root/.pm2/dump.pm2','utf8')).filter(p=>/^lhs-s100[1-5]$/.test(p.name));
const env=p=>({name:p.name,status:p.pm2_env?.status||p.status,enabled:p.pm2_env?.env?.ARENA_SETTLEMENT_ENABLED??p.env?.ARENA_SETTLEMENT_ENABLED,approved:p.pm2_env?.env?.ARENA_SETTLEMENT_APPROVED??p.env?.ARENA_SETTLEMENT_APPROVED,activation:p.pm2_env?.env?.ARENA_SETTLEMENT_ACTIVATION_AT??p.env?.ARENA_SETTLEMENT_ACTIVATION_AT});
console.log(JSON.stringify({live:pm.map(env),saved:saved.map(env)}));'''
        state = json.loads(run(ssh, 'node -', state_js))
        hash_js = "const c=require('crypto'),fs=require('fs');const p=process.argv.slice(2);console.log(JSON.stringify(Object.fromEntries(p.map(x=>[x,c.createHash('sha256').update(fs.readFileSync(x)).digest('hex')]))));"
        remote_hashes = json.loads(run(ssh, 'node - ' + ' '.join(shlex.quote(f'{REMOTE_ROOT}/{x}') for x in FILES), hash_js))
        report = {
            'result': 'DEPLOYED_COMPETITION_ACTIVATION_STABLE',
            'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'directPlayerWrites': 0,
            'backup': BACKUP,
            'beforeHashes': {rel: sha(remote[rel]) for rel in FILES},
            'afterHashes': remote_hashes,
            'restarted': restarted,
            'readiness': readiness,
            'state': state,
            'policy': 'Arena activation uses durable SERVER_OPEN_TIME/configured activation; missing open time fails closed; S5 env persisted explicitly before pm2 save',
        }
        out = ROOT / '_ai_workbench/temp/competition_activation_stable_20260926_release.json'
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception:
        if swapped:
            try:
                with ssh.open_sftp() as sftp:
                    for src in swapped:
                        rel = src[len(REMOTE_ROOT) + 1:]
                        backup = f'{BACKUP}/{Path(rel).name}.before'
                        tmp = src + '.rollback_tmp'
                        with sftp.open(backup, 'rb') as source, sftp.open(tmp, 'wb') as target:
                            target.write(source.read())
                        sftp.posix_rename(tmp, src)
                for name, _ in NODES:
                    try:
                        run(ssh, f'pm2 restart {shlex.quote(name)} --update-env')
                    except Exception:
                        pass
            except Exception:
                pass
        raise
    finally:
        try:
            run(ssh, f'rm -rf -- {shlex.quote(stage)}')
        except Exception:
            pass
        ssh.close()


if __name__ == '__main__':
    main()
