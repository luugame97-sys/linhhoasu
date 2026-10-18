'use strict';

// Internal operator workflow. Never grants without an existing hidden box.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const boxes = require('./FashionBoxService');
const INCIDENT = 'fashion_box_29040_20260907';
const MARKER = 'fashionBox29040_20260907';
const BACKUP = '/linhhoasu/_ai_workbench/backups/fashion_box_29040_repair_20260907';
const clone = value => JSON.parse(JSON.stringify(value));
function receipt(p) { return p?.moderation?.[MARKER]; }
function identity(p, userId) {
  const sid = Number(process.env.SERVER_ID || process.env.DEFAULT_SERVER_ID);
  if (![1001,1002].includes(sid) || !p || p.userId !== userId || !p.playerId
      || Number(p.serverId) !== sid || p.isBot === true) throw Error('FASHION_REPAIR_IDENTITY');
}
function snapshot(p) {
  const boxCount = Number(p.items?.[boxes.BOX_ID] || 0);
  if (!Number.isSafeInteger(boxCount) || boxCount < 0 || boxCount > 10000) throw Error('FASHION_REPAIR_COUNT');
  const owns = boxes.COMPONENTS.map(id => ({ id, owned: require('./RoleAppearanceService').hasFashionOwnership(p,id) }));
  const value = { userId:p.userId, playerId:p.playerId, serverId:Number(p.serverId), boxCount, owns };
  return { ...value, signature:crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}
function sessions(ws,userId) {
  return [...(ws?.clients?.values() || []),...(ws?._closingPlayers?.values() || [])].filter(r=>r.session?.userId===userId);
}
function sync(ws,userId,saved) {
  for(const {session} of sessions(ws,userId)) {
    if(!session.player)continue;
    // Preserve the player's other live fields and use only confirmed repaired fields.
    session.player.fashionInfo=clone(saved.fashionInfo);
    session.player.items ||= {};session.player.items[boxes.BOX_ID]=Number(saved.items?.[boxes.BOX_ID]||0);
    session.player.currencies ||= {};session.player.currencies.diamond=Number(saved.currencies?.diamond||0);
    session.player.items[1]=session.player.currencies.diamond;
    session.player.moderation ||= {};session.player.moderation[MARKER]=clone(receipt(saved));
    session._itemListCache=null;session._responseCache?.clear();
  }
}
async function notify(saved,ws) {
  const r=receipt(saved),Mail=require('../db/models/Mail');
  const content='Đã khắc phục '+r.boxCount+' hộp Thời đại hàng hải bị ẩn và kích hoạt đủ bộ trang phục. Vào Ngoại quan > Thời trang đặc sắc > Thời đại hàng hải để mặc. '
    +(r.duplicateYuanbao?'Các món trùng đã đổi thành '+r.duplicateYuanbao.toLocaleString('vi-VN')+' Nguyên bảo theo cấu hình. ':'')
    +'Quyền sở hữu đã cộng trực tiếp; thư này không cấp thêm bản sao. Mã đối soát: '+INCIDENT+'.';
  const mail=await Mail.findOneAndUpdate({userId:saved.userId,eventKey:INCIDENT},{$setOnInsert:{userId:saved.userId,eventKey:INCIDENT,title:'Khắc phục trang phục Thời đại hàng hải',content,text:content,sender:'0',attachments:[],targetType:'user',targetServerId:Number(saved.serverId),batchId:INCIDENT,createdBy:'owner-approved',expireAt:new Date(Date.now()+30*86400000)}},{upsert:true,new:true}).lean();
  ws?.pushToUser?.(saved.userId,1102,{result:0,mailData:require('../handlers/mail').toClientMail(mail)});
  return String(mail._id);
}
async function dispatch(body,ws) {
  if(!body||typeof body.userId!=='string'||!body.userId||body.userId.length>200)throw Error('FASHION_REPAIR_USER_REQUIRED');
  if(!['preview','apply'].includes(body.action))throw Error('FASHION_REPAIR_ACTION');
  if(body.action==='apply'&&(body.confirm!==true||body.incident!==INCIDENT||typeof body.signature!=='string'))throw Error('FASHION_REPAIR_CONFIRM');
  const userId=body.userId,Player=require('../db/models/Player'),service=require('./PlayerService');
  return require('./PlayerMutationService').run(userId,async()=>{
    await service.drainPendingSaves(userId);
    const db=await Player.findOne({userId}).lean();identity(db,userId);
    const live=ws?.getPlayerForMutation?.(userId),current=live||db;identity(current,userId);
    const old=receipt(db);
    if(old){
      if(old.incident!==INCIDENT||old.userId!==userId||old.playerId!==db.playerId)throw Error('FASHION_REPAIR_RECEIPT');
      if(live&&!receipt(live)){ws.invalidatePlayerForMutation(userId);throw Error('FASHION_REPAIR_RELOGIN_REQUIRED');}
      const state=snapshot(current);
      if(state.boxCount>0||state.owns.some(r=>!r.owned))throw Error('FASHION_REPAIR_POST_RECEIPT_DRIFT');
      return {success:true,replayed:true,receipt:old,...(body.action==='apply'?{noticeId:await notify(db,ws)}:{}),state};
    }
    if(receipt(current))throw Error('FASHION_REPAIR_UNCOMMITTED');
    const before=snapshot(current);
    if(body.action==='preview')return {success:true,state:before,eligible:before.boxCount>0};
    if(body.signature!==before.signature||body.expectedCount!==before.boxCount||before.boxCount<1)throw Error('FASHION_REPAIR_PREVIEW_DRIFT');
    const next=clone(current),priorDiamond=Number(next.currencies?.diamond||0);
    if(!Number.isSafeInteger(priorDiamond)||priorDiamond<0)throw Error('FASHION_REPAIR_BALANCE');
    boxes.rewardsFor(boxes.BOX_ID,before.boxCount);
    // Consume exactly the owned parent boxes; the common router handles missing parts and duplicates.
    next.items[boxes.BOX_ID]=0;
    const granted=require('../handlers/item').addRewardRowsToPlayer(next,boxes.rewardsFor(boxes.BOX_ID,before.boxCount),1);
    const after=snapshot(next);if(after.owns.some(r=>!r.owned)||after.boxCount!==0)throw Error('FASHION_REPAIR_GRANT_FAILED');
    const record={incident:INCIDENT,userId,playerId:next.playerId,serverId:Number(next.serverId),boxCount:before.boxCount,signature:before.signature,newlyActivated:before.owns.filter(r=>!r.owned).map(r=>r.id),duplicateYuanbao:Number(next.currencies?.diamond||0)-priorDiamond,appliedAt:new Date().toISOString()};
    next.moderation ||= {};next.moderation[MARKER]=record;
    fs.mkdirSync(BACKUP,{recursive:true,mode:0o700});
    const file=path.join(BACKUP,crypto.createHash('sha256').update(userId+'|'+before.signature).digest('hex')+'.json');
    if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({before,items:current.items,currencies:current.currencies,fashionInfo:current.fashionInfo,priorReceipt:receipt(current)||null},null,2),{flag:'wx',mode:0o600});
    try{
      if(!await service.savePlayer(userId,next,{returnSaved:false}))throw Error('FASHION_REPAIR_SAVE_NOT_CONFIRMED');
      const readback=await Player.findOne({userId}).lean();identity(readback,userId);
      if(JSON.stringify(receipt(readback))!==JSON.stringify(record)||snapshot(readback).boxCount!==0||snapshot(readback).owns.some(r=>!r.owned)
        ||Number(readback.currencies?.diamond||0)!==Number(next.currencies?.diamond||0))throw Error('FASHION_REPAIR_READBACK');
      sync(ws,userId,readback);
      ws?.pushToUser?.(userId,1202,{result:0,items:[{id:boxes.BOX_ID,count:-before.boxCount},...granted.itemDeltas],changed:[{id:boxes.BOX_ID,count:0},...granted.changed]});
      for(const packet of require('./RewardGrantService').buildAppearanceSyncPackets(readback,granted.rewardInfo))ws?.pushToUser?.(userId,packet.tag,packet.data);
      return {success:true,replayed:false,receipt:record,noticeId:await notify(readback,ws)};
    }catch(error){ws?.invalidatePlayerForMutation?.(userId);throw error;}
  });
}
module.exports={dispatch,snapshot,INCIDENT,MARKER};
