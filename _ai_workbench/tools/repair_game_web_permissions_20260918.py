"""Narrow, reversible repair of the two confirmed inaccessible static directories."""
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding='utf-8')
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE = r'''
set -eu
game=/linhhoasu/webgame/game
test "$(stat -c '%a:%U:%G' "$game")" = '750:root:root'
test "$(stat -c '%a:%U:%G' "$game/js")" = '750:root:root'
id www
backup=$(mktemp -d /linhhoasu/_ai_workbench/backups/web_permissions_20260918_XXXXXX)
getfacl -p "$game" "$game/js" > "$backup/permissions.acl"
sha256sum "$game/index.html" > "$backup/index.sha256"
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));' > "$backup/processes.json"
rollback() { setfacl --restore="$backup/permissions.acl"; }
trap rollback ERR
chgrp www "$game" "$game/js"
runuser -u www -- test -r "$game/index.html"
runuser -u www -- test -x "$game/js"
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:81/)" = 200
sha256sum -c "$backup/index.sha256"
stat -c '%n %a %U:%G' "$game" "$game/js"
printf 'BACKUP=%s\n' "$backup"
'''

if __name__ == '__main__':
    ssh = connect()
    try:
        result = run(ssh, 'bash -se', REMOTE)
        print(result)
        out = WB / 'temp/game_web_permissions_20260918'
        out.mkdir(exist_ok=True, parents=True)
        (out / 'repair.txt').write_text(result, encoding='utf-8')
    finally:
        ssh.close()
