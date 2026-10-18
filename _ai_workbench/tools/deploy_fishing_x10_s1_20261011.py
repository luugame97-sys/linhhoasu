from __future__ import annotations
import hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('helper', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
REMOTE = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'
LOCAL = ROOT / 'linhhoasu'
FILES = [('src/handlers/compat.js', 'compat.js'),
         ('src/services/FishingX10Service.js', 'FishingX10Service.js')]
WEB_FILES = [('webgame/game/index.html', 'index.html'), ('webgame/game/js/lhs-fishing-x10-v1.js', 'lhs-fishing-x10-v1.js')]
EXPECTED_COMPAT = 'bff94a6b96bd2d7bb4291e39a50661960f114cd07110e08e9d73abddea8d3a59'

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def q(value): return shlex.quote(value)

def main():
    ssh = helper.connect(); stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/fishing_x10_s1_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/fishing_x10_s1_{stamp}'
    evidence = {'at': datetime.now(timezone.utc).isoformat(), 'result': 'FAILED', 'productionWrites': 0, 'playerWrites': 0}
    try:
        pre = helper.procs(ssh); evidence['preProcess'] = next(x for x in pre if x['name'] == 'lhs-s1001')
        evidence['preReady'] = helper.ready(ssh, 8080)
        if evidence['preProcess']['status'] != 'online' or evidence['preReady'] != '200': raise RuntimeError('S1_BASELINE')
        compat_target = REMOTE + '/src/handlers/compat.js'
        compat_hash = helper.rh(ssh, compat_target)
        if compat_hash != EXPECTED_COMPAT: raise RuntimeError('COMPAT_CAS:' + compat_hash)
        service_target = REMOTE + '/src/services/FishingX10Service.js'
        if helper.run(ssh, 'test -e ' + q(service_target) + ' && echo EXISTS || echo MISSING').strip() != 'MISSING': raise RuntimeError('SERVICE_COLLISION')
        idx_target = WEB + '/index.html'; idx_hash = helper.rh(ssh, idx_target)
        addon_target = WEB + '/js/lhs-fishing-x10-v1.js'
        if helper.run(ssh, 'test -e ' + q(addon_target) + ' && echo EXISTS || echo MISSING').strip() != 'MISSING': raise RuntimeError('ADDON_COLLISION')
        baseline = (ROOT / 'linhhoasu/webgame/game/index.html').read_bytes()
        baseline = b'\r\n'.join(line for line in baseline.split(b'\r\n') if b'lhs-fishing-x10-v1.js?v=20261010_fishing_x10_s1' not in line)
        marker = b'"js/lhs-artifact-quench-v1.js?v=20261010_quench_v1",'
        if baseline.count(marker) != 1: raise RuntimeError('INDEX_LOCAL_MARKER')
        index_data = baseline.replace(marker, marker + b'\r\n\t\t"js/lhs-fishing-x10-v1.js?v=20261010_fishing_x10_s1",')
        candidates = {rel: sha(ROOT / 'linhhoasu/lhs/newServer' / rel) for rel, _ in FILES}
        candidates.update({rel: sha(ROOT / 'linhhoasu' / rel) for rel, _ in WEB_FILES})
        candidate_index_hash = hashlib.sha256(index_data).hexdigest()
        candidates['webgame/game/index.html'] = candidate_index_hash
        helper.run(ssh, 'install -d -m 700 ' + q(stage) + ' ' + q(backup))
        # Source backup/CAS
        helper.run(ssh, 'install -d -m 700 ' + q(backup + '/src/handlers') + ' ' + q(backup + '/src/services'))
        helper.run(ssh, 'cp -p -- ' + q(compat_target) + ' ' + q(backup + '/src/handlers/compat.js'))
        if helper.rh(ssh, backup + '/src/handlers/compat.js') != EXPECTED_COMPAT: raise RuntimeError('BACKUP_COMPAT')
        # Static index backup/CAS
        helper.run(ssh, 'install -d -m 700 ' + q(backup + '/webgame/game'))
        helper.run(ssh, 'cp -p -- ' + q(idx_target) + ' ' + q(backup + '/webgame/game/index.html'))
        if helper.rh(ssh, backup + '/webgame/game/index.html') != idx_hash: raise RuntimeError('BACKUP_INDEX')
        for rel, name in FILES:
            remote_stage = stage + '/' + rel; target = REMOTE + '/' + rel
            helper.run(ssh, 'install -d -m 700 ' + q(remote_stage.rsplit('/', 1)[0]))
            with ssh.open_sftp() as sf: sf.put(str(ROOT / 'linhhoasu/lhs/newServer' / rel), remote_stage)
            if helper.rh(ssh, remote_stage) != candidates[rel]: raise RuntimeError('STAGE_SOURCE:'+rel)
            tmp = target + '.fishing_x10.tmp'
            helper.run(ssh, 'cp -- ' + q(remote_stage) + ' ' + q(tmp) + ' && chmod 640 ' + q(tmp) + ' && chown root:www ' + q(tmp) + ' && mv -f -- ' + q(tmp) + ' ' + q(target))
        # Publish index from locally constructed candidate and addon.
        for rel, name in WEB_FILES:
            target = WEB + '/' + rel.split('webgame/game/', 1)[1] if rel.startswith('webgame/game/') else WEB+'/'+name
            remote_stage = stage + '/' + rel
            helper.run(ssh, 'install -d -m 700 ' + q(remote_stage.rsplit('/', 1)[0]))
            with ssh.open_sftp() as sf:
                with sf.open(remote_stage, 'wb') as f: f.write(index_data if name == 'index.html' else (ROOT / 'linhhoasu' / rel).read_bytes())
            tmp = target + '.fishing_x10.tmp'
            helper.run(ssh, 'cp -- ' + q(remote_stage) + ' ' + q(tmp) + ' && chmod --reference=' + q(target) + ' ' + q(tmp) + ' 2>/dev/null || chmod 644 ' + q(tmp))
            helper.run(ssh, 'chown root:www ' + q(tmp) + ' && mv -f -- ' + q(tmp) + ' ' + q(target))
        # Readback and restart S1 only.
        evidence['installedHashes'] = {
            'compat.js': helper.rh(ssh, compat_target),
            'FishingX10Service.js': helper.rh(ssh, service_target),
            'index.html': helper.rh(ssh, idx_target),
            'lhs-fishing-x10-v1.js': helper.rh(ssh, addon_target),
        }
        helper.run(ssh, 'node --check ' + q(compat_target) + ' && node --check ' + q(service_target) + ' && node --check ' + q(addon_target))
        helper.run(ssh, 'pm2 restart lhs-s1001', 120)
        deadline = time.time() + 90; ready = '000'
        while time.time() < deadline:
            ready = helper.ready(ssh, 8080)
            if ready == '200': break
            time.sleep(1)
        if ready != '200': raise RuntimeError('POST_READY:' + ready)
        evidence['postProcess'] = next(x for x in helper.procs(ssh) if x['name'] == 'lhs-s1001')
        evidence['postReady'] = ready
        evidence['result'] = 'PASS'; evidence['backup'] = backup; evidence['verifiedAt'] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        evidence['error'] = str(exc); raise
    finally:
        (ROOT / '_ai_workbench/temp/fishing_x10_s1_20261010/release.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        try: helper.run(ssh, 'rm -rf -- ' + q(stage), 30)
        except Exception: pass
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False))

if __name__ == '__main__': main()
