'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('C:/Users/vandu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),game=path.resolve(__dirname,'../../linhhoasu/webgame/game'),main=fs.readFileSync(path.join(root,'main.fixed.js'),'utf8');
function extract(marker,anchor){const p=main.indexOf(marker,anchor?main.indexOf(anchor):0);assert(p>=0,marker);let n=acorn.parseExpressionAt(main,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const funcs={autoChildren:extract('(_=V6e.prototype).childrenCreated=function'),room:{}};
for(const k of ['initFishRoomButton','closeFishRoomPicker','openFishRoomPicker','loadFishRooms'])funcs.room[k]=extract('a.'+k+'=function','i(Ggt,');
fs.writeFileSync(path.join(root,'ui-functions.json'),JSON.stringify(funcs));
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1'),base=u.pathname.startsWith('/game/')?game:root;const p=u.pathname==='/'?path.join(__dirname,'room_ui_fixture_20260906.html'):path.resolve(base,'.'+decodeURI(u.pathname.replace(/^\/game/,'')));if(!p.startsWith(base)&&u.pathname!=='/'){res.writeHead(403);return res.end();}if(!fs.existsSync(p)){res.writeHead(404);return res.end();}const ext=path.extname(p);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'})[ext]||'application/octet-stream');res.end(fs.readFileSync(p));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-webgl','--use-angle=swiftshader']});const result={};try{
 for(const type of ['rooms','auto']){const page=await browser.newPage({viewport:{width:492,height:875},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+port+'/#'+type);try{await page.waitForFunction(()=>window.fixtureReady,{timeout:15000});}catch{}
  await page.screenshot({path:path.join(root,'ui-'+type+'.png')});result[type]={errors,...await page.evaluate(()=>({ready:window.fixtureReady||false,errors:window.fixtureErrors||[],bounds:window.fixturePanel?{width:fixturePanel.width,height:fixturePanel.height}:null}))};
  const probe=await page.evaluate(type=>{
   const p=window.fixturePanel;
   if(type==='auto'){const card=p.autoPowerFishCard;const btn=p.startButton;return {inside:card.y+card.height<btn.y,noteInside:p.autoPowerFishNote.y+p.autoPowerFishNote.height<=card.height,cardChildren:card.numChildren,cardWidth:card.width,frameHeight:p.commonwin.height};}
   const button=p.fishRoomPicker.body.getChildAt(2).$children.find(x=>x instanceof eui.Button);const point=button.localToGlobal(button.width/2,button.height/2);return {x:point.x/720*innerWidth,y:point.y/1280*innerHeight};
  },type);
  if(type==='auto'){assert(probe.inside&&probe.noteInside);result[type].layout=probe;}else{await page.mouse.click(probe.x,probe.y);await page.waitForFunction(()=>window.lastRoomSelected===3,{timeout:3000});result[type].nativeButtonClick=true;}
  await page.close();}
 }finally{await browser.close();server.close();}fs.writeFileSync(path.join(root,'ui-render.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
