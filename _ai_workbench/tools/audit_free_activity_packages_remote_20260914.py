"""Read-only live audit for free activity-shop rows on S1/S2/S3."""

from __future__ import annotations

import base64
import hashlib
import json
import shlex
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / "linhhoasu/lhs/newServer"
APP = "/linhhoasu/lhs/newServer"
ITEM = ROOT / "src/handlers/item.js"
ACTIVITY = ROOT / "src/handlers/activity.js"
COMMERCE = ROOT / "src/handlers/commerce-compat.js"

# Daily free rows from the checked-in ActivityShopConfig dump. The fishing
# row 11001400 is intentionally excluded because its per-instance ledger is
# owned by FishingEventShopService.
DAILY_SHOP_IDS = [
    11001000, 11001100, 11001200, 11001300, 11001500, 11001600,
    11005000, 11007000, 11008000, 11008100, 11014000, 11015000,
    11016000, 11017000, 11018000, 11019000, 11020000, 11021000,
    11027000, 11028000, 11029000, 11030000,
]
FREE_SHOP_IDS = [
    10901, 11103, 4000001, 5000001, 11001000, 11001100, 11001200,
    11001300, 11001400, 11001500, 11001600, 11004000, 11005000,
    11007000, 11008000, 11008100, 11009000, 11009010, 11009020,
    11009030, 11009100, 11009120, 11009130, 11014000, 11015000,
    11016000, 11017000, 11018000, 11019000, 11020000, 11021000,
    11026001, 11027000, 11027100, 11028000, 11029000, 11030000,
]

REMOTE_AUDIT = r'''
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const dailyIds = new Set(%s);
const freeIds = new Set(%s);
function n(v){const x=Number(v);return Number.isFinite(x)?Math.floor(x):0;}
function obj(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arr(v){return Array.isArray(v)?v:[]}
async function audit(serverId){
  const uri='mongodb://127.0.0.1:27017/lhs_s'+serverId;
  const conn=await mongoose.createConnection(uri,{serverSelectionTimeoutMS:7000}).asPromise();
  try{
    const docs=await conn.db.collection('players').find({}, {projection:{shopInfo:1,activityInfo:1}}).toArray();
    let freePlayers=0, freeRows=0, dailyRows=0, suspiciousRows=0, ledgerMissingRows=0;
    const freeCounts={};
    const dailyBreakdown={};
    for(const p of docs){
      const buys=obj(obj(p.shopInfo).buyRecords); let touched=false;
      for(const id of freeIds){const c=n(buys[String(id)]??buys[id]); if(c>0){touched=true;freeCounts[id]=(freeCounts[id]||0)+c;}}
      if(touched)freePlayers++;
      for(const row of arr(obj(p.activityInfo).datas)){
        const rowBuys=obj(row&&row.buyRecords), ledger=obj(obj(p.activityInfo).dailyShopClaims)[String(n(row&&row.id))];
        for(const id of dailyIds){const c=n(rowBuys[String(id)]??rowBuys[id]);if(c>0){dailyRows++;if(c>1)suspiciousRows++;if(!obj(ledger)[String(id)] && !obj(ledger)[id])ledgerMissingRows++;const key=String(id);dailyBreakdown[key] ||= {rows:0,overOne:0,ledgerPresent:0};dailyBreakdown[key].rows++;if(c>1)dailyBreakdown[key].overOne++;if(obj(ledger)[String(id)] || obj(ledger)[id])dailyBreakdown[key].ledgerPresent++;}}
      }
      freeRows += Object.keys(buys).filter(id=>freeIds.has(n(id)) && n(buys[id])>0).length;
    }
    return {serverId,players:docs.length,playersWithFreePurchase:freePlayers,freePurchaseRows:freeRows,freePurchaseCounts:freeCounts,dailyActivityRowsWithClaims:dailyRows,suspiciousDailyRowsOverOne:suspiciousRows,dailyRowsMissingLedger:ledgerMissingRows,dailyBreakdown};
  } finally { await conn.close(); }
}
(async()=>{const out=[];for(const sid of [1001,1002,1003])out.push(await audit(sid));console.log(JSON.stringify({result:'PASS',readOnly:true,servers:out}));})().catch(e=>{console.error(e.stack||String(e));process.exit(1)});
''' % (json.dumps(DAILY_SHOP_IDS), json.dumps(FREE_SHOP_IDS))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    ssh = connect()
    try:
        hashes = run(ssh, "sha256sum -- %s %s %s" % tuple(shlex.quote(APP + rel) for rel in (
            "/src/handlers/item.js", "/src/handlers/activity.js", "/src/handlers/commerce-compat.js")))
        health = run(ssh, "for p in 8080 8083 8084; do printf '%s=' \"$p\"; curl -fsS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:$p/ready || true; echo; done")
        pm2 = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-s1002\",\"lhs-s1003\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time}))}}})'")
        log_audit = run(ssh, "find /linhhoasu/lhs/newServer/logs -maxdepth 1 -type f -name 'combined-*.log' -mtime -3 -print0 | xargs -0 -r grep -aE 'legacy shop (buy|buy result) goodsId=' | tail -n 500000 | awk 'BEGIN{OFS=\" \"} /legacy shop buy result/ {match($0,/goodsId=([0-9]+)/,a);match($0,/result=([-0-9]+)/,b);if(a[1]!=\"\")r[a[1] \"|result=\" b[1]]++} /legacy shop buy goodsId=/ && $0 !~ /legacy shop buy result/ {match($0,/goodsId=([0-9]+)/,a);if(a[1]!=\"\")r[a[1] \"|request\"]++} END{for(k in r)print k,r[k]}' || true")
        encoded = base64.b64encode(REMOTE_AUDIT.encode()).decode()
        mongo = run(ssh, "cd %s && node -e \"eval(Buffer.from('%s','base64').toString('utf8'))\"" % (shlex.quote(APP), encoded))
        print(json.dumps({
            "result": "PASS",
            "readOnly": True,
            "localCandidateHashes": {"item": sha256(ITEM), "activity": sha256(ACTIVITY), "commerce": sha256(COMMERCE)},
            "remoteHashes": hashes.strip(),
            "health": health.strip(),
            "pm2": [json.loads(line) for line in pm2.splitlines() if line.strip().startswith("{")],
            "logAudit": log_audit.strip().splitlines(),
            "mongo": json.loads(mongo),
        }, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
