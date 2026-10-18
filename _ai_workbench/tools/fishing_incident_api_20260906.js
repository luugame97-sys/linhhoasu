'use strict';
// Reads each running process's effective API key locally; never prints credentials.
const fs=require('fs'),cp=require('child_process'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict');
const app='/linhhoasu/lhs/newServer',dotenv=require(app+'/node_modules/dotenv');
const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),action=process.argv[3],accountId=process.argv[4],sid=Number(process.argv[5]);
const row=plan.rows.find(r=>r.accountId===accountId);assert(row);assert([1001,1002].includes(sid));
const proc=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s'+sid);assert(proc?.pm2_env.pm_cwd===app);
const inherited=Object.fromEntries(fs.readFileSync('/proc/'+proc.pid+'/environ','utf8').split('\0').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
const env={...dotenv.parse(fs.readFileSync(app+'/.env')),...inherited};assert(env.API_KEY&&env.API_KEY!=='lhs_internal_key','EFFECTIVE_API_KEY_MISSING');
const endpoint=action==='auth-preview'?'/api/internal/account/ban':'/api/internal/account/fishing-free-recovery-20260906';
const body=action==='auth-preview'?{accountId:row.accountId,durationSeconds:60,reason:'Chỉ kiểm tra xác thực, không khóa',dryRun:true,confirm:false}
 :{accountId:row.accountId,action,confirm:action!=='status',incident:plan.incident,evidenceSha256:plan.evidenceSha256};
const raw=JSON.stringify(body),timestamp=Date.now(),nonce=crypto.randomBytes(16).toString('hex');
const signature=crypto.createHmac('sha256',env.API_KEY).update(['POST',endpoint,timestamp,nonce,raw].join('\n')).digest('hex');
const req=http.request({hostname:'127.0.0.1',port:sid===1001?8080:8083,path:endpoint,method:'POST',timeout:20000,
 headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw),'x-api-key':env.API_KEY,'x-timestamp':String(timestamp),'x-nonce':nonce,'x-signature':signature}},res=>{
 let data='';res.setEncoding('utf8');res.on('data',x=>data+=x);res.on('end',()=>{try{const result=JSON.parse(data);console.log(JSON.stringify({httpStatus:res.statusCode,result}));if(res.statusCode!==200||result.success!==true)process.exitCode=1;}catch{console.error('INVALID_API_RESPONSE');process.exitCode=1;}});
});
req.on('timeout',()=>req.destroy(Error('INCIDENT_API_TIMEOUT')));req.on('error',e=>{console.error(e.message);process.exitCode=1;});req.end(raw);
