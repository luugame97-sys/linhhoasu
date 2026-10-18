'use strict';
const assert=require('assert/strict');
const puzzle=require('../src/services/OldTrekPuzzleService');
// BFS solves a 3x3 board independently of the generator and supplies replay proof.
function solve(start) {
 const goal='123456780', initial=start.join(''), queue=[initial], prev=new Map([[initial,null]]);
 let head=0;
 while(head<queue.length){const key=queue[head++];if(key===goal)break;const blank=key.indexOf('0');
  for(const at of [blank-3,blank+3,blank-1,blank+1]){if(at<0||at>8||Math.abs(at%3-blank%3)+Math.abs(Math.floor(at/3)-Math.floor(blank/3))!==1)continue;
   const a=key.split('');[a[blank],a[at]]=[a[at],a[blank]];const next=a.join('');if(!prev.has(next)){prev.set(next,{key,at});queue.push(next);}}
 }
 if(!prev.has(goal))throw Error('UNSOLVABLE');const out=[];let key=goal;while(prev.get(key)){const p=prev.get(key);out.push(p.at);key=p.key;}return out.reverse();
}
for(const seed of [1,77,98765,2147483646]) {const board=puzzle.board(seed),steps=solve(board);assert(steps.length>0);assert(puzzle.validate(seed,steps));assert(!puzzle.validate(seed,steps.slice(0,-1)));}
for(const moves of [[],[99],[0.5],Array(513).fill(0)])assert(!puzzle.validate(1,moves));
console.log(JSON.stringify({status:'PASS',seedScenarios:4,invalidProofScenarios:4,productionWrites:0}));
