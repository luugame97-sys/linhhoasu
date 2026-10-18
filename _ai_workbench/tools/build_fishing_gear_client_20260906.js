'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]);let source=fs.readFileSync(path.join(root,'main.js'),'utf8');const changes=[];
function patch(marker,fn,after=0){const at=source.indexOf(marker,after);assert(at>=0,marker);let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const before=source.slice(n.start,n.end),next=fn(before);assert.notEqual(next,before,marker);source=source.slice(0,n.start)+next+source.slice(n.end);changes.push(marker);}
function once(s,from,to){assert.equal(s.split(from).length-1,1,from);return s.replace(from,to);}
for(const [kind,name,tag,event]of [['rod','Rod',4010,'FISH_ROD_PANEL_UPDATE'],['raft','Raft',4015,'FISH_RAFT_UPGRADE_UPDATE']]){
 patch('u.send'+name+'Upgrade=function',s=>{
  s=once(s,'function(t){var e=this;','function(t,a){var e=this;');
  s=once(s,'{upgradeAll:t}','{upgradeAll:t,action:a||(t?"fast":"level"),requestId:"gear_'+kind+'_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(this.fishInfo.balanceRevision||0),expectedState:{rank:this.fishInfo.'+kind+'Rank,level:this.fishInfo.'+kind+'Level,exp:this.fishInfo.'+kind+'Exp}}');
  const sync='t&&t.balanceRevision!=null&&(e.fishInfo.balanceRevision=t.balanceRevision);if(t&&t.result!==0&&t.rank!=null&&t.level!=null&&t.exp!=null){e.fishInfo.'+kind+'Rank=t.rank;e.fishInfo.'+kind+'Level=t.level;e.fishInfo.'+kind+'Exp=t.exp;A.ins().dispatch(E.'+event+');}';
  return once(s,'function(t){','function(t){'+sync);
 });
}
patch('a.onClickGradeUp=function',s=>once(s,'sendRodUpgrade(!1)','sendRodUpgrade(!1,"grade")'),source.indexOf('i(Qgt,'));
patch('a.onClick=function',s=>once(s,'Y.FishingModel.sendRaftUpgrade(!1));break;case this.btnBuy','Y.FishingModel.sendRaftUpgrade(!1,"grade"));break;case this.btnBuy'),source.indexOf('i(Xgt,'));
patch('a.updateViewUI=function',s=>once(s,
 'var m=t.rodLevel>=s.level&&o?o:s,v=t.rodLevel>=s.level?1:t.rodLevel+1',
 'var m=n&&o?o:s,v=n&&o?1:O.min(s.level,t.rodLevel+1)'),source.indexOf('i(Qgt,'));
patch('a.getLevelUpListData=function',s=>once(s,
 'var a=i.raftLevel>=t.level&&e?e:t,s=i.raftLevel>=t.level?1:i.raftLevel+1',
 'var a=i.raftLevel>=t.level&&i.raftExp>=t.exp&&e?e:t,s=i.raftLevel>=t.level&&i.raftExp>=t.exp&&e?1:O.min(t.level,i.raftLevel+1)'),source.indexOf('i(Xgt,'));
const messages={FISH_GEAR_ACTION_INVALID:'Thao tác nâng không hợp lệ. Vui lòng tải lại game.',FISH_GEAR_STATE_REQUIRED:'Vui lòng tải lại game để đồng bộ cần/bè.',FISH_GEAR_STALE:'Cấp hoặc kinh nghiệm đã đổi; chưa trừ vật phẩm. Vui lòng thử lại.',FISH_GEAR_MAX:'Cần/bè đã đạt tối đa, không thể nâng thêm.',FISH_GEAR_NOT_READY:'Cần đạt trần cấp và đầy kinh nghiệm trước khi nâng bậc.',FISH_GEAR_GRADE_REQUIRED:'Đã sẵn sàng lên bậc. Hãy bấm Nâng bậc để dùng tinh thể.',FISH_GEAR_FUNDS_NOT_ENOUGH:'Không đủ Ngư Tệ hoặc tinh thể cho thao tác đã chọn.',FISH_GEAR_STATE_INVALID:'Dữ liệu cần/bè chưa hợp lệ; giữ nguyên để kiểm tra.',FISH_GEAR_CONFIG_INVALID:'Cấu hình nâng chưa hợp lệ; không trừ vật phẩm.'};
messages.FISH_GEAR_LOCKED='Tính năng cần/bè chưa được mở trên nhân vật này.';
const ast=acorn.parse(source,{ecmaVersion:'latest'}),edits=[];
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ObjectExpression'&&n.properties.some(p=>p.key?.value==='FISH_ENERGY_NOT_ENOUGH'))edits.push(n.start+1);for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
walk(ast);assert.equal(edits.length,24);const entries=JSON.stringify(messages).slice(1,-1)+',';
for(const at of edits.sort((a,b)=>b-a))source=source.slice(0,at)+entries+source.slice(at);
acorn.parse(source,{ecmaVersion:'latest'});fs.writeFileSync(path.join(root,'main.fixed.js'),source);fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({changes,errorMaps:edits.length,explicitGrade:true,previewAtPartialCap:true},null,2)+'\n');console.log(JSON.stringify({result:'PASS',changes:changes.length,errorMaps:edits.length}));
