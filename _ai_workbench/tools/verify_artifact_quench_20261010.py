"""Read-only runtime verification and RAM-only candidate tests."""
from pathlib import Path
import importlib.util
import json
import shlex
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/artifact_quench_release_20261010'
spec = importlib.util.spec_from_file_location('quench_release', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
sys.stdout.reconfigure(encoding='utf-8')

def main():
    ssh = helper.connect()
    app = helper.REMOTE_ROOT
    stage = '/linhhoasu/_ai_workbench/temp/artifact_quench_20261010'
    files = ['src/handlers/artifact.js', 'src/services/BattleService.js', 'src/services/PlayerService.js', 'src/net/WSServer.js']
    try:
        evidence = {'app': app, 'hashes': {rel: helper.rh(ssh, app + '/' + rel) for rel in files},
                    'processes': helper.procs(ssh), 'ready': {str(port): helper.ready(ssh, port) for _, port in helper.NODES}}
        proc_code = "const fs=require('fs');const rows=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(rows.filter(p=>/^lhs-s100[1-8]$/.test(p.name)).map(p=>({name:p.name,cwd:p.pm2_env.pm_cwd||p.pm2_env.cwd,script:p.pm2_env.pm_exec_path,pid:p.pid,actualCwd:fs.readlinkSync('/proc/'+p.pid+'/cwd')}))));"
        evidence['runtimePaths'] = json.loads(helper.run(ssh, 'pm2 jlist | node -e ' + shlex.quote(proc_code)))
        (OUT / 'runtime.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(evidence, ensure_ascii=False))
        if '--candidate' in sys.argv or '--installed' in sys.argv:
            helper.run(ssh, 'install -d -m 700 ' + shlex.quote(stage))
            with ssh.open_sftp() as sf:
                sf.put(str(ROOT / '_ai_workbench/tools/test_artifact_quench_20261010.js'), stage + '/contract.js')
                if '--candidate' in sys.argv:
                    for name in ['artifact.js', 'BattleService.js', 'PlayerService.js']:
                        sf.put(str(OUT / 'candidate' / name), stage + '/' + name)
            env = 'APP_ROOT=' + shlex.quote(app)
            if '--candidate' in sys.argv:
                env += ' QUENCH_CANDIDATE=' + shlex.quote(stage)
            output = helper.run(ssh, env + ' node ' + shlex.quote(stage + '/contract.js'), 60)
            kind = 'candidate' if '--candidate' in sys.argv else 'installed'
            (OUT / (kind + '_contract.txt')).write_text(output, encoding='utf-8')
            print(output)
        with ssh.open_sftp() as sf:
            for rel in ['src/services/ConfigService.js', 'src/services/OldTrekSnapshotService.js']:
                sf.get(app+'/'+rel, str(OUT / Path(rel).name))
            sf.get('/linhhoasu/webgame/game/index.html', str(OUT / 'index.before.html'))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
