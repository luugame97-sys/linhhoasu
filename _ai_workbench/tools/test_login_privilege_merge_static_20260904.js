'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const activity=fs.readFileSync(process.argv[2],'utf8'),account=fs.readFileSync(process.argv[3],'utf8');
for(const marker of ["} = require('../services/Activity9Service');",'function operateLoginPrivileges(','const activity9State = ensureActivity9State(player);','} else if (activityType === 9) {','const outcome = operateLoginPrivileges(player, row, { ...params, module, index, param });'])assert.equal(activity.split(marker).length-1,1,marker);
for(const marker of ["const { ensureActivity9State } = require('../services/Activity9Service');",'const activity9State = ensureActivity9State(player);','const activity9Changed = !!(activity9State && activity9State.changed);','|| rechargeAreaChanged || activity9Changed || launchWelfareChanged ||'])assert.equal(account.split(marker).length-1,1,marker);
assert.ok(activity.includes('syncNewYearDailyState(info);'));assert.ok(activity.includes('syncDailyShopClaimRows(info);'));assert.ok(activity.includes('} else if (activityType === 43) {'));assert.ok(activity.includes('} else if (activityType === 44 && module === 0) {'));
assert.ok(activity.includes('if ((flags & 1) === 0)'));assert.ok(activity.includes('if (bought && (flags & 2) === 0)'));assert.ok(activity.includes('if (!claimedAny) return { result: 1'));
console.log(JSON.stringify({result:'PASS',checks:16,activity9:true,activity43:true,activity44:true,loginPersistence:true}));
