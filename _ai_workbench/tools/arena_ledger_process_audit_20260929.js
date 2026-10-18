const fs=require('fs'),cp=require('child_process');
const rows=JSON.parse(cp.execFileSync('pm2',['jlist'],{maxBuffer:8e6}));
console.log(JSON.stringify(rows.map(p=>({name:p.name,pid:p.pid,script:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd,killTimeout:p.pm2_env.kill_timeout,autorestart:p.pm2_env.autorestart,cron:p.pm2_env.cron_restart,status:p.pm2_env.status})),null,2));
const names=fs.readdirSync('/proc').filter(s=>/^\d+$/.test(s));const known=new Set(rows.map(r=>r.pid));
for(const id of names)try{const cmd=fs.readFileSync('/proc/'+id+'/cmdline','utf8').split('\0');if(/node/.test(cmd[0])&&!known.has(+id))console.log('OTHER_NODE',id,cmd[0],cmd[1]||'');}catch(e){}
