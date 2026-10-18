"""Read-only production audit for Activity 9 / Tien duyen purchase flow."""
from __future__ import annotations

import getpass
import paramiko

HOST = "103.116.105.154"

REMOTE_AUDIT = r"""
set -u
echo '===PROCESS==='
ps -eo pid,ppid,user,stat,etime,args | grep -E '[n]ode .*newServer|[m]ongod|[r]edis-server' | sed -E 's/(--password[= ]+)[^ ]+/\1[REDACTED]/g' || true
echo '===PM2==='
pm2 list --no-color 2>/dev/null || true
echo '===MONGO_ENDPOINT==='
ss -lntp | grep -E ':27017\b' || true
echo '===SOURCE_MARKERS==='
for p in /linhhoasu/lhs/newServer/src/handlers/activity.js \
         /linhhoasu/lhs/newServer/src/handlers/recharge.js \
         /linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js \
         /linhhoasu/lhs/newServer/scripts/_tables_dump/Activity9TypeConfig.json \
         /linhhoasu/lhs/newServer/scripts/_tables_dump/Activity9Config.json \
         /linhhoasu/lhs/newServer/scripts/_tables_dump/PayConfig.json
do
  if [ -f "$p" ]; then
    echo "---$p"
    sha256sum "$p"
    case "$p" in
      *.js) grep -n -E 'activityType === 9|Activity9|applyRechargeBenefits|recordList|pushRechargeNotifications|handleRecharge' "$p" | head -120 || true ;;
      *.json) grep -o -E '10501|10502|9001|9002|9952|仙缘|20' "$p" | sort | uniq -c | head -80 || true ;;
    esac
  fi
done
echo '===MONGO_AUDIT==='
mongosh --quiet 'mongodb://127.0.0.1:27017/admin' --eval '
function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
const dbs = safe(() => db.adminCommand({listDatabases: 1}).databases.map(x => x.name), []);
print(JSON.stringify({databases: dbs}));
for (const dbName of dbs) {
  const d = db.getSiblingDB(dbName);
  const names = safe(() => d.getCollectionNames(), []);
  const interesting = names.filter(n => /(player|mail|transaction|recharge|payment|order|product|config)/i.test(n));
  print(JSON.stringify({db: dbName, interestingCollections: interesting}));
  for (const name of interesting) {
    const c = d.getCollection(name);
    const count = safe(() => c.estimatedDocumentCount(), -1);
    print(JSON.stringify({db: dbName, collection: name, count}));
  }
  if (names.includes("players")) {
    const p = d.players;
    const playerCount = safe(() => p.estimatedDocumentCount(), -1);
    const activity = safe(() => p.aggregate([
      {$unwind: "$activityInfo.datas"},
      {$match: {"activityInfo.datas.id": {$gte: 9001, $lte: 9952}}},
      {$group: {
        _id: "$activityInfo.datas.id",
        players: {$sum: 1},
        recordListPlayers: {$sum: {$cond: [{$gt: [{$size: {$ifNull: ["$activityInfo.datas.recordList", []]}}, 0]}, 1, 0]}},
        recordListValues: {$addToSet: "$activityInfo.datas.recordList"},
        rowsWithModule: {$sum: {$cond: [{$ne: [{$ifNull: ["$activityInfo.datas.module", 0]}, 0]}, 1, 0]}}
      }},
      {$sort: {_id: 1}}
    ]).toArray(), []);
    const rechargeIds = safe(() => p.aggregate([
      {$unwind: "$rechargeInfo.records"},
      {$group: {_id: "$rechargeInfo.records.id", players: {$sum: 1}, maxCount: {$max: "$rechargeInfo.records.count"}}},
      {$sort: {_id: 1}}
    ]).toArray(), []);
    const rechargeKeys = safe(() => p.aggregate([
      {$project: {keys: {$map: {input: {$objectToArray: {$ifNull: ["$rechargeInfo", {}]}}, as: "x", in: "$$x.k"}}}},
      {$unwind: "$keys"},
      {$group: {_id: "$keys", players: {$sum: 1}}},
      {$sort: {_id: 1}}
    ]).toArray(), []);
    const activityKeys = safe(() => p.aggregate([
      {$project: {keys: {$map: {input: {$objectToArray: {$ifNull: ["$activityInfo", {}]}}, as: "x", in: "$$x.k"}}}},
      {$unwind: "$keys"},
      {$group: {_id: "$keys", players: {$sum: 1}}},
      {$sort: {_id: 1}}
    ]).toArray(), []);
    const mismatch = safe(() => p.aggregate([
      {$project: {
        recharge: {$ifNull: ["$rechargeInfo.records", []]},
        datas: {$ifNull: ["$activityInfo.datas", []]}
      }},
      {$project: {
        has10501: {$gt: [{$size: {$filter: {input: "$recharge", as: "r", cond: {$and: [{$in: ["$$r.id", [10501, "10501"]]}, {$gt: ["$$r.count", 0]}]}}}}, 0]},
        has10502: {$gt: [{$size: {$filter: {input: "$recharge", as: "r", cond: {$and: [{$in: ["$$r.id", [10502, "10502"]]}, {$gt: ["$$r.count", 0]}]}}}}, 0]},
        actIds: {$map: {input: {$filter: {input: "$datas", as: "a", cond: {$and: [{$gte: ["$$a.id", 9001]}, {$lte: ["$$a.id", 9952]}]}}}, as: "a", in: "$$a.id"}},
        lists: {$map: {input: {$filter: {input: "$datas", as: "a", cond: {$and: [{$gte: ["$$a.id", 9001]}, {$lte: ["$$a.id", 9952]}]}}}, as: "a", in: {$ifNull: ["$$a.recordList", []]}}}
      }},
      {$match: {$or: [{has10501: true}, {has10502: true}]}},
      {$group: {
        _id: {has10501: "$has10501", has10502: "$has10502"},
        players: {$sum: 1},
        activityIds: {$addToSet: "$actIds"},
        activityRecordLists: {$addToSet: "$lists"}
      }}
    ]).toArray(), []);
    print(JSON.stringify({db: dbName, players: playerCount, activity9: activity, rechargeRecordIds: rechargeIds, rechargeInfoKeys: rechargeKeys, activityInfoKeys: activityKeys, purchaseVsActivityAggregate: mismatch}));
  }
  for (const name of names.filter(n => /(transaction|payment|order|recharge)/i.test(n))) {
    const c = d.getCollection(name);
    const statuses = safe(() => c.aggregate([
      {$group: {_id: {status: "$status", productId: "$productId", payId: "$payId"}, count: {$sum: 1}, amountSum: {$sum: {$convert: {input: "$amount", to: "double", onError: 0, onNull: 0}}}}},
      {$sort: {"_id.status": 1, "_id.productId": 1, "_id.payId": 1}}
    ]).toArray(), []);
    print(JSON.stringify({db: dbName, collection: name, paymentAggregate: statuses}));
  }
  if (names.includes("mails")) {
    const m = d.mails;
    const rechargeMails = safe(() => m.aggregate([
      {$match: {eventKey: {$regex: /^recharge:/}}},
      {$group: {_id: "$eventKey", count: {$sum: 1}}},
      {$count: "rechargeMailEventKeys"}
    ]).toArray(), []);
    print(JSON.stringify({db: dbName, rechargeMailEventKeys: rechargeMails}));
  }
}
'
echo '===LOG_COUNTS==='
for f in /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log
do
  if [ -f "$f" ]; then
    echo "---$f"
    printf 'lines='; wc -l < "$f"
    for pat in Recharge 10501 10502 Activity9 LoginPrivileges ORDER_NOT_FOUND AMOUNT_MISMATCH INVALID_SIGN
    do
      printf '%s=' "$pat"; grep -F -i -c "$pat" "$f" || true
    done
  fi
done
"""

def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    try:
        _stdin, stdout, stderr = ssh.exec_command(REMOTE_AUDIT, timeout=240)
        print(stdout.read().decode("utf-8", "replace"), end="")
        error = stderr.read().decode("utf-8", "replace")
        if error:
            print("STDERR=" + error, end="")
    finally:
        ssh.close()

if __name__ == "__main__":
    main()

