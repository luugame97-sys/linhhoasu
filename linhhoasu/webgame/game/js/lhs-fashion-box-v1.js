/* Fixed fashion boxes: explicit confirmation, server-owned inventory and ownership. */
(function(root){
  'use strict';
  if(root.LhsFashionBoxV1)return;
  var api=root.LhsFashionBoxV1={version:'20260927_fashion_box_v4',installed:false};
  function manager(){return root.GlobalManager||root.GameGlobalYDXZ||root.W;}
  function config(){var m=manager();return m&&m.Config;}
  function notify(text){if(root.UserTips&&root.UserTips.ins)root.UserTips.ins().showTips(text);}
  function dispatch(key){if(root.MessageCenter&&root.MessageDef&&root.MessageDef[key])root.MessageCenter.ins().dispatch(root.MessageDef[key]);}
  function candidate(id){var c=config(),a=c&&c.AssetsConfig[id],u=c&&c.AssetsUseConfig[id];return !!(a&&a.type===100&&(a.useType===105||u&&u.type===105));}
  function parts(id){
    var c=config(),a=c&&c.AssetsConfig[id],u=c&&c.AssetsUseConfig[id],d=c&&c.FashionDressConfig[id];
    if(!a||a.useType!==105||!u||u.type!==105||!d||u.conditions&&u.conditions.length||u.limit>0)return null;
    var table=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit];
    var variants=c[table]&&c[table][id],v=d.isSuit===4?variants:variants&&variants[0],ids=v&&v.fashionIds;
    if(!Array.isArray(ids)||!ids.length)return null;
    // Match FashionBoxService: an opening effect is a separate owned slot306,
    // not a fifth clothing part. Only the configured effect may be included.
    var opening=d.isSuit===4&&v.beginEffectId||0;
    ids=opening?ids.concat([opening]):ids.slice();
    if(!Array.isArray(u.rewards)||u.rewards.length!==ids.length)return null;
    var seen={},types={};
    for(var i=0;i<ids.length;i++){
      var f=c.FashionConfig[ids[i]];
      if(seen[ids[i]]||!f||Number(f.dressId)!==Number(id)||types[f.type]||([301,302,303,305,309].indexOf(f.type)<0&&!(ids[i]===opening&&f.type===306))||
        u.rewards.filter(function(r){return r.id===ids[i]&&r.count===1;}).length!==1)return null;
      seen[ids[i]]=true;types[f.type]=true;
    }
    return ids.slice();
  }
  function wrap(p,name,make){if(p&&typeof p[name]==='function')p[name]=make(p[name]);}
  function visible(node,value){if(node){node.visible=!!value;node.includeInLayout=!!value;}}
  function save(view,node,key,value){if(!node)return;(view._lhsBoxRestore||(view._lhsBoxRestore=[])).push([node,key,node[key]]);node[key]=value;}
  function restore(view){(view._lhsBoxRestore||[]).forEach(function(x){x[0][x[1]]=x[2];});view._lhsBoxRestore=[];}
  function ownedCount(id){return Math.max(0,Number(manager().ItemModel.GetItemCount(id))||0);}
  function owner(){var m=manager();return String(m.ActorModel&&m.ActorModel.actorID||'')+'|'+String(root.GameSocket.ins()._host||'');}
  function pending(model){var job=model._lhsBoxOpenJob;if(job&&job.owner!==owner()){model._lhsBoxOpenJob=null;return null;}return job;}
  function openData(row){return Object.assign({},row,{id:Number(row.id),count:ownedCount(row.id),isOwner:true});}
  function label(view,text){if(view.labUseDesc){visible(view.labUseDesc,true);view.labUseDesc.text=text;}}
  function updateView(view){
    if(!view._lhsBoxId)return;
    var job=pending(manager().ItemModel),id=view._lhsBoxId,blocked=job&&job.request.index!==id,busy=job&&job.phase==='pending';
    view._lhsBoxJob=job||null;visible(view.useBtn,!view._isPreview);
    if(view.useBtn){view.useBtn.enabled=!!(!view._isPreview&&parts(id)&&!blocked&&!busy&&(job||ownedCount(id)>0));view.useBtn.label=job&&job.phase==='uncertain'&&!blocked?'Kiểm tra lại':busy?'Đang mở...':'Mở rương';}
    if(view.numInput){view.numInput.touchEnabled=!job&&!view._isPreview;view.numInput.touchChildren=!job&&!view._isPreview;}
    if(!parts(id))label(view,'Rương chưa đủ dữ liệu. Vật phẩm được giữ nguyên.');
    else if(blocked)label(view,'Đang chờ rương khác. Mở lại rương đó để kiểm tra kết quả.');
    else if(job&&job.phase==='uncertain')label(view,'Chưa rõ kết quả. “Kiểm tra lại” dùng yêu cầu cũ, không mở thêm.');
    else if(busy)label(view,'Đang chờ server xác nhận...');
    else label(view,view._isPreview?'Xem trước; không sử dụng vật phẩm.':'Nhận đủ các phần dưới đây. Sau mở, vào Ngoại quan → Bộ để mặc.');
  }
  function rewards(view){
    if(!view.list)return;
    var ids=parts(view._lhsBoxId)||[],n=Number(view.numInput.nowNum);
    var rows=ids.map(function(part){return {_lhsFashionBoxReward:true,itemData:{id:part,count:Number.isSafeInteger(n)&&n>0?n:1,blockClick:true},maxNum:0,canChange:false,isShowHave:false,isShowAwake:false,isShowMaxStar:false};});
    view.list.itemRenderer=root.ChooseItemIcon;
    if(view.list.dataProvider&&view.list.dataProvider.replaceAll)view.list.dataProvider.replaceAll(rows);
    else view.list.dataProvider=new root.eui.ArrayCollection(rows);
  }
  function finish(model,job,reply,error){
    if(model._lhsBoxOpenJob!==job||job.owner!==owner())return;
    if(!error&&reply&&reply.result===0){
      job.phase='done';model._lhsBoxOpenJob=null;
      if(!reply.replayed){
        model._itemUseRecords=model._itemUseRecords||{};
        model._itemUseRecords[job.request.index]=(model._itemUseRecords[job.request.index]||0)+job.request.count;
      }
      if(job.view&&job.view._lhsBoxJob===job&&job.view._lhsBoxId===job.request.index)job.view.CloseSelf();
      dispatch('BAG_UPDATE');dispatch('FASHION_UPDATE');
      if(!reply.replayed&&root.GetRewardView&&reply.rewardInfo){root.GetRewardView.Open(reply.rewardInfo);root.GetRewardView.CheckOpenSpGetView(reply.rewardInfo,true);}
      notify('Đã mở rương. Vào Ngoại quan → Bộ để chọn mặc.');return;
    }
    var rejected=!error&&reply&&typeof reply.result==='number'&&reply.result!==0;
    if(rejected||!job.request.requestId){job.phase='rejected';model._lhsBoxOpenJob=null;notify('Không thể mở: kiểm tra số lượng hoặc cấu hình rương.');}
    else{job.phase='uncertain';notify('Chưa xác nhận kết quả. Bấm Kiểm tra lại hoặc đăng nhập lại trước khi mở thêm.');}
    if(job.view&&job.view._lhsBoxJob===job)updateView(job.view);
  }
  function submit(view){
    var id=view._lhsBoxId,model=manager().ItemModel,job=pending(model);
    if(view._isPreview||!parts(id))return;
    if(job&&(job.phase==='pending'||job.request.index!==id))return;
    if(!job){
      var n=Number(view.numInput.nowNum),count=ownedCount(id);
      if(!Number.isSafeInteger(n)||n<1||n>count||n>10000){notify('Số lượng rương không hợp lệ hoặc đã thay đổi.');return;}
      job=model._lhsBoxOpenJob={request:{index:id,count:n},owner:owner(),view:view,phase:'pending'};
    }
    job.phase='pending';job.view=view;view._lhsBoxJob=job;updateView(view);
    var attempt=job.attempt=(job.attempt||0)+1;
    function done(reply){if(job.attempt===attempt)finish(model,job,reply,null);}
    function failed(error){if(job.attempt===attempt)finish(model,job,null,error||{});}
    try{root.LhsFashionGearV1.requestBox(root.GameSocket.ins(),job.request,done,failed,function(){return job.owner===owner();});}
    catch(error){failed(error);}
  }
  function install(){
    if(api.installed)return true;
    if(!root.ItemIcon||!root.ItemModel||!root.ItemUseView||!root.ItemTipsView||!root.ViewManager||!root.LhsFashionGearV1||!root.LhsFashionGearV1.requestBox)return false;
    var Item=root.ItemModel.prototype,Tips=root.ItemTipsView.prototype,Use=root.ItemUseView.prototype;
    wrap(root.ChooseItemIcon&&root.ChooseItemIcon.prototype,'dataChanged',function(old){return function(){
      var result=old.apply(this,arguments),row=this.data;
      if(row&&row._lhsFashionBoxReward&&this.nameLabel&&!String(this.nameLabel.text||'').trim()){
        var f=config().FashionConfig[row.itemData.id];
        if(f)this.nameLabel.text=({301:'Vũ khí',302:'Mũ',303:'Áo',305:'Phụ kiện',306:'Hiệu ứng vào trận',309:'Quần'})[f.type]||'Phần bộ';
      }
      return result;
    };});
    wrap(root.ItemIcon.prototype,'onClickItem',function(old){return function(){
      var row=this.data;
      if(this._isShowInfo&&row&&!row.blockClick&&candidate(row.id)){
        if(!parts(row.id)){notify('Rương thời trang chưa đủ dữ liệu; chưa thể mở.');return;}
        if(row.isOwner){
          var job=pending(manager().ItemModel);
          if(ownedCount(row.id)<=0&&!(job&&job.request.index===Number(row.id))){notify('Bạn không còn rương này.');return;}
          root.ViewManager.ins().open(root.ItemTipsView,openData(row),this);return;
        }
      }
      return old.apply(this,arguments);
    };});
    wrap(Item,'CheckItemCanUse',function(old){return function(id){if(candidate(id))return !!parts(id);return old.apply(this,arguments);};});
    wrap(Item,'getBagItems',function(old){return function(type){
      var rows=old.apply(this,arguments),self=this;
      if(type&&Number(type)!==100)return rows;
      // Previously delivered unsupported boxes remain visible but never usable.
      Object.keys(this._itemMap||{}).forEach(function(id){
        id=Number(id);if(candidate(id)&&!parts(id)&&self.GetItemCount(id)>0&&!rows.some(function(r){return r.id===id;}))
          rows.push({id:id,count:self.GetItemCount(id),isOwner:true,canUse:0,hideExtraCount:1});
      });return rows;
    };});
    wrap(Tips,'OnOpen',function(old){return function(data){
      restore(this);this._lhsBoxTip=0;var result=old.apply(this,arguments);
      if(!data||!candidate(data.id))return result;
      this._lhsBoxTip=Number(data.id);save(this,this.useBtn,'label','Mở rương');
      save(this,this.btnDetail,'visible',!!parts(data.id));save(this,this.btnDetail,'includeInLayout',!!parts(data.id));
      if(!parts(data.id))visible(this.useBtn,false);
      return result;
    };});
    wrap(Tips,'onClickDetail',function(old){return function(){if(this._lhsBoxTip&&parts(this._lhsBoxTip)){root.ViewManager.ins().open(root.FashionInfoView,this._lhsBoxTip);return;}return old.apply(this,arguments);};});
    wrap(Tips,'onClickUseBtn',function(old){return function(){
      if(!this._lhsBoxTip)return old.apply(this,arguments);
      var job=pending(manager().ItemModel);
      if(!parts(this._lhsBoxTip)||!this._itemData.isOwner||(ownedCount(this._lhsBoxTip)<=0&&!(job&&job.request.index===this._lhsBoxTip))){notify('Rương chưa thể mở.');return;}
      root.ViewManager.ins().open(root.ItemUseView,openData(this._itemData),false);
    };});
    wrap(Use,'OnOpen',function(old){return function(data,preview){
      restore(this);this._lhsBoxId=0;this._lhsBoxJob=null;
      if(!data||!candidate(data.id))return old.apply(this,arguments);
      // Reuse the native chooseBox layout with fixed, read-only reward rows.
      var result=old.call(this,Object.assign({},data),!!preview||!data.isOwner);
      this._lhsBoxId=Number(data.id);this._nowUseType=105;this._nowChooseBoxSelects={};this._nowChooseCount=0;
      this.currentState='chooseBox';if(this.validateNow)this.validateNow();
      var max=Math.min(10000,ownedCount(data.id)),job=pending(manager().ItemModel);this._nowMaxNum=max;
      if(job&&job.request.index===this._lhsBoxId){job.view=this;this._lhsBoxJob=job;}
      save(this,this.useBtn,'label','Mở rương');save(this,this.useBtn,'enabled',true);save(this,this.useBtn,'visible',true);save(this,this.useBtn,'includeInLayout',true);
      save(this,this.numInput,'visible',true);save(this,this.numInput,'includeInLayout',true);
      save(this,this.numInput,'bottom',145);save(this,this.numInput,'touchEnabled',true);save(this,this.numInput,'touchChildren',true);
      save(this,this.groupCount,'visible',false);save(this,this.groupCount,'includeInLayout',false);
      save(this,this.labUseDesc,'visible',true);save(this,this.labUseDesc,'includeInLayout',true);save(this,this.labUseDesc,'text','');
      save(this,this.labUseDesc,'bottom',95);save(this,this.labUseDesc,'size',18);save(this,this.labUseDesc,'width',530);save(this,this.labUseDesc,'textAlign','center');
      if(this.list&&this.list.parent&&this.list.parent.parent)save(this,this.list.parent.parent,'height',405);
      save(this,this.list,'itemRenderer',root.ChooseItemIcon);
      save(this,this.numInput,'_numChangeEvent',function(){rewards(this);}.bind(this));
      var n=job&&job.request.index===this._lhsBoxId?job.request.count:max?1:0;
      this.numInput.data={initNum:n,minNum:max?1:0,maxNum:Math.max(max,n)};
      rewards(this);updateView(this);return result;
    };});
    wrap(Use,'onClickUseBtn',function(old){return function(){if(this._lhsBoxId)return submit(this);return old.apply(this,arguments);};});
    api.installed=true;return true;
  }
  api.parts=parts;api.install=install;
  if(!install()&&root.console)root.console.error('[LHS fashion box] missing native dependencies');
})(window);
