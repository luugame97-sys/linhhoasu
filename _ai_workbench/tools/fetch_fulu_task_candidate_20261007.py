from pathlib import Path
import hashlib
from skin_incident_remote import connect

root = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/event_goal_20261007/fulu/before'
files = ['services/RealmTaskProgressService.js']
with connect() as client:
    with client.open_sftp() as sftp:
        for relative in files:
            with sftp.open('/linhhoasu/lhs/newServer/src/' + relative, 'rb') as stream:
                data = stream.read()
            target = root / relative
            if target.exists() and target.read_bytes() != data:
                raise RuntimeError('Refusing changed baseline: ' + relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(relative, hashlib.sha256(data).hexdigest())
