from pathlib import Path
import importlib.util
import json
import shlex
import sys

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('transport', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
OUT = ROOT / '_ai_workbench/temp/artifact_forge_20261013'
REMOTE = '/linhhoasu/_ai_workbench/temp/artifact_forge_20261013_candidate'

def main():
    ssh = helper.connect()
    try:
        helper.run(ssh, 'rm -rf -- ' + shlex.quote(REMOTE) + ' && install -d -m 700 -- ' + shlex.quote(REMOTE + '/candidate'))
        with ssh.open_sftp() as sf:
            sf.put(str(OUT / 'candidate/artifact.js'), REMOTE + '/candidate/artifact.js')
            sf.put(str(ROOT / '_ai_workbench/tools/test_artifact_forge_contract_20261013.js'), REMOTE + '/test.js')
        command = 'cd ' + shlex.quote(helper.REMOTE_ROOT) + ' && APP_ROOT=' + shlex.quote(helper.REMOTE_ROOT) + ' FORGE_CANDIDATE=' + shlex.quote(REMOTE + '/candidate') + ' node ' + shlex.quote(REMOTE + '/test.js')
        output = helper.run(ssh, command, 120)
        (OUT / 'candidate_contract.txt').write_text(output, encoding='utf-8')
        print(output)
        if '"result":"PASS"' not in output.replace(' ', ''):
            raise RuntimeError('candidate contract did not pass')
    finally:
        try: helper.run(ssh, 'rm -rf -- ' + shlex.quote(REMOTE), 30)
        finally: ssh.close()

if __name__ == '__main__': main()
