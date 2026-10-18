"""Read-only bounded reconcile log audit; strips secrets and never writes production."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/reconcile_logs.json"
NODE = r'''const fs=require('fs');const names=Array.from({length:9},(_,i)=>'lhs-s'+(1001+i));const out={};for(const n of names){const rows=[];for(const suffix of ['error','out']){const f='/root/.pm2/logs/'+n+'-'+suffix+'.log';if(!fs.existsSync(f))continue;const b=fs.readFileSync(f,'utf8').split('\n').filter(x=>/OldTrekReconcile|startup failed|uncaught|unhandled/i.test(x)).slice(-40);rows.push(...b.map(x=>x.replace(/(password|token|secret|api[_-]?key)=\S+/gi,'$1=[REDACTED]')));}out[n]=rows.slice(-40);}console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,logs:out}));'''


def main() -> None:
    with connect() as client:
        result = json.loads(run(client, "cd /linhhoasu/lhs/newServer && node -", data=NODE))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"at": result["at"], "readOnly": True, "directPlayerWrites": 0,
                      "hits": {k: v[-10:] for k, v in result["logs"].items()}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
