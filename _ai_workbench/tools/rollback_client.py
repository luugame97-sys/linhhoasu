"""Rollback client to client_pet_release_fix_20260929_131108."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from snapshot_web_multiserver_20260906 import connect, run

BACKUP = '/linhhoasu/_ai_workbench/backups/client_pet_release_fix_20260929_131108'
FILES = [
    '/linhhoasu/webgame/game/index.html',
    '/linhhoasu/webgame/game/js/main.min_drop100.js',
]

def main():
    s = connect()
    for f in FILES:
        run(s, f'cp -p -- {BACKUP}{f} {f}')
    print('Rollback restored files.')
    print(run(s, 'sha256sum /linhhoasu/webgame/game/index.html /linhhoasu/webgame/game/js/main.min_drop100.js'))
    s.close()

if __name__ == '__main__':
    main()
