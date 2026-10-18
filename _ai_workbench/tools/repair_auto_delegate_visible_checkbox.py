from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


AUTO_DELEGATE_FUNCTION = (
    'o.autoDelegateEquip=function(t,e,i){var n=this,a=Y.EquipModel.getPresetIdx(),s={},o=[],r=[];'
    'for(var l=0;l<e.length;l++){var h=e[l],d=Y.EquipModel.getMapEquipInfo(h.type,a),c=YV.calPower(h),u=d?YV.calPower(d):0,p=s[h.type];'
    'c>u&&(!p||c>YV.calPower(p))?(p&&o.push(p),s[h.type]=h):o.push(h)}'
    'var p=[];for(var f in s)p.push(s[f]);var g=function(){if(0==p.length)return n.addSaleList(i),'
    '0<o.length?n.openHeroReplaceView(t,o):t.changeState(2);var e=p.shift(),s=Y.EquipModel.getMapEquipInfo(e.type,a),'
    'r=Y.EquipModel.getEquipFromPlan(e.uid);t.Rpc(2200,{uid:e.uid,listId:r,mapId:a,autoDelegate:!0},function(r){'
    'if(r&&0==r.result){Y.EquipModel.removeOpenListEquip(e.uid);var l={x:0,y:0};try{var h=Y.RaidMgr.mMapRaid.GetEntity(Y.ActorModel.actorID);'
    'h&&h.parent&&(l=h.parent.localToGlobal(h.x,h.y))}catch(t){}if(s){var d=Y.EquipModel.equipReplace(e,a,l);d&&(Y.EquipModel.addEquipToOpenList(d),i.push(d))}'
    'else Y.EquipModel.addEquip(e,a,l);A.ins().dispatchImmediate(E.EQUIP_REPLACE,s),A.ins().dispatch(E.EQUIP_MATRIX_VIEW_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,1)}'
    'else o.push(e);g()})};g()}'
)


def replace_auto_flow(text: str) -> str:
    start = text.find('o.autoDelegateEquip=function')
    if start < 0:
        raise RuntimeError('auto-equip function anchor missing')
    end = text.find(',o.openHeroReplaceView=function', start)
    if end < 0:
        raise RuntimeError('auto-equip function end anchor missing')
    return text[:start] + AUTO_DELEGATE_FUNCTION + text[end:]


def patch_main(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_auto_flow(text)
    text = replace_once(
        text,
        ',this.autoDelegateBox.addEventListener(egret.Event.CHANGE,this.autoDelegateCheckBox,this)',
        '',
        'remove missing checkbox listener',
    )
    text = replace_once(
        text,
        'this.powerCheckBox.selected=e.enoughPower,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected,this.autoDelegateBox.selected=!!e.autoDelegate',
        'this.powerCheckBox.selected=!!e.autoDelegate,this.powerLab.text="Tự mặc đồ mạnh, bán đồ yếu",this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'bind visible power checkbox',
    )
    text = replace_once(
        text,
        '_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,this.orCheckBox.selected=U9.autoConfig.enoughPower&&!1,this.bothCheckBox.selected=U9.autoConfig.enoughPower&&!0,U9.autoConfig.isBoth=!0},_.autoDelegateCheckBox=function(){U9.autoConfig.autoDelegate=!U9.autoConfig.autoDelegate},',
        '_.powerConditionCheckBox=function(){U9.autoConfig.autoDelegate=!U9.autoConfig.autoDelegate,U9.autoConfig.enoughPower=U9.autoConfig.autoDelegate,this.orCheckBox.selected=U9.autoConfig.autoDelegate&&!1,this.bothCheckBox.selected=U9.autoConfig.autoDelegate&&!0,U9.autoConfig.isBoth=!0},',
        'visible checkbox handler',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_index(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    old = next((marker for marker in ('20260831_auto_delegate1', '20260831_auto_delegate_ui1') if marker in text), None)
    if not old:
        raise RuntimeError(f'cache marker missing: {path}')
    text = text.replace(old, '20260831_auto_delegate_ui2')
    path.write_text(text, encoding='utf-8', newline='')


def main() -> None:
    args = [Path(value) for value in sys.argv[1:]]
    if len(args) < 2 or len(args) % 2:
        raise SystemExit('usage: repair_auto_delegate_visible_checkbox.py <main.js> <index.html> [pairs...]')
    for offset in range(0, len(args), 2):
        patch_main(args[offset])
        patch_index(args[offset + 1])
        print(f'PATCHED={args[offset]} INDEX={args[offset + 1]}')


if __name__ == '__main__':
    main()
