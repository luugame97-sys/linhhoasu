"""Restore stop-on-power semantics and keep auto-equip as an independent control."""
import sys
from pathlib import Path

OLD_VERSION='20260904_auto_equip_fsm_v3';NEW_VERSION='20260904_auto_delegate_clean_v4'

def once(text,old,new,label):
 count=text.count(old)
 if count!=1:raise RuntimeError('{} anchor expected once, found {}'.format(label,count))
 return text.replace(old,new,1)

def main():
 if len(sys.argv)!=3:raise SystemExit('usage: patch_auto_delegate_clean_controls_v4_20260904.py BUNDLE INDEX')
 main,index=map(Path,sys.argv[1:3]);source=main.read_text(encoding='utf8');page=index.read_text(encoding='utf8')
 source=once(source,'this.autoEquipNewAccountGroup.top=392','this.autoEquipNewAccountGroup.top=432','auto-equip layout')
 source=once(source,'this.currentState=So.getCurCreateTime()>AppInfo.params.powerOpen?"stateA":"stateB"','this.currentState="stateA"','full controls for all accounts')
 old=('this.ticketCheckBox.selected=e.arenaTicket,this.powerCheckBox.selected=!!e.autoEquipUpgrade,'
      'this.powerLab.text="Tự động mặc trang bị mạnh hơn",this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade,'
      'this.autoEquipNewAccountGroup.visible="stateB"==this.currentState,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected')
 new=('this.ticketCheckBox.selected=e.arenaTicket,this.powerCheckBox.selected=!!e.enoughPower,'
      'this.powerLab.text=B.ConvertLanguageToText(30030107),this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade,'
      'this.autoEquipNewAccountGroup.visible=!0,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected')
 source=once(source,old,new,'independent power and auto-equip controls')
 old=('_.powerConditionCheckBox=function(){this.autoEquipUpgradeCheckBox()},'
      '_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,'
      'U9.autoConfig.enoughPower=!1,this.orCheckBox.selected=!1,this.bothCheckBox.selected=!1,this.updateViewUI()}')
 new=('_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,'
      'U9.autoConfig.isBoth=!0,this.updateViewUI()},'
      '_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,this.updateViewUI()}')
 source=once(source,old,new,'independent toggle handlers')
 source=once(source,'t.enoughPower=!1,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade',
             't.enoughPower=null!=t.enoughPower&&t.enoughPower,t.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade',
             'power persistence normalization')
 page=once(page,OLD_VERSION,NEW_VERSION,'cache version')
 main.write_text(source,encoding='utf8',newline='');index.write_text(page,encoding='utf8',newline='')
 print('patched clean v4 controls: stop-on-power restored, auto-equip independent, full UI for all accounts')
if __name__=='__main__':main()
