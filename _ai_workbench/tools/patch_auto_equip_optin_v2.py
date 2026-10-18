"""Migrate auto-equip UI to a new, default-off persisted flag."""
from pathlib import Path
import re
import sys

def once(s, a, b, label):
    count = s.count(a)
    if count != 1:
        raise RuntimeError(f'{label}: {count}')
    return s.replace(a, b, 1)

main, index = map(Path, sys.argv[1:3])
s = main.read_text(encoding='utf-8')
s = once(s, 'U9.autoConfig.enoughPower?this.autoEquipPowerUpgrade(t,e):', 'U9.autoConfig.autoEquipUpgrade?this.autoEquipPowerUpgrade(t,e):', 'flow flag')
s = once(s, 'autoDelegate:!!(U9.isOpen&&U9.autoConfig.enoughPower)', 'autoDelegate:!!(U9.isOpen&&U9.autoConfig.autoEquipUpgrade)', 'sale flag')
s = once(s, 'this.powerCheckBox.selected=e.enoughPower,this.powerLab.text="Tự động mặc trang bị mạnh hơn"', 'this.powerCheckBox.selected=!!e.autoEquipUpgrade,this.powerLab.text="Tự động mặc trang bị mạnh hơn"', 'view flag')
s = once(s, '_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,this.orCheckBox.selected=U9.autoConfig.enoughPower&&!1,this.bothCheckBox.selected=U9.autoConfig.enoughPower&&!0,U9.autoConfig.isBoth=!0}', '_.powerConditionCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,U9.autoConfig.enoughPower=!1,this.orCheckBox.selected=!1,this.bothCheckBox.selected=!1}', 'click flag')
s = once(s, 't.writeBoolean(e.oldTrek_recruit_reward);var n=egret.Base64Util.encode(t.buffer)', 't.writeBoolean(e.oldTrek_recruit_reward),t.writeBoolean(e.autoEquipUpgrade);var n=egret.Base64Util.encode(t.buffer)', 'persist write')
s = once(s, 'e.position<e.length&&(i.oldTrek_recruit_reward=e.readBoolean()),this._autoConfig=i', 'e.position<e.length&&(i.oldTrek_recruit_reward=e.readBoolean()),e.position<e.length&&(i.autoEquipUpgrade=e.readBoolean()),this._autoConfig=i', 'persist read')
s = once(s, 't.enoughPower=null!=t.enoughPower&&t.enoughPower,t.maxQualitySelect=', 't.enoughPower=!1,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade,t.maxQualitySelect=', 'default off')
main.write_text(s, encoding='utf-8', newline='')
h = index.read_text(encoding='utf-8')
h = re.sub(r'(main\.min_a6195824\.js)(?:\?v=[^"\']*)?', r'\1?v=20260904_auto_equip_upgrade2', h, count=1)
index.write_text(h, encoding='utf-8', newline='')
print('PATCHED_OPTIN_V2')
