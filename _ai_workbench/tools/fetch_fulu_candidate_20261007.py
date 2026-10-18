from pathlib import Path
import hashlib
import json
from skin_incident_remote import connect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/event_goal_20261007/fulu/before'
FILES = ['handlers/activity.js', 'services/PlayerMutationService.js', 'services/FeatureReceiptService.js', 'services/PlayerService.js', 'services/RewardGrantService.js']

with connect() as client:
    with client.open_sftp() as sftp:
        result = {}
        for relative in FILES:
            remote = '/linhhoasu/lhs/newServer/src/' + relative
            try:
                with sftp.open(remote, 'rb') as stream:
                    data = stream.read()
            except FileNotFoundError:
                result[relative] = {'missing': True}
                continue
            target = OUT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            result[relative] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        print(json.dumps(result, indent=2))
