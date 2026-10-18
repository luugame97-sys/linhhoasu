"""Compact read-only OldTrek runtime audit; never loads application code or writes production data."""
from __future__ import annotations

import json
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/runtime_audit.json"
NODE = r'''const cp=require('child_process'),crypto=require('crypto'),fs=require('fs');
const wanted=new Set(Array.from({length:9},(_,i)=>'lhs-s'+(1001+i)));
const keys=['OLD_TREK_EVENT_ENGINE_ENABLED','OLD_TREK_SETTLEMENT_ENABLED','OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'];
const pms=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8*1024*1024}));
const rows=pms.filter(p=>wanted.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};return {name:p.name,pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(keys.map(k=>[k,v[k]??null]))};});
const files=['src/app.js','ecosystem.config.js','src/handlers/old-trek.js','src/services/OldTrekEventService.js','src/services/OldTrekArenaService.js','src/services/OldTrekMaintenanceService.js','src/services/OldTrekSnapshotService.js'];
const root='/linhhoasu/lhs/newServer';
const hashes=Object.fromEntries(files.map(rel=>{const f=root+'/'+rel;return [rel,fs.existsSync(f)?crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'):null];}));
console.log(JSON.stringify({at:new Date().toISOString(),readOnly:true,directPlayerWrites:0,rows,hashes}));'''


def main() -> None:
    with connect() as client:
        result = json.loads(run(client, "cd /linhhoasu/lhs/newServer && node -", data=NODE))
        ports = {row["name"]: row["port"] for row in result["rows"]}
        result["ready"] = {}
        for name, port in ports.items():
            result["ready"][name] = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    safe = {**result, "rows":[{"name":r["name"],"pid":r["pid"],"status":r["status"],"port":r["port"],"flags":r["flags"]} for r in result["rows"]]}
    print(json.dumps(safe, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
