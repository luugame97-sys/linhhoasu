"""Read-only audit of recharge package runtime state on production.

The tool deliberately reports aggregates only (no account, role, order,
token, mail body or credential) and performs no write/restart operation.
"""
from __future__ import annotations

import getpass
import json
from pathlib import Path
from datetime import datetime

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"recharge_runtime_audit_{STAMP}.json"

REMOTE_JS = r'''
function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
function n(v, fallback=0) { const x=Number(v); return Number.isFinite(x)?Math.floor(x):fallback; }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function normId(v) { const x=Number(v); return Number.isFinite(x)&&x>0&&Math.floor(x)===x ? String(Math.floor(x)) : ''; }
function keyCount(o) { return Object.keys(obj(o)).length; }
function attachmentCount(v) {
  if (Array.isArray(v)) return v.filter(x=>x && n(x.id,0)>0 && n(x.count,0)>0).length;
  return v && typeof v==='object' ? Object.keys(v).length : 0;
}
function inc(map, key, value=1) { map[key] = (map[key]||0) + value; }
function sortedMap(map) { return Object.keys(map).sort((a,b)=>{const na=Number(a),nb=Number(b); return Number.isFinite(na)&&Number.isFinite(nb)?na-nb:a.localeCompare(b);}).map(k=>({id:k,count:map[k]})); }

const out = { generatedAt: new Date().toISOString(), databases: [], warnings: [] };
const dbNames = safe(()=>db.adminCommand({listDatabases:1}).databases.map(x=>x.name), []);
for (const dbName of dbNames) {
  const d = db.getSiblingDB(dbName);
  const names = safe(()=>d.getCollectionNames(), []);
  const entry = { db: dbName, collections: {}, packageState: null, paymentCollections: [], mailAudit: null };
  for (const name of names.filter(x=>/(player|mail|transaction|payment|order|recharge)/i.test(x))) {
    entry.collections[name] = safe(()=>d.getCollection(name).estimatedDocumentCount(), -1);
  }

  if (names.includes('players')) {
    const docs = safe(()=>d.players.find({}, {rechargeInfo:1, activityInfo:1, shopInfo:1}).toArray(), []);
    const idAgg = {};
    const idTypeAgg = {};
    const perPlayer = { total: docs.length, withRecords: 0, withMalformedRecord: 0,
      withDuplicateRecordId: 0, withMonthCards: 0, withMonthCardRecords: 0,
      withPrivilegeItem: 0, withActivity9Row: 0, withActivity9Activated: 0,
      withA9PurchaseNoActivation: 0, withA9ActivationNoPurchase: 0 };
    const target = {};
    for (const id of ['10501','10502']) target[id] = { recordPlayers:0, activityRowPlayers:0,
      activatedPlayers:0, recordNoActivity:0, activityNoRecord:0, recordCountSum:0,
      maxRecordCount:0, activityRecordListLengths:[], activityIds:[] };
    const monthTargets = {};
    for (const id of ['11000001','11000002','11000007','11000008','11000009','11000012']) {
      monthTargets[id] = {recordPlayers:0, activePlayers:0, claimRecordPlayers:0,
        recordNoActive:0, activeNoRecord:0, activeNoClaimRecord:0,
        expiredPlayers:0, maxEndTime:0};
    }
    const recordShape = {};
    const monthKeyAgg = {}, monthRecordKeyAgg = {}, privilegeKeyAgg = {}, packKeyAgg = {};
    const activityIdAgg = {};
    for (const doc of docs) {
      const ri = obj(doc.rechargeInfo);
      const records = arr(ri.records);
      const seen = {};
      let malformed = false;
      for (const rec of records) {
        const rawId = rec && rec.id;
        const id = normId(rawId);
        if (!id) { malformed = true; inc(idTypeAgg, typeof rawId); continue; }
        const count = Math.max(0, n(rec && rec.count, 0));
        const type = typeof rawId;
        inc(recordShape, `${id}:${type}`);
        if (!seen[id]) seen[id] = 0;
        seen[id] += 1;
        if (!idAgg[id]) idAgg[id] = { players:0, countSum:0, maxCount:0, duplicatePlayers:0 };
        idAgg[id].players += 1;
        idAgg[id].countSum += count;
        idAgg[id].maxCount = Math.max(idAgg[id].maxCount, count);
        if (id === '10501' || id === '10502') {
          target[id].recordPlayers += 1;
          target[id].recordCountSum += count;
          target[id].maxRecordCount = Math.max(target[id].maxRecordCount, count);
        }
      }
      if (records.length) perPlayer.withRecords++;
      if (malformed) perPlayer.withMalformedRecord++;
      if (Object.values(seen).some(x=>x>1)) {
        perPlayer.withDuplicateRecordId++;
        for (const id of Object.keys(seen)) if (seen[id]>1 && idAgg[id]) idAgg[id].duplicatePlayers++;
      }
      const cards = obj(ri.monthCards), cardRecords = obj(ri.monthCardRecords), priv = obj(ri.privilegeItem);
      if (keyCount(cards)) perPlayer.withMonthCards++;
      if (keyCount(cardRecords)) perPlayer.withMonthCardRecords++;
      if (keyCount(priv)) perPlayer.withPrivilegeItem++;
      for (const k of Object.keys(cards)) inc(monthKeyAgg, k);
      for (const k of Object.keys(cardRecords)) inc(monthRecordKeyAgg, k);
      for (const k of Object.keys(priv)) inc(privilegeKeyAgg, k);
      const auditNow = Date.now();
      for (const id of Object.keys(monthTargets)) {
        const hasRecord = records.some(r=>normId(r&&r.id)===id && n(r&&r.count,0)>0);
        const endTime = Math.max(0, Number(cards[id])||0);
        const hasActive = endTime > 0;
        const hasClaimRecord = Object.prototype.hasOwnProperty.call(cardRecords,id);
        if (hasRecord) monthTargets[id].recordPlayers++;
        if (hasActive) {
          monthTargets[id].activePlayers++;
          monthTargets[id].maxEndTime=Math.max(monthTargets[id].maxEndTime,endTime);
          if (endTime<auditNow) monthTargets[id].expiredPlayers++;
        }
        if (hasClaimRecord) monthTargets[id].claimRecordPlayers++;
        if (hasRecord&&!hasActive) monthTargets[id].recordNoActive++;
        if (!hasRecord&&hasActive) monthTargets[id].activeNoRecord++;
        if (hasActive&&!hasClaimRecord) monthTargets[id].activeNoClaimRecord++;
      }
      const packs = arr(obj(doc.shopInfo).pack);
      for (const p of packs) { const id=normId(p && p.id); if (id) inc(packKeyAgg,id); }

      const datas = arr(obj(doc.activityInfo).datas);
      const a9 = datas.filter(a=>{const id=n(a&&a.id,0); return id>=9001 && id<=9952;});
      if (a9.length) perPlayer.withActivity9Row++;
      const a9Ids = new Set(a9.map(a=>String(n(a&&a.id,0))));
      a9.forEach(a=>inc(activityIdAgg, String(n(a&&a.id,0))));
      let anyA9Activated = false;
      for (const id of ['10501','10502']) {
        const hasRecord = records.some(r=>normId(r&&r.id)===id && n(r&&r.count,0)>0);
        const rows = a9.filter(a=>arr(a&&a.recordList).length>0 || a);
        const hasRow = rows.length>0;
        const activated = a9.some(a=>arr(a&&a.recordList).some(x=>normId(x)===id));
        if (hasRecord && hasRow) target[id].activityRowPlayers++;
        if (activated) { target[id].activatedPlayers++; anyA9Activated=true; }
        if (hasRecord && !activated) target[id].recordNoActivity++;
        if (!hasRecord && activated) target[id].activityNoRecord++;
        if (hasRow) target[id].activityIds = Array.from(new Set([...target[id].activityIds, ...a9.map(a=>n(a&&a.id,0))])).sort((a,b)=>a-b);
        target[id].activityRecordListLengths.push(...a9.map(a=>arr(a&&a.recordList).length));
      }
      if (anyA9Activated) perPlayer.withActivity9Activated++;
      // Per-document checks above need a local test, not aggregate totals. Re-evaluate
      // to classify all purchase/activation mismatches without exposing document IDs.
      const hasA9Record = records.some(r=>['10501','10502'].includes(normId(r&&r.id)) && n(r&&r.count,0)>0);
      const hasA9Activation = a9.some(a=>arr(a&&a.recordList).some(x=>['10501','10502'].includes(normId(x))));
      if (hasA9Record && !hasA9Activation) perPlayer.withA9PurchaseNoActivation++;
      if (!hasA9Record && hasA9Activation) perPlayer.withA9ActivationNoPurchase++;
    }
    // The target record player counters above are global and intentionally not
    // reused for per-player mismatch counters; retain compact, accurate values.
    const targetRows = {};
    for (const id of ['10501','10502']) {
      const t = target[id];
      targetRows[id] = {
        recordPlayers:t.recordPlayers,
        activityRowPlayers:t.activityRowPlayers,
        activatedPlayers:t.activatedPlayers,
        recordNoActivityPlayers:t.recordNoActivity,
        activityNoRecordPlayers:t.activityNoRecord,
        recordCountSum:t.recordCountSum,
        maxRecordCount:t.maxRecordCount,
        activityIds:t.activityIds,
        activityRecordListLength:{min:t.activityRecordListLengths.length?Math.min(...t.activityRecordListLengths):0,max:t.activityRecordListLengths.length?Math.max(...t.activityRecordListLengths):0,totalSamples:t.activityRecordListLengths.length},
      };
    }
    entry.packageState = {
      playerCount: docs.length,
      players: perPlayer,
      recordIds: sortedMap(Object.fromEntries(Object.entries(idAgg).map(([id,v])=>[id,v.players]))),
      recordDetails: Object.fromEntries(Object.entries(idAgg).sort((a,b)=>Number(a[0])-Number(b[0])).map(([id,v])=>[id,v])),
      malformedRecordRawTypes: idTypeAgg,
      recordShapeTop: Object.entries(recordShape).sort((a,b)=>b[1]-a[1]).slice(0,80).map(([shape,count])=>({shape,count})),
      activity9Targets: targetRows,
      activity9Ids: sortedMap(activityIdAgg),
      monthCardTargets: monthTargets,
      monthCardKeys: sortedMap(monthKeyAgg),
      monthCardRecordKeys: sortedMap(monthRecordKeyAgg),
      privilegeItemKeys: sortedMap(privilegeKeyAgg),
      shopPackIds: sortedMap(packKeyAgg),
    };
  }

  if (names.includes('mails')) {
    const mails = safe(()=>d.mails.find({}, {eventKey:1,title:1,content:1,attachments:1,claimed:1,createdAt:1}).toArray(), []);
    const byPrefix={}, byAttachment={empty:0,nonempty:0}, byClaimed={true:0,false:0,missing:0};
    let matched=0;
    for (const m of mails) {
      const text = `${m&&m.eventKey||''} ${m&&m.title||''} ${m&&m.content||''}`;
      const isRecharge = /(recharge|充值|nạp|tiên duyên|tien duyen|pay|purchase)/i.test(text);
      if (!isRecharge) continue;
      matched++;
      const eventKey=String(m&&m.eventKey||'');
      const ek=/^webgm_recharge_/i.test(eventKey) ? 'webgm_recharge' : ((eventKey.split(':')[0]||'(none)').slice(0,40));
      inc(byPrefix,ek);
      if (attachmentCount(m&&m.attachments)>0) byAttachment.nonempty++; else byAttachment.empty++;
      if (m && m.claimed === true) byClaimed.true++; else if (m && m.claimed === false) byClaimed.false++; else byClaimed.missing++;
    }
    entry.mailAudit={totalMails:mails.length,rechargeLikeMails:matched,byEventKeyPrefix:byPrefix,attachments:byAttachment,claimed:byClaimed};
  }

  for (const name of names.filter(x=>/(transaction|payment|order|recharge)/i.test(x))) {
    const c=d.getCollection(name);
    const docs=safe(()=>c.find({}, {status:1,productId:1,payId:1,amount:1,channel:1,createdAt:1}).toArray(), []);
    const groups={};
    for (const x of docs) {
      const status=String(x&&x.status==null?'(missing)':x.status);
      const product=normId(x&&x.productId)||'(none)';
      const pay=normId(x&&x.payId)||'(none)';
      const k=`${status}|${product}|${pay}`;
      if (!groups[k]) groups[k]={status,productId:product,payId:pay,count:0,amountSum:0};
      groups[k].count++;
      const amount=Number(x&&x.amount); if (Number.isFinite(amount)) groups[k].amountSum+=amount;
    }
    entry.paymentCollections.push({collection:name,total:docs.length,groups:Object.values(groups).sort((a,b)=>a.status.localeCompare(b.status)||a.productId.localeCompare(b.productId))});
  }
  out.databases.push(entry);
}
print(JSON.stringify(out));
'''


