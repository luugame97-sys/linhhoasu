'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'../..'),game=path.join(root,'linhhoasu/webgame/game'),temp=path.join(root,'_ai_workbench/temp/item_quantity_20260907');
process.env.CONFIG_BIN_PATH=path.join(game,'update/resource/assets/excel/config_e5ac72c2.bin');process.env.LOG_DIR='';
const config=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const cfg=config.loadAllTables();cfg.LanguageConfig=config.reload(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
fs.writeFileSync(path.join(temp,'config.json'),JSON.stringify(cfg));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname==='/result'){
  let body='';req.on('data',d=>{body+=d;if(body.length>200000)req.destroy();});req.on('end',()=>{try{const result=JSON.parse(body);const file=['rank-before','rank-after','rank-live-asset'].includes(result.mode)?result.mode+'.json':'native-result.json';fs.writeFileSync(path.join(temp,file),JSON.stringify(result,null,2));res.end('saved');console.log(JSON.stringify(result));}catch(e){res.writeHead(400);res.end('invalid');}});return;
 }
 if(url.pathname==='/patch-hash'){res.end(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(game,'js/lhs-item-quantity-v1.js'))).digest('hex'));return;}
 let file;
 if(url.pathname==='/')file=path.join(__dirname,'item_quantity_native_20260907.html');
 else if(url.pathname==='/visual-assets.json')file=path.join(root,'_ai_workbench/temp/fishing_full_candidate_20260906/visual-assets.json');
 else if(url.pathname.startsWith('/game/'))file=path.resolve(game,'.'+decodeURIComponent(url.pathname.slice(5)));
 else if(['/config.json','/skins.json','/fonts.json'].includes(url.pathname))file=path.join(temp,url.pathname.slice(1));
 if(!file||(!file.startsWith(game+path.sep)&&!file.startsWith(temp+path.sep)&&file!==path.join(__dirname,'item_quantity_native_20260907.html')&&!file.endsWith('fishing_full_candidate_20260906'+path.sep+'visual-assets.json'))){res.writeHead(404);res.end();return;}
 const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
 res.setHeader('Content-Type',types[ext]||'application/octet-stream');res.setHeader('Cache-Control','no-store');const stream=fs.createReadStream(file);stream.on('error',()=>{res.statusCode=404;res.end('not found');});stream.pipe(res);
});server.listen(18741,'127.0.0.1',()=>console.log('Native item quantity fixture http://127.0.0.1:18741/'));
