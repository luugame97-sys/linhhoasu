/* Larger Tinh tuy purchase selector. No purchase is made by the Max button. */
(function(root){
  'use strict';
  var VERSION='20261017_essence_buy_max_v1',ID=1000006,ITEM=20,CAP=999999999,SAFE=9007199254740991;
  if(root.LhsEssenceBuyMax)return;
  var api=root.LhsEssenceBuyMax={version:VERSION,installed:false,cap:CAP};
  function manager(){return root.GlobalManager||root.GameGlobalYDXZ||{};}
  function type(n){var x=manager()[n]||root[n];if(typeof x==='function')return x;if(x&&x.constructor!==Object)return x.constructor;try{return root.egret.getDefinitionByName(n);}catch(_){return null;}}
  function integer(n){n=Number(n);return Number.isSafeInteger(n)&&n>=0?n:null;}
  function maximum(){var m=manager(),g=m.Config&&m.Config.ShopConfig[ID];if(!g||g.payId||g.costAgain.length||g.cost.length!==1||g.cost[0].id!==1||g.cost[0].count!==100||g.rewards.length!==1||g.rewards[0].id!==ITEM||g.rewards[0].count!==250)return 0;
    var money=integer(m.ItemModel.GetItemCount(1)),owned=integer(m.ItemModel.GetItemCount(ITEM)),bought=integer(m.RechargeModel.getBuyCount(ID));if(money===null||owned===null||bought===null)return 0;
    return Math.max(0,Math.min(CAP,Math.floor(money/100),Math.floor((SAFE-owned)/250),SAFE-bought,g.limit>0?Math.max(0,g.limit-bought):CAP));}
  api.maximum=maximum;
  function maxSkin(){var s=new root.eui.Skin(),bg=new root.eui.Rect(),label=new root.eui.Label();s.width=79;s.height=55;bg.percentWidth=100;bg.percentHeight=100;bg.fillColor=0x27303b;bg.fillAlpha=.95;bg.strokeColor=0x9e967d;bg.strokeWeight=2;bg.ellipseWidth=24;bg.ellipseHeight=24;label.text='Max';label.size=24;label.bold=true;label.textColor=0xffedb0;label.horizontalCenter=0;label.verticalCenter=0;label.touchEnabled=false;s.elementsContent=[bg,label];s.skinParts=[];return s;}
  function refresh(panel){var max=maximum(),n=panel.input;if(!n)return max;n.minNum=max>0?1:0;n.maxNum=Math.max(1,max);if(n.data)n.data.maxNum=max;
    panel.buyBtn.enabled=max>0;if(n.maxBtn)n.maxBtn.enabled=max>0;return max;}
  function requestId(){var bytes=new Uint8Array(12);root.crypto.getRandomValues(bytes);var events=root.LhsCrossEvents,now=events&&events.snapshot?Number(events.snapshot.serverTime)+Date.now()-events.receivedAt:Date.now();return Math.floor(now)+'-'+Array.prototype.map.call(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');}
  function install(){var T=type('CommonBuyItemPanel'),p=T&&T.prototype,M=type('ShopModel'),mp=M&&M.prototype;if(!p||!mp||typeof p.OnOpen!=='function'||typeof p.setBuyCount!=='function'||typeof mp.Rpc!=='function')return false;
    if(!p.__lhsEssenceMax){var open=p.OnOpen,set=p.setBuyCount;
      p.OnOpen=function(){var n=this.input,previous=this._lhsEssenceOriginal;if(previous&&n){n.maxBtn.skinName=previous.skin;n.input.size=previous.size;n.input.maxChars=previous.maxChars;this.buyBtn.enabled=previous.buyEnabled;n.maxBtn.enabled=previous.maxEnabled;this._lhsEssenceOriginal=null;}
        var r=open.apply(this,arguments);if(Number(arguments[0])!==ID)return r;var self=this;n=this.input;if(!n||!n.maxBtn)return r;
        this._lhsEssenceOriginal={skin:n.maxBtn.skinName,size:n.input.size,maxChars:n.input.maxChars,buyEnabled:this.buyBtn.enabled,maxEnabled:n.maxBtn.enabled};
        n.data=Object.assign({},n.data,{isHideMaxMinBtn:false,isHideTenBtn:false});n.validateNow();
        n.minBtn.visible=false;n.minBtn.includeInLayout=false;
        n.maxBtn.skinName=maxSkin();n.maxBtn.width=79;n.maxBtn.height=55;
        n.input.maxChars=9;n.input.size=22;
        n.setMaxBtnClickEvent(function(){var max=refresh(self);n.nowNum=max;});
        var max=refresh(this);n.nowNum=Math.min(max,Math.max(1,n.nowNum||1));return r;};
      p.setBuyCount=function(count){if(this._shopId!==ID)return set.apply(this,arguments);var max=refresh(this),value=Math.min(max,Math.max(max>0?1:0,Math.floor(Number(count)||0)));if(this.input&&this.input._nowNum!==value){this.input._nowNum=value;this.input.updateNumLabel();}return set.call(this,value);};p.__lhsEssenceMax=true;
    }
    if(!mp.__lhsEssenceMax){var rpc=mp.Rpc;mp.Rpc=function(tag,data){var args=Array.prototype.slice.call(arguments);if((Number(tag)===1200&&Number(data&&data.id)===ID)||(Number(tag)===1202&&data&&data.require&&data.require[ID]!=null)){args[1]=Object.assign({},data);if(!args[1].requestId)args[1].requestId=requestId();}return rpc.apply(this,args);};mp.__lhsEssenceMax=true;}
    return api.installed=true;
  }
  api.install=install;
  (function tick(){if(!install())root.setTimeout(tick,500);}());
}(window));