REMOTE_SHELL = r'''
set -u
echo '===RUNTIME===' 
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-dist","lhs-admin","lhs-real-bots"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime,cpu:e.monit&&e.monit.cpu,mem:e.monit&&e.monit.memory}))}}}catch(e){}})' || true
echo '===LISTENERS===' 
ss -lntp 2>/dev/null | grep -E ':(81|8080|9200|3001|9097|27017|3306)\b' || true
echo '===HEALTH===' 
for u in http://127.0.0.1:8080/ready http://127.0.0.1:8080/health; do printf '%s|' "$u"; curl -sS -o /dev/null -w '%{http_code}|%{size_download}|%{content_type}\n' --max-time 10 "$u" || true; done
echo '===CONFIG_HASHES===' 
for p in /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin; do if [ -f "$p" ]; then sha256sum "$p"; stat -c '%n|size=%s|mtime=%Y|mode=%a|uid=%u|gid=%g' "$p"; fi; done
echo '===PAY_LOG_MARKERS===' 
for f in /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log; do if [ -f "$f" ]; then echo "---$f"; wc -l < "$f" | awk '{print "lines=" $1}'; for pat in '充值成功' '[Recharge]' 'tag=1230' 'tag=1210' '10501' '10502' 'ORDER_NOT_FOUND' 'AMOUNT_MISMATCH' 'INVALID_SIGN' 'PLAYER_NOT_FOUND' 'DUPLICATE_ORDER'; do printf '%s=' "$pat"; grep -F -i -c "$pat" "$f" 2>/dev/null || true; done; fi; done
echo '===MONGO_JSON_BEGIN===' 
mongosh --quiet 'mongodb://127.0.0.1:27017/admin' --eval "$MONGO_JS" 2>/dev/null || true
'''


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        # Send the JS through stdin to avoid shell quoting and never interpolate
        # credentials into the command line.
        shell = REMOTE_SHELL.replace('$MONGO_JS', "$(cat <<'__LHS_MONGO_JS__'\n" + REMOTE_JS + "\n__LHS_MONGO_JS__\n)")
        _stdin, stdout, stderr = ssh.exec_command(shell, timeout=300)
        raw = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
    finally:
        ssh.close()

    # Parse the JSON section separately; retain text inventory alongside it.
    marker = "===MONGO_JSON_BEGIN==="
    before, _, after = raw.partition(marker)
    mongo = None
    for line in reversed([x.strip() for x in after.splitlines() if x.strip()]):
        if line.startswith('{'):
            try:
                mongo = json.loads(line)
                break
            except json.JSONDecodeError:
                continue
    payload = {"generatedAt": datetime.now().isoformat(timespec="seconds"), "inventoryText": before, "mongo": mongo, "stderr": err}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "mongoDatabases": len((mongo or {}).get("databases", [])), "inventoryChars": len(before), "stderrChars": len(err)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
