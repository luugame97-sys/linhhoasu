a.initFishRoomButton=function(){
 var self=this;if(!this.fishRoomButton){var b=this.fishRoomButton=new U.Button;b.skinName='BtnBlue0Skin';b.scaleX=b.scaleY=.58;b.right=116;b.bottom=18;this.addChild(b);b.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){self.openFishRoomPicker();},this);}
 var room=Y.FishRoomModel.roomInfo;this.fishRoomButton.label='Phòng '+(room&&room.roomId||'—')+' ▾';
},
a.closeFishRoomPicker=function(){
 this._fishRoomListSeq=(this._fishRoomListSeq||0)+1;
 if(this.fishRoomPicker&&this.fishRoomPicker.parent)this.fishRoomPicker.parent.removeChild(this.fishRoomPicker);
 this.fishRoomPicker=null;
},
a.openFishRoomPicker=function(){
 if(this.fishRoomPicker)return;var self=this;
 var overlay=this.fishRoomPicker=new U.Group;overlay.left=overlay.right=overlay.top=overlay.bottom=0;this.addChild(overlay);
 var shade=new U.Rect;shade.percentWidth=shade.percentHeight=100;shade.fillColor=0;shade.fillAlpha=.6;shade.touchEnabled=true;overlay.addChild(shade);
 var card=new U.Group;card.width=720;card.height=1020;card.horizontalCenter=card.verticalCenter=0;overlay.addChild(card);
 var frame=new U.Component;frame.skinName='CommonWinDialog0Skin';frame.width=720;frame.height=1020;card.addChild(frame);frame.validateNow();frame.titleLabel.text='Phòng câu';frame.closeBtn.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){self.closeFishRoomPicker();},self);
 function label(text,x,y,w,size){var l=new U.Label;l.text=text;l.x=x;l.y=y;l.width=w;l.size=size||22;l.fontFamily='Microsoft YaHei';l.textColor=0x4D514E;card.addChild(l);return l;}
 function button(text,x,y,scale,fn){var b=new U.Button;b.skinName='BtnBlue0Skin';b.label=text;b.x=x;b.y=y;b.scaleX=b.scaleY=scale;card.addChild(b);b.addEventListener(egret.TouchEvent.TOUCH_TAP,fn,self);return b;}
 var scene=Y.Config.FishSceneConfig[this.model.fishInfo.scene];var name=label(B.ConvertLanguageToText(scene.name),60,116,600,28);name.textAlign='center';name.bold=true;
 var deco1=new U.Image('common_bm_zhuangshi');deco1.x=78;deco1.y=160;deco1.scaleX=.55;deco1.tint=0x2A343E;card.addChild(deco1);
 var deco2=new U.Image('common_bm_zhuangshi');deco2.x=642;deco2.y=160;deco2.scaleX=-.55;deco2.tint=0x2A343E;card.addChild(deco2);
 var help=label('Cùng ngư trường • Cùng phòng • Cùng câu',108,158,504,21);help.textAlign='center';
 overlay.status=label('Đang tìm phòng…',64,203,592,19);overlay.status.textAlign='center';overlay.status.textColor=0x73746A;
 overlay.body=new U.Group;overlay.body.x=60;overlay.body.y=239;overlay.body.width=600;overlay.body.height=596;card.addChild(overlay.body);
 overlay.page=0;
 button('‹ Trước',62,854,.66,function(){self.loadFishRooms(Math.max(0,overlay.page-1));});
 button('Làm mới',276,854,.72,function(){self.loadFishRooms(overlay.page);});
 button('Sau ›',509,854,.66,function(){self.loadFishRooms(overlay.page+1);});
 var note=label('4 chỗ riêng trong mỗi phòng. Đổi phòng sẽ dừng auto.\nPhòng đầy? Chọn phòng trống kế tiếp để bắt đầu.',70,934,550,19);note.textAlign='center';note.lineSpacing=8;
 this.loadFishRooms(0);
},
a.loadFishRooms=function(page){
 var self=this,overlay=this.fishRoomPicker;if(!overlay||overlay.loading)return;
 var model=this.model,mapId=model.fishInfo.scene,seq=this._fishRoomListSeq=(this._fishRoomListSeq||0)+1;
 overlay.loading=true;overlay.status.text='Đang tìm phòng…';
 model.Rpc(4050,{action:'list',id:mapId,page:page},function(r){
  if(self.fishRoomPicker!==overlay||seq!==self._fishRoomListSeq||!self.stage)return;
  overlay.loading=false;
  if(!r||r.result!==0||r.roomProtocol!==1){overlay.status.text=model.fishRoomError(r);return;}
  overlay.page=r.page;overlay.status.text='Trang '+(r.page+1)+' / '+r.totalPages+'     •     Phòng hiện tại: '+(r.currentRoomId||'—');
  overlay.body.removeChildren();
  r.rooms.forEach(function(room,index){
   var current=room.id===r.currentRoomId,full=room.count>=4;
   var row=new U.Group;row.width=600;row.height=136;row.y=index*148;overlay.body.addChild(row);
   var fill=new U.Image('common_box_2');fill.scale9Grid=new egret.Rectangle(25,25,0,0);fill.x=9;fill.y=9;fill.width=582;fill.height=118;fill.tint=current?0xBBD3C3:0xCCCBCE;fill.alpha=.5;row.addChild(fill);
   var border=new U.Image('common_line_4');border.scale9Grid=new egret.Rectangle(24,24,0,0);border.width=600;border.height=136;border.tint=current?0x71978B:0xD5B39F;row.addChild(border);
   var title=new U.Label;title.fontFamily='Microsoft YaHei';title.text='Phòng '+room.id;title.size=26;title.bold=true;title.textColor=0x44505B;title.x=24;title.y=18;title.width=290;row.addChild(title);
   var count=new U.Label;count.fontFamily='Microsoft YaHei';count.text=room.count+' / 4 người';count.size=21;count.textColor=full?0x98735E:0x528474;count.x=336;count.y=22;count.width=140;row.addChild(count);
   var names=new U.Label;names.fontFamily='Microsoft YaHei';var people=room.players.map(function(p){var n=Array.from(p.name||'');return n.length>16?n.slice(0,15).join('')+'…':p.name;});names.text=people.length?[people.slice(0,2).join('  ·  '),people.slice(2).join('  ·  ')].filter(Boolean).join('\n'):'Chưa có người câu\nMời bạn chọn chỗ đầu tiên';names.size=19;names.textColor=0x73776D;names.x=24;names.y=65;names.width=418;names.height=57;names.lineSpacing=8;row.addChild(names);
   var b=new U.Button;b.skinName=current||full?'BtnBlue0Skin':'BtnYellow0Skin';b.x=462;b.y=68;b.scaleX=b.scaleY=.52;b.label=current?'Đang ở':full?'Đã đầy':'Vào phòng';b.enabled=!full&&!current;row.addChild(b);
   b.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){if(model.changeFishRoom(mapId,room.id))self.closeFishRoomPicker();},self);
  });
 });
},
