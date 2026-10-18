'use strict';
const cp=require('child_process');
const env=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).find(p=>p.name==='lhs-s1001').pm2_env;
for(const [k,v] of Object.entries(env))if(typeof v==='string')process.env[k]=v;
const log=require.resolve('./src/logger');require.cache[log]={id:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config=require('./src/services/ConfigService'),tables=config.loadAllTables(),out={skills:{},textTables:{}};
for(const n of Object.keys(tables)){
  if(/skill/i.test(n))for(const [id,row] of Object.entries(tables[n]||{}))if(Number(id)>=10500&&Number(id)<=10516)(out.skills[n]||={})[id]=row;
  if(/lang|text/i.test(n)){
    const rows={};for(let id=30104531;id<=30104553;id++)if(tables[n]?.[id])rows[id]=tables[n][id];
    if(Object.keys(rows).length)out.textTables[n]=rows;
  }
}
console.log(JSON.stringify(out));
