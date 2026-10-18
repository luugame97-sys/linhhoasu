'use strict';
const fs=require('fs'),cp=require('child_process');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6}));
const nodes=pm.filter(p=>/^lhs-s100[1-8]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}));
const coreCandidates=fs.readdirSync('.').filter(name=>/^core(?:\.\d+)?$/.test(name)).map(name=>{
  const stat=fs.statSync(name);return{name,size:stat.size,mtime:stat.mtime.toISOString(),isFile:stat.isFile()};
});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),nodes,coreCandidates,
  corePattern:fs.readFileSync('/proc/sys/kernel/core_pattern','utf8').trim(),productionWrites:0}));
