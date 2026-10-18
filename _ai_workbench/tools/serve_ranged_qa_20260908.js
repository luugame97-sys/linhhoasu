'use strict';
// Reuse an existing Egret QA page; no new HTML artifact or live account.
const fs=require('fs'),path=require('path'),http=require('http');
const wb=path.resolve(__dirname,'..'),game=path.resolve(wb,'../linhhoasu/webgame/game'),app=path.resolve(wb,'../linhhoasu/lhs/newServer');
const out=path.join(wb,'temp/ranged_action_fix_20260908');fs.mkdirSync(out,{recursive:true});
const config=require(path.join(app,'src/services/ConfigService')),tables=config.loadAllTables();
tables.LanguageConfig=config.decodeTables(fs.readFileSync(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const data=JSON.stringify(tables),index=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_rods_audit_20260908/resource-index.json'),'utf8'));
const resources={};for(const [key,entries]of Object.entries(index)){const entry=entries.find(r=>!/-pack-entry$/.test(r.type));if(entry)resources[key]='/game/update/resource/'+entry.url;}
const shell=fs.readFileSync(path.join(__dirname,'fishing_visual_runtime_20260906.html'),'utf8');
const html=shell.replace('/main.fixed.js','/game/js/main.min_a6195824.js').replace(/<script>\s*window.inspectRuntime[\s\S]*?<\/script>/,'<script src="/qa.js"></script>');
const sockets=new Set();let server;
server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&url.pathname==='/result'){let body='';req.on('data',b=>{body+=b;if(body.length>250000)req.destroy();});req.on('end',()=>{try{const r=JSON.parse(body);fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify(r,null,2)+'\n');res.end('saved');console.log(JSON.stringify(r));}catch(_){res.statusCode=400;res.end();}});return;}
 if(req.method!=='GET'){res.statusCode=405;res.end();return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(url.pathname==='/config.json'){res.setHeader('Content-Type','application/json');return res.end(data);}
 if(url.pathname==='/resources.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(resources));}
 if(url.pathname==='/skins.json'){res.setHeader('Content-Type','application/json');return fs.createReadStream(path.join(wb,'temp/fishing_full_candidate_20260906/visual-skins.json')).pipe(res);}
 let file;
 if(url.pathname==='/qa.js')file=path.join(__dirname,'ranged_visual_qa_20260908.js');
 else if(url.pathname.startsWith('/game/')){file=path.resolve(game,'.'+decodeURIComponent(url.pathname.slice(5)));if(!file.startsWith(game+path.sep)){res.statusCode=403;return res.end();}}
 if(!file||!fs.existsSync(file)){res.statusCode=404;return res.end('not found');}
 res.setHeader('Content-Type',({'.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
server.listen(18749,'127.0.0.1',()=>console.log('Ranged native QA http://127.0.0.1:18749/'));
process.on('SIGINT',()=>{for(const s of sockets)s.destroy();server.close(()=>process.exit(0));});
