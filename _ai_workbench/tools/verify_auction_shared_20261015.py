"""Read-only production auction/source/readiness postcheck, no player writes."""
import json
import shlex
from auction_ops_20261015 import APP, TASK, connect, run

JS = r'''
const fs=require('fs'),crypto=require('crypto'),{MongoClient}=require('mongodb');
const pm=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:4e6}));
const service=require('./src/services/AuctionService'), config=require('./src/services/ConfigService');
const now=Date.now(),info=service.cycleInfo(now),catalog=service.getCatalog();
function hash(data){return crypto.createHash('sha256').update(data).digest('hex');}
function logTail(file){if(!file||!fs.existsSync(file))return '';const size=fs.statSync(file).size,buf=Buffer.alloc(Math.min(size,131072)),fd=fs.openSync(file,'r');fs.readSync(fd,buf,0,buf.length,Math.max(0,size-buf.length));fs.closeSync(fd);return buf.toString();}
(async()=>{
 const result={checkedAt:new Date(now).toISOString(),phase:info.phase,catalog:catalog.catalogVersion,files:[],servers:[],directPlayerWrites:0};
 for(const [rel,row]of Object.entries(expected)){const actual=hash(fs.readFileSync(row.remote));if(actual!==row.after)throw Error('HASH:'+rel);result.files.push({file:rel,sha256:actual});}
 for(const p of pm.filter(p=>/^lhs-s100[1-8]$/.test(p.name))){
  const e=p.pm2_env,serverId=Number(e.SERVER_ID||e.DEFAULT_SERVER_ID||1001);
  if(e.AUCTION_SHARED_ENABLED!=='1'||e.AUCTION_SHARED_APPROVED!=='1'||e.status!=='online')throw Error('FLAGS:'+p.name);
  const c=new MongoClient(e.MONGO_URI,{serverSelectionTimeoutMS:5000});await c.connect();
  try{
   const db=c.db(),s=await c.db(e.IDENTITY_MONGO_DB||undefined).collection('gameservers').findOne({serverId});
   const dayStart=Math.floor((now+7*3600000)/86400000)*86400000-7*3600000;
   const nativeOpen=dayStart+86400000-Math.max(1,Math.ceil((now-s.openTime)/86400000))*86400000+999;
   let window=null;
   for(const row of Object.values(config.get('AuctionOpenConfig'))){
    if(row.area!==s.rechargeArea||row.isRoyal!==1||row.showLimit?.length)continue;
    if(row.limitServerId&&!row.limitServerId.some(([a,b])=>serverId>=a&&serverId<=b))continue;
    const cv=v=>!v?0:row.timeType===2?v:row.timeType===3?nativeOpen+(v-1)*86400000:0;
    if(cv(row.limitStartTime)&&nativeOpen<cv(row.limitStartTime)||cv(row.limitEndTime)&&nativeOpen>cv(row.limitEndTime))continue;
    if(cv(row.startTime)<now&&now<cv(row.endTime))window={id:row.id,start:cv(row.startTime),end:cv(row.endTime)};
   }
   const rows=await db.collection('auctionlistings').find({serverId,cycleKey:info.cycleKey}).toArray();
   const expectedCount=window&&['onshelf','bidding'].includes(info.phase)?5:0;
   if(rows.length!==expectedCount)throw Error('CATALOG_COUNT:'+p.name+':'+rows.length+':expected'+expectedCount);
   for(const row of rows){const lot=catalog.lots.find(l=>l.lotId===row.lotId);if(!lot||row.price!==lot.price||row.item.id!==lot.item.id||row.time!==info.royalOpenAtMs||row.closeAtMs!==info.closeAtMs)throw Error('LOT:'+p.name);}
   const indexes=rows.length?await db.collection('auctionlistings').listIndexes().toArray():[];
   if(rows.length&&!indexes.some(i=>i.unique&&i.key.serverId===1&&i.key.cycleKey===1&&i.key.lotId===1))throw Error('INDEX:'+p.name);
   const records=await db.collection('auctionrecords').countDocuments();
   const pending=await db.collection('auctionrecords').countDocuments({deliveryState:'pending'});
   const health=await fetch('http://127.0.0.1:'+e.HTTP_PORT+'/ready').then(r=>r.json());
   if(health.status!=='ok'||!health.checks.mongo||!health.checks.redis)throw Error('READY:'+p.name);
   const logs=(logTail(e.pm_out_log_path)+'\n'+logTail(e.pm_err_log_path)).split('\n').filter(l=>l.includes('[Auction]')).filter(l=>{const m=/\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\]/.exec(l);return m&&Date.parse(m[1].replace(' ','T')+'+07:00')>=e.pm_uptime-1000;});
   result.servers.push({name:p.name,pid:p.pid,restarts:e.restart_time,activeWindow:window,lots:rows.length,items:rows.map(x=>x.item.id),records,pending,auctionLogErrors:logs,ready:true});
  }finally{await c.close();}
 }
 if(result.servers.length!==8)throw Error('SERVER_COUNT');
 result.result=result.servers.every(s=>s.auctionLogErrors.length===0)?'PASS':'CHECK_LOGS';
 console.log('AUCTION_RESULT='+JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
'''

def main():
    receipt=json.loads((TASK/'shared-deployment.json').read_text(encoding='utf-8'))
    if receipt['status']!='deployed': raise RuntimeError('Deployment not completed')
    client=connect()
    try:
        source='const expected='+json.dumps(receipt['files'])+';\n'+JS
        raw=run(client,'cd '+shlex.quote(APP)+" && node - <<'AUCTION_VERIFY'\n"+source+'\nAUCTION_VERIFY')
        line=next(line for line in raw.splitlines() if line.startswith('AUCTION_RESULT='))
        result=json.loads(line.split('=',1)[1])
        (TASK/'shared-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
    finally: client.close()

if __name__=='__main__': main()
