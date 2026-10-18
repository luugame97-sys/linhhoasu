import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skin_incident_remote import connect, run

REMOTE = r'''#!/usr/bin/env bash
set -euo pipefail
nodes=("lhs-s1001 8080" "lhs-s1002 8083" "lhs-s1003 8084" "lhs-s1004 8085" "lhs-s1005 8086" "lhs-s1006 8087" "lhs-s1007 8088" "lhs-s1008 8089")
for entry in "${nodes[@]}"; do
  read -r name port <<< "$entry"
  pm2 restart "$name" --update-env >/dev/null
  ok=0
  for i in {1..60}; do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port}/ready" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let x=JSON.parse(s);process.exit(x.status==="ok"&&x.checks.mongo===true&&x.checks.redis===true?0:1)}catch(e){process.exit(1)}})' >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  test "$ok" -eq 1
  echo "READY:$name"
done
node - <<'NODE'
const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService'); C.reload();
const d=Object.values(C.get('CrossArenaDayRankRewardConfig')).map(x=>x.rewards.find(r=>r.id===1001).count);
const w=Object.values(C.get('CrossArenaWeeklyRankRewardConfig')).map(x=>x.rewards.find(r=>r.id===1001).count);
console.log(JSON.stringify({day:d,week:w,playerWrites:0,productionWrites:0}));
if(JSON.stringify(d)!==JSON.stringify([3750,3000,2250,1500,1200,750,450,300,150,75])||JSON.stringify(w)!==JSON.stringify([11250,9000,6750,5625,5625,4500,4500,4050,3375,2250])) process.exit(2);
NODE
'''

with connect() as client:
    sftp = client.open_sftp()
    remote = '/linhhoasu/_ai_workbench/temp/finish_cross_arena_1001_half_20261015.sh'
    try:
        with sftp.open(remote, 'w') as f: f.write(REMOTE)
    finally: sftp.close()
    print(run(client, f'bash {remote}'))

if __name__ == '__main__': pass
