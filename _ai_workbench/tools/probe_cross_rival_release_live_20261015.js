'use strict';
const fs=require('fs'),cp=require('child_process'),config=JSON.parse(fs.readFileSync('/linhhoasu/lhs/newServer/src/config/crossRivalRelease.json','utf8'));
const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s100[1-8]$/.test(p.name));
const ready=rows.map(p=>{const port=p.pm2_env.HTTP_PORT;let body={};try{body=JSON.parse(cp.execFileSync('curl',['--silent','--show-error','--fail','--max-time','5','http://127.0.0.1:'+port+'/ready'],{encoding:'utf8'}));}catch(e){body={error:'READY_FAILED'};}return{name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,ready:body};});
console.log(JSON.stringify({config:{version:config.version,enabled:config.enabled,activationAt:config.activationAt,qaActors:config.qaActors},ready}));
