u.fishRoomError=function(r){
 var messages={FISH_ROOM_FULL:'Phòng đã đủ 4 người. Hãy chọn phòng khác.',FISH_ROOM_NOT_FOUND:'Phòng đã thay đổi. Hãy làm mới danh sách.',FISH_ROOM_INVALID:'Phòng không hợp lệ.',FISH_ROOM_UNAVAILABLE:'Chưa kết nối được phòng câu. Hãy đăng nhập lại.',FISH_SCENE_LOCKED:'Chưa đủ cấp câu cá để vào ngư trường này.'};
 return messages[r&&r.reason]||'Chưa chuyển được phòng. Hãy thử lại.';
},
u.changeFishRoom=function(mapId,roomId,callback){
 var m=this;if(m._fishRoomChanging)return false;
 if(m.fishing||m._autoPowerPending||m.fishInfo.nextFishTime>T.serverTimeMilli){S.ins().showTips('Đang xử lý lượt câu. Hãy chờ cá lên rồi đổi phòng.');return false;}
 m.isAutoFish=false;m._fishRoomChanging=true;m.changeSceneCallBack=callback;
 var generation=m._autoPowerGeneration||0,answered=false;
 var params={id:mapId};if(roomId!=null)params.roomId=roomId;
 m.Rpc(4002,params,function(r){
  if(answered||generation!==(m._autoPowerGeneration||0))return;answered=true;
  if(!r||r.result!==0){m._fishRoomChanging=false;m.changeSceneCallBack=null;S.ins().showTips(m.fishRoomError(r));return;}
  m.fishInfo.scene=r.id;
 });return true;
},
