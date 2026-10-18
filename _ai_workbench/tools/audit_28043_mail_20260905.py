"""Read-only: concrete 28043 mail/currency/icon evidence, no claims or grants."""
import json,sys,hashlib
from datetime import datetime,timezone
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1]
OUT=WB/'temp'/('mail_28043_'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
OUT.mkdir()
sys.stdout.reconfigure(encoding='utf-8')
code=r"""
const fs=require('fs'),crypto=require('crypto');const APP='/linhhoasu/lhs/newServer';
const log=require.resolve(APP+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const{MongoClient}=require(APP+'/node_modules/mongodb');
const cfg=require(APP+'/src/services/ConfigService'),tables=cfg.loadAllTables('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
const anon=x=>crypto.createHash('sha256').update('lhs28043|'+String(x)).digest('hex').slice(0,16);
const getOwn=(p,id)=>(p?.fashionInfo?.activateFashion||[]).map(Number).includes(id)||Number(p?.fashionInfo?.fashions?.[id])>0;
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1});await c.connect();const dbs={};
for(const name of ['lhs_s1001','lhs_s1002']){const db=c.db(name);const raw=await db.collection('mails').find({createdAt:{$gte:new Date('2026-09-05T00:00:00+07:00')},$or:[{'attachments.id':28043},{title:{$regex:'GM Linh', $options:'i'}}]},{projection:{userId:1,title:1,content:1,attachments:1,claimed:1,read:1,createdAt:1,updatedAt:1}}).sort({createdAt:-1}).limit(60).toArray();const rows=[];
for(const m of raw){const p=await db.collection('players').findOne({userId:m.userId},{projection:{items:1,fashionInfo:1,roleInfo:1,mailClaimLedger:1}});rows.push({mail:anon(m._id),subject:anon(m.userId),title:m.title,contentKind:/WebShop/i.test(m.content||'')?'webshop':/GM gửi|GM gui/i.test(m.content||'')?'gm':'other',attachments:m.attachments,claimed:m.claimed,read:m.read,createdAt:m.createdAt,updatedAt:m.updatedAt,playerFound:!!p,owns28043:getOwn(p,28043),ownedSuitParts:[28041,28042,28043,28049].filter(id=>getOwn(p,id)),bag28043:p?.items?.[28043]||0,role:p?.roleInfo?{kungfuId:p.roleInfo.kungfuId,subJob:p.roleInfo.subJob}:null,claimLedger:(p?.mailClaimLedger||[]).map(String).includes(String(m._id))});}
dbs[name]=rows;}
await c.close();const configs={};for(const id of[1,28040,28043,80128043,80228043,80328043])configs[id]={asset:tables.AssetsConfig[id],fashion:tables.FashionConfig[id],dress:tables.FashionDressConfig[id],use:tables.AssetsUseConfig[id]};
const main=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_a6195824.js','utf8');const snippets={};for(const term of ['MailData=function','MailData=','rewardData','MailDetailPanel','MailDetailView','MailPanel','FashionData=','FashionModel=']){const i=main.indexOf(term);snippets[term]={offset:i,text:i<0?'':main.slice(Math.max(0,i-150),i+7000)};}
const paths={'mail.js':APP+'/src/handlers/mail.js','HTTPServer.js':APP+'/src/net/HTTPServer.js','user_api.php':'/linhhoasu/webgame/gm/api/user_api.php','config.bin':'/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'};
const hashes=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
console.log(JSON.stringify({generatedAt:new Date().toISOString(),readOnly:true,dbs,configs,snippets,hashes}));})().catch(e=>{console.error(e.name);process.exitCode=1;});
"""
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 i,o,e=s.exec_command('node -',timeout=60);i.write(code);i.channel.shutdown_write();data=json.loads(o.read());assert o.channel.recv_exit_status()==0
 (OUT/'audit.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 # Fetch only current visible client/source assets; no config credentials.
 sf=s.open_sftp()
 for rel,remote in {'main.js':'/linhhoasu/webgame/game/js/main.min_a6195824.js','user_api.php':'/linhhoasu/webgame/gm/api/user_api.php','HTTPServer.js':'/linhhoasu/lhs/newServer/src/net/HTTPServer.js','client.bin':'/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'}.items():sf.get(remote,str(OUT/rel))
 sf.close()
 print(json.dumps({'out':str(OUT),'generatedAt':data['generatedAt'],'dbs':data['dbs'],'configs':data['configs']},ensure_ascii=False))
finally:s.close()
