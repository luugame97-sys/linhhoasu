'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),rules=JSON.parse(fs.readFileSync(path.join(root,'app/src/config/fishingBalance.json')));
let source=fs.readFileSync(path.join(root,'main.js'),'utf8');const changes=[];
function patch(marker,work){const at=source.indexOf(marker);assert(at>=0,marker);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const before=source.slice(n.start,n.end),after=work(before);assert.notEqual(after,before,marker);source=source.slice(0,n.start)+after+source.slice(n.end);changes.push(marker);}
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
const req=prefix=>'{requestId:"'+prefix+'_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(this.fishInfo.balanceRevision||0)}';
patch('u.sendRodRefine=function',s=>{
 s=once(s,'this.Rpc(4012,null,','this.Rpc(4012,'+req('wash')+',');
 s=once(s,'function(t){','function(t){t&&t.balanceRevision!=null&&(e.fishInfo.balanceRevision=t.balanceRevision);');
 return s;
});
patch('u.sendRodSwitchAttr=function',s=>{
 s=once(s,'this.Rpc(4013,null,','this.Rpc(4013,'+req('replace')+',');
 s=once(s,'function(t){','function(t){t&&t.balanceRevision!=null&&(e.fishInfo.balanceRevision=t.balanceRevision);');
 return once(s,'e.fishInfo.rodAttrs=e.fishInfo.rodTempAttrs,e.fishInfo.rodTempAttrs=[]','e.fishInfo.rodAttrs=t.rodAttrs||e.fishInfo.rodTempAttrs,e.fishInfo.rodTempAttrs=t.rodTempAttrs||[]');
});
patch('p.sendOpenBox=function',s=>{
 s=once(s,'function(t,e){','function(t,e){var b=this;');
 s=once(s,'{itemId:t,count:e}','{itemId:t,count:e,requestId:"box_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(this.fishInfo.balanceRevision||0)}');
 return once(s,'function(t){','function(t){t&&t.balanceRevision!=null&&(b.fishInfo.balanceRevision=t.balanceRevision);');
});
patch('m.sendUseItem=function',s=>{
 s=once(s,'this.Rpc(1300,t,','[94821,94822,94823,94824,94825].indexOf(s)>=0&&(t.requestId="box_"+Date.now()+"_"+Math.floor(Math.random()*1e9),t.expectedRevision=Number(Y.FishingModel.fishInfo.balanceRevision||0)),this.Rpc(1300,t,');
 return once(s,'function(t){','function(t){t&&t.balanceRevision!=null&&(Y.FishingModel.fishInfo.balanceRevision=t.balanceRevision);');
});
// Only backed/implemented wash effects may be selected by auto-wash filters.
patch('Gye.Init=function',s=>once(s,'1==Y.Config.FishWashAttrDescConfig[e].isWash',JSON.stringify(rules.wash.attributes.map(r=>r.type))+'.indexOf(Number(e))>=0'));
const boxClass='i(i4e,gWe=n)',classStart=source.indexOf(boxClass);assert(classStart>0);
let classEnd=source.indexOf('t(e6=i4e,"OldTrekFishBoxUseView")',classStart);assert(classEnd>classStart);
let box=source.slice(classStart,classEnd);
box=once(box,'1==t[e].privilegeItemShow&&','(1==t[e].privilegeItemShow||Y.ItemModel.GetItemCount(t[e].id)>0)&&');
box=once(box,'isLock:1!=t[e].privilegeItemShow','isLock:1!=t[e].privilegeItemShow&&Y.ItemModel.GetItemCount(t[e].id)<=0');
box=once(box,'maxNum:Y.ItemModel.GetItemCount(this.selectId)||1','maxNum:Math.min('+rules.boxes.maxPerRequest+',Y.ItemModel.GetItemCount(this.selectId)||1)');
const boxDescriptions=Object.fromEntries(Object.entries(rules.boxes.pools).map(([id,pool])=>{
 const pct=item=>pool.find(r=>r.id===item).weight/100;
 const shard=pool.find(r=>r.id>=190001&&r.id<=190005);
 return [id,'Bảng riêng · 1 quà/hộp · Không bảo hiểm.\nMảnh '+shard.weight/100+'% · Nguyên bảo '+pct(1)+'% · Bánh bao '+pct(4)+'%\nTăng tốc '+pct(6)+'% · Bạc '+pct(2)+'%'];
}));
box=once(box,'this.labBoxDesc.textFlow=B.generateTextFlowByLangId(s.desc)',
 'this.labBoxDesc.width=540,this.labBoxDesc.height=66,this.labBoxDesc.size=18,this.labBoxDesc.lineSpacing=2,this.labBoxDesc.textAlign="center",this.labBoxDesc.verticalCenter=-128,this.labBoxDesc.textFlow=Cc.generateTextFlow(('+JSON.stringify(boxDescriptions)+')[this.selectId]||"")');
