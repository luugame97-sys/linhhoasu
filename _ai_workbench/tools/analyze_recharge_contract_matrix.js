#!/usr/bin/env node
/* Build a read-only payId -> client expectation -> generic server behavior matrix. */
const fs = require('fs');

function rows(value, context = {}) {
  const out = [];
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((child, index) => out.push(...rows(child, { ...context, index })));
    return out;
  }
  const own = { ...context };
  for (const key of ['id', 'activityId', 'stage', 'day', 'index', 'taskId']) {
    if (value[key] != null) own[key] = value[key];
  }
  const refs = [];
  for (const [key, child] of Object.entries(value)) {
    if (/^(payid?|advancedPayid|rechargeId|rechargeID|productId)$/i.test(key)) {
      const id = Number(child);
      if (Number.isFinite(id) && id > 0) refs.push({ field: key, payId: Math.floor(id) });
    }
  }
  if (refs.length) out.push({ value, context: own, refs });
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') out.push(...rows(child, { ...own, key }));
  }
  return out;
}

function itemRows(value) {
  return Array.isArray(value) ? value.map((r) => ({ id: Number(r && r.id) || 0, count: Number(r && r.count) || 0 })).filter((r) => r.id > 0 && r.count > 0) : [];
}

function merge(items) {
  const map = new Map();
  for (const row of items) map.set(row.id, (map.get(row.id) || 0) + row.count);
  return [...map.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => a.id - b.id);
}

function ownRewardFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of Object.keys(value)) {
    if (/^(rewards?|pRewards|eRewards\d*|firstRewards|subsequentRewards|extraRewards|fundReward|advancedReward|show_1|show_2)$/i.test(key)) {
      const parsed = itemRows(value[key]);
      if (parsed.length) result[key] = parsed;
    }
  }
  return result;
}

function get(table, id) {
  if (!table || typeof table !== 'object') return null;
  return table[id] || table[String(id)] || null;
}

function main() {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const tables = JSON.parse(fs.readFileSync(value('--tables'), 'utf8'));
  const out = value('--out');
  const pay = tables.PayConfig || {};
  const shop = tables.ShopConfig || {};
  const privilege = tables.PrivilegeConfig || {};
  const knownMonth = new Set([11000001, 11000002, 11000007, 11000009, 11000012]);
  const references = [];
  for (const [table, root] of Object.entries(tables)) {
    for (const hit of rows(root)) {
      for (const ref of hit.refs) references.push({ table, ...ref, context: hit.context, rewardFields: ownRewardFields(hit.value) });
    }
  }
  const ids = [...new Set(references.map((r) => r.payId))].sort((a, b) => a - b);
  const shopRows = Object.values(shop).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  const matrix = ids.map((payId) => {
    const payRow = get(pay, payId);
    const linked = shopRows.filter((row) => Number(row.payId != null ? row.payId : (row.payid != null ? row.payid : row.rechargeId)) === payId);
    const direct = get(shop, payId);
    const linkedMonth = linked.find((row) => knownMonth.has(Number(row.id)) || !!get(privilege, row.id));
    const selected = linkedMonth || direct || linked[0] || null;
    const primary = itemRows(selected && selected.rewards);
    const payRewards = itemRows(payRow && payRow.rewards);
    const tokenRewards = primary.length ? primary : payRewards;
    const refs = references.filter((row) => row.payId === payId);
    const expectedRewardFields = refs.flatMap((row) => Object.entries(row.rewardFields).map(([field, items]) => ({ table: row.table, field, items, context: row.context })));
    const shopOtherRewards = selected ? ownRewardFields(selected) : {};
    const activityTypes = [...new Set(refs.map((row) => {
      const match = row.table.match(/^Activity(\d+)/i); return match ? Number(match[1]) : 0;
    }).filter(Boolean))].sort((a, b) => a - b);
    const monthCardId = selected && (knownMonth.has(Number(selected.id)) || !!get(privilege, selected.id)) ? Number(selected.id) : 0;
    const cashBuiltinDiamond = payRow ? Math.max(0, Number(payRow.diamond || payRow.count || payRow.itemCount || payRow.rewardDiamond || 0)) : 0;
    const risks = [];
    if (!payRow) risks.push('PAYCONFIG_MISSING');
    if (!selected) risks.push('SHOP_LINK_MISSING');
    if (selected && tokenRewards.length === 0 && payId !== 10501 && payId !== 10502) risks.push('TOKEN_FALLBACK_ID1_X60');
    if (cashBuiltinDiamond === 0) risks.push('CASH_BUILTIN_DIAMOND_ZERO');
    if (expectedRewardFields.length && tokenRewards.length === 0) risks.push('CLIENT_EXPECTS_REWARDS_BUT_GENERIC_TOKEN_HAS_NONE');
    if (Object.keys(shopOtherRewards).some((field) => !/^rewards?$/i.test(field))) risks.push('GENERIC_TOKEN_IGNORES_ALTERNATE_REWARD_FIELDS');
    if (activityTypes.some((type) => ![7, 9].includes(type))) risks.push('PAY_LINKED_ACTIVITY_WITHOUT_EXPLICIT_GENERIC_HANDLER_PROOF');
    return {
      payId,
      payConfig: payRow || null,
      referenceCount: refs.length,
      referenceTables: [...new Set(refs.map((r) => r.table))].sort(),
      activityTypes,
      linkedShopIds: linked.map((row) => Number(row.id) || row.id),
      selectedShopId: selected ? Number(selected.id) || selected.id : null,
      monthCardId,
      tokenPrimaryRewards: tokenRewards,
      selectedShopRewardFields: shopOtherRewards,
      clientExpectedRewardFields: expectedRewardFields,
      cashBuiltinDiamond,
      genericActivation: {
        addsRechargeRecord: true,
        explicitActivityHandlers: activityTypes.filter((type) => [7, 9].includes(type)),
        activity9Special: [10501, 10502].includes(payId),
        monthCardSpecial: monthCardId > 0,
      },
      risks: [...new Set(risks)],
    };
  });

  const summary = {
    payConfigRows: Object.keys(pay).length,
    referencedPayIds: matrix.length,
    referencedMissingPayConfig: matrix.filter((row) => row.risks.includes('PAYCONFIG_MISSING')).length,
    missingShopLink: matrix.filter((row) => row.risks.includes('SHOP_LINK_MISSING')).length,
    fallback60: matrix.filter((row) => row.risks.includes('TOKEN_FALLBACK_ID1_X60')).length,
    cashBuiltinDiamondZero: matrix.filter((row) => row.risks.includes('CASH_BUILTIN_DIAMOND_ZERO')).length,
    alternateRewardFieldsIgnored: matrix.filter((row) => row.risks.includes('GENERIC_TOKEN_IGNORES_ALTERNATE_REWARD_FIELDS')).length,
    unprovenActivityTypes: [...new Set(matrix.flatMap((row) => row.activityTypes).filter((type) => ![7, 9].includes(type)))].sort((a, b) => a - b),
    riskCounts: {},
  };
  matrix.forEach((row) => row.risks.forEach((risk) => { summary.riskCounts[risk] = (summary.riskCounts[risk] || 0) + 1; }));
  const report = { generatedAt: new Date().toISOString(), readOnly: true, summary, matrix };
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
