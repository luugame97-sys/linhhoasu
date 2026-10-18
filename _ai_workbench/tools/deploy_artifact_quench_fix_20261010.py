from __future__ import annotations
import hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_helper', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
LIVE = ROOT / '_ai_workbench/temp/artifact_quench_release_20261010/candidate'
REMOTE_ROOT = '/linhhoasu/lhs/newServer'
BACKUP_ROOT = '/linhhoasu/_ai_workbench/backups/artifact_quench_fix_20261010'
FILES = [('src/handlers/artifact.js', 'artifact.js'), ('src/services/BattleService.js', 'BattleService.js'), ('src/services/PlayerService.js', 'PlayerService.js')]
EXPECTED = {
    'src/handlers/artifact.js': '9c91108c0071d76ebcf3c5baffb2f542dd07d813e8fe5a33b5c29c03d882bec9',
    'src/services/BattleService.js': 'f4e09722cd897a56f59a5535c1c00429efbbcf654ad2ea39dbb00f043b2d1ab5',
    'src/services/PlayerService.js': 'f06f0368f4d85bae34b3c2ff6852b9372d56946efd6495295bf0f2f5209c18f3',
}
NODES = helper.NODES

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def q(value): return shlex.quote(value)

def main():
    ssh = helper.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = BACKUP_ROOT + '_' + stamp
    stage = '/linhhoasu/_ai_workbench/temp/artifact_quench_fix_20261010_' + stamp
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionWrites': 0, 'playerWrites': 0}
    try:
        evidence['preProcesses'] = helper.procs(ssh)
        evidence['preReady'] = {str(p): helper.ready(ssh, p) for _, p in NODES}
        if len(evidence['preProcesses']) != 8 or any(row['status'] != 'online' for row in evidence['preProcesses']): raise RuntimeError('PROCESS_BASELINE')
        if any(code != '200' for code in evidence['preReady'].values()): raise RuntimeError('PRE_READY')
        candidates = {rel: sha(LIVE / name) for rel, name in FILES}
        evidence['candidateHashes'] = candidates
        for rel, _ in FILES:
            if helper.rh(ssh, REMOTE_ROOT + '/' + rel) != EXPECTED[rel]: raise RuntimeError('CAS:' + rel)
        helper.run(ssh, 'install -d -m 700 ' + q(stage) + ' ' + q(backup))
        for rel, name in FILES:
            remote_stage = stage + '/' + rel; remote_backup = backup + '/' + rel; target = REMOTE_ROOT + '/' + rel
            helper.run(ssh, 'install -d -m 700 ' + q(remote_stage.rsplit('/', 1)[0]) + ' ' + q(remote_backup.rsplit('/', 1)[0]))
            with ssh.open_sftp() as sf: sf.put(str(LIVE / name), remote_stage)
            if helper.rh(ssh, remote_stage) != candidates[rel]: raise RuntimeError('STAGE_HASH:' + rel)
            helper.run(ssh, 'cp -p -- ' + q(target) + ' ' + q(remote_backup))
            if helper.rh(ssh, remote_backup) != EXPECTED[rel]: raise RuntimeError('BACKUP_HASH:' + rel)
        evidence['backup'] = backup
        for rel, _ in FILES:
            target = REMOTE_ROOT + '/' + rel; remote_stage = stage + '/' + rel; temp = target + '.artifact_quench_20261010.tmp'
            if helper.rh(ssh, target) != EXPECTED[rel]: raise RuntimeError('PUBLISH_CAS:' + rel)
            helper.run(ssh, 'cp -- ' + q(remote_stage) + ' ' + q(temp) + ' && chmod --reference=' + q(target) + ' ' + q(temp) + ' && chown --reference=' + q(target) + ' ' + q(temp) + ' && mv -f -- ' + q(temp) + ' ' + q(target))
            if helper.rh(ssh, target) != candidates[rel]: raise RuntimeError('FINAL_HASH:' + rel)
        evidence['installedHashes'] = {rel: helper.rh(ssh, REMOTE_ROOT + '/' + rel) for rel, _ in FILES}
        evidence['restarted'] = []
        for name, port in NODES:
            helper.run(ssh, 'pm2 restart ' + q(name), 120)
            code = '000'; deadline = time.time() + 90
            while time.time() < deadline:
                code = helper.ready(ssh, port)
                if code == '200': break
                time.sleep(1)
            if code != '200': raise RuntimeError('READY:' + name + ':' + code)
            evidence['restarted'].append({'name': name, 'port': port, 'ready': code})
        evidence['postReady'] = {str(p): helper.ready(ssh, p) for _, p in NODES}
        evidence['postProcesses'] = helper.procs(ssh)
        syntax = helper.run(ssh, 'for f in /linhhoasu/lhs/newServer/src/handlers/artifact.js /linhhoasu/lhs/newServer/src/services/BattleService.js /linhhoasu/lhs/newServer/src/services/PlayerService.js; do node --check "$f"; done; echo SYNTAX_PASS', 60).strip()
        if syntax != 'SYNTAX_PASS': raise RuntimeError('REMOTE_SYNTAX')
        evidence['syntax'] = 'PASS'; evidence['result'] = 'PASS'; evidence['verifiedAt'] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        evidence['error'] = str(exc)
        raise
    finally:
        (ROOT / '_ai_workbench/temp/artifact_quench_release_20261010/release_correct_path.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        try: helper.run(ssh, 'rm -rf -- ' + q(stage), 30)
        except Exception: pass
        ssh.close()
    print(json.dumps({'result': evidence['result'], 'backup': evidence.get('backup'), 'installedHashes': evidence.get('installedHashes'), 'postReady': evidence.get('postReady'), 'productionWrites': 0, 'playerWrites': 0}, ensure_ascii=False))

if __name__ == '__main__': main()
