from pathlib import Path
import sys


OLD_DEAL_SELECT = (
    'o.dealSelect=function(t){var e,i;U9.isOpen?(e=Y.BoxLayerModel.openEquipList,'
    'i=x9.CheckAutoStop(e),xV.isAutoOpenShowMatrix?0!=e.length?(t.addSaleList(i),'
    'console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    'A.ins().dispatch(E.SHOW_EQUIP_MATRIX,!0):(t.addSaleList(i),0!=e.length?'
    '(console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    't.changeState(2))):this.openHeroReplaceView(t,Y.BoxLayerModel.openEquipList)},'
    'o.openHeroReplaceView=function(t,e)'
)

NEW_DEAL_SELECT = (
    'o.dealSelect=function(t){var e,i;U9.isOpen?(e=Y.BoxLayerModel.openEquipList,'
    'i=x9.CheckAutoStop(e),U9.autoConfig.enoughPower?this.autoDelegateEquip(t,e,i):'
    'xV.isAutoOpenShowMatrix?0!=e.length?(t.addSaleList(i),'
    'console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    'A.ins().dispatch(E.SHOW_EQUIP_MATRIX,!0):(t.addSaleList(i),0!=e.length?'
    '(console.log("Đạt điều kiện tự động đóng mở rương"),this.openHeroReplaceView(t,e)):'
    't.changeState(2))):this.openHeroReplaceView(t,Y.BoxLayerModel.openEquipList)},'
    'o.autoDelegateEquip=function(t,e,i){var n=this,a=Y.EquipModel.getPresetIdx(),s={},o=[];'
    'for(var r=0;r<e.length;r++){var l=e[r],h=Y.EquipModel.getMapEquipInfo(l.type,a),'
    'd=YV.calPower(h),c=YV.calPower(l),u=s[l.type];c>d&&(!u||c>YV.calPower(u))?'
    '(u&&i.push(u),s[l.type]=l):o.push(l)}var p=[];for(var f in s)p.push(s[f]);'
    'var g=function(){if(0==p.length)return t.addSaleList(i),0<o.length?'
    'n.openHeroReplaceView(t,o):t.changeState(2);var e=p.shift(),s=Y.EquipModel.getMapEquipInfo(e.type,a),'
    'r=Y.EquipModel.getEquipFromPlan(e.uid);t.Rpc(2200,{uid:e.uid,listId:r,mapId:a,autoDelegate:!0},'
    'function(r){if(r&&0==r.result){Y.EquipModel.removeOpenListEquip(e.uid);var l={x:0,y:0};'
    'try{var h=Y.RaidMgr.mMapRaid.GetEntity(Y.ActorModel.actorID);h&&h.parent&&(l=h.parent.localToGlobal(h.x,h.y))}catch(t){}'
    'if(s){var d=Y.EquipModel.equipReplace(e,a,l);d&&(Y.EquipModel.addEquipToOpenList(d),i.push(d))}'
    'else Y.EquipModel.addEquip(e,a,l);A.ins().dispatchImmediate(E.EQUIP_REPLACE,s),'
    'A.ins().dispatch(E.EQUIP_MATRIX_VIEW_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,1)}'
    'else o.push(e);g()})};g()},o.openHeroReplaceView=function(t,e)'
)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


def patch_main(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'this.Rpc(2201,{uids:i},function(t){for(var e=0,i=0,n=t.rewardInfo.items;',
        'this.Rpc(2201,{uids:i,autoDelegate:!!(U9.isOpen&&U9.autoConfig.enoughPower)},'
        'function(t){t.ignoredUids&&0<t.ignoredUids.length&&'
        '(console.warn("[LHS] AutoDelegate protected equips",t.ignoredUids),U9.isOpen=!1);'
        'for(var e=0,i=0,n=t.rewardInfo.items;',
        'auto sale request',
    )
    text = replace_once(text, OLD_DEAL_SELECT, NEW_DEAL_SELECT, 'delegate select flow')
    text = replace_once(
        text,
        'this.powerCheckBox.selected=e.enoughPower,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'this.powerCheckBox.selected=e.enoughPower,this.powerLab.text="Tự mặc đồ mạnh, bán đồ yếu",'
        'this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'delegate label',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_index(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    candidates = ('20260830_name_rename_fix2', '20260830_name_rename_fix1')
    old = next((marker for marker in candidates if marker in text), None)
    if not old:
        raise RuntimeError(f'cache marker not found in {path}')
    text = text.replace(old, '20260831_auto_delegate1')
    path.write_text(text, encoding='utf-8', newline='')


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit('usage: patch_auto_delegate_client.py <main.js> <index.html> [<main.js> <index.html> ...]')
    args = [Path(value) for value in sys.argv[1:]]
    if len(args) % 2:
        raise SystemExit('expected main/index pairs')
    for offset in range(0, len(args), 2):
        patch_main(args[offset])
        patch_index(args[offset + 1])
        print(f'PATCHED={args[offset]} INDEX={args[offset + 1]}')


if __name__ == '__main__':
    main()
