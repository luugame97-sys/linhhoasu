'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const file=path.join(ROOT,'linhhoasu/webgame/game/index.html');
const trace=`<script>
(function(){
 var descriptor=Object.getOwnPropertyDescriptor(WebSocket.prototype,'send');
 var nativeSend=descriptor.value;
 function trace(kind,value){console.warn('[SOCKET_QA] '+kind+' '+JSON.stringify(value));}
 var timer=setInterval(function(){
  var T=window.egret&&egret.web&&egret.web.HTML5WebSocket;
  if(!T||!T.prototype.__lhsNativeSendGuardV2||T.prototype.__qaObserved)return;
  T.prototype.__qaObserved=true;
  var original=T.prototype.send,originalSet=T.prototype._setSocket;
  T.prototype._setSocket=function(url){var value=originalSet.call(this,url);trace('create',{name:this._nativeSend&&this._nativeSend.name,length:this._nativeSend&&this._nativeSend.length,isNativeSocket:this._nativeSocket instanceof WebSocket,sendEqualsNative:WebSocket.prototype.send===nativeSend});return value;};
  T.prototype.send=function(data){try{return original.call(this,data);}catch(e){
    trace('throw',{error:String(e),name:this._nativeSend&&this._nativeSend.name,nativeSocket:this._nativeSocket instanceof WebSocket,socket:this.socket instanceof WebSocket,same:this.socket===this._nativeSocket,ready:this._nativeSocket&&this._nativeSocket.readyState,sendEqualsNative:WebSocket.prototype.send===nativeSend,ownSender:Object.prototype.hasOwnProperty.call(this,'_nativeSend'),senderSource:String(this._nativeSend).slice(0,160)});throw e;
  }};
 },10);setTimeout(function(){clearInterval(timer);},60000);
})();
</script>`;
const server=http.createServer((req,res)=>{
 const target=new URL(req.url,'http://127.0.0.1:18793');
 if(target.pathname==='/'||target.pathname==='/index.html'){
  let html=fs.readFileSync(file,'utf8').replace('</head>',trace+'</head>');
  html=html.replace("query.get('backendHost') || window.location.hostname", "query.get('backendHost') || '103.116.105.154'");
  html=html.replace("query.get('httpPort') || window.location.port", "query.get('httpPort') || '81'").replace("query.get('wsPort') || window.location.port", "query.get('wsPort') || '81'");
  res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);return;
 }
 const upstream=http.request({host:'103.116.105.154',port:81,path:req.url,method:req.method,headers:{...req.headers,host:'103.116.105.154:81'}},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
 upstream.on('error',e=>{res.statusCode=502;res.end('QA proxy upstream unavailable');});req.pipe(upstream);
});
server.listen(18793,'127.0.0.1',()=>console.log('LOGIN_AB=http://127.0.0.1:18793'));
process.on('SIGINT',()=>server.close());
