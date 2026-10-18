"""Make the verified game vhost the default for public port 81, with rollback."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding="utf-8")
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / "temp/pydeps"))
from snapshot_web_multiserver_20260906 import connect, run

REMOTE = r'''
set -eu
cfg=/www/server/panel/vhost/nginx/game.lhs.conf
test "$(grep -Ec '^[[:space:]]*listen[[:space:]]+81;[[:space:]]*$' "$cfg")" = 1
test "$(grep -Ec '^[[:space:]]*listen[[:space:]]+81[[:space:]]+default_server;[[:space:]]*$' "$cfg")" = 0
backup=$(mktemp -d /linhhoasu/_ai_workbench/backups/game_vhost_ws_20260918_XXXXXX)
cp -p "$cfg" "$backup/game.lhs.conf"
sha256sum "$cfg" > "$backup/game.lhs.conf.sha256.before"
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));' > "$backup/processes.before.json"
rollback() {
  cp -p "$backup/game.lhs.conf" "$cfg"
  nginx -t >/dev/null 2>&1 && nginx -s reload || true
}
trap rollback ERR
sed -i '0,/^[[:space:]]*listen[[:space:]]*81;[[:space:]]*$/s//    listen 81 default_server;/' "$cfg"
grep -Eq '^[[:space:]]*listen[[:space:]]+81[[:space:]]+default_server;[[:space:]]*$' "$cfg"
nginx -t
nginx -s reload
sleep 1
node - <<'NODE'
const net=require('net'),crypto=require('crypto');
const targets=['/ws','/ws-s2','/ws-s3','/ws-s4'];
(async()=>{for(const path of targets){await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port:81},()=>{const k=crypto.randomBytes(16).toString('base64');s.write(`GET ${path} HTTP/1.1\r\nHost: 103.116.105.154:81\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${k}\r\nSec-WebSocket-Version: 13\r\n\r\n`)});let data='';s.on('data',d=>{data+=d;s.destroy()});s.on('close',()=>/^HTTP\/1\.1 101 /.test(data)?resolve():reject(Error(path+':'+(data.split('\r\n')[0]||'no response'))));s.on('error',reject);setTimeout(()=>s.destroy(),5000);})}console.log('WS_INTERNAL_ALL_101')})().catch(e=>{console.error(e.stack);process.exit(1)});
NODE
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/)" = 200
sha256sum "$cfg" > "$backup/game.lhs.conf.sha256.after"
printf 'BACKUP=%s\n' "$backup"
'''

if __name__ == "__main__":
    ssh = connect()
    try:
        result = run(ssh, "bash -se", REMOTE)
        out = WB / "temp/game_websocket_vhost_20260918"
        out.mkdir(parents=True, exist_ok=True)
        (out / "repair.txt").write_text(result, encoding="utf-8")
        print(result)
    finally:
        ssh.close()
