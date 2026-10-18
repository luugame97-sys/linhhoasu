'use strict';
const a=require('assert/strict'),f=require('fs'),s=f.readFileSync(process.argv[2],'utf8'),h=f.readFileSync(process.argv[3],'utf8');
for(const m of ['U9.autoConfig.autoEquipUpgrade?this.autoEquipPowerUpgrade','autoDelegate:!!(U9.isOpen&&U9.autoConfig.autoEquipUpgrade)','this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade','t.writeBoolean(e.autoEquipUpgrade)','i.autoEquipUpgrade=e.readBoolean()','t.enoughPower=null!=t.enoughPower&&t.enoughPower,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade'])a.equal(s.split(m).length-1,1,m);
a.ok(s.includes('_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,this.updateViewUI()}'));
a.ok(s.includes('_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower'));
a.equal(s.includes('U9.autoConfig.enoughPower?this.autoEquipPowerUpgrade'),false);
a.ok(/main\.min_a6195824\.js\?v=20260904_(?:auto_equip_upgrade2|double_monsters1|task_guide_restore1|auto_equip_new_accounts1|auto_equip_fsm_v3|auto_delegate_clean_v4)/.test(h));
a.ok(s.includes('_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}'));
console.log(JSON.stringify({result:'PASS',checks:11}));
