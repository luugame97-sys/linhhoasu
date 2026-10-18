"""Read scoped production config; persist local audit evidence, never game data."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'_ai_workbench/temp/box_tier100_20260922/requirements_live.json'
ssh = connect()
try:
    script = Path(__file__).with_suffix('.js').read_text(encoding='utf8')
    data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && timeout 50s node', script))
finally:
    ssh.close()
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps({ 'at':data['at'], 'tiers':data['tierCount'], 'tier10':data['boxTier10'],
    'tasks10':data['boxTierTasks10'], 'maxBossStage':data['maxBossStage'],
    'bossBeyondConfigFromTier':data.get('bossBeyondConfigFromTier'), 'items':data['items'], 'evidence':str(OUT)}, ensure_ascii=True))
