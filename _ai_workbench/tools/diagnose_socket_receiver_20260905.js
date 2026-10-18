'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {WebSocketServer}=require(path.join(ROOT,'linhhoasu/lhs/newServer/node_modules/ws'));
const echo=new WebSocketServer({host:'127.0.0.1',port:18792});
echo.on('connection',socket=>socket.on('message',data=>socket.send(data)));
const page=`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kiểm tra receiver WebSocket</title>
<body><h1>Kiểm tra gọi WebSocket trên trình duyệt</h1><button id="test">Chạy phép thử</button><pre id="result">Chưa chạy</pre>
<script>
document.querySelector('#test').onclick=async function(){
 const out=[];
 for(const mode of ['instance','bound-prototype','reflect-prototype','descriptor-call','bound-instance']){
  const socket=new WebSocket('ws://127.0.0.1:18792');
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const row={mode,instanceSendEqualsPrototype:socket.send===WebSocket.prototype.send,ready:socket.readyState};
  const message='receiver-'+mode;
  const reply=new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),1200);socket.onmessage=()=>{clearTimeout(timer);resolve(true);};});
  try{
   if(mode==='instance')socket.send(message);
   if(mode==='bound-prototype')WebSocket.prototype.send.bind(socket)(message);
   if(mode==='reflect-prototype')Reflect.apply(WebSocket.prototype.send,socket,[message]);
   if(mode==='descriptor-call')Function.prototype.call.bind(Object.getOwnPropertyDescriptor(WebSocket.prototype,'send').value)(socket,message);
   if(mode==='bound-instance')socket.send.bind(socket)(message);
   row.sent=true;
  }catch(error){row.error=String(error);}
  row.echo=await reply;socket.close();out.push(row);document.querySelector('#result').textContent=JSON.stringify(out,null,2);
 }
 fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(out)});
};
</script></body></html>`;
const server=http.createServer((req,res)=>{
 if(req.method==='POST'&&req.url==='/result'){
  let data='';req.on('data',b=>{data+=b;if(data.length>32000)req.destroy();});req.on('end',()=>{
   const rows=JSON.parse(data);fs.writeFileSync(path.join(ROOT,'_ai_workbench/temp/socket_receiver_probe_20260905.json'),JSON.stringify(rows,null,2));res.end('ok');});return;
 }
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(page);
});
server.listen(18791,'127.0.0.1',()=>console.log('SOCKET_PROBE=http://127.0.0.1:18791'));
process.on('SIGINT',()=>{echo.close();server.close();});
