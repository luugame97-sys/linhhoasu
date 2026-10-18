'use strict';
const {execFileSync}=require('child_process');
const fs=require('fs'),crypto=require('crypto');
const list=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const cfg='/linhhoasu/lhs/newServer/src/config/crossServerEventSchedule.json';
const out={configSha256:crypto.createHash('sha256').update(fs.readFileSync(cfg)).digest('hex'),rotation:JSON.parse(fs.readFileSync(cfg,'utf8')).rotation,runtime:list.filter(x=>/^lhs-s100[1-7]$/.test(x.name)).map(x=>({name:x.name,status:x.pm2_env.status,pid:x.pid,pmUptime:x.pm2_env.pm_uptime,restarts:x.pm2_env.restart_time,crossEventEnabled:x.pm2_env.env.CROSS_EVENT_ENABLED||''}))};console.log(JSON.stringify(out,null,2));
