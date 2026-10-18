'use strict';
const crypto=require('crypto');
const VERSION='20261017_mount_star_progress_v1';
const clone=x=>JSON.parse(JSON.stringify(x));
function create({config,randomInt=crypto.randomInt,clock=Date.now}){
  function caps(skill){const rows=config.get('SwordPassiveSkillConfig')?.[skill.id]?.[skill.quality];
    if(!rows||!Number.isInteger(skill.level)||skill.level<1)return 0;
    const max=Math.max(...Object.keys(rows).map(Number));return rows[skill.level]?max:0;}
  function total(skills){return skills.reduce((n,s)=>n+s.level,0);}
  function allocate(skills,turns,pick){let added=0;for(let i=0;i<turns;i++){
    const eligible=skills.filter(s=>s.level<caps(s));if(!eligible.length||total(skills)>=40)break;
    const slot=pick(eligible.length,i);if(!Number.isInteger(slot)||slot<0||slot>=eligible.length)throw Error('MOUNT_RANDOM_INVALID');
    eligible[slot].level++;added++;}return added;}
  function repairInfo(info,identity){
    let changed=0,added=0;for(const m of info?.data||[]){
      if(m.passiveRecoveryV1||!Number.isInteger(m.star)||m.star<=1||m.star>40||!Array.isArray(m.skills)||!m.skills.length||m.skills.length>4||m.skills.some(s=>!caps(s)||s.level>caps(s)))continue;
      const initial=Number(config.get('SwordBaseConfig')?.passiveSkillInitialCount?.[m.quality]);
      if(!Number.isInteger(initial)||initial<1)continue;
      // Legacy records started at star0 or1. Starting at1 gives the proven lower bound.
      const floor=Math.min(40,initial+m.star-1,m.skills.reduce((n,s)=>n+caps(s),0)),deficit=Math.max(0,floor-total(m.skills));
      if(!deficit)continue;
      const before=m.skills.map(s=>({id:s.id,quality:s.quality,level:s.level}));
      const count=allocate(m.skills,deficit,(size,step)=>crypto.createHash('sha256').update(VERSION+':'+identity+':'+m.uid+':'+step).digest().readUInt32BE(0)%size);
      if(count){m.passiveSkills=clone(m.skills);m.passiveRecoveryV1={version:VERSION,before,added:count,at:clock()};changed++;added+=count;}
    }return{changed,added};
  }
  function progress(target,material,helpers){
    const skills=helpers.normalizeMountSkills(target.skills);if(!skills.length||skills.some(s=>!caps(s)))throw Error('MOUNT_SKILL_CONFIG_INVALID');
    const maximum=Math.min(4,Number(config.get('SwordBaseConfig')?.passiveSkillMaxCount)||4),gain=material.star+1;
    const desired=Math.min(40,total(skills)+gain);
    for(const skill of helpers.normalizeMountSkills(material.skills)){
      if(skills.length>=maximum||total(skills)>=desired)break;
      skills.push({...skill,level:1});
    }
    if(skills.some(s=>!caps(s)))throw Error('MOUNT_SKILL_CONFIG_INVALID');
    allocate(skills,Math.max(0,desired-total(skills)),size=>randomInt(size));
    target.star=Math.min(40,target.star+gain);target.skills=skills;target.passiveSkills=clone(skills);
    target.attrs=helpers.buildMountAttrs(target.id,target.quality,target.level,target.star,target.uid);
    return target;
  }
  return{caps,total,repairInfo,progress};
}
let domain;
function get(){return domain||(domain=create({config:require('./ConfigService')}));}
async function recoverLoaded(player,collection){
  if(!player?.swordInfo?.data?.length)return player;
  const before=clone(player.swordInfo),next=clone(before),result=get().repairInfo(next,player.playerId||player.userId);
  if(!result.changed)return player;
  // One atomic read repair. Save the original skill levels inside the repaired mount.
  const done=await collection.updateOne({userId:player.userId,swordInfo:{$eq:before}},{$set:{swordInfo:next,updatedAt:new Date()}},{maxTimeMS:10000});
  if(!done.matchedCount)throw Error('MOUNT_RECOVERY_CAS_RETRY');
  player.swordInfo=next;return player;
}
async function swallow(params,session,msgUid,helpers){
  const fail=(code,msg)=>({tag:3205,msgUid,data:{result:-1,code,msg,rewards:helpers.buildMountRewardResponse([]),rewardInfo:helpers.buildMountRewardResponse([])}});
  const uid=Number(params?.targetUid),matUid=Number(params?.matUid),userId=session?.userId;
  if(!userId||!Number.isSafeInteger(uid)||!Number.isSafeInteger(matUid)||uid<=0||matUid<=0||uid===matUid)return fail('MOUNT_MATERIAL_INVALID','Thú cưỡi nguyên liệu không hợp lệ.');
  const mutation=require('./PlayerMutationService'),players=require('./PlayerService'),receipts=require('./FeatureReceiptService');
  return mutation.run(userId,async()=>{
    await players.drainPendingSaves(userId);
    const fresh=await players.loadPlayer(userId);if(!fresh)return fail('MOUNT_LOGIN_REQUIRED','Vui lòng đăng nhập lại.');
    const original=session.player;if(original&&String(original.playerId)!==String(fresh.playerId))return fail('MOUNT_IDENTITY_CHANGED','Nhân vật đã thay đổi.');
    const replay=receipts.read(fresh,3205,params);
    if(replay){session.player=fresh;return[{tag:3200,msgUid:0,data:{result:0,uid:fresh.swordInfo.equippedUid,info:helpers.buildMountInfoUpdatePayload(fresh.swordInfo)}},{tag:1202,msgUid:0,data:{items:[],changed:require('./CurrencySync').buildClientItemList(fresh)}},{tag:3205,msgUid,data:{...replay,replay:true}}];}
    const raw=fresh.swordInfo,rawTarget=raw?.data?.find(m=>m.uid===uid),rawMaterial=raw?.data?.find(m=>m.uid===matUid);
    if(!rawTarget||!rawMaterial||rawTarget.id!==rawMaterial.id)return fail('MOUNT_MATERIAL_INVALID','Cần chọn hai thú cưỡi cùng loại đang sở hữu.');
    if(rawMaterial.lock||Number(raw.equippedUid)===matUid)return fail('MOUNT_MATERIAL_PROTECTED','Thú cưỡi nguyên liệu đang khóa hoặc đang cưỡi.');
    if(!Number.isInteger(rawTarget.star)||!Number.isInteger(rawMaterial.star)||rawTarget.star<0||rawTarget.star>=40||rawMaterial.star<0||rawMaterial.star>40)return fail('MOUNT_STAR_MAX','Thú cưỡi đã đạt sao tối đa hoặc dữ liệu sao không hợp lệ.');
    const fields=['swordInfo','items','currencies','other_attr_info'],expected={};for(const key of fields)if(Object.hasOwn(fresh,key))expected[key]=clone(fresh[key]);
    const draft=clone(fresh),info=helpers.ensureMountInfo(draft),target=info.data.find(m=>m.uid===uid),material=info.data.find(m=>m.uid===matUid);
    get().progress(target,material,helpers);
    const base=require('./ConfigService').get('SwordBaseConfig'),rewardCount=Math.max(0,Math.floor(Number(base.swallowReturn?.[target.quality]||0)/4));
    const owned=Number(draft.items?.[20]||0);if(!Number.isSafeInteger(owned+rewardCount))return fail('MOUNT_REWARD_OVERFLOW','Đã đạt giới hạn lưu trữ Tinh túy.');
    info.data=info.data.filter(m=>m.uid!==matUid);
    const rewards=rewardCount?[{id:20,count:rewardCount}]:[];for(const r of rewards)helpers.addRewardToPlayer(draft,r.id,r.count);
    const rewardInfo=helpers.buildMountRewardResponse(rewards),data={result:0,data:target,rewards:rewardInfo,rewardInfo};
    receipts.record(draft,3205,params,data);
    try{const saved=await players.savePlayer(userId,draft,{returnSaved:false,onlyFields:fields,mountCAS:{fields,expected}});if(!saved)throw Error('MOUNT_SWALLOW_CAS_RETRY');}
    catch(error){require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation?.(userId);session.player=null;throw error;}
    if(original){Object.assign(original,draft);session.player=original;}else session.player=draft;
    session._itemListCache=null;
    const sync=helpers.buildMountRewardSync(draft,rewards),response={tag:3205,msgUid,data};return sync?[sync,response]:response;
  });
}
module.exports={VERSION,create,get,recoverLoaded,swallow};
