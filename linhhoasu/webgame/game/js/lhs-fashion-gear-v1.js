/* Scoped native UI repair: ownership is always server-authoritative. */
(function (root) {
  'use strict';
  if (root.LhsFashionGearV1) return;
  var api = root.LhsFashionGearV1 = { version:'20260909_fashion_gear_v7', installed:false, attempts:0 };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function config() { var m=manager(); return m && m.Config; }
  function notify(message) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(message); }
  function dispatch(name) { if (root.MessageCenter && root.MessageDef && root.MessageDef[name]) root.MessageCenter.ins().dispatch(root.MessageDef[name]); }
  function wrap(proto, name, factory) { if (proto && typeof proto[name] === 'function') proto[name] = factory(proto[name]); }
  function isBox(id) {
    var c=config(),a=c&&c.AssetsConfig[id],u=c&&c.AssetsUseConfig[id];
    return !!(a && a.type===100 && a.useType===105 && u && u.type===105 && c.FashionDressConfig[id]);
  }
  var configured=null;
  function prepareConfig() {
    var c=config(); if (!c || !c.AssetsConfig || !c.FishRodConfig || !c.FashionDressConfig || configured===c.AssetsConfig) return;
    configured=c.AssetsConfig;
    Object.keys(c.FashionDressConfig).forEach(function(id) { if (isBox(id)) { c.AssetsConfig[id].ifShow=1; c.AssetsConfig[id].ifShowNum=1; } });
    ['FishRodConfig','FishRaftConfig'].forEach(function(table) {
      Object.keys(c[table]||{}).forEach(function(id) {
        var row=c[table][id];
        // Only server-age gates are waived, never card expiry/ownership or
        // feature unlocks. No other event schedule/config is changed.
        if (row.conditions) row.conditions=row.conditions.filter(function(x){return x.type!==5;});
      });
    });
  }
  function validResource(key) { return key && root.RES && root.RES.hasRes(key); }
  function isSuitPiece(id) {
    var c=config(),row=c&&c.FashionConfig[id],dress=row&&c.FashionDressConfig[row.dressId];
    // 28000 is the native role/class outfit, not a collectible skin set.
    // Do not hide ordinary class equipment or standalone cosmetic weapons.
    if(!dress||Number(row.dressId)===28000)return false;
    // Match the native client contract: linkage, colour-change and end-skill
    // outfits are whole-set equipment; normal outfits and bathrobes keep
    // their standalone component behaviour.
    if([1,2,4].indexOf(Number(dress.isSuit))<0)return false;
    var table=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][dress.isSuit];
    var variants=table&&c[table]&&c[table][row.dressId];
    if(!variants)return false;
    // DressLevelConfig is keyed by star level, not FashionConfig.colorId.
    // Search all configured variants so colour aliases cannot leak into the
    // standalone weapon/head/body/leg tabs.
    var rows=dress.isSuit===4?[variants]:Object.keys(variants).map(function(key){return variants[key];});
    return rows.some(function(variant){return variant&&Array.isArray(variant.fashionIds)&&variant.fashionIds.indexOf(Number(id))>=0;});
  }
  api.isSuitPiece=isSuitPiece;
  function filterPieceTabs(view) {
    // Filter the view only. GetFashionList also feeds stats and activation
    // checks, so filtering that shared model would change gameplay attributes.
    if(view.isInHotSpring||!Array.isArray(view.dataList))return;
    view.dataList=view.dataList.filter(function(row){return !isSuitPiece(row.id);});
  }
  function hidePieceActions(view) {
    if(view.isInHotSpring||!isSuitPiece(view.selectId))return;
    view._lhsPieceVisibility=[];
    ['btnSelect','btnActive','costItem','imgUse','groupTitle','labTitle','labDesc','groupAttr','listAttr','labEmptyAttr','groupTime'].forEach(function(key){
      if(view[key]){view._lhsPieceVisibility.push([view[key],view[key].visible,view[key].includeInLayout]);view[key].visible=false;view[key].includeInLayout=false;}
    });
  }
  function restorePieceActions(view) {
    (view._lhsPieceVisibility||[]).forEach(function(saved){saved[0].visible=saved[1];saved[0].includeInLayout=saved[2];});
    view._lhsPieceVisibility=null;
  }
  function iconFor(id, original) {
    if (validResource(original)) return original;
    var c=config(),a=c&&c.AssetsConfig[id],row=c&&c.FashionConfig[id],dress=row&&c.FashionDressConfig[row.dressId];
    if (!a || !row || !dress) return original;
    var table=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][dress.isSuit];
    var variants=c[table]&&c[table][row.dressId],variant=dress.isSuit===4?variants:variants&&variants[row.colorId||0];
    // Configured portrait typo 28340 vs actual pack head_rs_2834 is resolved
    // only if the exact resource exists; never use a currency icon as a part.
    var candidates=[variant&&variant.icon,c.AssetsConfig[row.dressId]&&c.AssetsConfig[row.dressId].icon,
      'head_rs_'+Math.floor(row.dressId/10)];
    for(var i=0;i<candidates.length;i++) if(validResource(candidates[i])) return candidates[i];
    return 'ui_zb_bm_jiantou';
  }
  api.iconFor=iconFor;
  function updateIcon(view,id) {
    var c=config(),a=c&&c.AssetsConfig[id];if(!a||!view.icon)return;
    var source=iconFor(id,view.icon.source||a.icon);view.icon.source=source;
    var row=c.FashionConfig[id],fallback=source!==a.icon && source!==a.icon+'_nv';
    if (row && fallback && !view._lhsPartLabel && root.eui) {
      var label=new root.eui.Label();label.size=15;label.textColor=0xffffff;label.stroke=2;label.strokeColor=0x332211;
      label.left=5;label.top=5;label.touchEnabled=false;(view.group||view).addChild(label);view._lhsPartLabel=label;
    }
    if(view._lhsPartLabel) {view._lhsPartLabel.visible=!!(row&&fallback);view._lhsPartLabel.text=row?({301:'Vũ khí',302:'Mũ',303:'Áo',309:'Quần'})[row.type]||'Phần bộ':'';}
  }
  function gearRows(panel,kind) {
    prepareConfig();var m=manager(),c=config();if(!m||!c||!m.FishingModel)return [];
    var table=kind==='rod'?'FishRodConfig':'FishRaftConfig',method=kind==='rod'?'isUnlockFishRod':'isUnlockFishRaft';
    var info=m.FishingModel.getFishInfo()||{},equipped=info[kind+'Id'];
    var ids=Object.keys(c[table]||{}).map(Number).filter(function(id){return !!c.AssetsConfig[id];}).sort(function(a,b){return a-b;});
    ids=ids.filter(function(id){var r=c[table][id],other=(r.conditions||[]).filter(function(x){return x.type!==5;});
      return id===equipped||m.FishingModel[method](id)||!other.length||m.UnlockSystem.checkConditions(other);});
    if(ids.indexOf(panel.selectId)<0)panel.selectId=ids.indexOf(equipped)>=0?equipped:ids[0];
    return ids.map(function(id){return {id:id,state:m.FishingModel[method](id)?id===equipped?'use':'normal':'lock',select:id===panel.selectId};});
  }
  api.gearRows=gearRows;
  function refreshGear(panel,kind,force) {
    if(panel._lhsGearBuilding)return;
    var list=panel.circulateList;if(!list)return;
    var data=gearRows(panel,kind),key=data.map(function(x){return x.id;}).join(',');if(!data.length)return;
    panel._lhsGearBuilding=true;
    try {
      if(!list._lhsGearLayout) {
        list._lhsGearLayout=true;
        var create=list._createItem;
        list._createItem=function(index){var item=create.call(this,index);if(item.validateNow)item.validateNow();if(!(item.width>0))item.width=110;return item;};
        var scroll=list.scrollTo;
        list.scrollTo=function(match){
          var rows=this._dataList||[];if(!rows.length||!(this._itemList||[]).length)return false;
          if(!rows.some(match)){var first=rows[0].id;return scroll.call(this,function(x){return x&&x.id===first;});}
          return scroll.call(this,match);
        };
      }
      if(force||list._lhsGearKey!==key||!list._itemList||!list._itemList.length) {
        list._lhsGearKey=key;list.updateData(data,true,5);var target=panel.selectId;
        list.scrollTo(function(x){return x&&x.id===target;});
      } else list.refreshByDataList(data);
    } finally {panel._lhsGearBuilding=false;}
  }
  function applySelection(data,model) {
    if(!data||!data.selection||!model||!model._fashionInfo)return;
    model._fashionInfo.fashion=Object.assign({},data.selection);
    model._fashionInfo.curFashion=Object.assign({},data.selection);
    model._fashionInfo.fashionMap=Object.assign({},data.selection);
    model._fashionInfo.equipped=Object.assign({},data.selection);
    if(data.setId!=null&&data.setId!==999)model._fashionInfo.setId=data.setId;
    if(data.sets)model._fashionInfo.sets=data.sets;
    dispatch('EQUIP_FASHION_CHANGE');dispatch('FASHION_SET_UPDATE');dispatch('CHANGE_IDLE_MAP_ROLE_SHOW');
  }
  function install() {
    api.attempts++;
    if(!root.GameSocket||!root.FashionModel||!root.FishRodPanel||!root.ItemModel) {
      if(api.attempts<120)root.setTimeout(install,100);return;
    }
    ['rod','raft'].forEach(function(kind) {
      var Type=root[kind==='rod'?'FishRodPanel':'FishRaftPanel'];if(!Type)return;
      var p=Type.prototype;
      p.initCirculateList=function(){refreshGear(this,kind,true);};
      p.updateCirculateList=function(){refreshGear(this,kind,false);};
      wrap(p,'onSelectChange',function(old){return function(event){if(this._lhsGearBuilding||!event||!event.data||!event.data.data)return;return old.apply(this,arguments);};});
      wrap(p,'updateViewUI',function(old){return function(){gearRows(this,kind);return old.apply(this,arguments);};});
    });
    var Fish=root.FishingModel&&root.FishingModel.prototype;
    ['rod','raft'].forEach(function(kind){
      var name=kind==='rod'?'isUnlockFishRod':'isUnlockFishRaft';
      wrap(Fish,name,function(old){return function(id){var c=config(),initial=c&&c.FishBaseConfig[kind==='rod'?'initFishRodId':'initFishRaftId'];return Number(id)===Number(initial)||old.apply(this,arguments);};});
    });
    var Item=root.ItemModel.prototype;
    ['initData','getBagItems','CheckItemCanUse','checkBagUseRed'].forEach(function(name){wrap(Item,name,function(old){return function(){prepareConfig();return old.apply(this,arguments);};});});
    wrap(Item,'onItemChange',function(old){return function(data){var result=old.apply(this,arguments);
      if(data&&[].concat(data.items||[],data.changed||[]).some(function(x){return x.id>=5901&&x.id<=5908||x.id>=6201&&x.id<=6210;})){
        dispatch('FISH_ROD_PANEL_UPDATE');dispatch('FISH_RAFT_SWITCH_UPDATE');
      }return result;};});
    ['DisguiseFashionItem','EquipFashionItem','SpiritItemIcon'].forEach(function(name){
      var p=root[name]&&root[name].prototype;wrap(p,'setItem',function(old){return function(id){var result=old.apply(this,arguments);updateIcon(this,id);return result;};});
    });
    ['GetImgByID','GetItemIconById'].forEach(function(name){wrap(root.ResDataPath,name,function(old){return function(id){return iconFor(id,old.apply(this,arguments));};});});
    var Fashion=root.FashionModel.prototype;
    wrap(Fashion,'onFashionData',function(old){return function(data){var result=old.apply(this,arguments);applySelection(data,this);return result;};});
    var PiecePanel=root.DisguiseFashionPanel&&root.DisguiseFashionPanel.prototype;
    wrap(PiecePanel,'updateDataList',function(old){return function(){var result=old.apply(this,arguments);filterPieceTabs(this);return result;};});
    wrap(PiecePanel,'updateUI',function(old){return function(){restorePieceActions(this);filterPieceTabs(this);var result=old.apply(this,arguments);hidePieceActions(this);return result;};});
    wrap(PiecePanel,'getCurShowInfo',function(old){return function(){
      if(!this.isInHotSpring&&isSuitPiece(this.selectId))return manager().FashionModel.GetShowServerData();
      return old.apply(this,arguments);
    };});
    wrap(PiecePanel,'onClickSelect',function(old){return function(){if(!this.isInHotSpring&&isSuitPiece(this.selectId))return;return old.apply(this,arguments);};});
    wrap(PiecePanel,'onClickActive',function(old){return function(){if(!this.isInHotSpring&&isSuitPiece(this.selectId))return;return old.apply(this,arguments);};});
    // An explicit hidden clothing slot must not load the engine's default
    // clothing as a fallback. The native setData path already removes old parts.
    var Role=root.RoleShowSpine&&root.RoleShowSpine.prototype,show=root.ERoleShowType;
    if(Role&&show)[['loadToukui','toukui'],['loadShenti','shenti'],['loadTui','tui']].forEach(function(pair){
      wrap(Role,pair[0],function(old){return function(){if(this.showData&&this.showData[show[pair[1]]]===-1)return [];return old.apply(this,arguments);};});
    });
    var Socket=root.GameSocket.prototype,originalRpc=Socket.Rpc;
    function clock(){return root.performance&&root.performance.now?root.performance.now():Date.now();}
    function epochOwner(socket){var m=manager();return String(m&&m.ActorModel&&m.ActorModel.actorID||'')+'|'+String(socket._host||'');}
    function epoch(socket,work,failed){
      var owner=epochOwner(socket),state=socket._lhsFeatureEpoch;
      if(state&&state.owner===owner&&state.id&&clock()>=state.localStart&&clock()-state.localStart<state.ttl-60000)return work(state);
      var queue=socket._lhsFashionEpochQueue;
      if(queue&&queue.owner===owner){if(queue.length>=32)return failed();queue.push({work:work,failed:failed});return;}
      var waiting=[{work:work,failed:failed}];waiting.owner=owner;socket._lhsFashionEpochQueue=waiting;
      var settled=false;
      function done(data){if(settled)return;settled=true;
        // An old connection's reply must not drain a new player's queue/cache.
        if(socket._lhsFashionEpochQueue!==waiting||epochOwner(socket)!==owner){waiting.forEach(function(job){job.failed({stale:true});});return;}
        socket._lhsFashionEpochQueue=null;
        var next=data&&data.result===0&&/^[a-f0-9]{32}$/.test(data.epoch)?{id:data.epoch,owner:owner,seq:Number(data.sequence)||0,localStart:clock(),ttl:Number(data.expiresIn)||0}:null;
        socket._lhsFeatureEpoch=next;waiting.forEach(function(job){if(next)job.work(next);else job.failed(data);});
      }
      return originalRpc.call(socket,2499,{},done,socket,done);
    }
    Socket.Rpc=function(tag,data,callback,context,onError) {
      var params=data||{},scoped=tag>=1801&&tag<=1806||tag===1300&&isBox(params.itemId||params.index||params.id);
      if(!scoped)return originalRpc.apply(this,arguments);
      params=Object.assign({},params);
      var socket=this;
      function received(reply){
        if(!reply||reply.result!==0){notify('Không thể thực hiện: kiểm tra quyền sở hữu, đủ bộ và tài nguyên.');return;}
        var m=manager(),f=m&&m.FashionModel;
        // Old native callbacks assign historical ACK fields. A replay must
        // restore today's selection, not the outfit from the old receipt.
        if(reply.replayed&&reply.selection){applySelection(reply,f);return;}
        if(tag===1801&&reply.setId===999){dispatch('EQUIP_FASHION_CHANGE');return;}
        if(callback)callback.call(context,reply);
        applySelection(reply,f);
      }
      function failed(error){if(onError)return onError.call(context,error);notify('Chưa nhận được xác nhận. Hãy kết nối lại để kiểm tra đồ.');}
      function send(state){if(state)params.requestId='v3_'+state.id+'_'+(++state.seq);return originalRpc.call(socket,tag,params,received,context,failed);}
      if(!params.requestId)return epoch(socket,send,failed);
      return send(null);
    };
    // Explicit box UI needs ACK/replay/error completion, unlike legacy callbacks
    // which must not receive rejected replies. Reuse the same epoch allocator.
    api.requestBox=function(socket,request,callback,onError,valid){
      var settled=false;
      function done(reply){if(settled)return;settled=true;
        if(valid&&!valid()){onError({stale:true});return;}
        if(reply&&reply.result===0){var m=manager();applySelection(reply,m&&m.FashionModel);}
        callback(reply);
      }
      function failed(error){if(settled)return;settled=true;onError(error);}
      function send(state){
        if(valid&&!valid())return failed({stale:true});
        if(!request.requestId)request.requestId='v3_'+state.id+'_'+(++state.seq);
        try{return originalRpc.call(socket,1300,Object.assign({},request),done,socket,failed);}
        catch(error){failed(error);}
      }
      if(request.requestId)return send(null);
      return epoch(socket,send,failed);
    };
    api.installed=true;
  }
  install();
})(window);
