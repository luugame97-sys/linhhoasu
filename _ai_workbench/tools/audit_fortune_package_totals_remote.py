"""Read-only production inventory for Shop 11018000 rewards and daily ledger."""

from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "temp" / "fortune_package_audit"


NODE_SOURCE = r'''
const fs = require('fs');
const crypto = require('crypto');
try { require('/linhhoasu/lhs/newServer/node_modules/dotenv').config({path:'/linhhoasu/lhs/newServer/.env'}); } catch (_) {}
const mongoose = require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player = require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Account = require('/linhhoasu/lhs/newServer/src/db/models/Account');
const Config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

const SHOP_ID = 11018000;
const ACTIVITY_ID = 43001;
const REWARD_ITEM_ID = 4;
const REWARD_COUNT = 10;
const DAY_MS = 86400000;
const GMT8_MS = 8 * 60 * 60 * 1000;
function obj(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function arr(value) { return Array.isArray(value) ? value : []; }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function dayKey(value) { return Math.floor((Math.max(0, num(value)) + GMT8_MS) / DAY_MS); }
function sha(path) { return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'); }
function rechargeCount(player) {
  const row = arr(obj(player.rechargeInfo).records).find(item => num(item && item.id) === SHOP_ID);
  return Math.max(0, num(row && row.count));
}
function shopCount(player) {
  return Math.max(0, num(obj(obj(player.shopInfo).buyRecords)[String(SHOP_ID)]));
}
function activityRow(player) {
  return arr(obj(player.activityInfo).datas).find(item => num(item && item.id) === ACTIVITY_ID) || null;
}
function dailyLedger(player) {
  const all = obj(obj(player.activityInfo).dailyShopClaims);
  return obj(obj(all[String(ACTIVITY_ID)])[String(SHOP_ID)]);
}

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lhs_s1001';
  await mongoose.connect(uri, {serverSelectionTimeoutMS: 7000});
  const now = Date.now();
  const currentDayKey = dayKey(now);
  const projection = {
    userId: 1, playerId: 1, name: 1, level: 1, items: 1, currencies: 1,
    shopInfo: 1, rechargeInfo: 1, activityInfo: 1, createdAt: 1, updatedAt: 1,
  };
  const players = await Player.collection.find({$or: [
    {[`shopInfo.buyRecords.${SHOP_ID}`]: {$gt: 0}},
    {'rechargeInfo.records': {$elemMatch: {id: SHOP_ID, count: {$gt: 0}}}},
  ]}, {projection}).toArray();
  const userIds = Array.from(new Set(players.map(row => String(row.userId || '')).filter(Boolean)));
  const accounts = userIds.length
    ? await Account.find({'roles.userId': {$in: userIds}}).select({accountId: 1, roles: 1}).lean()
    : [];
  const accountByUser = {};
  accounts.forEach(account => arr(account.roles).forEach(role => {
    const userId = String(role && role.userId || '');
    if (userId) accountByUser[userId] = {
      accountId: String(account.accountId || ''),
      serverId: num(role.serverId),
      roleName: String(role.name || ''),
    };
  }));

  const rows = players.map(player => {
    const userId = String(player.userId || '');
    const shop = shopCount(player);
    const recharge = rechargeCount(player);
    const activity = activityRow(player);
    const ledger = dailyLedger(player);
    const startTime = Math.max(0, num(activity && activity.startTime));
    const endTime = Math.max(0, num(activity && activity.endTime));
    const eligibleLast = endTime > 0 ? Math.min(now, Math.max(startTime, endTime - 1)) : now;
    const eligibleDays = startTime > 0 && eligibleLast >= startTime
      ? Math.max(0, dayKey(eligibleLast) - dayKey(startTime) + 1)
      : 0;
    const authoritativeCount = shop === recharge ? shop : Math.max(shop, recharge);
    const todayLedgerCount = num(ledger.dayKey) === currentDayKey ? Math.max(0, num(ledger.count)) : 0;
    const uiBuyCount = Math.max(0, num(obj(activity && activity.buyRecords)[String(SHOP_ID)]));
    return {
      accountId: accountByUser[userId] ? accountByUser[userId].accountId : '',
      userId,
      playerId: String(player.playerId || ''),
      name: String(player.name || ''),
      level: Math.max(0, num(player.level)),
      shopCounter: shop,
      rechargeCounter: recharge,
      countersMatch: shop === recharge,
      authoritativeCount,
      packageBaoziReceived: authoritativeCount * REWARD_COUNT,
      currentBaoziBalance: Math.max(0, num(obj(player.items)[String(REWARD_ITEM_ID)])),
      currentDiamondBalance: Math.max(0, num(obj(player.currencies).diamond)),
      activityStartTime: startTime,
      activityEndTime: endTime,
      eligibleDailyClaims: eligibleDays,
      minimumExcessClaims: Math.max(0, authoritativeCount - eligibleDays),
      minimumExcessBaozi: Math.max(0, authoritativeCount - eligibleDays) * REWARD_COUNT,
      todayDayKey: currentDayKey,
      todayLedgerCount,
      ledgerDayKey: Math.max(0, num(ledger.dayKey)),
      ledgerLastClaimAt: Math.max(0, num(ledger.lastClaimAt)),
      uiBuyCount,
      todayLedgerValid: todayLedgerCount === 0 || todayLedgerCount === 1,
      createdAt: player.createdAt || null,
      updatedAt: player.updatedAt || null,
    };
  }).sort((a, b) => b.authoritativeCount - a.authoritativeCount || a.userId.localeCompare(b.userId));

  const shopConfig = obj(Config.get('ShopConfig'))[String(SHOP_ID)] || obj(Config.get('ShopConfig'))[SHOP_ID] || null;
  const activityShop = obj(obj(Config.get('ActivityShopConfig'))[String(ACTIVITY_ID)] || obj(Config.get('ActivityShopConfig'))[ACTIVITY_ID]);
  const activityPolicy = activityShop[String(SHOP_ID)] || activityShop[SHOP_ID] || null;
  const totals = {
    uniquePlayers: rows.length,
    uniqueAccounts: new Set(rows.map(row => row.accountId).filter(Boolean)).size,
    totalClaims: rows.reduce((sum, row) => sum + row.authoritativeCount, 0),
    totalPackageBaoziReceived: rows.reduce((sum, row) => sum + row.packageBaoziReceived, 0),
    totalCurrentBaoziBalance: rows.reduce((sum, row) => sum + row.currentBaoziBalance, 0),
    counterMismatches: rows.filter(row => !row.countersMatch).length,
    minimumExcessPlayers: rows.filter(row => row.minimumExcessClaims > 0).length,
    minimumExcessClaims: rows.reduce((sum, row) => sum + row.minimumExcessClaims, 0),
    minimumExcessBaozi: rows.reduce((sum, row) => sum + row.minimumExcessBaozi, 0),
    todayClaimedPlayers: rows.filter(row => row.todayLedgerCount === 1).length,
    todayLedgerOverLimit: rows.filter(row => row.todayLedgerCount > 1).length,
    todayUiMatchesLedger: rows.filter(row => row.uiBuyCount === row.todayLedgerCount).length,
    todayUiMismatchesLedger: rows.filter(row => row.uiBuyCount !== row.todayLedgerCount).length,
    missingAccountMapping: rows.filter(row => !row.accountId).length,
  };
  console.log('AUDIT_JSON=' + JSON.stringify({
    generatedAt: new Date(now).toISOString(),
    timezone: 'GMT+8',
    currentDayKey,
    readOnly: true,
    mongoDb: mongoose.connection.name,
    contract: {
      shopId: SHOP_ID,
      activityId: ACTIVITY_ID,
      reward: {id: REWARD_ITEM_ID, count: REWARD_COUNT},
      shopConfig,
      activityPolicy,
    },
    live: {
      itemPath: '/linhhoasu/lhs/newServer/src/handlers/item.js',
      itemSha256: sha('/linhhoasu/lhs/newServer/src/handlers/item.js'),
      activityPath: '/linhhoasu/lhs/newServer/src/handlers/activity.js',
      activitySha256: sha('/linhhoasu/lhs/newServer/src/handlers/activity.js'),
    },
    totals,
    rows,
  }));
  await mongoose.disconnect();
})().catch(async error => {
  console.error(error.stack || String(error));
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
'''


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-6000:] or output[-6000:] or f"remote exit={code}")
    return output


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
      encoded = base64.b64encode(NODE_SOURCE.encode()).decode()
      output = run(ssh, f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\"")
      marker = "AUDIT_JSON="
      if marker not in output:
          raise RuntimeError("audit JSON marker missing")
      audit = json.loads(output.split(marker, 1)[1].splitlines()[0])
      health = run(ssh, "date --iso-8601=seconds; pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'; curl -sS --max-time 15 http://127.0.0.1:8080/ready; printf '\n'; curl -sS --max-time 15 http://127.0.0.1:9200/health")
      log_text = run(ssh, "grep -a 'fortune daily gift' /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log 2>/dev/null | tail -n 10000 || true")
    finally:
      ssh.close()
    fake_users = {"first", "concurrent", "inactive", "multi", "save-fail", "control"}
    granted_re = re.compile(r"fortune daily gift granted user=([^\s]+)")
    denied_re = re.compile(r"fortune daily gift replay denied user=([^\s]+)")
    real_granted: dict[str, int] = {}
    real_denied: dict[str, int] = {}
    fixture_lines = 0
    for line in log_text.splitlines():
        granted = granted_re.search(line)
        denied = denied_re.search(line)
        user = (granted or denied).group(1) if (granted or denied) else ""
        if user in fake_users:
            fixture_lines += 1
            continue
        if granted:
            real_granted[user] = real_granted.get(user, 0) + 1
        if denied:
            real_denied[user] = real_denied.get(user, 0) + 1
    post_fix_log = {
        "realGrantedEvents": sum(real_granted.values()),
        "realDeniedReplayEvents": sum(real_denied.values()),
        "realGrantedByUser": real_granted,
        "realDeniedByUser": real_denied,
        "fixtureLinesExcluded": fixture_lines,
        "source": "/linhhoasu/lhs/newServer/logs/combined-2026-09-01.log",
    }
    payload = {"host": HOST, "readOnly": True, "audit": audit, "health": health, "postFixLog": post_fix_log}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    target = OUT_DIR / f"fortune_package_totals_{stamp}.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(json.dumps({"output": str(target), "sha256": digest, "totals": audit.get("totals", {}), "live": audit.get("live", {}), "postFixLog": post_fix_log}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
