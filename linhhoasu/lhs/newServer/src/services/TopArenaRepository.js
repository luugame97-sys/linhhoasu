'use strict';
const mongoose=require('mongoose');
const R=require('./TopArenaRules');
function createRepository(options={}) {
  const connection=options.connection||mongoose.connection;
  const identity=()=>connection.useDb(options.identityDb||process.env.IDENTITY_MONGO_DB||'lhs_s1001',{useCache:true});
  const coll=n=>identity().collection(n);
  const playerDb=sid=>connection.useDb((options.playerPrefix||'lhs_s')+Number(sid),{useCache:true});
  return {
    get: id=>coll('toparenaseasons').findOne({_id:id}),
    async create(s){try{await coll('toparenaseasons').insertOne(s);}catch(e){if(e.code!==11000)throw e;}return this.get(s._id);},
    async cas(before,after){
      if(Buffer.byteLength(JSON.stringify(after))>10*1024*1024)throw R.error('SEASON_CAPACITY');
      after.revision=before.revision+1;
      return (await coll('toparenaseasons').replaceOne({_id:before._id,revision:before.revision},after)).modifiedCount===1;
    },
    action:id=>coll('toparenaactions').findOne({_id:id}),
    async economyReceipt(sid,uid,id){return !!await playerDb(sid).collection('players').findOne({userId:uid,'topArenaV3.receipts':id},{projection:{_id:1}});},
    async putAction(a){try{await coll('toparenaactions').insertOne(a);}catch(e){if(e.code!==11000)throw e;}const old=await this.action(a._id);if(old.fingerprint!==a.fingerprint)throw R.error('REQUEST_CONFLICT');return old;},
    async complete(id,response){await coll('toparenaactions').updateOne({_id:id},{$set:{status:'done',response}});},
    async failAction(id,code){await coll('toparenaactions').updateOne({_id:id},{$set:{status:'failed',error:code}});},
    async replay(id,record){try{await coll('toparenareplays').insertOne({_id:id,...record});}catch(e){if(e.code!==11000)throw e;}return coll('toparenareplays').findOne({_id:id});},
    getReplay:id=>coll('toparenareplays').findOne({_id:id}),
    async lockProfile(cycle,actor,detail){const id=R.hash([cycle,actor]);try{await coll('toparenaprofiles').insertOne({_id:id,cycle,actor,detail});}catch(e){if(e.code!==11000)throw e;}return this.lockedProfile(cycle,actor);},
    lockedProfile:(cycle,actor)=>coll('toparenaprofiles').findOne({_id:R.hash([cycle,actor])}),
    async logs(cycle,actor,kind){return coll('toparenaactions').find({cycle,actor,kind,status:'done'},{projection:{response:1,at:1}}).sort({at:-1}).limit(50).toArray();},
    async seasons(){return coll('toparenaseasons').find({settled:false}).sort({'cycle.startTime':1}).limit(32).toArray();},
    async profile(sid,uid){return playerDb(sid).collection('players').findOne({userId:uid},{projection:require('./ArenaReadModelService').PLAYER_PROJECTION});},
    async settleMail(recipient,key,attachments,title,cutoff){
      const db=playerDb(recipient.serverId), Mail=db.collection('mails'),id=new mongoose.Types.ObjectId(R.hash(key).slice(0,24));
      if(!attachments.length)return;
      const p=await db.collection('players').findOne({userId:recipient.userId},{projection:{mailClaimLedger:1}});
      if(!p)throw R.error('RECIPIENT_MISSING');
      if((p.mailClaimLedger||[]).map(String).includes(String(id)))return;
      const current=await Mail.findOne({_id:id});
      if(current){if(current.userId!==recipient.userId||current.eventKey!==key||R.hash(current.attachments)!==R.hash(attachments))throw R.error('MAIL_COLLISION');return;}
      if(Date.now()>=cutoff+30*R.DAY)throw R.error('MAIL_EXPIRED_RECONCILE');
      try{await Mail.insertOne({_id:id,userId:recipient.userId,eventKey:key,batchId:key,title,content:'Thưởng Thiên Hạ Đệ Nhất theo kết quả đã chốt.',text:'Thưởng Thiên Hạ Đệ Nhất theo kết quả đã chốt.',sender:'Hệ thống',attachments,targetServerId:recipient.serverId,claimed:false,read:false,createdAt:new Date(),updatedAt:new Date(),expireAt:new Date(cutoff+30*R.DAY)});}catch(e){if(e.code!==11000)throw e;}
      const after=await Mail.findOne({_id:id});if(!after||after.userId!==recipient.userId||R.hash(after.attachments)!==R.hash(attachments))throw R.error('MAIL_NOT_CONFIRMED');
    },
  };
}
module.exports={createRepository};
