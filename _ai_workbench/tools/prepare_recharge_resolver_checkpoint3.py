"""Build a local-only checkpoint-3 candidate from the latest production snapshot.

The script never connects to a VPS.  It copies only the files involved in the
token recharge path into _ai_workbench/temp and patches that isolated copy.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "temp/phase2_recharge_prod_20260901_044241/lhs/newServer"
LOCAL_RESOLVER = ROOT.parent / "linhhoasu" / "lhs" / "newServer" / "src" / "services" / "RechargeRewardResolver.js"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "temp" / f"checkpoint3_recharge_resolver_candidate_{STAMP}"

FILES = (
    "src/handlers/compat.js",
    "src/handlers/item.js",
    "src/services/RechargeBenefitService.js",
    "src/services/Activity9Service.js",
    "src/services/RechargeRewardResolver.js",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, got {count}")
    return text.replace(old, new, 1)


def patch_item(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r"(    if \(isEquipTemplateItem\(rewardId\)\) \{.*?      return;\n    \}\n)", re.S)
    native = "\\1\\n    // Fashion is native ownership, not a bag stack.\\n    if (isFashionRewardId(rewardId)) {\\n      for (let i = 0; i < rewardCount; i += 1) {\\n        const fashionRow = grantFashionReward(player, rewardId);\\n        if (fashionRow && !rewardFashion.some((row) => row.id === fashionRow.id)) rewardFashion.push(fashionRow);\\n      }\\n      return;\\n    }\\n"
    patched, count = pattern.subn(native, text, count=1)
    if count != 1:
        raise RuntimeError("item native fashion route: expected one match")
    text = patched
    text = replace_once(text, "      artifacts: rewardArtifacts,\n    }),", "      artifacts: rewardArtifacts,\n      fashion: rewardFashion,\n    }),", "item fashion rewardInfo")
    text = replace_once(text, "  handleUseItem, handleSaleItem, handleEquipReplace, handleEquipSale, handleShopBuy,\n  buildUseRecordsPayload,\n};", "  handleUseItem, handleSaleItem, handleEquipReplace, handleEquipSale, handleShopBuy,\n  addRewardRowsToPlayer,\n  buildGemInfoSyncPacket,\n  buildGemUpdatePackets,\n  buildUseRecordsPayload,\n};", "item recharge exports")
    path.write_text(text, encoding="utf-8", newline="\n")


def patch_compat(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, "const { addRewardToPlayer } = require('./raid');", "const { addRewardToPlayer } = require('./raid');\nconst { addRewardRowsToPlayer, buildGemInfoSyncPacket, buildGemUpdatePackets } = require('./item');", "compat item import")
    old_import = """const {
  applyRechargeBenefits,
  buildMonthCardUpdatePackets,
  resolveRechargeProduct,
} = require('../services/RechargeBenefitService');"""
    new_import = """const {
  applyRechargeBenefits,
  buildMonthCardUpdatePackets,
  resolveRechargeProduct,
} = require('../services/RechargeBenefitService');
const {
  applyPeriodPurchaseLedger,
  parseMulti,
  resolveRechargeRewards,
} = require('../services/RechargeRewardResolver');"""
    text = replace_once(text, old_import, new_import, "compat import")

    old_resolver = re.compile(r"function getRechargeRewardRows\(payId\) \{.*?\n\}\n", re.S)
    new_resolver = "function getRechargePurchasePlan(player, payId, multi, now) {\n  const rewardPlan = resolveRechargeRewards(player, { route: 'token', payId, multi, now, allowActivity9: true });\n  const product = resolveRechargeProduct(payId);\n  const payRow = getCfgRow(configService.get('PayConfig') || {}, payId);\n  return { product, payRow, rewardPlan };\n}\n"
    text, resolver_count = old_resolver.subn(new_resolver, text, count=1)
    if resolver_count != 1:
        raise RuntimeError("compat resolver function not found")

    old_head = """  const payId = toSafeInt(params.id, 0);
  const { payRow, rewardRows } = getRechargeRewardRows(payId);
  await applyConfiguredRechargeArea(player);
  const activity9Product = isActivity9PayId(payId);
  if (activity9Product && Math.max(1, toSafeInt(params.multi, 1)) !== 1) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId } };
  }"""
    new_head = """  const payId = toSafeInt(params.id, 0);
  const multi = Math.max(1, toSafeInt(params.multi, 1));
  await applyConfiguredRechargeArea(player);
  const activity9Product = isActivity9PayId(payId);
  if (activity9Product && multi !== 1) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'INVALID_MULTI' } };
  }
  const purchasePlan = getRechargePurchasePlan(player, payId, multi);
  const { payRow, rewardPlan } = purchasePlan;
  if (!payRow || !rewardPlan || !rewardPlan.ok) {
    const reason = rewardPlan && rewardPlan.reason ? rewardPlan.reason : 'RECHARGE_CONFIG_MISSING';
    logger.warn(`[Recharge1230] rejected payId=${payId} multi=${multi} reason=${reason} user=${session && session.userId ? session.userId : 'unknown'}`);
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: reason, rewardInfo: buildRewardInfo([]) } };
  }"""
    text = replace_once(text, old_head, new_head, "compat purchase head")

    old_cost = """  const tokenCost = pickTokenChargeOption(player, payRow || {});
  if (!tokenCost || tokenCost.itemId <= 0 || tokenCost.count <= 0) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, rewardInfo: buildRewardInfo([]) } };
  }
  if (!consumePlayerItem(player, tokenCost.itemId, tokenCost.count)) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, rewardInfo: buildRewardInfo([]) } };
  }

  const rewardInfo = buildRewardInfo(rewardRows);"""
    new_cost = """  const tokenCost = pickTokenChargeOption(player, payRow || {});
  if (!tokenCost || tokenCost.itemId <= 0 || tokenCost.count <= 0) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'TOKEN_COST_MISSING', rewardInfo: buildRewardInfo([]) } };
  }
  const totalTokenCost = tokenCost.count * multi;
  if (!consumePlayerItem(player, tokenCost.itemId, totalTokenCost)) {
    return { tag: 1230, msgUid, data: { result: -1, id: payId, code: 'NOT_ENOUGH_TOKEN', rewardInfo: buildRewardInfo([]) } };
  }

  const rewardInfo = buildRewardInfo(rewardPlan.rows);"""
    text = replace_once(text, old_cost, new_cost, "compat cost/rewards")

    old_benefit = """  const benefits = applyRechargeBenefits(player, { payId, productId: payId });"""
    new_benefit = """  const benefits = applyRechargeBenefits(player, { payId, productId: payId, multi });"""
    text = replace_once(text, old_benefit, new_benefit, "compat benefits")

    old_delta = """          { id: tokenCost.itemId, count: -tokenCost.count },"""
    new_delta = """          { id: tokenCost.itemId, count: -totalTokenCost },"""
    text = replace_once(text, old_delta, new_delta, "compat cost delta")
    path.write_text(text, encoding="utf-8", newline="\n")


def patch_benefit(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    marker = """function addRechargeRecord(info, id, addCount = 1) {
  const safeId = toSafeInt(id, 0);
  const count = Math.max(1, toSafeInt(addCount, 1));
  if (safeId <= 0) return;
  const found = info.records.find((row) => toSafeInt(row && row.id, 0) === safeId);
  if (found) found.count = Math.max(0, toSafeInt(found.count, 0)) + count;
  else info.records.push({ id: safeId, count });
}
"""
    addition = marker + """
