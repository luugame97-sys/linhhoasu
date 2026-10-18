from pathlib import Path
import shutil
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


def patch_server_equip(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        '  let silverGain = 0;\n  const protectedUids = options.safeAutoDelegate === true ? getEquippedUidSet(info) : new Set();',
        '  let silverGain = 0;\n  const sellAllEquipments = options.sellAllEquipments === true;\n  const protectedUids = options.safeAutoDelegate === true ? getEquippedUidSet(info) : new Set();',
        'server sell-all option',
    )
    text = replace_once(
        text,
        "    if (options.safeAutoDelegate === true) {\n      const equip = found.equip;\n      const current = normalizeEquip(activeEquipMap[String(toSafeInt(equip.type, 0))]);\n      if (protectedUids.has(uid) || !current || calcEquipPower(equip) >= calcEquipPower(current)) {\n        ignoredUids.push(uid);\n        return;\n      }\n    }",
        "    if (options.safeAutoDelegate === true) {\n      const equip = found.equip;\n      if (protectedUids.has(uid)) {\n        ignoredUids.push(uid);\n        return;\n      }\n      if (!sellAllEquipments) {\n        const current = normalizeEquip(activeEquipMap[String(toSafeInt(equip.type, 0))]);\n        if (!current || calcEquipPower(equip) >= calcEquipPower(current)) {\n          ignoredUids.push(uid);\n          return;\n        }\n      }\n    }",
        'server sell-all safety guard',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_server_item(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        '  ensureEquipInfo(player);\n  const result = saleOpenEquips(player, params && params.uids, {\n    safeAutoDelegate: !!(params && params.autoDelegate === true),\n  });',
        '  ensureEquipInfo(player);\n  const autoDelegate = !!(params && params.autoDelegate === true);\n  const sellAllEquipments = autoDelegate && !!(params && params.sellAllEquipments === true);\n  const result = saleOpenEquips(player, params && params.uids, {\n    safeAutoDelegate: autoDelegate,\n    sellAllEquipments,\n  });',
        'server sale handler option',
    )
    text = replace_once(
        text,
        '        autoDelegate: !!(params && params.autoDelegate === true),\n        rewardInfo,',
        '        autoDelegate,\n        sellAllEquipments,\n        rewardInfo,',
        'server sale response option',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_server_box(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'function settleManagedBotEquipments(player = {}, generated = []) {\n  ensureEquipInfo(player);',
        'function settleManagedBotEquipments(player = {}, generated = [], options = {}) {\n  ensureEquipInfo(player);\n  const sellAllEquipments = options === true || !!(options && options.sellAllEquipments);',
        'managed bot sell-all option',
    )
    text = replace_once(
        text,
        '  for (const equip of generatedRows) {\n    const type = Math.max(1, toSafeInt(equip.type, 1));',
        '  for (const equip of generatedRows) {\n    if (sellAllEquipments) {\n      ignored.push(toSafeInt(equip.uid, 0));\n      continue;\n    }\n    const type = Math.max(1, toSafeInt(equip.type, 1));',
        'managed bot skip replacement',
    )
    text = replace_once(
        text,
        '  const sale = saleUids.length > 0 ? saleOpenEquips(player, saleUids) : null;',
        '  const saleOptions = sellAllEquipments ? { safeAutoDelegate: true, sellAllEquipments: true } : undefined;\n  const sale = saleUids.length > 0 ? saleOpenEquips(player, saleUids, saleOptions) : null;',
        'managed bot sale option',
    )
    text = replace_once(
        text,
        '    soldUids: sale && Array.isArray(sale.uids) ? sale.uids.slice() : [],\n    saleItems,\n  };',
        '    soldUids: sale && Array.isArray(sale.uids) ? sale.uids.slice() : [],\n    saleItems,\n    sellAllEquipments,\n  };',
        'managed bot return option',
    )
    text = replace_once(
        text,
        '      botAutoDelegate = settleManagedBotEquipments(player, rewardEquips);',
        '      botAutoDelegate = settleManagedBotEquipments(player, rewardEquips, {\n        sellAllEquipments: !!(openInfo && openInfo.sellAllEquipments),\n      });',
        'managed bot settlement option',
    )
    text = replace_once(
        text,
        '      session.pendingBoxClaim = claimResult.claim;\n    }\n    session.pendingBoxReward = openInfo;',
        '      session.pendingBoxClaim = claimResult.claim;\n    }\n    if (session._isBot === true && params && params.sellAllEquipments === true) {\n      openInfo.sellAllEquipments = true;\n    }\n    session.pendingBoxReward = openInfo;',
        'managed bot policy carry',
    )
    text = replace_once(
        text,
        '      ignoredUids: botAutoDelegate.ignored,\n    };',
        '      ignoredUids: botAutoDelegate.ignored,\n      sellAllEquipments: !!(botAutoDelegate.sellAllEquipments || false),\n    };',
        'managed bot response option',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_client_main(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    old_ui = (
        'this.autoEquipNewAccountGroup=new U.Group,this.autoEquipNewAccountGroup.left=270,'
        'this.autoEquipNewAccountGroup.top=432,this.autoEquipNewAccountGroup.width=300,'
        'this.autoEquipNewAccountGroup.height=40,this.autoEquipNewAccountBox=new U.CheckBox,'
        'this.autoEquipNewAccountBox.left=0,this.autoEquipNewAccountBox.scaleX=.8,'
        'this.autoEquipNewAccountBox.scaleY=.8,this.autoEquipNewAccountBox.verticalCenter=0,'
        'this.autoEquipNewAccountBox.skinName="CheckBox1Skin",this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountBox),'
        'this.autoEquipNewAccountLabel=new U.Label,this.autoEquipNewAccountLabel.left=53,'
        'this.autoEquipNewAccountLabel.verticalCenter=0,this.autoEquipNewAccountLabel.size=18,'
        'this.autoEquipNewAccountLabel.bold=!0,this.autoEquipNewAccountLabel.fontFamily="Microsoft YaHei",'
        'this.autoEquipNewAccountLabel.textColor=5067090,this.autoEquipNewAccountLabel.text="Tự mặc đồ mạnh hơn",'
        'this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountLabel),'
    )
    new_ui = (
        'this.autoEquipNewAccountGroup=new U.Group,this.autoEquipNewAccountGroup.left=250,'
        'this.autoEquipNewAccountGroup.top=432,this.autoEquipNewAccountGroup.width=342,'
        'this.autoEquipNewAccountGroup.height=44,this.autoEquipNewAccountBox=new U.CheckBox,'
        'this.autoEquipNewAccountBox.left=0,this.autoEquipNewAccountBox.scaleX=.72,'
        'this.autoEquipNewAccountBox.scaleY=.72,this.autoEquipNewAccountBox.verticalCenter=0,'
        'this.autoEquipNewAccountBox.skinName="CheckBox1Skin",this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountBox),'
        'this.autoEquipNewAccountLabel=new U.Label,this.autoEquipNewAccountLabel.left=42,'
        'this.autoEquipNewAccountLabel.verticalCenter=0,this.autoEquipNewAccountLabel.size=16,'
        'this.autoEquipNewAccountLabel.bold=!0,this.autoEquipNewAccountLabel.fontFamily="Microsoft YaHei",'
        'this.autoEquipNewAccountLabel.textColor=5067090,this.autoEquipNewAccountLabel.text="Mặc đồ mạnh",'
        'this.autoEquipNewAccountGroup.addChild(this.autoEquipNewAccountLabel),'
        'this.sellAllEquipmentsBox=new U.CheckBox,this.sellAllEquipmentsBox.left=170,'
        'this.sellAllEquipmentsBox.scaleX=.72,this.sellAllEquipmentsBox.scaleY=.72,'
        'this.sellAllEquipmentsBox.verticalCenter=0,this.sellAllEquipmentsBox.skinName="CheckBox1Skin",'
        'this.autoEquipNewAccountGroup.addChild(this.sellAllEquipmentsBox),'
        'this.sellAllEquipmentsLabel=new U.Label,this.sellAllEquipmentsLabel.left=212,'
        'this.sellAllEquipmentsLabel.verticalCenter=0,this.sellAllEquipmentsLabel.size=16,'
        'this.sellAllEquipmentsLabel.bold=!0,this.sellAllEquipmentsLabel.fontFamily="Microsoft YaHei",'
        'this.sellAllEquipmentsLabel.textColor=5067090,this.sellAllEquipmentsLabel.text="Giữ lại phẩm chất",'
        'this.autoEquipNewAccountGroup.addChild(this.sellAllEquipmentsLabel),'
    )
    text = replace_once(text, old_ui, new_ui, 'compact auto-delegate controls')
    text = replace_once(
        text,
        'this.autoEquipNewAccountBox.addEventListener(egret.Event.CHANGE,this.autoEquipUpgradeCheckBox,this),this.startButton.addEventListener',
        'this.autoEquipNewAccountBox.addEventListener(egret.Event.CHANGE,this.autoEquipUpgradeCheckBox,this),this.sellAllEquipmentsBox.addEventListener(egret.Event.CHANGE,this.sellAllEquipmentsCheckBox,this),this.startButton.addEventListener',
        'sell-all checkbox listener',
    )
    text = replace_once(
        text,
        'this.powerCheckBox.selected=!!e.enoughPower,this.powerLab.text=B.ConvertLanguageToText(30030107),this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade,this.autoEquipNewAccountGroup.visible=!0,',
        'this.powerCheckBox.selected=!!e.enoughPower,this.powerLab.text="Dừng khi LC cao hơn",this.autoEquipNewAccountBox.selected=!!e.autoEquipUpgrade,this.sellAllEquipmentsBox.selected=!e.sellAllEquipments,this.autoEquipNewAccountGroup.visible=!0,',
        'compact labels and setting binding',
    )
    text = replace_once(
        text,
        '_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,this.updateViewUI()},',
        '_.autoEquipUpgradeCheckBox=function(){U9.autoConfig.autoEquipUpgrade=!U9.autoConfig.autoEquipUpgrade,this.updateViewUI()},_.sellAllEquipmentsCheckBox=function(){U9.autoConfig.sellAllEquipments=!this.sellAllEquipmentsBox.selected,this.updateViewUI()},',
        'sell-all checkbox handler',
    )
    text = replace_once(
        text,
        'U9.autoConfig.autoEquipUpgrade?this.autoEquipPowerUpgrade(t,e):',
        'U9.autoConfig.sellAllEquipments?(t.addSaleList(e),t.changeState(2)):(U9.autoConfig.autoEquipUpgrade||U9.autoConfig.isSilentMode)?this.autoEquipPowerUpgrade(t,e):',
        'silent equipment flow',
    )
    text = replace_once(
        text,
        'o.autoEquipPowerUpgrade=function(t,e){var i=this,n=Y.EquipModel.getPresetIdx(),',
        'o.autoEquipPowerUpgrade=function(t,e){var i=this,z=!!U9.autoConfig.sellAllEquipments,n=Y.EquipModel.getPresetIdx(),',
        'silent FSM flag',
    )
    text = replace_once(
        text,
        'C=function(){t.addSaleList(r),t.addSaleList(I),0<s.length?i.openHeroReplaceView(t,s):t.changeState(2)}',
        'C=function(){t.addSaleList(r),t.addSaleList(I),z&&t.addSaleList(s),!z&&0<s.length?i.openHeroReplaceView(t,s):t.changeState(2)}',
        'silent FSM success path',
    )
    text = replace_once(
        text,
        '_=function(e){s.push(e);for(;0<g.length;)s.push(g.shift());for(;0<r.length;)s.push(r.shift());for(;0<I.length;)s.push(I.shift());U9.isOpen=!1,i.openHeroReplaceView(t,s)}',
        '_=function(e){s.push(e);for(;0<g.length;)s.push(g.shift());for(;0<r.length;)s.push(r.shift());for(;0<I.length;)s.push(I.shift());z?(t.addSaleList(s),t.changeState(2)):(U9.isOpen=!1,i.openHeroReplaceView(t,s))}',
        'silent FSM failure path',
    )
    text = replace_once(
        text,
        'this.Rpc(2201,{uids:i,autoDelegate:!!(U9.isOpen&&U9.autoConfig.autoEquipUpgrade)},function(t){',
        'this.Rpc(2201,{uids:i,autoDelegate:!!(U9.isOpen&&(U9.autoConfig.autoEquipUpgrade||U9.autoConfig.isSilentMode||U9.autoConfig.sellAllEquipments)),sellAllEquipments:!!(U9.isOpen&&U9.autoConfig.sellAllEquipments)},function(t){',
        'sell-all sale request',
    )
    text = replace_once(
        text,
        't.writeBoolean(e.autoEquipUpgrade),t.writeBoolean(!!e.fishing_autoEquipPower);',
        't.writeBoolean(e.autoEquipUpgrade),t.writeBoolean(!!e.fishing_autoEquipPower),t.writeBoolean(!!e.sellAllEquipments);',
        'sell-all setting persistence',
    )
    text = replace_once(
        text,
        'e.position<e.length&&(i.autoEquipUpgrade=e.readBoolean()),e.position<e.length&&(i.fishing_autoEquipPower=e.readBoolean()),',
        'e.position<e.length&&(i.autoEquipUpgrade=e.readBoolean()),e.position<e.length&&(i.fishing_autoEquipPower=e.readBoolean()),e.position<e.length&&(i.sellAllEquipments=e.readBoolean()),',
        'sell-all setting restore',
    )
    text = replace_once(
        text,
        't.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade,',
        't.autoEquipUpgrade=null!=t.autoEquipUpgrade&&t.autoEquipUpgrade,t.sellAllEquipments=null!=t.sellAllEquipments&&t.sellAllEquipments,',
        'sell-all setting default',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_client_index(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(text, '20260907_fishing_notice_v1', '20260914_auto_delegate_silent_v1', 'client cache marker')
    path.write_text(text, encoding='utf-8', newline='')


def main() -> None:
    if len(sys.argv) != 6:
        raise SystemExit('usage: patch_auto_delegate_silent_20260914.py box.js item.js EquipService.js main.js index.html')
    box, item, equip, main_js, index = map(Path, sys.argv[1:])
    patch_server_equip(equip)
    patch_server_item(item)
    patch_server_box(box)
    patch_client_main(main_js)
    patch_client_index(index)
    print('PATCHED', box, item, equip, main_js, index)


if __name__ == '__main__':
    main()
