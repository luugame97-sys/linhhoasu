"""Backup then grant resources through existing GM APIs to authorized vanduc97."""
from pathlib import Path
import json
import shlex
from auction_ops_20261015 import connect, APP, run

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/cross_rival_20261015'

def main():
    receipt = TASK / 'admin-native-resource-grant.json'
    backup = TASK / 'admin-native-resource-plan.json'
    if receipt.exists() or backup.exists():
        raise RuntimeError('Existing resource operation; inspect read-back instead of repeating')
    source = (ROOT / '_ai_workbench/tools/cross_rival_native_resources_20261015.js').read_text(encoding='utf-8')
    client = connect()
    try:
        def execute(payload):
            script = 'const input=' + json.dumps(payload) + ';\n' + source
            return json.loads(run(client, 'cd ' + shlex.quote(APP) + " && timeout 50s node - <<'RIVAL_GM_NATIVE'\n" + script + '\nRIVAL_GM_NATIVE', timeout=55))
        plan = execute({'mode':'plan'})
        backup.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
        result = execute({'mode':'apply','plan':plan})
        receipt.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'accountId':result['accountId'],'rolesVerified':sum(r['verified'] for r in result['rows']),
                          'backup':str(backup),'receipt':str(receipt)}))
    finally:
        client.close()

if __name__ == '__main__': main()
