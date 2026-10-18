"""Read-only remote Pet incident audit, stores bounded evidence locally."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '_ai_workbench/tools/audit_pet_incident_20260924.js'
OUT = ROOT / '_ai_workbench/temp/pet_incident_20260924'

def main():
    ssh = connect()
    try:
        result = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', SCRIPT.read_text(encoding='utf-8')))
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'live.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        compact = {'at': result['at'], 'servers': [{k:v for k,v in row.items() if k not in ['inventory','logs']} | {'playersWithPets':row['inventory']['playersWithPets'],'fullSlots':row['inventory']['fullSlots'],'anomalies':len(row['inventory']['anomalies']), 'logs':row['logs']} for row in result['servers']], 'target':[{k:v for k,v in row.items() if k not in ['pets','soulBindings']} for row in result['target']]}
        print(json.dumps(compact, ensure_ascii=True, indent=2))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
