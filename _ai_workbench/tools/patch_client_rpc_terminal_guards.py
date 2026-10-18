"""Patch bounded RPC/UI terminal guards into a client root.

The root must contain webgame/game/js/main.min_a6195824.js and
webgame/game/index.html. All replacements are exact-count guarded so a
different production bundle cannot be modified accidentally.
"""
from __future__ import annotations

import sys
from pathlib import Path


OLD_TOKEN = "20260831_artifact_item_sync2"
NEW_TOKEN = "20260831_input_freeze_guard2"


def replace_exact(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} match, found {count}")
    return text.replace(old, new)


def patch_bundle(bundle: str) -> str:
    replacements = [
        (
            "RepeatRpcBlockModel auto reset",
            ".setRpcRecord=function(t,e){this._rpcRecordMap[t]={state:e,time:T.serverTimeMilli}},"
            "m.checkRpc=function(t){var e,t=this._rpcRecordMap[t];return!t||((e=1==t.state)||"
            "(15e3<T.serverTimeMilli-t.time&&(t.state=1),S.ins().showTipsByLangId(30020146)),e)}",
            ".setRpcRecord=function(t,e){var i=this,n={state:e,time:T.serverTimeMilli};"
            "this._rpcRecordMap[t]=n,2==e&&setTimeout(function(){i._rpcRecordMap[t]===n&&2==n.state&&(n.state=1)},15e3)},"
            "m.checkRpc=function(t){var e=this._rpcRecordMap[t];return!e||1==e.state||15e3<T.serverTimeMilli-e.time?"
            "(e&&2==e.state&&(e.state=1),!0):(S.ins().showTipsByLangId(30020146),!1)}",
        ),
        (
            "ActivityModel error callback",
            "f.sendActivityOperate=function(t,e,i,n,a){void 0===a&&(a=null),"
            "this.Rpc(1700,{id:t,module:e,index:i,param:n},function(t){a&&a(t)})}",
            "f.sendActivityOperate=function(t,e,i,n,a,s){void 0===a&&(a=null),void 0===s&&(s=null),"
            "this.Rpc(1700,{id:t,module:e,index:i,param:n},function(t){a&&a(t)},null,s)}",
        ),
        (
            "KnifeReward terminal error cleanup",
            "Y.ActivityModel.sendActivityOperate(this.id,this.MODULE_DRAW,t,null,function(){e._blockFlag=!1;"
            "var t=e.getConfig();e._fakePoolCount+=t.diamondAward,A.ins().dispatch(E.ACTIVITY_KNIFEREWARD_DRAW_UPDATE)})",
            "Y.ActivityModel.sendActivityOperate(this.id,this.MODULE_DRAW,t,null,function(){e._blockFlag=!1;"
            "var t=e.getConfig();e._fakePoolCount+=t.diamondAward,A.ins().dispatch(E.ACTIVITY_KNIFEREWARD_DRAW_UPDATE)},"
            "function(){e._blockFlag=!1,i&&(i.globalMask.visible=!1,i.autoCheck.selected=!1)})",
        ),
        (
            "Mooncake terminal error cleanup",
            "f.sendMakeMooncake=function(t,i,n,a){this.Rpc(1780,{id:t,index:i,count:n,consumes:a},"
            "function(t){var e=Ap.getActivityData();0==t.result?(P.ins().isShow(YI)||Er.Open(t.rewardInfo),e.updateRecord(i)):"
            "1!=t.result&&2!=t.result||e.updateRecordRedessCount(),e.addMakeRecord(i,n,t.result,a),e.resetBlockFlag(),"
            "A.ins().dispatch(E.MOONCAKE_MAKE_RESULT_UPDATE,i,a,t)})}",
            "f.sendMakeMooncake=function(t,i,n,a){this.Rpc(1780,{id:t,index:i,count:n,consumes:a},"
            "function(t){var e=Ap.getActivityData();if(!t)return void(e&&e.resetBlockFlag());"
            "0==t.result?(P.ins().isShow(YI)||Er.Open(t.rewardInfo),e.updateRecord(i)):"
            "1!=t.result&&2!=t.result||e.updateRecordRedessCount(),e.addMakeRecord(i,n,t.result,a),e.resetBlockFlag(),"
            "A.ins().dispatch(E.MOONCAKE_MAKE_RESULT_UPDATE,i,a,t)},null,function(){var t=Ap.getActivityData();"
            "t&&t.resetBlockFlag()})}",
        ),
        (
            "Gem falsy response guard",
            "s._bindPanel&&(s._bindPanel.globalMask.visible=!1),0==t.result&&",
            "s._bindPanel&&(s._bindPanel.globalMask.visible=!1),t&&0==t.result&&",
        ),
        (
            "Gem terminal error cleanup",
            "A.ins().dispatch(E.Gem_Set_Update)})},m.sendBuyField=function",
            "A.ins().dispatch(E.Gem_Set_Update)},null,function(){s._bindPanel&&"
            "(s._bindPanel.globalMask.visible=!1)})},m.sendBuyField=function",
        ),
        (
            "Pet use egg model error callback",
            "a.sendUseEgg=function(s,o){var r=this;this.Rpc(3300,{eggId:s},function(t){if(t){for(var e=[],i=0,n=t.data;"
            "i<n.length;i++){var a=n[i];r.updatePetData(a),e.push(a.slot)}A.ins().dispatch(E.PET_GET_UPDATE,e,s,o)}})}",
            "a.sendUseEgg=function(s,o,l){var r=this;this.Rpc(3300,{eggId:s},function(t){if(t){for(var e=[],i=0,n=t.data;"
            "i<n.length;i++){var a=n[i];r.updatePetData(a),e.push(a.slot)}A.ins().dispatch(E.PET_GET_UPDATE,e,s,o)}else l&&l()},"
            "null,function(){l&&l()})}",
        ),
        (
            "Pet compose model signature",
            "a.sendCompose=function(s,o,r,l,h){var d=this;",
            "a.sendCompose=function(s,o,r,l,h,c){var d=this;",
        ),
        (
            "Pet compose falsy response branch",
            "this.Rpc(3302,{uid:s,targetUid:o},function(t){var e,i,n,a;t&&(",
            "this.Rpc(3302,{uid:s,targetUid:o},function(t){var e,i,n,a;t?(",
        ),
        (
            "Pet compose model error callback",
            "A.ins().dispatch(E.PET_COMP_UPDATE,e,t.data,[r,l],h),A.ins().dispatch(E.ATTR_CHANGE,6))})},"
            "Object.defineProperty(a,\"nowUpgradeTimes\"",
            "A.ins().dispatch(E.PET_COMP_UPDATE,e,t.data,[r,l],h),A.ins().dispatch(E.ATTR_CHANGE,6)):c&&c()},"
            "null,function(){c&&c()})},Object.defineProperty(a,\"nowUpgradeTimes\"",
        ),
        (
            "Pet eat model signature",
            "a.sendPetEat=function(n,a,s,o,r){var l=this;",
            "a.sendPetEat=function(n,a,s,o,r,h){var l=this;",
        ),
        (
            "Pet eat falsy response branch",
            "this.Rpc(3311,{matUid:n,targetUid:a},function(t){var e,i;t&&(",
            "this.Rpc(3311,{matUid:n,targetUid:a},function(t){var e,i;t?(",
        ),
        (
            "Pet eat model error callback",
            "A.ins().dispatch(E.PET_COMP_UPDATE,i,t.data,[s,o],r)))})},a.sendPetSwap=function",
            "A.ins().dispatch(E.PET_COMP_UPDATE,i,t.data,[s,o],r))):h&&h()},null,function(){h&&h()})},"
            "a.sendPetSwap=function",
        ),
        (
            "Pet swap model signature",
            "a.sendPetSwap=function(t,e,i){var a=this,s={type:t,uid:e,costUid:i};",
            "a.sendPetSwap=function(t,e,i,n){var a=this,s={type:t,uid:e,costUid:i};",
        ),
        (
            "Pet swap model error callback",
            "A.ins().dispatch(E.Pet_ReplaceMent_View_Update,t),A.ins().dispatch(E.ATTR_CHANGE,6,19),"
            "A.ins().dispatch(E.CHANGE_IDLE_MAP_ROLE_SHOW)}})},a.sendPetSetWish=function",
            "A.ins().dispatch(E.Pet_ReplaceMent_View_Update,t),A.ins().dispatch(E.ATTR_CHANGE,6,19),"
            "A.ins().dispatch(E.CHANGE_IDLE_MAP_ROLE_SHOW)}else n&&n()},null,function(){n&&n()})},a.sendPetSetWish=function",
        ),
        (
            "Pet auto egg 24 terminal stop",
            "Y.PetModel.sendUseEgg(24,function(){e.onAutoComposeOpenEgg()})",
            "Y.PetModel.sendUseEgg(24,function(){e.onAutoComposeOpenEgg()},function(){e.changeAutoComposeState(0)})",
        ),
        (
            "Pet auto egg 25 terminal stop",
            "Y.PetModel.sendUseEgg(25,function(){e.onAutoComposeOpenEgg()})",
            "Y.PetModel.sendUseEgg(25,function(){e.onAutoComposeOpenEgg()},function(){e.changeAutoComposeState(0)})",
        ),
        (
            "Pet auto compose terminal stop",
            "Y.PetModel.sendCompose(a.uid,n.uid,a.slot,n.slot,function(){t.onAutoComposeCompose()})",
            "Y.PetModel.sendCompose(a.uid,n.uid,a.slot,n.slot,function(){t.onAutoComposeCompose()},"
            "function(){t.changeAutoComposeState(0)})",
        ),
        (
            "Pet auto eat terminal stop",
            "Y.PetModel.sendPetEat(p.uid,l.uid,p.slot,l.slot,function(){t.onAutoComposeCompose()})",
            "Y.PetModel.sendPetEat(p.uid,l.uid,p.slot,l.slot,function(){t.onAutoComposeCompose()},"
            "function(){t.changeAutoComposeState(0)})",
        ),
        (
            "Pet replacement once-only watchdog",
            "_.onPetReplace=function(e){var i=this;this.commonWin.closeBtn.setTouchEnabled(!1),"
            "this.commonWin.bg.setTouchEnabled(!1),this.maskGroup.visible=!0,this.petSpine.registerSpineEventHandler(function(t){"
            "\"e_hit\"==t.eventData.name&&(i.midSpine.setAnimation(0,\"a_5\",!1),i.composeItem.visible=!1,"
            "i.petIconItem.visible=!0,i.itemIcon.visible=!1,i.petIconItem.setAdd())},5),"
            "this.midSpine.registerSpineEventHandler(function(t){\"e_hit\"==t.eventData.name&&"
            "i.resultSpine.setAnimation(0,\"a_6\",!1).waitPlayEnd().then(function(){i.replaceBtn.visible=!0,"
            "i.commonWin.closeBtn.setTouchEnabled(!0),i.commonWin.bg.setTouchEnabled(!0),i.maskGroup.visible=!1,"
            "e.data&&Y.Config.PetConfig[e.data.id]&&(P.ins().AddQueueOpen(L7,e.data,!1,0,0,null),Er.Open(e.rewardInfo),"
            "i.resetView())})},5),this.resultSpine.registerSpineEventHandler(function(t){\"e_hit\"==t.eventData.name&&e.data&&"
            "(i.resultItem.visible=!0,i.questionMarkImg.visible=!1,i.resultItem.data={isUnlock:!0,petData:e.data})},5),"
            "this.petSpine.setAnimation(0,\"a_3\",!1),this.costSpine.setAnimation(0,\"a_4\",!1)}",
            "_.onPetReplace=function(e){var i=this,n=!1,a=function(){n||(n=!0,i.replaceBtn.visible=!0,"
            "i.commonWin.closeBtn.setTouchEnabled(!0),i.commonWin.bg.setTouchEnabled(!0),i.maskGroup.visible=!1,"
            "e.data&&Y.Config.PetConfig[e.data.id]&&(P.ins().AddQueueOpen(L7,e.data,!1,0,0,null),Er.Open(e.rewardInfo),"
            "i.resetView()))};this.commonWin.closeBtn.setTouchEnabled(!1),this.commonWin.bg.setTouchEnabled(!1),"
            "this.maskGroup.visible=!0,this.petSpine.registerSpineEventHandler(function(t){\"e_hit\"==t.eventData.name&&"
            "(i.midSpine.setAnimation(0,\"a_5\",!1),i.composeItem.visible=!1,i.petIconItem.visible=!0,"
            "i.itemIcon.visible=!1,i.petIconItem.setAdd())},5),this.midSpine.registerSpineEventHandler(function(t){"
            "\"e_hit\"==t.eventData.name&&i.resultSpine.setAnimation(0,\"a_6\",!1).waitPlayEnd().then(a)},5),"
            "this.resultSpine.registerSpineEventHandler(function(t){\"e_hit\"==t.eventData.name&&e.data&&"
            "(i.resultItem.visible=!0,i.questionMarkImg.visible=!1,i.resultItem.data={isUnlock:!0,petData:e.data})},5),"
            "this.petSpine.setAnimation(0,\"a_3\",!1),this.costSpine.setAnimation(0,\"a_4\",!1),setTimeout(a,8e3)}",
        ),
        (
            "Pet replacement request closure",
            "_.onReplaceClick=function(){if(0==this._nowWishId)",
            "_.onReplaceClick=function(){var i=this;if(0==this._nowWishId)",
        ),
        (
            "Pet replacement request error restore",
            "(this.checkBox.selected?Y.PetModel.sendPetSwap(1,this._nowChooseMainUId,[]):"
            "Y.PetModel.sendPetSwap(2,this._nowChooseMainUId,this._nowChooseSubUIds),this.replaceBtn.visible=!1)",
            "(this.replaceBtn.visible=!1,this.checkBox.selected?Y.PetModel.sendPetSwap(1,this._nowChooseMainUId,[],"
            "function(){i.replaceBtn.visible=!0}):Y.PetModel.sendPetSwap(2,this._nowChooseMainUId,this._nowChooseSubUIds,"
            "function(){i.replaceBtn.visible=!0}))",
        ),
    ]
    patched = bundle
    for label, old, new in replacements:
        patched = replace_exact(patched, old, new, 1, label)
    return patched


