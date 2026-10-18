"""Read-only require smoke after the scoped production release."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

CODE = """const files=['src/handlers/account.js','src/handlers/upgrade.js','src/handlers/playerPayload.js','src/handlers/task.js','src/handlers/arena.js','src/handlers/mine.js','src/handlers/artifact.js','src/handlers/valhalla.js','src/services/SideTaskProgressService.js','src/services/FeatureMutationService.js','src/services/DoubleTowerLifecycleService.js'];for(const f of files)require('/linhhoasu/lhs/newServer/'+f);console.log(JSON.stringify({status:'PASS',files,productionWrites:0}));"""

ssh = connect()
try:
    data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -e ' + json.dumps(CODE)))
finally:
    ssh.close()
print(json.dumps(data, ensure_ascii=False))
