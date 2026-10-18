"""Focused read-only Mongo audit for the Tiên duyên purchase/activity state."""
from __future__ import annotations
import getpass
import paramiko

HOST = "103.116.105.154"

REMOTE = r"""
set -u
mongosh --quiet 'mongodb://127.0.0.1:27017/lhs_s1001' --eval '
const d = db.getSiblingDB("lhs_s1001");
const p = d.players;
function out(x) { print(JSON.stringify(x)); }
function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
function summarizeRow(r) {
  if (!r || typeof r !== "object") return {valueType: typeof r};
  return {
    keys: Object.keys(r).sort(),
    id: r.id,
    idType: typeof r.id,
    activityId: r.activityId,
    module: r.module,
    index: r.index,
    record: r.record,
    recordList: Array.isArray(r.recordList) ? r.recordList.slice(0, 30) : null,
    recordsKeys: r.records && typeof r.records === "object" ? Object.keys(r.records).slice(0, 30) : [],
    startTime: r.startTime,
    endTime: r.endTime
  };
}
out({playerCount: safe(() => p.estimatedDocumentCount(), -1)});
out({serverRechargeArea: safe(() => d.gameservers.find(
  {serverId: 1001},
  {_id: 0, serverId: 1, rechargeArea: 1, running: 1, status: 1}
).toArray(), [])});
const samples = safe(() => p.find({}, {activityInfo:1, rechargeInfo:1}).limit(5).toArray(), []);
out({samples: samples.map(x => ({
  activityKeys: x.activityInfo && typeof x.activityInfo === "object" ? Object.keys(x.activityInfo).sort() : [],
  activityDatas: Array.isArray(x.activityInfo && x.activityInfo.datas) ? x.activityInfo.datas.slice(0, 12).map(summarizeRow) : [],
  rechargeKeys: x.rechargeInfo && typeof x.rechargeInfo === "object" ? Object.keys(x.rechargeInfo).sort() : [],
  rechargeRecords: Array.isArray(x.rechargeInfo && x.rechargeInfo.records) ? x.rechargeInfo.records.slice(0, 40).map(r => ({id:r && r.id, idType:typeof (r && r.id), count:r && r.count})) : []
}))});
const idTypes = safe(() => p.aggregate([
  {$unwind: "$activityInfo.datas"},
  {$group: {_id: {type: {$type: "$activityInfo.datas.id"}, id: "$activityInfo.datas.id"}, count: {$sum: 1}}},
  {$sort: {"_id.type": 1, "_id.id": 1}}
]).toArray(), []);
out({activityIdTypes: idTypes});
const allActivity = safe(() => p.aggregate([
  {$unwind: "$activityInfo.datas"},
  {$group: {_id: "$activityInfo.datas.id", count: {$sum: 1}, examples: {$addToSet: "$activityInfo.datas.recordList"}}},
  {$sort: {_id: 1}}
]).toArray(), []);
out({allActivityIds: allActivity.slice(0, 300)});
const rechargeTarget = safe(() => p.aggregate([
  {$unwind: "$rechargeInfo.records"},
  {$match: {"rechargeInfo.records.id": {$in: [10501, 10502, "10501", "10502"]}}},
  {$group: {_id: "$rechargeInfo.records.id", players: {$sum: 1}, counts: {$addToSet: "$rechargeInfo.records.count"}}}
]).toArray(), []);
out({targetRechargeRecords: rechargeTarget});
const mails = d.mails;
out({mailKeys: safe(() => mails.findOne({}, {_id:0}).then ? [] : Object.keys(mails.findOne({}, {_id:0}) || {}).sort(), [])});
out({mailEventPrefixes: safe(() => mails.aggregate([
  {$project: {eventKey:1}},
  {$group: {_id: {$cond: [
    {$eq: [{$type: "$eventKey"}, "string"]},
    {$arrayElemAt: [{$split: ["$eventKey", ":"]}, 0]},
    "(missing)"
  ]}, count: {$sum: 1}}},
  {$sort: {_id:1}}
]).toArray(), [])});
for (const name of ["transactions", "rechargeorders", "playerbindings"]) {
  const c = d.getCollection(name);
  out({collection: name, exists: safe(() => d.getCollectionNames().includes(name), false), count: safe(() => c.estimatedDocumentCount(), 0), keys: safe(() => Object.keys(c.findOne({}, {_id:0}) || {}).sort(), [])});
}
'
echo '===DIST_DB==='
mongosh --quiet 'mongodb://127.0.0.1:27017/lhs_dist' --eval '
const d=db.getSiblingDB("lhs_dist");
function out(x){print(JSON.stringify(x));}
function safe(fn,f){try{return fn();}catch(e){return f;}}
out({collections:safe(()=>d.getCollectionNames(),[])});
for(const n of safe(()=>d.getCollectionNames(),[]).filter(x=>/(transaction|recharge|order|payment|player)/i.test(x))){
 const c=d.getCollection(n);
 out({collection:n,count:safe(()=>c.estimatedDocumentCount(),-1),keys:safe(()=>Object.keys(c.findOne({}, {_id:0})||{}).sort(),[])});
 out({aggregate:safe(()=>c.aggregate([{$group:{_id:{status:"$status",productId:"$productId",payId:"$payId"},count:{$sum:1}}},{$sort:{"_id.status":1}}]).toArray(),[])});
}
'
echo '===CONFIG_DB==='
mongosh --quiet 'mongodb://127.0.0.1:27017/config' --eval '
const d=db.getSiblingDB("config");
print(JSON.stringify({collections:d.getCollectionNames()}));
'
"""
def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(REMOTE, timeout=180)
        print(stdout.read().decode("utf-8", "replace"), end="")
        err = stderr.read().decode("utf-8", "replace")
        if err:
            print("STDERR=" + err, end="")
    finally:
        ssh.close()
if __name__ == "__main__":
    main()