def validate_patched(bundle: str, index: str) -> None:
    markers = (
        "i._rpcRecordMap[t]===n&&2==n.state",
        "i&&(i.globalMask.visible=!1,i.autoCheck.selected=!1)",
        "t&&t.resetBlockFlag()",
        "s._bindPanel&&(s._bindPanel.globalMask.visible=!1)",
        "function(){e.changeAutoComposeState(0)}",
        "setTimeout(a,8e3)",
        "function(){i.replaceBtn.visible=!0}",
        "Array.isArray(t.changed)&&t.changed.length",
    )
    missing = [marker for marker in markers if marker not in bundle]
    if missing:
        raise RuntimeError(f"patched bundle missing markers: {missing}")
    if index.count(NEW_TOKEN) != 2:
        raise RuntimeError(f"index must contain {NEW_TOKEN} exactly twice")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_client_rpc_terminal_guards.py <client-root>")
    root = Path(sys.argv[1]).resolve()
    bundle_path = root / "webgame/game/js/main.min_a6195824.js"
    index_path = root / "webgame/game/index.html"
    bundle = bundle_path.read_text(encoding="utf-8")
    index = index_path.read_text(encoding="utf-8")
    if NEW_TOKEN in index:
        validate_patched(bundle, index)
        print(f"already patched root={root}")
        return
    patched_bundle = patch_bundle(bundle)
    patched_index = replace_exact(index, OLD_TOKEN, NEW_TOKEN, 2, "index cache token")
    validate_patched(patched_bundle, patched_index)
    bundle_path.write_text(patched_bundle, encoding="utf-8", newline="")
    index_path.write_text(patched_index, encoding="utf-8", newline="")
    print(f"patched root={root}")


if __name__ == "__main__":
    main()
