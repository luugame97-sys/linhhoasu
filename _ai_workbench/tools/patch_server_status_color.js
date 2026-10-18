'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve(__dirname,'../temp/server_status_color_20260905');
const original=fs.readFileSync(path.join(dir,'main.js.before'),'utf8');
const helper=`function lhsServerStatusOpen(row,now){if(!row)return false;var state=Number(row.state),status=Number(row.status);if(row.running===false||row.running===0||row.running==='0')return false;if(row.status!=null&&(!Number.isFinite(status)||status<=0))return false;if(!Number.isFinite(state)||state===0||state===4||state===5)return false;var open=Number(row.openTime)||0;return open<=0||now>=open}function lhsColorServerDot(image,row){if(!image)return;var now=typeof T!=='undefined'&&Number(T.serverTimeMilli)>0?Number(T.serverTimeMilli):Date.now();var green=lhsServerStatusOpen(row,now);if(image.__lhsStatusGreen===green)return;image.__lhsStatusGreen=green;image.filters=green?[new egret.ColorMatrixFilter([0,1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1,0])]:null}function lhsRefreshServerDot(view,row){var root=view.serverBg;if(!root||typeof root.getChildAt!=='function')return;for(var i=0;i<root.numChildren;i++){var child=root.getChildAt(i);if(child&&child.source==='login_bm_redpoint')lhsColorServerDot(child,row)}}`;
let out=original;
const anchor='b.SetCurServerName=function(){sht.ServerInfo?';assert.equal(out.split(anchor).length,2);
out=out.replace(anchor,'b.SetCurServerName=function(){lhsRefreshServerDot(this,sht.ServerInfo);sht.ServerInfo?');
const itemAnchor='b.dataChanged=function(){this.Desc=this.data;var t=this.Desc.state;';assert.equal(out.split(itemAnchor).length,2);
out=out.replace(itemAnchor,'b.dataChanged=function(){this.Desc=this.data;if(!this._lhsServerStatusDot){var dot=new U.Image("login_bm_redpoint");dot.x=6;dot.y=37;dot.width=14;dot.height=14;dot.touchEnabled=false;this.addChild(dot);this._lhsServerStatusDot=dot}lhsColorServerDot(this._lhsServerStatusDot,this.Desc);var t=this.Desc.state;');
const closure='!function(v){';assert(out.startsWith(closure));out=out.replace(closure,closure+helper);
fs.writeFileSync(path.join(dir,'main.js'),out);
let index=fs.readFileSync(path.join(dir,'index.html.before'),'utf8');
// Change only the main cache key, keep resource/translation and other guards intact.
const cache="20260904_auto_delegate_clean_v4";assert(index.includes(cache));index=index.replaceAll(cache,'20260905_server_status_color_v1');
fs.writeFileSync(path.join(dir,'index.html'),index);fs.writeFileSync(path.join(dir,'helper.js'),helper);
console.log(JSON.stringify({result:'PASS',loginHooks:1,listHooks:1,helperOnly:true,clientBytes:Buffer.byteLength(out)}));
if(process.argv.includes('--sync-local')){
 const crypto=require('crypto'),root=path.resolve(__dirname,'../../linhhoasu/webgame/game');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 const files={'main.js':path.join(root,'js/main.min_a6195824.js'),'index.html':path.join(root,'index.html')};
 const backup=path.resolve(__dirname,'../backups/server_status_color_local_20260905');fs.mkdirSync(backup,{recursive:true});
 for(const [key,file]of Object.entries(files)){const b=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),manifest[key].sha256,'local drift');fs.copyFileSync(file,path.join(backup,key));}
 for(const [key,file]of Object.entries(files))fs.copyFileSync(path.join(dir,key),file);
 console.log('LOCAL_MECHANICAL_PATCH_SYNC_PASS');
}
