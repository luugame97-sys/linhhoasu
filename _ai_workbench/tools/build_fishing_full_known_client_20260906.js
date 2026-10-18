'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),source=fs.readFileSync(path.join(root,'main.js'),'utf8');
const marker='u.sendAutoPowerFish=function',at=source.indexOf(marker);assert(at>=0);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];
const before=source.slice(n.start,n.end),anchor='if(r&&r.orderState)m.fishInfo.orders=r.orderState;';assert.equal(before.split(anchor).length-1,1);
const after=before.replace(anchor,anchor+'if(r&&r.extraPrice){m.fishInfo.extraPrice=r.extraPrice;A.ins().dispatch(E.FISH_PRICE_REWARN_UPDATE);}');
const out=source.slice(0,n.start)+after+source.slice(n.end);acorn.parse(out,{ecmaVersion:'latest'});assert.equal(out.replace(after,before),source);
fs.writeFileSync(path.join(root,'main.fixed.js'),out);fs.writeFileSync(path.join(root,'client-known-build.json'),JSON.stringify({marker,before,after,scope:'gold rod bonus display only',deployed:false},null,2)+'\n');console.log('Client bonus sync candidate built (not deployed)');
