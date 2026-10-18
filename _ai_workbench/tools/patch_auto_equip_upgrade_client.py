"""Patch the current production bundle with opt-in auto-equip upgrade flow."""
from pathlib import Path
import re
import sys

OLD_DEAL = (
    'o.dealSelect=function(t){var e,i;U9.isOpen?(e=Y.BoxLayerModel.openEquipList,'
    'i=x9.CheckAutoStop(e),xV.isAutoOpenShowMatrix?0!=e.length?(t.addSaleList(i),'
    'console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    'A.ins().dispatch(E.SHOW_EQUIP_MATRIX,!0):(t.addSaleList(i),0!=e.length?'
    '(console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    't.changeState(2))):this.openHeroReplaceView(t,Y.BoxLayerModel.openEquipList)},'
    'o.openHeroReplaceView=function(t,e)'
)

NEW_DEAL = (
    'o.dealSelect=function(t){var e,i;U9.isOpen?(e=Y.BoxLayerModel.openEquipList,'
    'U9.autoConfig.enoughPower?this.autoEquipPowerUpgrade(t,e):'
    '(i=x9.CheckAutoStop(e),xV.isAutoOpenShowMatrix?0!=e.length?(t.addSaleList(i),'
    'console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    'A.ins().dispatch(E.SHOW_EQUIP_MATRIX,!0):(t.addSaleList(i),0!=e.length?'
    '(console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    't.changeState(2)))):this.openHeroReplaceView(t,Y.BoxLayerModel.openEquipList)},'
    'o.autoEquipPowerUpgrade=function(t,e){var i=this,n=Y.EquipModel.getPresetIdx(),a=U9.autoConfig.enoughPower;'
    'U9.autoConfig.enoughPower=!1;try{var s=e.slice(),o=x9.CheckAutoStop(s)}finally{U9.autoConfig.enoughPower=a}'
    'for(var r={},l=[],h=0;h<o.length;h++){var d=o[h],c=Y.EquipModel.getMapEquipInfo(d.type,n),u=YV.calPower(c),p=YV.calPower(d),f=r[d.type];'
    'p>u&&(!f||p>YV.calPower(f))?(f&&l.push(f),r[d.type]=d):l.push(d)}'
    'var g=[];for(var m in r)g.push(r[m]);var v=[],I=function(){t.addSaleList(l),t.addSaleList(v),0<s.length?i.openHeroReplaceView(t,s):t.changeState(2)},'
    'C=function(e){s.push(e);for(;0<g.length;)s.push(g.shift());for(;0<l.length;)s.push(l.shift());for(;0<v.length;)s.push(v.shift());U9.isOpen=!1,i.openHeroReplaceView(t,s)},'
    '_=function(){if(0==g.length)return I();var e=g.shift(),a=Y.EquipModel.getMapEquipInfo(e.type,n),o=Y.EquipModel.getEquipFromPlan(e.uid);'
    't.Rpc(2200,{uid:e.uid,listId:o,mapId:n,autoDelegate:!0},function(o){if(!(o&&0==o.result&&Number(o.afterPower)>Number(o.beforePower)))return C(e);'
    'Y.EquipModel.removeOpenListEquip(e.uid);var r={x:0,y:0};try{var l=Y.RaidMgr.mMapRaid.GetEntity(Y.ActorModel.actorID);'
    'l&&l.parent&&(r=l.parent.localToGlobal(l.x,l.y))}catch(t){}if(a){var h=Y.EquipModel.equipReplace(e,n,r);'
    'h&&(Y.EquipModel.addEquipToOpenList(h),v.push(h))}else Y.EquipModel.addEquip(e,n,r);'
    'A.ins().dispatchImmediate(E.EQUIP_REPLACE,a),A.ins().dispatch(E.EQUIP_MATRIX_VIEW_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,1),_()})};_()},'
    'o.openHeroReplaceView=function(t,e)'
)

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

def main():
    main_js, index = map(Path, sys.argv[1:3])
    text = main_js.read_text(encoding='utf-8')
    text = replace_once(text, OLD_DEAL, NEW_DEAL, 'select FSM')
    text = replace_once(
        text,
        'this.Rpc(2201,{uids:i},function(t){for(var e=0,i=0,n=t.rewardInfo.items;',
        'this.Rpc(2201,{uids:i,autoDelegate:!!(U9.isOpen&&U9.autoConfig.enoughPower)},function(t){'
        't.ignoredUids&&0<t.ignoredUids.length&&(console.warn("[LHS] AutoEquip protected equips",t.ignoredUids),U9.isOpen=!1);'
        'for(var e=0,i=0,n=t.rewardInfo.items;',
        'safe sale request',
    )
    text = replace_once(
        text,
        'this.powerCheckBox.selected=e.enoughPower,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'this.powerCheckBox.selected=e.enoughPower,this.powerLab.text="Tự động mặc trang bị mạnh hơn",this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'native checkbox label',
    )
    main_js.write_text(text, encoding='utf-8', newline='')
    html = index.read_text(encoding='utf-8')
    marker = '20260904_auto_equip_upgrade1'
    html = re.sub(r'(main\.min_a6195824\.js)(?:\?v=[^"\']*)?', r'\1?v=' + marker, html, count=1)
    if marker not in html:
        raise RuntimeError('cache marker insert failed')
    index.write_text(html, encoding='utf-8', newline='')
    print(f'PATCHED={main_js} INDEX={index}')

if __name__ == '__main__':
    main()
