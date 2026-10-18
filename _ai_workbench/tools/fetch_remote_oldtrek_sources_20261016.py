from pathlib import Path
import paramiko
import sys
from skin_incident_remote import connect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench' / 'temp' / 'oldtrek_fix_20261016' / 'remote'
OUT.mkdir(parents=True, exist_ok=True)
files = {
    '/linhhoasu/lhs/newServer/src/app.js': OUT / 'app.js',
    '/linhhoasu/lhs/newServer/ecosystem.config.js': OUT / 'ecosystem.config.js',
    '/linhhoasu/lhs/newServer/src/services/OldTrekArenaService.js': OUT / 'OldTrekArenaService.js',
    '/linhhoasu/lhs/newServer/src/services/OldTrekEventService.js': OUT / 'OldTrekEventService.js',
}
if '--hardening' in sys.argv:
    OUT = OUT.parent / 'baseline2'
    OUT.mkdir(parents=True, exist_ok=True)
    relatives = ['src/handlers/old-trek.js', 'src/services/PlayerService.js',
                 'src/services/OldTrekEventService.js', 'src/services/OldTrekArenaService.js',
                 'src/services/OldTrekMaintenanceService.js', 'src/services/OldTrekScheduleService.js',
                 'src/services/OldTrekSettlementService.js', 'src/services/OldTrekSnapshotService.js',
                 'src/services/OldTrekProgressService.js', 'src/services/CurrencySync.js',
                 'src/services/OldTrekLedgerService.js', 'src/services/PlayerMutationService.js',
                 'src/config/oldTrekGameplayPolicy.json', 'ecosystem.config.js']
    files = {'/linhhoasu/lhs/newServer/' + rel: OUT / rel for rel in relatives}
with connect() as client:
    sftp = client.open_sftp()
    try:
        for remote, local in files.items():
            local.parent.mkdir(parents=True, exist_ok=True)
            with sftp.open(remote, 'rb') as src:
                local.write_bytes(src.read())
    finally:
        sftp.close()
print('\n'.join(str(v) for v in files.values()))
