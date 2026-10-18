"""Prepare an isolated cash-callback resolver candidate from live snapshot."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "temp/phase2_recharge_prod_20260901_062545/lhs/newServer"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"checkpoint4_cash_resolver_candidate_{STAMP}"
LOCAL_RESOLVER = ROOT.parent / "linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, got {count}")
    return text.replace(old, new, 1)


def patch_recharge(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    old_import = """const { buildItemSyncPayload } = require('../services/PlayerGrantService');"""
    new_import = """const { buildItemSyncPayload } = require('../services/PlayerGrantService');
const { addRewardRowsToPlayer } = require('./item');
const {
  applyPeriodPurchaseLedger,
  resolveRechargeRewards,
} = require('../services/RechargeRewardResolver');"""
    text = replace_once(text, old_import, new_import, "recharge resolver imports")

    old_build = """function buildRewardInfo(items = []) {
  return {
    items,
    equips: [],
    pets: [],
    bloodline: [],
  };
}"""
    new_build = """function buildRewardInfo(items = []) {
  return {
    items,
    equips: [],
    swords: [],
    pets: [],
    artifacts: [],
    gems: [],
    valhalla: [],
    bloodline: [],
    fashion: [],
    elves: [],
    sailor: [],
    extraReward: {},
  };
}

function clonePlain(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_error) { return value; }
}

function mergeRewardInfo(primary = {}, bonus = null) {
  const categories = ['items', 'equips', 'swords', 'pets', 'artifacts', 'gems', 'valhalla', 'bloodline', 'fashion', 'elves', 'sailor'];
  const info = { ...primary };
  categories.forEach((key) => { info[key] = Array.isArray(primary[key]) ? primary[key].slice() : []; });
  info.extraReward = primary.extraReward && typeof primary.extraReward === 'object' ? { ...primary.extraReward } : {};
  if (bonus) {
    info.extraReward[1] = {
      items: Array.isArray(bonus.items) ? bonus.items.slice() : [],
      equips: Array.isArray(bonus.equips) ? bonus.equips.slice() : [],
      swords: Array.isArray(bonus.swords) ? bonus.swords.slice() : [],
      pets: Array.isArray(bonus.pets) ? bonus.pets.slice() : [],
      artifacts: Array.isArray(bonus.artifacts) ? bonus.artifacts.slice() : [],
      gems: Array.isArray(bonus.gems) ? bonus.gems.slice() : [],
      valhalla: Array.isArray(bonus.valhalla) ? bonus.valhalla.slice() : [],
      bloodline: Array.isArray(bonus.bloodline) ? bonus.bloodline.slice() : [],
      fashion: Array.isArray(bonus.fashion) ? bonus.fashion.slice() : [],
    };
  }
  return info;
}

function normalizeRewardSnapshot(rewardInfo = {}) {
  const snapshot = {};
  ['items', 'equips', 'swords', 'pets', 'artifacts', 'gems', 'valhalla', 'bloodline', 'fashion', 'elves', 'sailor']
    .forEach((key) => { snapshot[key] = clonePlain(Array.isArray(rewardInfo[key]) ? rewardInfo[key] : []); });
  snapshot.extraReward = clonePlain(rewardInfo.extraReward || {});
  return snapshot;
}"""
    text = replace_once(text, old_build, new_build, "recharge rewardInfo helpers")

    old_marker_fields = """    monthCardUpdates: Array.isArray(marker.monthCardUpdates) ? marker.monthCardUpdates : [],
    attachments: Array.isArray(marker.attachments) ? marker.attachments : [],
    appliedAt: Number(marker.appliedAt) || Date.now(),"""
    new_marker_fields = """    monthCardUpdates: Array.isArray(marker.monthCardUpdates) ? marker.monthCardUpdates : [],
    attachments: Array.isArray(marker.attachments) ? marker.attachments : [],
    rewardSnapshot: marker.rewardSnapshot && typeof marker.rewardSnapshot === 'object'
      ? clonePlain(marker.rewardSnapshot) : normalizeRewardSnapshot(),
    resolverVersion: String(marker.resolverVersion || 'catalog-v1'),
    appliedAt: Number(marker.appliedAt) || Date.now(),"""
    text = replace_once(text, old_marker_fields, new_marker_fields, "marker reward snapshot")

    old_push = """  wsServer.pushToUser(userId, 1210, {
    result: 0,
    payid: benefits && benefits.payId || 0,
    totalrecharge: player.rechargeInfo && player.rechargeInfo.totalrecharge,
    totalRecharge: player.rechargeInfo && player.rechargeInfo.totalRecharge,
    rewardInfo,
  });"""
    new_push = old_push + """
  const activity9Update = benefits && benefits.activity9Update;
  if (activity9Update && activity9Update.row) {
    wsServer.pushToUser(userId, 1701, { data: activity9Update.row });
  }"""
    text = replace_once(text, old_push, new_push, "cash Activity9 push")

    old_resolved = """    const attachmentRewards = resolvedProduct && resolvedProduct.enabled !== false && resolvedProduct.amount > 0
      ? rechargeConfigService.normalizeRewardItems(resolvedProduct.attachments)
      : [];
