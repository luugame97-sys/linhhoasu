"""Read-only feasibility audit for merging S1-S4; no data mutation."""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NAMES = [f"lhs-s{sid}" for sid in range(1001, 1005)]


def main():
    ssh = connect()
    try:
        js = """let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const names=new Set(%s);const out=JSON.parse(s).filter(p=>names.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};const u=String(v.MONGO_URI||'');const m=u.match(/^mongodb(?:\\+srv)?:\\/\\/[^/]*\\/([^?]*)/i);return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cwd:e.pm_cwd,script:e.pm_exec_path,serverId:v.SERVER_ID,httpPort:v.HTTP_PORT,wsPort:v.WS_PORT,db:m&&m[1]||'',identityDb:v.IDENTITY_MONGO_DB||''};});console.log(JSON.stringify(out));});""" % json.dumps(NAMES)
        pm2 = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(js)))
        dbs = sorted({row["db"] for row in pm2 if row.get("db")})
        identity = sorted({row["identityDb"] for row in pm2 if row.get("identityDb")})
        mongo_eval = r'''
const names=JSON.parse(process.env.AUDIT_DBS||'[]');
const out={};
for(const name of names){
 const d=db.getSiblingDB(name);
 const info={name,collections:d.getCollectionNames()};
 for(const c of ['players','Players','accounts','Account','gameservers','GameServer','mails','Mail','crossarenaentries','CrossEventEntry']){
   try{info[c]=d.getCollection(c).countDocuments({});}catch(e){info[c]='error';}
 }
 for(const c of ['players','Players']){try{const col=d.getCollection(c);info[c+'Indexes']=col.getIndexes().map(x=>({name:x.name,key:x.key,unique:!!x.unique}));}catch(e){}}
 try{info.playerServerIdGroups=d.getCollection('players').aggregate([{$group:{_id:'$serverId',count:{$sum:1}}},{$sort:{_id:1}}]).toArray();}catch(e){info.playerServerIdGroups='error';}
 try{info.gameServerIds=d.getCollection('gameservers').find({}, {_id:0,serverId:1,pageId:1,serverName:1}).sort({serverId:1}).toArray();}catch(e){info.gameServerIds='error';}
 out[name]=info;
}
const dup={};
for(const field of ['userId','playerId','name']){
 const seen=new Set();let overlaps=0;let totals=0;
 for(const name of names){const cur=db.getSiblingDB(name).getCollection('players').find({}, {[field]:1,_id:0});while(cur.hasNext()){const v=cur.next()[field];if(v==null)continue;totals++;const k=String(v);if(seen.has(k))overlaps++;else seen.add(k);}}
 dup[field]={totalValues:totals,overlapsAcrossDbs:overlaps,distinct:seen.size};
}
print(JSON.stringify({databases:out,duplicateSummary:dup,dbList:db.adminCommand({listDatabases:1}).databases.map(x=>({name:x.name,sizeOnDisk:x.sizeOnDisk}))}));
'''
        env = "AUDIT_DBS=" + shlex.quote(json.dumps(dbs))
        mongo = run(ssh, env + " mongosh --quiet --host 127.0.0.1:27017 --eval " + shlex.quote(mongo_eval) + " 2>&1 || true").strip()
        routing = run(ssh, "ss -ltnp 2>/dev/null | grep -E ':(8080|8083|8084|8085|9200|9201|9202|9203)\\b' || true").strip()
        source_checks = {
            "playerUnique": "Player schema declares unique userId/playerId/name per database",
            "accountIdentity": "Account/GameServer models use IDENTITY_MONGO_DB shared connection",
            "serverScopedRole": "Account roles embed serverId and activeRoleByServer",
            "crossServer": "CrossArena/CrossEvent entries use cycleKey and playerId; not a merge migration",
        }
        result = {"scope": "read-only", "pm2": pm2, "gameDbs": dbs, "identityDbs": identity, "mongoAuditRaw": mongo, "routing": routing, "sourceChecks": source_checks}
        out = ROOT / "_ai_workbench" / "temp" / "s1_s4_merge_readonly_20260928.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"evidence": str(out), "pm2Rows": len(pm2), "gameDbs": dbs, "identityDbs": identity}))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
