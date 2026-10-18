'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]);let source=fs.readFileSync(path.join(root,'main.js'),'utf8');const changes=[];
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
function patch(marker,fn,after=0){const at=source.indexOf(marker,after);assert(at>=0,marker);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const before=source.slice(n.start,n.end),next=fn(before);assert.notEqual(next,before,marker);source=source.slice(0,n.start)+next+source.slice(n.end);changes.push(marker);}
patch('n7e.updateRecord=function',s=>once(s,'t.writeBoolean(e.autoEquipUpgrade);','t.writeBoolean(e.autoEquipUpgrade),t.writeBoolean(!!e.fishing_autoEquipPower);'));
patch('n7e.Init=function',s=>{
 s=once(s,'e.position<e.length&&(i.autoEquipUpgrade=e.readBoolean()),','e.position<e.length&&(i.autoEquipUpgrade=e.readBoolean()),e.position<e.length&&(i.fishing_autoEquipPower=e.readBoolean()),');
 return once(s,'t.fishing_isFastMode=t.fishing_isFastMode||!1,','t.fishing_isFastMode=t.fishing_isFastMode||!1,t.fishing_autoEquipPower=!!t.fishing_autoEquipPower,');
});
patch('u.autoDealAllFish=function',s=>once(s,'function(t){','function(t){if(U9.autoConfig.fishing_autoEquipPower)return this.sendAutoPowerFish(t);'));
const anchor='u.getDealMap=function';assert.equal(source.split(anchor).length-1,1);
const helper=[
 'u.sendAutoPowerFish=function(showHeld){',
 'var m=this;if(m._autoPowerPending||!m.isAutoFish)return;var generation=m._autoPowerGeneration||0;',
 'var rows=m.fishInfo.fishResult.fishInfos||[];if(!rows.length){m.startAutoFish();return;}',
 'm._autoPowerPending=true;',
 'm.Rpc(4008,{autoPower:true,autoPowerVersion:1,uids:rows.map(function(f){return f.uid}),requestId:"fish_auto_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(m.fishInfo.balanceRevision||0)},function(r){',
 'if(generation!==(m._autoPowerGeneration||0))return;m._autoPowerPending=false;',
 'if(r&&r.balanceRevision!=null)m.fishInfo.balanceRevision=r.balanceRevision;',
 'if(r&&r.state){m.fishInfo.slots=r.state.slots;m.fishInfo.fishResult=r.state.fishResult;m.fishInfo.pics=r.state.pics;m.fishInfo.fishTypeQualityPic=r.state.fishTypeQualityPic;for(var k in m.fishInfo.slots)m.parseFishInfo(m.fishInfo.slots[k]);}',
 'if(r&&r.orderState)m.fishInfo.orders=r.orderState;',
 'if(!r||r.result!==0){m.isAutoFish=false;S.ins().showTips("Chưa xử lý cá tự động; cá được giữ nguyên. Hãy kiểm tra lại.");return;}',
 'A.ins().dispatch(E.ATTR_CHANGE,12);A.ins().dispatch(E.FISH_ILLUS_UPDATE);A.ins().dispatch(E.FISH_DEAL_UPDATE);',
 'if(m.fishInfo.fishResult.fishInfos.length){m.isAutoFish=false;S.ins().showTips("Giữ lại cá khóa, có kỹ năng hoặc ngang lực chiến. Vui lòng xử lý thủ công.");showHeld&&m.openFishRewardPanel();return;}',
 'if(m.isAutoFish)y.ins().doNext(function(){m.isAutoFish&&m.startAutoFish();},m);',
 '});},',
].join('');
source=source.replace(anchor,helper+anchor);changes.push('sendAutoPowerFish callback');
patch('u.reconnectSuccess=function',s=>once(s,'function(){','function(){this._autoPowerPending=false;this._autoPowerGeneration=(this._autoPowerGeneration||0)+1;'));
patch('u.startAutoFish=function',s=>once(s,'function(){','function(){if(U9.autoConfig.fishing_autoEquipPower){if(this.isHaveNotDeadFish()){this.isAutoFish=true;this.sendAutoPowerFish(true);return true;}if(!Y.RaidMgr.mFishRaid||!en.Anim_Config.a_1){this.isAutoFish=false;S.ins().showTips("Hoạt ảnh câu cá chưa sẵn sàng. Hãy vào lại ngư trường rồi bật ủy thác.");return false;}}'));
const panelStart=source.indexOf('i(V6e,d6e=n)');assert(panelStart>0);
const controls=[
 'function(){var self=this;',
 'var box=this.autoPowerFishBox=new U.CheckBox;box.skinName="CheckBox1Skin";box.scaleX=box.scaleY=.8;box.x=22;box.y=768;',
 'var label=this.autoPowerFishLab=new U.Label;label.text="Tự trang bị cá mạnh, bán cá yếu";label.size=21;label.textColor=5067090;label.x=76;label.y=774;',
 'var note=this.autoPowerFishNote=new U.Label;note.text="Theo lực chiến server; giữ cá khóa/kỹ năng/ngang điểm.\\nBật mục này sẽ ưu tiên hơn các bộ lọc dừng/nộp đơn.";note.size=16;note.textColor=7303023;note.width=540;note.x=24;note.y=807;',
 'this.baseGroup.addChild(box);this.baseGroup.addChild(label);this.baseGroup.addChild(note);this.startButton.y=858;this.commonwin.height=1140;this.baseGroup.height=946;',
 'box.addEventListener(egret.Event.CHANGE,function(){U9.autoConfig.fishing_autoEquipPower=!!box.selected;self.updateViewUI();},this);',
].join('');
patch('(_=V6e.prototype).childrenCreated=function',s=>{assert(s.startsWith('function(){'));return controls+s.slice('function(){'.length);},panelStart);
patch('_.updateViewUI=function',s=>once(s,'function(){','function(){this.autoPowerFishBox&&(this.autoPowerFishBox.selected=!!U9.autoConfig.fishing_autoEquipPower);this.fastModeLab.text="Tăng tốc câu cá (1,11×)";'),source.indexOf('i(V6e,d6e=n)'));
const ast=acorn.parse(source,{ecmaVersion:'latest'});assert(ast.body.length);
fs.writeFileSync(path.join(root,'main.fixed.js'),source);
fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({changes,defaultEnabled:false,speedMultiplierUnchanged:1.11,settingAppendOnly:true},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',changes:changes.length,defaultEnabled:false}));
