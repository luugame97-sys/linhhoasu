'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(process.argv[2],'utf8');
const a=source.indexOf('  async _proxyGameMsgToServerNode('),b=source.indexOf('\n  /**',a);assert(a>=0&&b>a);
const method=source.slice(a,b).trim();let captured;
const C=vm.runInNewContext('(class Test{'+method+'})',{URL,AbortController,setTimeout,clearTimeout,Buffer,logger:{info(){}},fetch:async(url,opts)=>{captured={url,opts};return{status:200,arrayBuffer:async()=>new ArrayBuffer(0)};}});
(async()=>{const p=new C();p.realHttpProxyTimeoutMs=1000;
for(const [headers,expected]of [[{host:'103.116.105.154:81'},'103.116.105.154:81'],[{host:'127.0.0.1:8083','x-forwarded-host':'lhs.mg365.fun'},'lhs.mg365.fun']]){
 const body=Buffer.from([1,2,3]);await p._proxyGameMsgToServerNode({headers,protocol:'https',url:'/gameMsg.do'},body,2820,'http://127.0.0.1:8083');assert.equal(captured.opts.headers['x-forwarded-host'],expected);assert.equal(captured.opts.headers['x-forwarded-proto'],'https');assert.equal(captured.opts.body,body);}
console.log('PROXY_HOST_TEST_PASS');})().catch(e=>{console.error(e);process.exitCode=1;});