source=source.slice(0,classStart)+box+source.slice(classEnd);changes.push('OldTrekFishBoxUseView rates/owned boxes');
const tree=acorn.parse(source,{ecmaVersion:'latest'}),edits=[];
const messages={FISH_ENERGY_NOT_ENOUGH:'Không đủ Đùi Gà cho lượt câu đã chọn.',FISH_PENDING:'Bạn còn cá chờ xử lý. Hãy giữ hoặc bán trước khi câu tiếp.',FISH_SCENE_LOCKED:'Khu câu chưa đủ điều kiện mở.',FISH_COUNT_INVALID:'Số lượt câu không hợp lệ.',FISH_BAIT_INVALID:'Mồi hoặc danh sách mồi không hợp lệ.',FISH_ORDER_TICKET_NOT_ENOUGH:'Không đủ Vé làm mới đơn (ID70).',FISH_ORDER_ALREADY_CLAIMED:'Đơn đã nhận thưởng, không thể làm mới.',FISH_ORDER_STALE:'Đơn đã thay đổi. Vui lòng mở lại.',FISH_SOUL_DATA_INVALID:'Linh hồn được giữ nguyên để kiểm tra dữ liệu.',FISH_SOUL_RESERVE_FULL:'Kho dự phòng linh hồn đầy; cá chưa bị xóa.',FISH_WASH_STONE_NOT_ENOUGH:'Cần 10 Thiên Thanh Thạch để tẩy thuộc tính.',FISH_WASH_PREVIEW_MISSING:'Chưa có thuộc tính tẩy chờ thay thế.',FISH_CLIENT_UPDATE_REQUIRED:'Vui lòng tải lại game để dùng phiên bản cân bằng mới.',FISH_BALANCE_STALE:'Dữ liệu đã thay đổi. Vui lòng thử lại; chưa trừ vật phẩm.',FISH_REQUEST_CONFLICT:'Yêu cầu trùng không hợp lệ; chưa trừ vật phẩm.',FISH_BALANCE_CONFIG_INVALID:'Bảng cân bằng chưa hợp lệ; vật phẩm được giữ nguyên.',FISH_BOX_INVALID:'Hộp hoặc số lượng không hợp lệ (1–100).',FISH_BOX_NOT_ENOUGH:'Không đủ số hộp đã chọn.',FISH_BOX_REWARD_UNAVAILABLE:'Chưa cấp được phần thưởng; hộp được giữ nguyên.'};
function walk(n){if(!n||typeof n!=='object')return;
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='showTips'&&n.arguments.length===1){const a=n.arguments[0],text=source.slice(a.start,a.end);if(text.includes('Chức năng này tạm khóa để bảo toàn cá và vật phẩm.')){const match=/\[([\w$]+)\.reason\]/.exec(text);assert(match,text.slice(0,100));const p=match[1];edits.push({start:a.start,end:a.end,text:'('+JSON.stringify(messages)+')['+p+'.reason]||"Thao tác chưa hoàn tất. Vui lòng kiểm tra lại điều kiện."'});}}
 for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
walk(tree);assert.equal(edits.length,24);
for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
// Guard must also stop auto-wash after a failed debit/config/revision check.
for(const marker of ['u.sendRodRefine=function','u.sendRodSwitchAttr=function'])patch(marker,s=>once(s,'Y.FishingModel.isAutoFish=false;','typeof $D!=="undefined"&&($D.isOpen=false);Y.FishingModel.isAutoFish=false;'));
acorn.parse(source,{ecmaVersion:'latest'});
fs.writeFileSync(path.join(root,'main.fixed.js'),source);fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({changes,correctedErrorMessages:edits.length,rates:boxDescriptions},null,2)+'\n');console.log(JSON.stringify({result:'PASS',changes:changes.length,correctedErrorMessages:edits.length}));
