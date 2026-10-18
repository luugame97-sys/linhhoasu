"""Read-only production baseline. Downloads selected evidence; never deploys."""
from pathlib import Path
import importlib.util
import hashlib
import json
import shlex
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

def main():
    if (OUT / 'baseline.json').exists():
        raise RuntimeError('Baseline already exists; do not overwrite evidence')
    out = OUT / 'baseline'
    out.mkdir(parents=True, exist_ok=True)
    app = helper.REMOTE_ROOT
    files = {
        'artifact.js': app + '/src/handlers/artifact.js',
        'BattleService.js': app + '/src/services/BattleService.js',
        'PlayerService.js': app + '/src/services/PlayerService.js',
        'WSServer.js': app + '/src/net/WSServer.js',
        'FeatureReceiptService.js': app + '/src/services/FeatureReceiptService.js',
        'PlayerMutationService.js': app + '/src/services/PlayerMutationService.js',
        'account.js': app + '/src/handlers/account.js',
        'lhs-artifact-quench-v1.js': '/linhhoasu/webgame/game/js/lhs-artifact-quench-v1.js',
        'index.html': '/linhhoasu/webgame/game/index.html',
        'main.min_drop200.js': '/linhhoasu/webgame/game/js/main.min_drop200.js',
    }
    ssh = helper.connect()
    try:
        evidence = {'at': datetime.now(timezone.utc).isoformat(), 'productionWrites': 0, 'files': {}}
        with ssh.open_sftp() as sf:
            for name, remote in files.items():
                before = helper.rh(ssh, remote)
                sf.get(remote, str(out / name))
                digest = hashlib.sha256((out / name).read_bytes()).hexdigest()
                if before != digest or helper.rh(ssh, remote) != digest:
                    raise RuntimeError('SOURCE_DRIFT:' + name)
                evidence['files'][name] = {'remote': remote, 'sha256': digest}
        code = "const c=require('./src/services/ConfigService');c.loadAllTables();console.log('CONFIG_JSON:'+JSON.stringify(Object.fromEntries(['ArtifactBaseConfig','ArtifactForgeConfig','ArtifactQuenchConfig','ArtifactConfig','ArtifactForgeSkillConfig','ArtifactSkillConfig','ArtifactElementSkillConfig','SkillConfig','ArtifactForgeAttrsConfig'].map(k=>[k,c.get(k)]))));"
        raw = helper.run(ssh, 'cd ' + shlex.quote(app) + ' && node -e ' + shlex.quote(code), 60)
        configs = json.loads(raw.split('CONFIG_JSON:', 1)[1].splitlines()[0])
        (out / 'config.json').write_text(json.dumps(configs, ensure_ascii=False), encoding='utf-8')
        evidence['configHash'] = hashlib.sha256((out / 'config.json').read_bytes()).hexdigest()
        evidence['processes'] = helper.procs(ssh)
        evidence['ready'] = {name: json.loads(helper.run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:' + str(port) + '/ready', 15)) for name, port in helper.NODES}
        evidence['served'] = {}
        for rel in ['index.html', 'js/main.min_drop200.js', 'js/lhs-artifact-quench-v1.js']:
            command = 'curl -fsS --max-time 30 ' + shlex.quote('https://linhhoasu.lol/' + rel) + ' | sha256sum'
            evidence['served'][rel] = helper.run(ssh, command, 40).split()[0]
        (OUT / 'baseline.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'result': 'BASELINE_SAVED', 'files': evidence['files'], 'ready': evidence['ready'], 'served': evidence['served'], 'productionWrites': 0}))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
