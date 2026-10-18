const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const src = fs.readFileSync('linhhoasu/webgame/gm/assets/js/admin.js','utf8');
const php = fs.readFileSync('linhhoasu/webgame/gm/admin/index.php','utf8');
const nodes = new Map(); let opened, loadEvents=0, rendered='';
function $(key) {
  if (!nodes.has(key)) {
    const n = {value:'', props:{}, attrValue:{}, htmlValue:'', length:1,
      val(v){if(v===undefined)return this.value;this.value=v;return this;},
      prop(k,v){this.props[k]=v;return this;}, attr(k,v){if(v===undefined)return this.attrValue[k];this.attrValue[k]=v;return this;},
      text(v){this.textValue=v;return this;},html(v){this.htmlValue=v;if(key==='#milestoneTableBody')rendered=v;return this;},
      each(){return this;},on(){return this;},trigger(){return this;},find(){return this;},
      appendTo(){return this;},select2(){return this;},addClass(){return this;},removeClass(){return this;},toggleClass(){return this;},
      0:{reset(){}}
    };nodes.set(key,n);
  }return nodes.get(key);
}
$.each=(o,fn)=>Object.entries(o).forEach(([k,v])=>fn(k,v));$.fn={select2:true};
const data=['day','week','month','total'].map((p,i)=>({id:i+1,period_type:p,title:p+'_reward',reward_items:'{"1":5}',milestone_amount:100,sort_order:0,is_active:1}));
$.post=(url,input,done)=>done({status:'success',data});
const c={ $,document:{body:{},getElementById:id=>id},window:{},bootstrap:{Modal:{getOrCreateInstance:id=>({show(){opened=id;}})}},
  initAdminSelects(){},loadRechargeEvents(){loadEvents++;},updateMilestonePreview(){},milestoneItems:{},milestoneCache:[],
  rechargePeriodLabels:{day:'Ngày',week:'Tuần',month:'Tháng',total:'Tổng'},
  tableLoadingRow:()=>'',tableErrorRow:()=>'',tableEmptyRow:()=>'',rewardCardHtml:(id,n)=>id+':'+n,formatMoney:String,escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),initTooltips(){},
  rewardKeyToId:id=>String(id).replace(/^item_/,''),getAdminItemName:id=>'Item '+id,getAdminItemIcon:()=>'/icon.png',resolveItemImageUrl:x=>x};
vm.createContext(c);
vm.runInContext(src.slice(src.indexOf("var donateAdminPeriod = 'day'"),src.indexOf('function toggleMilestone')),c);
for(const p of ['day','week','month','total']){
 c.selectDonatePeriod(p);assert.match(rendered,new RegExp(p+'_reward'));
 for(const other of ['day','week','month','total'].filter(x=>x!==p))assert.doesNotMatch(rendered,new RegExp(other+'_reward'));
 c.openNewDonateMilestone();assert.equal($('#milestone_period_type').value,p);assert.equal(opened,'donateMilestoneModal');
}
c.selectDonatePeriod('event');assert.equal(loadEvents,1);assert.equal($('#donateMilestonePanel').props.hidden,true);assert.equal($('#tab-recharge-events-admin').props.hidden,false);
c.editMilestone(2);assert.equal(opened,'donateMilestoneModal');assert.equal($('#milestone_id').value,2);assert.equal($('#milestone_period_type').value,'week');assert.equal(c.milestoneItems.item_1,5);
assert.equal(JSON.stringify(c.normalizeDonateEditorItems('[{"item_id":65,"amount":10}]')),'{"item_65":10}');
assert.equal(JSON.stringify(c.normalizeDonateEditorItems('{"item_65":10}')),'{"item_65":10}');
assert.doesNotMatch(php,/data-tab="tab-recharge-events-admin"/);
assert.equal((php.match(/data-donate-period=/g)||[]).length,5);
assert.doesNotMatch(src.slice(src.indexOf('function editMilestone'),src.indexOf('function toggleMilestone')),/scrollTo|trigger\('click'\)/);
assert.doesNotMatch(src.slice(src.indexOf('window.editRechargeEvent'),src.indexOf('window.toggleRechargeEvent')),/scrollTo|trigger\('click'\)/);
assert.match(src,/donateEventModal'\)\)\.hide\(\)/);
console.log('PASS: 4 period filters/create defaults, nested event tab, modal edit identity/rewards, list/map compatibility, no scroll, save closes popup');
const gifts = Object.fromEntries(Array.from({length:12},(_,i)=>[String(i+1),i===0?50000000:i===1?50000:12345]));
const compact=c.donateCompactRewardsHtml(JSON.stringify(gifts),'Mốc <test>');
assert.equal((compact.match(/<img /g)||[]).length,4);
assert.match(compact,/\+8 vật phẩm/);assert.match(compact,/Xem đủ 12 quà/);
assert.match(compact,/×50M/);assert.match(compact,/×50K/);assert.match(compact,/×12\.345/);
const full=JSON.parse(decodeURIComponent(compact.match(/data-rewards="([^"]+)"/)[1]));
assert.equal(Object.keys(full).length,12);assert.equal(full.item_1,50000000);assert.equal(full.item_12,12345);
assert.match(compact,/Item item_12/);assert.match(compact,/Mốc &lt;test>/);
assert.match(c.donateCompactRewardsHtml('[]',''),/Chưa có quà/);
assert.match(c.donateCompactRewardsHtml('invalid',''),/Không đọc được quà/);
assert.equal((c.donateCompactRewardsHtml('[{"item_id":65,"amount":500}]','').match(/<img /g)||[]).length,1);
console.log('PASS: compact 4-icon limit, +8, exact quantities/tooltip, all 12 detail items, hidden-item search, escaped title, empty/malformed/list');
