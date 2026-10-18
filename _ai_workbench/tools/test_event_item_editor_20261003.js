const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(process.env.EVENT_ADMIN_JS || 'linhhoasu/webgame/gm/assets/js/admin.js', 'utf8');
const nodes = {};
function $(selector) {
    if (!nodes[selector]) {
        const n = { value: '', content: '', handlers: {}, props: {},
            val(v) { if (v === undefined) return this.value; this.value = v; return this; },
            html(v) { if (v === undefined) return this.content; this.content = v; return this; },
            text(v) { this.content = v; return this; },
            prop(k,v) { this.props[k] = v; return this; },
            after() { return this; }, removeAttr() { return this; }, trigger() { return this; },
            on(k,fn) { this.handlers[k] = fn; return this; },
            empty() { this.content = ''; return this; }, append(v) { this.content += v; return this; }
        };
        nodes[selector] = n;
    }
    return nodes[selector];
}
const ctx = { $, window: {}, document: {getElementById: () => ({scrollIntoView(){}})},
    Swal: {fire(){}}, formatMoney: String, rewardCardHtml: (id, count) => `${id}:${count}` };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('    var rechargeEventTiers = [];'), source.indexOf('    function loadLuckyWheelHistory()')), ctx);
const run = code => vm.runInContext(code, ctx);
run('rechargeEventTiers = [{amount:100000,items:{1:10000000,1001:5000,22006:1}},{amount:300000,items:{1:10000000,1001:10000}}]');
const submit = () => nodes['#addRechargeEventTier'].handlers.click();
ctx.window.editRechargeEventItem(0, '1001');
assert.equal($('#recharge_event_item').val(), 'item_1001');
$('#recharge_event_item_amount').val('6000'); submit();
assert.equal(run('rechargeEventTiers[0].items[1001]'),6000);
assert.equal(run('rechargeEventTiers[0].items[1]'),10000000);
assert.equal(run('rechargeEventTiers[1].items[1001]'),10000);
ctx.window.editRechargeEventItem(0,'22006'); $('#recharge_event_item').val('item_22011'); submit();
assert.equal(run('rechargeEventTiers[0].items[22006]'),undefined);
assert.equal(run('rechargeEventTiers[0].items[22011]'),1);
ctx.window.editRechargeEventItem(0,'22011'); $('#recharge_event_item').val('item_1'); submit();
assert.equal(run('rechargeEventTiers[0].items[1]'),10000000);
assert.notEqual(run('rechargeEventItemEdit'),null);
nodes['#cancelRechargeEventItemEdit'].handlers.click();
ctx.window.removeRechargeEventItem(0,'1001');
assert.equal(run('rechargeEventTiers[0].items[1001]'),undefined);
assert.equal(run('rechargeEventTiers.length'),2);
ctx.window.editRechargeEventItem(1,'1001'); ctx.window.removeRechargeEventTier(0);
$('#recharge_event_item_amount').val(11000); submit();
assert.equal(run('rechargeEventTiers[0].items[1001]'),11000);
ctx.window.removeRechargeEventItem(0,'1'); ctx.window.removeRechargeEventItem(0,'1001');
assert.equal(run('rechargeEventTiers.length'),1);
let warnings = 0; ctx.Swal.fire=()=>warnings++;
nodes['#rechargeEventForm'].handlers.submit({preventDefault(){}});
assert.equal(warnings,1);
$('#recharge_event_tier_amount').val(300000); $('#recharge_event_item').val('item_36'); $('#recharge_event_item_amount').val('1.5'); submit();
assert.equal(run('Object.keys(rechargeEventTiers[0].items).length'),0);
$('#recharge_event_item_amount').val(5); submit();
assert.equal(JSON.parse($('#recharge_event_tiers_json').val())[0].items[0].amount,5);
run('rechargeEventCache=[{id:5,title:"Running",edit_version:1,tiers:[{id:1,amount:100000,items:[{item_id:1,amount:5}]},{id:2,amount:300000,items:[{item_id:65,amount:1}]}]}]');
ctx.showDonateEditor=()=>{};
ctx.window.editRechargeEvent(5);
assert.deepEqual(JSON.parse(run('JSON.stringify(eventTierJson().map(function(t){return t.id;}))')), [1,2]);
$('#recharge_event_tier_amount').val(50000); $('#recharge_event_item').val('item_4'); $('#recharge_event_item_amount').val(2); submit();
assert.deepEqual(JSON.parse(run('JSON.stringify(eventTierJson().map(function(t){return t.id;}))')), [0,1,2]);
ctx.window.removeRechargeEventTier(0);
assert.deepEqual(JSON.parse(run('JSON.stringify(eventTierJson().map(function(t){return t.id;}))')), [1,2]);
ctx.window.editRechargeEventItem(0,'1'); $('#recharge_event_item_amount').val(8); submit();
assert.equal(JSON.parse($('#recharge_event_tiers_json').val())[0].id,1);
console.log('PASS: edit quantity, replace ID, collision guard, cancel, per-item delete, other-tier preservation, stable edit after tier removal, empty-tier save guard, integer validation, serialized payload, stable claimed-tier IDs after loading/inserting/removing/editing. No network/DB writes.');
