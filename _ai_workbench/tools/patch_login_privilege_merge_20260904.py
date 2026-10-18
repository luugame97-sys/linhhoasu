"""Merge Activity 9 claim/login lifecycle into the current Activity 43/44 production snapshot."""
import sys
from pathlib import Path

def once(text,old,new,label):
 count=text.count(old)
 if count!=1:raise RuntimeError('{} expected once, found {}'.format(label,count))
 return text.replace(old,new,1)
def main():
 root=Path(sys.argv[1]);activity=root/'server/handlers/activity.js';account=root/'server/handlers/account.js'
 s=activity.read_text(encoding='utf8')
 s=once(s,"const { ensureFashionInfo } = require('./fashion');\n", "const { ensureFashionInfo } = require('./fashion');\nconst {\n  ensureActivity9State,\n  getActivity9PayId,\n  getRewardRows: getActivity9RewardRows,\n} = require('../services/Activity9Service');\n",'activity9 import')
 anchor='function ensureActivityInfo(player = {}) {\n'
 helper='''function hasActivity9RechargeRecord(player = {}, rechargeId = 0) {
  const id = Math.max(0, toSafeInt(rechargeId, 0));
  const records = ensureArray(player.rechargeInfo && player.rechargeInfo.records);
  return id > 0 && records.some((row) => (
    toSafeInt(row && row.id, 0) === id && toSafeInt(row && row.count, 0) > 0
  ));
}

function operateLoginPrivileges(player = {}, row = {}, params = {}) {
  const module = toSafeInt(params.module, 0);
  if (module !== 0) {
    return { result: 1, row, rewardInfo: buildRewardInfo([]) };
  }
  const state = ensureActivity9State(player, { now: Date.now() });
  if (state && state.row && toSafeInt(state.row.id, 0) === toSafeInt(row.id, 0)) row = state.row;
  const payId = getActivity9PayId(row.id);
  row.recordList = Array.from(new Set(ensureArray(row.recordList)
    .map((value) => Math.max(0, toSafeInt(value, 0)))
    .filter((value) => value > 0))).sort((left, right) => left - right);
  const bought = payId > 0 && (row.recordList.includes(payId) || hasActivity9RechargeRecord(player, payId));
  if (bought && !row.recordList.includes(payId)) {
    row.recordList.push(payId);
    row.recordList.sort((left, right) => left - right);
  }
  row.records = normalizeRecordsMap(row.records, 9);
  const openDay = Math.max(0, toSafeInt(row.score, 0));
  const claimRewards = [];
  let claimedAny = false;
  getActivity9RewardRows(row.id).forEach((rewardRow) => {
    const day = Math.max(0, toSafeInt(rewardRow && rewardRow.day, 0));
    if (day <= 0 || day > openDay) return;
    let flags = Math.max(0, toSafeInt(row.records[day], 0));
    if ((flags & 1) === 0) {
      claimRewards.push(...ensureArray(rewardRow.rewards));
      flags |= 1;
      claimedAny = true;
    }
    if (bought && (flags & 2) === 0) {
      claimRewards.push(...ensureArray(rewardRow.pRewards));
      flags |= 2;
      claimedAny = true;
    }
    row.records[day] = flags;
  });
  if (!claimedAny) return { result: 1, row, rewardInfo: buildRewardInfo([]) };
  row.status = 1;
  return { result: 0, row, rewardInfo: grantRewardRows(player, claimRewards) };
}

'''
 s=once(s,anchor,helper+anchor,'activity9 helper')
 s=once(s,'  syncActivationPassActivity(info, player);\n  const currentDayKey', '''  syncActivationPassActivity(info, player);
  const activity9State = ensureActivity9State(player);
  if (activity9State && activity9State.row) {
    const activity9Index = info.datas.findIndex((row) => (
      toSafeInt(row && row.id, 0) === activity9State.activityId
    ));
    if (activity9Index >= 0) info.datas[activity9Index] = normalizeActivityDataRow(activity9State.row, 9);
  }
  const currentDayKey''','ensure lifecycle')
 s=once(s,'  if (activityType === 7) {\n    const outcome = operateActivationPass(player, row);\n    result = outcome.result;\n    row = outcome.row;\n    rewardInfo = outcome.rewardInfo;\n  } else if (activityType === 21) {', '''  if (activityType === 7) {
    const outcome = operateActivationPass(player, row);
    result = outcome.result;
    row = outcome.row;
    rewardInfo = outcome.rewardInfo;
  } else if (activityType === 9) {
    const outcome = operateLoginPrivileges(player, row, { ...params, module, index, param });
    result = outcome.result;
    row = outcome.row;
    rewardInfo = outcome.rewardInfo;
  } else if (activityType === 21) {''','activity9 branch')
 activity.write_text(s,encoding='utf8',newline='')
 s=account.read_text(encoding='utf8');s=once(s,"const { ensureActivityInfo, buildActivityPayload } = require('./activity');\n","const { ensureActivityInfo, buildActivityPayload } = require('./activity');\nconst { ensureActivity9State } = require('../services/Activity9Service');\n",'account import');s=once(s,'  const rechargeAreaChanged = applyRechargeArea(player, rechargeArea);\n  let launchWelfareChanged',"  const rechargeAreaChanged = applyRechargeArea(player, rechargeArea);\n  const activity9State = ensureActivity9State(player);\n  const activity9Changed = !!(activity9State && activity9State.changed);\n  let launchWelfareChanged",'account ensure');s=once(s,' || rechargeAreaChanged || launchWelfareChanged ||',' || rechargeAreaChanged || activity9Changed || launchWelfareChanged ||','account save condition');account.write_text(s,encoding='utf8',newline='')
 print('PATCHED Activity9 merge into current production snapshot')
if __name__=='__main__':main()
