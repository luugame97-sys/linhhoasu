'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const cfgPath='/linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json';
const nodes=[['lhs-s1001',8080],['lhs-s1002',8083],['lhs-s1003',8084],['lhs-s1004',8085],['lhs-s1005',8086],['lhs-s1006',8087],['lhs-s1007',8088]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(port){for(let i=0;i<60;i++){try{const res=await fetch(`http://127.0.0.1:${port}/ready`);const body=await res.json();if(res.status===200&&body.status==='ok'&&body.mongo===true&&body.redis===true)return body;}catch(_e){}await sleep(1000);}throw new Error(`READINESS_FAILED:${port}`)}
(async()=>{
 const restarts=[];
 for(const [name,port] of nodes){execFileSync('pm2',['restart',name,'--update-env'],{stdio:'ignore'});const body=await ready(port);restarts.push({name,port,ready:true,pid:JSON.parse(execFileSync('pm2',['pid',name],{encoding:'utf8'}).trim())||0});}
 const list=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
 const runtime=list.filter(x=>/^lhs-s100[1-7]$/.test(x.name)).map(x=>({name:x.name,status:x.pm2_env.status,pid:x.pid,restarts:x.pm2_env.restart_time,crossEventEnabled:x.pm2_env.env.CROSS_EVENT_ENABLED||''}));
 const s=JSON.parse(fs.readFileSync(cfgPath,'utf8')),now=Date.now(),DAY=86400000,a=Date.parse(s.anchor),i=Math.floor((now-a)/(s.periodDays*DAY)),ai=s.independent.crossArena,ci=Math.floor((now-Date.parse(ai.anchor))/(ai.periodDays*DAY));
 const result={result:'RESTARTED_VERIFIED',configSha256:crypto.createHash('sha256').update(fs.readFileSync(cfgPath)).digest('hex'),rotation:s.rotation,periodDays:s.periodDays,settlementGraceMs:s.settlementGraceMs,crossRivalCycle:{index:i,startTime:a+i*s.periodDays*DAY,endTime:a+(i+1)*s.periodDays*DAY},crossArenaCycle:{index:ci,startTime:Date.parse(ai.anchor)+ci*ai.periodDays*DAY,endTime:Date.parse(ai.anchor)+(ci+1)*ai.periodDays*DAY},restarts,runtime};console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
