"""Select auto-equip upgrades from every drop, then apply keep/sale policy to leftovers."""
import re,sys
from pathlib import Path

OLD_VERSION='20260904_auto_equip_new_accounts1';NEW_VERSION='20260904_auto_equip_fsm_v3'
START='o.autoEquipPowerUpgrade=function(t,e){'
END=',o.openHeroReplaceView=function(t,e)'
NEW=('o.autoEquipPowerUpgrade=function(t,e){var i=this,n=Y.EquipModel.getPresetIdx(),a=U9.autoConfig.enoughPower,s=e.slice(),o=e.slice();'
'U9.autoConfig.enoughPower=!1;try{var r=x9.CheckAutoStop(s)}finally{U9.autoConfig.enoughPower=a}'
'for(var l={},h=0;h<o.length;h++){var d=o[h],c=Y.EquipModel.getMapEquipInfo(d.type,n),u=YV.calPower(c),p=YV.calPower(d),f=l[d.type];'
'p>u&&(!f||p>YV.calPower(f))&&(l[d.type]=d)}var g=[];for(var m in l)g.push(l[m]);'
'var v=function(t){for(var e=t.length-1;0<=e;e--){var i=l[t[e].type];i&&i.uid==t[e].uid&&t.splice(e,1)}};v(s),v(r);'
'var I=[],C=function(){t.addSaleList(r),t.addSaleList(I),0<s.length?i.openHeroReplaceView(t,s):t.changeState(2)},'
'_=function(e){s.push(e);for(;0<g.length;)s.push(g.shift());for(;0<r.length;)s.push(r.shift());for(;0<I.length;)s.push(I.shift());U9.isOpen=!1,i.openHeroReplaceView(t,s)},'
'b=function(){if(0==g.length)return C();var e=g.shift(),a=Y.EquipModel.getMapEquipInfo(e.type,n),o=Y.EquipModel.getEquipFromPlan(e.uid);'
't.Rpc(2200,{uid:e.uid,listId:o,mapId:n,autoDelegate:!0},function(o){if(!(o&&0==o.result&&Number(o.afterPower)>Number(o.beforePower)))return _(e);'
'Y.EquipModel.removeOpenListEquip(e.uid);var r={x:0,y:0};try{var l=Y.RaidMgr.mMapRaid.GetEntity(Y.ActorModel.actorID);l&&l.parent&&(r=l.parent.localToGlobal(l.x,l.y))}catch(t){}'
'if(a){var h=Y.EquipModel.equipReplace(e,n,r);h&&(Y.EquipModel.addEquipToOpenList(h),I.push(h))}else Y.EquipModel.addEquip(e,n,r);'
'A.ins().dispatchImmediate(E.EQUIP_REPLACE,a),A.ins().dispatch(E.EQUIP_MATRIX_VIEW_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,1),b()})};b()}')
def main():
 main,index=map(Path,sys.argv[1:3]);text=main.read_text(encoding='utf8');start=text.find(START);end=text.find(END,start)
 if start<0 or end<0 or text.find(START,start+1)>=0:raise RuntimeError('autoEquipPowerUpgrade anchor mismatch')
 text=text[:start]+NEW+text[end:];main.write_text(text,encoding='utf8',newline='')
 page=index.read_text(encoding='utf8');count=page.count(OLD_VERSION)
 if count!=1:raise RuntimeError('cache anchor expected once, found '+str(count))
 index.write_text(page.replace(OLD_VERSION,NEW_VERSION,1),encoding='utf8',newline='')
 print('patched auto-equip FSM v3: all drops considered, keep/sale applies to leftovers')
if __name__=='__main__':main()
