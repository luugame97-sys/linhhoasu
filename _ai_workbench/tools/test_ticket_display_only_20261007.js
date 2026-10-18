'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const file=process.env.TICKET_DISPLAY_MAIN||path.resolve(__dirname,'../../linhhoasu/webgame/game/js/main.min_drop200.js');
const map=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
const main=fs.readFileSync(map[file]||file,'utf8');
assert.equal((main.match(/this\.countLabel\.text=t\.toString\(\)/g)||[]).length,1);
assert.equal((main.match(/this\.currencyItem\.labelShow=function\(t\)\{return String\(t\)\}/g)||[]).length,2);
assert(main.includes('GetItemCount(10)'));assert(main.includes('GetItemCount(110)'));
assert(!main.includes('this.countLabel.text=t.toString()+"/"+e.toString()'));
assert(!main.includes('this.currencyItem.labelShow=function(t){return t+"/"+Y.CrossArenaModel.getTicketLimit()}'));
const start=main.indexOf('a.updateItemCount=function(){var t,e,i;99==this.data.itemId');
const end=main.indexOf(',a.updateTimeLabel=function',start);
assert(start>=0&&end>start);
let have=84;
const context={Y:{ItemModel:{GetItemCount:()=>have},FateModel:{getNowLeftTalentPoint:()=>7},Config:{CuriosBaseConfig:{freeResMax:20}}},RV:{getArenaTicketMax:()=>9},B:{ConvertLanguageToText:()=>''}};
const update=vm.runInNewContext('('+main.slice(start,end).replace('a.updateItemCount=','')+')',context);
for(const itemId of [10,110])for(const balance of [0,10,84,1000]){
  have=balance;const widget={data:{itemId},countLabel:{},labelShow:n=>String(n)};
  update.call(widget);assert.equal(widget.countLabel.text,String(balance));
}
have=5;
const unrelated={data:{itemId:128},countLabel:{},labelShow:n=>String(n)};
update.call(unrelated);assert.equal(unrelated.countLabel.text,'5/20');
console.log(JSON.stringify({result:'PASS',checks:14,productionWrites:0,networkAttempts:0,scope:'item10 and item110 display labels only',nativeMethodExecuted:true}));