"""
    new_resolved = old_resolved + """
    const numericPayId = Number(productId);
    const cashRewardPlan = resolveRechargeRewards(player, {
      route: 'cash',
      payId: numericPayId,
      multi: 1,
      amount: requestedAmount,
      now: Date.now(),
      allowActivity9: true,
    });
    if (!cashRewardPlan.ok) {
      if (claimId) await releaseClaim(orderId, claimId, cashRewardPlan.reason, false);
      return { success: false, error: cashRewardPlan.reason };
    }
"""
    text = replace_once(text, old_resolved, new_resolved, "cash prevalidation")

    old_recovery = """      rewardInfo = buildRewardInfo(mergeRewardItems([
        ...(diamond > 0 ? [{ id: 1, count: diamond }] : []),
      ]));"""
    new_recovery = """      rewardInfo = previousMarker.rewardSnapshot && typeof previousMarker.rewardSnapshot === 'object'
        ? clonePlain(previousMarker.rewardSnapshot)
        : buildRewardInfo([]);"""
    text = replace_once(text, old_recovery, new_recovery, "crash recovery snapshot")

    old_calc = """      const isFirst = previousTotalRecharge === 0;
      diamond = await calcDiamond(canonicalAmount, isFirst, productId);

      player.currencies = getObject(player.currencies);
      player.currencies.diamond = (Number(player.currencies.diamond) || 0) + diamond;"""
    new_calc = """      const isFirst = previousTotalRecharge === 0;
      // Catalog package rewards are authoritative.  Never add the old generic
      // 1R=10 diamond formula on top of ShopConfig rewards.
      const authoritativePlan = resolveRechargeRewards(player, {
        route: 'cash',
        payId: Number(productId),
        multi: 1,
        amount: canonicalAmount,
        now: Date.now(),
        allowActivity9: true,
      });
      if (!authoritativePlan.ok) {
        if (claimId) await releaseClaim(orderId, claimId, authoritativePlan.reason, false);
        return { success: false, error: authoritativePlan.reason };
      }
      const normalGrant = addRewardRowsToPlayer(player, authoritativePlan.rows, 1);
      const bonusGrant = authoritativePlan.doubleRows && authoritativePlan.doubleRows.length > 0
        ? addRewardRowsToPlayer(player, authoritativePlan.doubleRows, 1) : null;
      rewardInfo = mergeRewardInfo(normalGrant.rewardInfo, bonusGrant && bonusGrant.rewardInfo);
      diamond = [...(normalGrant.itemDeltas || []), ...((bonusGrant && bonusGrant.itemDeltas) || [])]
        .filter((row) => Number(row && row.id) === 1)
        .reduce((sum, row) => sum + Math.max(0, Number(row.count) || 0), 0);
      applyPeriodPurchaseLedger(player, authoritativePlan, Date.now());

      player.currencies = getObject(player.currencies);"""
    text = replace_once(text, old_calc, new_calc, "authoritative catalog grant")

    old_marker = """        monthCardUpdates,
        attachments: attachmentRewards,
        appliedAt: Date.now(),"""
    new_marker = """        monthCardUpdates,
        attachments: attachmentRewards,
        rewardSnapshot: normalizeRewardSnapshot(rewardInfo),
        resolverVersion: 'catalog-v1',
        appliedAt: Date.now(),"""
    text = replace_once(text, old_marker, new_marker, "marker catalog snapshot")

    old_late_reward = """      rewardInfo = buildRewardInfo(mergeRewardItems([
        ...(diamond > 0 ? [{ id: 1, count: diamond }] : []),
      ]));
      rechargeMail = await ensureRechargeMail({"""
    new_late_reward = """      rechargeMail = await ensureRechargeMail({"""
    text = replace_once(text, old_late_reward, new_late_reward, "remove late generic reward")

    text = text.replace("if (benefits.activity9Update) player.markModified('activityInfo');", "if (benefits.activity9Update) player.markModified('activityInfo');", 1)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    if OUT.exists():
        raise FileExistsError(OUT)
    files = {
        "src/handlers/recharge.js": SNAPSHOT / "src/handlers/recharge.js",
        "src/handlers/item.js": SNAPSHOT / "src/handlers/item.js",
        "src/services/RechargeBenefitService.js": SNAPSHOT / "src/services/RechargeBenefitService.js",
        "src/services/Activity9Service.js": SNAPSHOT / "src/services/Activity9Service.js",
        "src/services/RechargeRewardResolver.js": LOCAL_RESOLVER,
    }
    before = {}
    for rel, src in files.items():
        if not src.is_file():
            raise FileNotFoundError(src)
        dst = OUT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())
        before[rel] = sha(src)

    patch_recharge(OUT / "src/handlers/recharge.js")
    after = {rel: sha(OUT / rel) for rel in files}
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "localOnly": True,
        "sourceSnapshot": str(SNAPSHOT),
        "candidate": str(OUT),
        "before": before,
        "after": after,
        "scope": "cash callback catalog resolver; no production mutation",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
