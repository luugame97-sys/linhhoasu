from pathlib import Path
import hashlib
from skin_incident_remote import connect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/mainline_infinite_20261014/baseline_extra'
FILES = {
    'src/handlers/upgrade.js': '/linhhoasu/lhs/newServer/src/handlers/upgrade.js',
    'src/services/CultivationProgressionService.js': '/linhhoasu/lhs/newServer/src/services/CultivationProgressionService.js',
}

with connect() as ssh:
    with ssh.open_sftp() as sftp:
        for rel, remote in FILES.items():
            dest = OUT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            with sftp.open(remote, 'rb') as handle:
                data = handle.read()
            dest.write_bytes(data)
            with sftp.open(remote, 'rb') as handle:
                if hashlib.sha256(handle.read()).hexdigest() != hashlib.sha256(data).hexdigest():
                    raise RuntimeError('DRIFT:' + remote)
print('EXTRA_BASELINE_SAVED:' + str(len(FILES)))
