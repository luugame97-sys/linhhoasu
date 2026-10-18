'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const s=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/main.min_drop100.js'),'utf8');
const start=s.indexOf('.Room_Config={512:');
console.log('ROOM_CONFIG',start,s.slice(start-150,start+1600));
for(const name of ['onTopArena','sendTopArena','sendAudition','onAudition','sendRoom','onRoom','sendGuess','onGuess','sendPass','onPass','checkGuessOpen','getGuessOdds','getRoundFight','sendSupport','sendWorship']){
 const re=new RegExp('(?:\\.prototype\\.|m\\.)('+name+'[A-Za-z0-9_]*)=function\\([^)]*\\)\\{','g');
 for(const m of s.matchAll(re)){
  const fragment=s.slice(m.index, m.index+5000);
  const end=fragment.indexOf('},m.',fragment.indexOf('{'));
  const text=fragment.slice(0,end>=0?end+1:900);
  if(/620\d|621\d|622\d|TopArena|guessInfo|matchInfo|audition/.test(text))console.log(text.slice(0,3000));
 }
}
for(const tag of [2350,6200,6201,6202,6203,6210,6211,6212,6213,6214,6215,6216,6217,6218,6220,6221]){
 const re=new RegExp('(sendMsg|regNetMsg|regNetMsgAndEvent|send)\\('+tag+'[,)]','g');
 for(const m of s.matchAll(re))console.log('TAG',tag,s.slice(Math.max(0,m.index-180),m.index+650));
}
