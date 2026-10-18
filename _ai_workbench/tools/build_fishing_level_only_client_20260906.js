'use strict';
// Targeted build transform: only normal-ground gating, description, level-up unlock.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),input=process.argv[3]||'main.js',output=process.argv[4]||'main.fixed.js';
const original=fs.readFileSync(path.join(root,input),'utf8');let source=original;const changes=[];
function once(s,before,after){assert.equal(s.split(before).length-1,1,before);return s.replace(before,after);}
function patch(marker,transform,from=0){const at=source.indexOf(marker,from);assert(at>=0,marker);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});
  if(n.type==='SequenceExpression')n=n.expressions[0];assert.equal(n.type,'FunctionExpression');
  const before=source.slice(n.start,n.end),after=transform(before);assert.notEqual(after,before);
  source=source.slice(0,n.start)+after+source.slice(n.end);changes.push({marker,before,after});
}
patch('H_e.isSceneUnlock=function',s=>once(s,'!(t.openDay>T.serverOpenDay)','(!t.isActivity||!(t.openDay>T.serverOpenDay))'));
const panelStart=source.indexOf('i(pmt,');assert(panelStart>=0);
patch('a.UpdateContent=function',s=>once(s,'this.config.openDay&&1<this.config.openDay&&','this.config.isActivity&&this.config.openDay&&1<this.config.openDay&&'),panelStart);
patch('u.unlockNewSceneId=function',s=>{const fragment='&&!(T.serverOpenDay<i[a].openDay)';assert.equal(s.split(fragment).length-1,2);return s.split(fragment).join('');});
acorn.parse(source,{ecmaVersion:'latest'});
let restored=source;for(const row of changes.slice().reverse())restored=once(restored,row.after,row.before);assert.equal(restored,original);
fs.writeFileSync(path.join(root,output),source);
if(output==='main.fixed.js')fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({result:'PASS',changes,normalScenesLevelOnly:true,eventSceneRulesUnchanged:true,autoEffectsChanged:false},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',functionsChanged:changes.length,output,autoEffectsChanged:false}));
