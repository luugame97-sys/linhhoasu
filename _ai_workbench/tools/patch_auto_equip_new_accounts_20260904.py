"""Expose auto-equip in both AutoOpenBoxPanelSkin states without changing defaults."""

import sys
from pathlib import Path


OLD_VERSION = "20260904_task_guide_restore1"
NEW_VERSION = "20260904_auto_equip_new_accounts1"


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError("{} anchor expected once, found {}".format(label, count))
    return text.replace(old, new, 1)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_auto_equip_new_accounts_20260904.py BUNDLE INDEX")
    bundle = Path(sys.argv[1])
    index = Path(sys.argv[2])
    source = bundle.read_text(encoding="utf-8")
    page = index.read_text(encoding="utf-8")

    children_old = "(_=Z9e.prototype).childrenCreated=function(){this.startButton.addEventListener"
    children_new = (
        "(_=Z9e.prototype).childrenCreated=function(){"
        "this.autoEquipNewAccountGroup=new U.Group,this.autoEquipNewAccountGroup.left=270,"
        "this.autoEquipNewAccountGroup.top=392,this.autoEquipNewAccountGroup.width=300,"
        "this.autoEquipNewAccountGroup.height=40,this.autoEquipNewAccountBox=new U.CheckBox,"
        "this.autoEquipNewAccountBox.left=0,this.autoEquipNewAccountBox.scaleX=.8,"
        "this.autoEquipNewAccountBox.scaleY=.8,this.autoEquipNewAccountBox.verticalCenter=0,"
        "this.autoEquipNewAccountBox.skinName=\"CheckBox1Skin\","
        "this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountBox),"
        "this.autoEquipNewAccountLabel=new U.Label,this.autoEquipNewAccountLabel.left=53,"
        "this.autoEquipNewAccountLabel.verticalCenter=0,this.autoEquipNewAccountLabel.size=18,"
        "this.autoEquipNewAccountLabel.bold=!0,this.autoEquipNewAccountLabel.fontFamily=\"Microsoft YaHei\","
        "this.autoEquipNewAccountLabel.textColor=5067090,this.autoEquipNewAccountLabel.text=\"Tự mặc đồ mạnh hơn\","
        "this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountLabel),"
        "this.baseGroup&&this.baseGroup.addChild(this.autoEquipNewAccountGroup),"
        "this.autoEquipNewAccountBox.addEventListener(egret.Event.CHANGE,this.autoEquipUpgradeCheckBox,this),"
        "this.startButton.addEventListener"
    )
    source = once(source, children_old, children_new, "runtime EUI checkbox")

    view_old = (
        "this.ticketCheckBox.selected=e.arenaTicket,this.powerCheckBox.selected=!!e.autoEquipUpgrade,"
        "this.powerLab.text=\"Tự động mặc trang bị mạnh hơn\","
        "this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected"
    )
    view_new = (
        "this.ticketCheckBox.selected=e.arenaTicket,this.powerCheckBox.selected=!!e.autoEquipUpgrade,"
        "this.powerLab.text=\"Tự động mặc trang bị mạnh hơn\","
        "this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade,"
        "this.autoEquipNewAccountGroup.visible=\"stateB\"==this.currentState,"
        "this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected"
    )
    source = once(source, view_old, view_new, "stateB checkbox layout")

    handler_old = (
        "_.powerConditionCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,"
        "U9.autoConfig.enoughPower=!1,this.orCheckBox.selected=!1,this.bothCheckBox.selected=!1},"
        "_.maxQualityCheckBox=function()"
    )
    handler_new = (
        "_.powerConditionCheckBox=function(){this.autoEquipUpgradeCheckBox()},"
        "_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,"
        "U9.autoConfig.enoughPower=!1,this.orCheckBox.selected=!1,this.bothCheckBox.selected=!1,"
        "this.updateViewUI()},_.maxQualityCheckBox=function()"
    )
    source = once(source, handler_old, handler_new, "shared auto-equip toggle")
    page = once(page, OLD_VERSION, NEW_VERSION, "cache version")

    bundle.write_text(source, encoding="utf-8", newline="")
    index.write_text(page, encoding="utf-8", newline="")
    print("auto-equip checkbox exposed for stateB/new-account panel; default remains off")


if __name__ == "__main__":
    main()
