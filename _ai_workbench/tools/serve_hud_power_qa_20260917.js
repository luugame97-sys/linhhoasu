'use strict';
// Local static QA, reuse existing Egret shell and original skins/resources.
const fs=require('fs'),path=require('path'),http=require('http');
const wb=path.resolve(__dirname,'..'),game=path.resolve(wb,'../linhhoasu/webgame/game'),cells=process.env.POWER_CELLS_QA==='1';
const out=cells?path.join(wb,'temp/power_cells_full_20260917'):path.join(wb,'temp/hud_power_full_20260917',process.env.HUD_QA_HOTFIX==='1'?'hotfix':'');
const index=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_rods_audit_20260908/resource-index.json'))),resources={};
for(const [key,rows]of Object.entries(index)){const r=rows.find(r=>!/-pack-entry$/.test(r.type));if(r)resources[key]='/game/update/resource/'+r.url;}
const shell=fs.readFileSync(path.join(__dirname,'fishing_visual_runtime_20260906.html'),'utf8');
const html=shell.replace('/main.fixed.js','/main.js').replace(/<script>\s*window.inspectRuntime[\s\S]*?<\/script>/,'<script src="/qa.js"></script>');
const sockets=new Set();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&u.pathname==='/result'){let data='';req.on('data',b=>{data+=b;if(data.length>300000)req.destroy();});req.on('end',()=>{try{const r=JSON.parse(data);if(!['desktop','mobile','cold','cold-desktop','cold-mobile','cold-late'].includes(r.mode))throw Error('QA_MODE_INVALID');const name=r.mode==='cold'?'diagnostic-cold.json':'visual-'+r.mode+'.json';fs.writeFileSync(path.join(out,name),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({result:r.result,mode:r.mode,checks:r.checks?.length}));res.end('{}');}catch(e){res.statusCode=400;res.end(e.message);}});return;}
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(u.pathname==='/resources.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(resources));}
 if(cells&&u.pathname==='/qa.js'){
  const base=fs.readFileSync(path.join(__dirname,'hud_power_visual_qa_20260917.js'),'utf8'),anchor=' const samples=';
  if(base.indexOf(anchor)<0)throw Error('QA_BOOTSTRAP_ANCHOR');
  const boot=base.slice(0,base.indexOf(anchor))+"\n await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/cells-qa.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});\n await window.startPowerCellQa({mode,cold,fontDelay,skins,resources,textures,texture,errors,line});\n})().catch(e=>{console.error(e);document.getElementById('qa-status').textContent=e.stack;});";
  res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(boot);
 }
 let file;
 if(cells&&u.pathname==='/cells-qa.js')file=path.join(__dirname,'power_cells_visual_qa_20260917.js');
 if(u.pathname==='/skins.json')file=path.join(wb,'temp/fishing_full_candidate_20260906/visual-skins.json');
 if(u.pathname==='/main.js')file=path.join(wb,'temp/fashion_current_audit_20260917/client/js/main.min_drop100.js');
 if(u.pathname==='/qa.js')file=path.join(__dirname,'hud_power_visual_qa_20260917.js');
 if(u.pathname.startsWith('/game/')){file=path.resolve(game,'.'+decodeURIComponent(u.pathname.slice(5)));if(!file.startsWith(game+path.sep)){res.statusCode=403;return res.end();}}
 if(!file||!fs.existsSync(file)){res.statusCode=404;return res.end('missing');}
 res.setHeader('Content-Type',({'.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});server.listen(18752,'127.0.0.1',()=>console.log('HUD QA http://127.0.0.1:18752/'));
process.on('SIGINT',()=>{for(const s of sockets)s.destroy();server.close(()=>process.exit(0));});
