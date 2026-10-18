'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]);let source=fs.readFileSync(path.join(root,'main.js'),'utf8');const changes=[];
function patch(marker,work){const at=source.indexOf(marker);assert(at>=0,marker);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const old=source.slice(n.start,n.end),next=work(old);assert.notEqual(next,old,marker);source=source.slice(0,n.start)+next+source.slice(n.end);changes.push(marker);}
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
patch('u.sendBaitBagUpdate=function',s=>once(s,'i.fishInfo.foodBag=e','i.fishInfo.foodBag=t.foodBag||e'));
patch('u.sendFishing=function',s=>once(s,'r.fishInfo.food=i.food,','r.fishInfo.food=i.food,r.fishInfo.foodBag=i.foodBag||r.fishInfo.foodBag,'));
patch('u.sendRefreshOrders=function',s=>once(s,'{index:e}','{index:e,expectedId:this.fishInfo.orders[e].id}'));
patch('p.sendFishSoulDeal=function',s=>{
 s=once(s,'this.Rpc(4061,null,','this.Rpc(4061,{integrityVersion:2},');
 s=once(s,'h.fishInfo.catchResult.infos=[]','h.fishInfo.catchResult=t.catchResult||{time:0,infos:[],escapes:[],items:[],sailItems:{}},h.fishInfo.fishSoulPic=t.pics||h.fishInfo.fishSoulPic,h.fishInfo.fishSoulReserveCount=t.reserveCount||0');
 // Discover all received souls, even when the better old soul stays equipped.
 s=once(s,'for(var a=0,s=t.infos;','for(var a=0,s=t.discovered||t.infos;');
 // Current native discovery loop was nested in infos.length>0; guarantee the ledger even with no upgrade.
 s=once(s,'A.ins().dispatch(E.OLD_TREK_GET_FISHING_REWARD,t.rewards)','A.ins().dispatch(E.OLD_TREK_FISH_SOUL_ILLUS_UPDATE),A.ins().dispatch(E.OLD_TREK_GET_FISHING_REWARD,t.rewards)');
 return s;
});
const tree=acorn.parse(source,{ecmaVersion:'latest'}),edits=[];
function walk(n){if(!n||typeof n!=='object')return;
 if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='showTips'&&n.arguments.length===1){const a=n.arguments[0],text=source.slice(a.start,a.end);if(text.includes('Chức năng này tạm khóa để bảo toàn cá và vật phẩm.')){
  const match=/^([\w$]+)\.reason/.exec(text);assert(match);const p=match[1];
  const messages={FISH_ENERGY_NOT_ENOUGH:'Không đủ Đùi Gà cho lượt câu đã chọn.',FISH_PENDING:'Bạn còn cá chờ xử lý. Hãy giữ hoặc bán cá trước khi câu tiếp.',FISH_SCENE_LOCKED:'Khu câu chưa đủ điều kiện mở.',FISH_COUNT_INVALID:'Số lượt câu không hợp lệ.',FISH_BAIT_INVALID:'Mồi đã hết hoặc danh sách mồi không hợp lệ. Vui lòng chọn lại.',FISH_ORDER_TICKET_NOT_ENOUGH:'Không đủ Vé làm mới đơn (ID70).',FISH_ORDER_ALREADY_CLAIMED:'Đơn hôm nay đã nhận thưởng, không thể làm mới.',FISH_ORDER_STALE:'Đơn đã thay đổi. Vui lòng mở lại bảng đơn.',FISH_SOUL_DATA_INVALID:'Dữ liệu linh hồn chưa hợp lệ; cá được giữ nguyên để kiểm tra.',FISH_SOUL_RESERVE_FULL:'Kho dự phòng linh hồn đã đầy; liên hệ quản trị. Cá chưa bị xóa.',FISH_WASH_CONFIG_UNVERIFIED:'Chưa có bảng giá trị tẩy thuộc tính chuẩn. Không tiêu hao Thiên Thanh Thạch.',FISH_SOUL_BOX_CONFIG_UNVERIFIED:'Chưa có tỷ lệ quà của hộp này. Hộp được giữ nguyên.'};
  edits.push({start:a.start,end:a.end,text:'('+JSON.stringify(messages)+')['+p+'.reason]||'+text});
 }}for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
walk(tree);assert.equal(edits.length,24);
for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
acorn.parse(source,{ecmaVersion:'latest'});fs.writeFileSync(path.join(root,'main.fixed.js'),source);
fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({changes,errorMessages:edits.length},null,2)+'\n');console.log(JSON.stringify({result:'PASS',changes:changes.length,errorMessages:edits.length}));
