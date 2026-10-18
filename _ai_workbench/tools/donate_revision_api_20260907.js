'use strict';
// Runs on owning VPS only; never returns effective API credentials.
const fs=require('fs'),cp=require('child_process'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict');
const app='/linhhoasu/lhs/newServer',plan=JSON.parse(fs.readFileSync(process.argv[2])),action=process.argv[3],uid=process.argv[4],target=plan.rows.find(r=>r.userId===uid);assert(target);
const proc=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s'+target.serverId);assert(proc?.pm2_env.pm_cwd===app);
const env=Object.fromEntries(fs.readFileSync('/proc/'+proc.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
const dot=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));const key=env.API_KEY||dot.API_KEY;assert(key&&key!=='lhs_internal_key');
const endpoint='/api/internal/player/donate-revision-20260907',body={action,userId:uid,confirm:action!=='status',incident:plan.incident,evidenceSha256:plan.evidenceSha256};
const raw=JSON.stringify(body),timestamp=String(Date.now()),nonce=crypto.randomBytes(16).toString('hex'),signature=crypto.createHmac('sha256',key).update(['POST',endpoint,timestamp,nonce,raw].join('\n')).digest('hex');
const req=http.request({hostname:'127.0.0.1',port:target.serverId===1001?8080:8083,path:endpoint,method:'POST',timeout:25000,headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw),'x-api-key':key,'x-timestamp':timestamp,'x-nonce':nonce,'x-signature':signature}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>{try{const r=JSON.parse(text);console.log(JSON.stringify({http:res.statusCode,...r}));if(res.statusCode!==200||!r.success)process.exitCode=1;}catch{console.error('INVALID_RESPONSE');process.exitCode=1;}});});req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.on('error',e=>{console.error(e.message);process.exitCode=1;});req.end(raw);
