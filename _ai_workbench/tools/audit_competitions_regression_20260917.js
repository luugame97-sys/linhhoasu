'use strict';
const path=require('path'),Module=require('module');
let networkAttempts=0;
const deny=()=>{networkAttempts++;throw Error('AUDIT_NETWORK_DENIED');};
require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
for(const p of ['http','https']){require(p).request=deny;require(p).get=deny;}global.fetch=deny;
const log=require.resolve('./src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const results=[];
const originalLog=console.log, originalError=console.error;
(async()=>{
 for(const test of AUDIT_CASES){
  const output=[],errors=[];
  console.log=(...args)=>output.push(args.join(' '));console.error=(...args)=>errors.push(args.join(' '));
  const isSettlement=test.name==='test-arena-settlement.js';
  const filename=isSettlement?path.join(process.cwd(),'scripts',test.name):'/linhhoasu/_ai_workbench/tools/'+test.name;
  // Resolve existing harness paths to the installed app and the actual served bundle.
  const source=test.source.replaceAll('../../linhhoasu/','../../').replaceAll("'linhhoasu', 'lhs'","'lhs'")
   .replaceAll('linhhoasu/webgame/','webgame/').replaceAll('main.min_a6195824.js','main.min_drop100.js');
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  try{m._compile(source,filename);await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}
  catch(e){errors.push(e.stack);}
  const warnings=errors.filter(s=>s.includes('[MONGOOSE] Warning: `isNew` is a reserved schema pathname'));
  const failures=errors.filter(s=>!warnings.includes(s));
  results.push({name:test.name,output,errors:failures,warnings,pass:failures.length===0&&output.length>0});
 }
 console.log=originalLog;console.error=originalError;
 originalLog(JSON.stringify({at:new Date().toISOString(),scope:'existing regressions against installed code and served main bundle; RAM only',
  results,networkAttempts,productionWrites:0}));
})().catch(e=>{console.log=originalLog;console.error=originalError;originalError(e.stack);process.exitCode=1;});