function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRewardRows(rows = [], times = 1) {
  const safeTimes = Math.max(1, toSafeInt(times, 1));
  return ensureArray(rows)
    .map((row) => ({
      id: Math.max(0, toSafeInt(row && row.id, 0)),
      count: Math.max(0, toSafeInt(row && row.count, 0)) * safeTimes,
    }))
    .filter((row) => row.id > 0 && row.count > 0);
}

function mergeRewardRows(rows = []) {
  const merged = new Map();
  normalizeRewardRows(rows).forEach((row) => {
    merged.set(row.id, (merged.get(row.id) || 0) + row.count);
  });
  return Array.from(merged.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => left.id - right.id);
}

function getRechargeRecordCount(player = {}, id = 0) {
  const safeId = Math.max(0, toSafeInt(id, 0));
  const records = ensureArray(ensureObject(player.rechargeInfo).records);
  const found = records.find((row) => toSafeInt(row && row.id, 0) === safeId);
  return found ? Math.max(0, toSafeInt(found.count, 0)) : 0;
}

function resolveRechargeRewards(player = {}, options = {}) {
  const rawId = options.payId != null ? options.payId : options.productId;
  const product = resolveRechargeProduct(rawId);
  const shopRow = ensureObject(product.shopRow);
  const payRow = getCfgRow(getConfigTable('PayConfig'), product.payId || product.requestedId);
  const multi = Math.max(1, toSafeInt(options.multi, 1));
  const previousCount = Math.max(
    0,
    toSafeInt(options.previousCount, getRechargeRecordCount(player, product.payId || product.requestedId))
  );

  if (!payRow || !product.shopRow) {
    return { ok: false, reason: 'RECHARGE_CONFIG_MISSING', ...product, rows: [] };
  }

  const baseRows = normalizeRewardRows(shopRow.rewards);
  const firstRows = normalizeRewardRows(shopRow.firstRewards);
  const subsequentRows = normalizeRewardRows(shopRow.subsequentRewards);
  const extraRows = normalizeRewardRows(shopRow.extraRewards);
  const selectedRows = [];
  let mode = 'base';

  for (let index = 0; index < multi; index += 1) {
    const purchaseIndex = previousCount + index;
    let rows = baseRows;
    let purchaseMode = 'base';
    if (purchaseIndex === 0 && firstRows.length > 0) {
      rows = [...baseRows, ...firstRows];
      purchaseMode = 'first';
    } else if (purchaseIndex > 0 && subsequentRows.length > 0) {
      rows = [...baseRows, ...subsequentRows];
      purchaseMode = 'subsequent';
    }
    // `extraRewards` belong to a later claim/activation contract for every
    // current catalog row.  They must not be granted on purchase here.
    selectedRows.push(...rows);
    if (index === 0) mode = purchaseMode;
    else if (mode !== purchaseMode) mode = 'mixed';
  }

  if (selectedRows.length <= 0 && options.allowEmpty !== true) {
    return {
      ok: false,
      reason: 'SPECIALIZED_RECHARGE_RESOLVER_REQUIRED',
      ...product,
      payRow,
      previousCount,
      multi,
      mode: 'specialized',
      rows: [],
      extraRows,
    };
  }

  return {
    ok: true,
    reason: '',
    ...product,
    payRow,
    previousCount,
    multi,
    mode,
    isDouble: false,
    rows: mergeRewardRows(selectedRows),
    extraRows,
  };
}
"""
    text = replace_once(text, marker, addition, "benefit resolver insertion")

    old_exports = """  getCfgRow,
  resolveRechargeProduct,
  toSafeInt,"""
    new_exports = """  getCfgRow,
  getRechargeRecordCount,
  mergeRewardRows,
  normalizeRewardRows,
  resolveRechargeProduct,
  resolveRechargeRewards,
  toSafeInt,"""
    text = replace_once(text, old_exports, new_exports, "benefit exports")
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    if OUT.exists():
        raise FileExistsError(OUT)
    before = {}
    for rel in FILES:
        src = LOCAL_RESOLVER if rel.endswith("RechargeRewardResolver.js") else SNAPSHOT / rel
        if not src.is_file():
            raise FileNotFoundError(src)
        dst = OUT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())
        before[rel] = sha(src)

    patch_item(OUT / "src/handlers/item.js")
    # The finalized compat candidate is kept immutable after its full fixture
    # passed; copying it avoids regenerating an earlier partial draft.
    final_compat = ROOT / "temp/checkpoint3_recharge_resolver_candidate_20260901_060034/src/handlers/compat.js"
    if not final_compat.is_file():
        raise FileNotFoundError(final_compat)
    (OUT / "src/handlers/compat.js").write_bytes(final_compat.read_bytes())
    after = {rel: sha(OUT / rel) for rel in FILES}
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "localOnly": True,
        "sourceSnapshot": str(SNAPSHOT),
        "candidate": str(OUT),
        "before": before,
        "after": after,
        "scope": "token recharge 1230 reward resolver; no VPS mutation",
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
