"""Read-only TopArena live audit; no player, reward, DB or runtime writes."""
from __future__ import annotations

import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
OUT = WB / "temp" / "top_arena_live_20260927"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        command = r'''
set -o pipefail
printf '{"pm2":'
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(p=>/^lhs-s\d+$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}));process.stdout.write(JSON.stringify(a));});'
printf ',"ready":['
first=1
for p in 8080 8083 8084 8085 8086 8087; do
  rm -f /tmp/top_arena_ready_body_$p
  code=$(curl --noproxy '*' -sS --max-time 5 -o /tmp/top_arena_ready_body_$p -w '%{http_code}' http://127.0.0.1:$p/ready || true)
  body=$(if [ -f /tmp/top_arena_ready_body_$p ]; then tr -d '\n' </tmp/top_arena_ready_body_$p | head -c 1200; fi | sed 's/\\/\\\\/g;s/"/\\"/g')
  [ $first -eq 0 ] && printf ','
  first=0
  printf '{"port":%s,"code":"%s","body":"%s"}' "$p" "$code" "$body"
done
printf '],"hashes":'
sha256sum /linhhoasu/lhs/newServer/src/handlers/arena.js /linhhoasu/lhs/newServer/src/services/CrossEventScheduleService.js /linhhoasu/lhs/newServer/src/services/CrossServerEventService.js /linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json
printf ',"logs":'
for f in /root/.pm2/logs/lhs-s100*-out.log /root/.pm2/logs/lhs-s100*-error.log; do
  [ -f "$f" ] || continue
  printf '\n---%s---\n' "$f"
  rg -n --text 'TopArena|6200|6201|6202|6203|6210|6211|6212|6213|6214|6215|6216|6217|6218|6220|6221|tag=2350|CROSS_EVENT|TypeError|ReferenceError|SyntaxError|Unhandled' "$f" | tail -n 160 || true
done
'''
        raw = run(ssh, "bash -lc " + shlex.quote(command))
        evidence = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "readOnly": True,
            "rawSha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "raw": raw,
        }
        (OUT / "audit.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"path": str(OUT / "audit.json"), "rawSha256": evidence["rawSha256"], "bytes": len(raw.encode("utf-8"))}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
