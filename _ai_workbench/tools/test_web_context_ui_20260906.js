'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidate = path.resolve(process.argv[2] || '_ai_workbench/temp/web_multiserver_20260906/candidate');
let passed = 0;
function check(name, run) { run(); passed++; process.stdout.write('PASS ' + name + '\n'); }

let prefilter, notices = 0, reloads = 0, closes = 0;
const neverResolved = new Promise(() => {});
function jquery(selector) {
    return { attr: () => selector.includes('lhs-web-context') ? 'context_s1' : 'csrf_s1' };
}
jquery.ajaxPrefilter = callback => { prefilter = callback; };
const location = { protocol: 'https:', host: 'web.example.test', reload: () => { reloads++; } };
const window = { location, Swal: { fire: () => { notices++; return neverResolved; }, close: () => { closes++; } } };
const document = { createElement: () => ({
    set href(value) { const parsed = new URL(value, 'https://web.example.test/gm/index.php'); Object.assign(this, {protocol:parsed.protocol, host:parsed.host, pathname:parsed.pathname}); }
}) };
vm.runInNewContext(fs.readFileSync(path.join(candidate, 'assets/js/web-context.js'), 'utf8'), { window, document, jQuery: jquery });
function request(url) {
    const xhr = { headers: {}, doneHandlers: [], failHandlers: [], aborted: false,
        setRequestHeader(key, value) { this.headers[key] = value; },
        done(callback) { this.doneHandlers.push(callback); }, fail(callback) { this.failHandlers.push(callback); },
        abort() { this.aborted = true; }
    };
    prefilter({ url }, {}, xhr); return xhr;
}
check('player request includes rendered context and CSRF', () => {
    assert.deepEqual(request('api/user_api.php').headers, { 'X-CSRF-Token':'csrf_s1', 'X-LHS-Context':'context_s1' });
});
check('admin request includes identical page binding', () => {
    assert.equal(request('/gm/admin/admin_api.php').headers['X-LHS-Context'], 'context_s1');
});
check('foreign origin never receives context or CSRF', () => {
    assert.deepEqual(request('https://foreign.example.test/gm/api/user_api.php').headers, {});
});
check('unrelated same-origin request receives no extra context', () => {
    assert.deepEqual(request('/gm/api/item_icon.php').headers, {});
});
check('player/admin remove unscoped global AJAX headers', () => {
    for (const name of ['index.php','admin/index.php']) assert(!fs.readFileSync(path.join(candidate,name),'utf8').includes('$.ajaxSetup('));
});
check('all native logout forms include a page context token',()=>{
    let forms=0;
    for(const file of ['index.php','admin/index.php']) {
        const html=fs.readFileSync(path.join(candidate,file),'utf8');
        for(const match of html.matchAll(/<form\b[\s\S]*?<\/form>/g)) {
            if(!match[0].includes('name="action" value="logout"'))continue;
            assert(match[0].includes('name="csrf_token"'));assert(match[0].includes('name="web_context_token"'));forms++;
        }
    }
    assert.equal(forms,3);
});
check('normal API response does not expire page', () => {
    request('api/user_api.php').doneHandlers[0]({status:'success'}); assert.equal(window.lhsWebContext.isExpired(), false);
});
check('stale page shows one reload prompt and never replays', () => {
    request('api/user_api.php').doneHandlers[0]({status:'error',context_changed:1,reload_required:1});
    assert.equal(window.lhsWebContext.isExpired(), true); assert.equal(notices, 1); assert.equal(reloads, 0);
    assert.equal(request('api/user_api.php').aborted, true);
    window.lhsWebContext.handleResponse({reload_required:1}); window.Swal.fire('generic error'); assert.equal(notices, 1);
});
check('legacy callback cannot close stale-context reload warning', () => {
    window.Swal.close(); assert.equal(closes,0);
});

// Exercise the actual pending-delivery retry function with transport captured.
const indexSource = fs.readFileSync(path.join(candidate, 'assets/js/index.js'), 'utf8');
const retryFunction = indexSource.slice(indexSource.indexOf('function retryPendingReward(button) {'), indexSource.indexOf("\n$('.menu-btn').on('click'"));
assert(retryFunction.startsWith('function retryPendingReward'));
const posts = [];
let readRefreshes = 0;
const retryState = { loading:false, retrying:{} };
function retryJquery(value) { return { attr: name => value[name], prop: () => {} }; }
retryJquery.post = (url, data, callback) => {
    const record = {url,data,callback}; posts.push(record);
    return {fail(fn) { record.fail = fn; return this; }, always(fn) {record.always = fn; return this;}};
};
const retrySandbox = {window:{lhsWebContext:{isExpired:()=>false,handleResponse:()=>false}}, $:retryJquery,
    pendingRewardsState:retryState, parseInt, appToast:()=>{}, markGiftcodeClaimed:()=>{},
    loadPendingRewards:()=>{readRefreshes++;}, refreshRechargeStatus:()=>{}, Swal:{fire:()=>{}}};
vm.runInNewContext(retryFunction, retrySandbox);
check('recharge retry uses delivery ID only, never current milestone period', () => {
    retrySandbox.retryPendingReward({'data-kind':'recharge','data-delivery-id':'17'});
    assert.equal(posts.length, 1); assert.equal(posts[0].data.action, 'claim_recharge_milestone');
    assert.equal(posts[0].data.delivery_id,17); assert.deepEqual(Object.keys(posts[0].data), ['action','delivery_id']);
});
check('double-click cannot submit concurrent retry for same delivery', () => {
    retrySandbox.retryPendingReward({'data-kind':'recharge','data-delivery-id':'17'}); assert.equal(posts.length, 1);
});
check('ambiguous retry response refreshes list only, no automatic resubmit', () => {
    posts[0].fail(); posts[0].always(); assert.equal(posts.length,1); assert.equal(readRefreshes,1);
    assert.equal(retryState.retrying[17], undefined);
});
check('gift retry uses immutable delivery id and permitted action', () => {
    retrySandbox.retryPendingReward({'data-kind':'giftcode','data-delivery-id':'19'});
    assert.equal(posts[1].data.action,'submit_giftcode'); assert.equal(posts[1].data.delivery_id,19);
    posts[1].callback({status:'success',pending:true}); posts[1].always(); assert.equal(posts.length,2);
});
check('unknown delivery kind cannot dispatch API mutation', () => {
    retrySandbox.retryPendingReward({'data-kind':'other','data-delivery-id':'22'}); assert.equal(posts.length,2);
});
check('stale page cannot retry pending delivery', () => {
    retrySandbox.window.lhsWebContext.isExpired = () => true;
    retrySandbox.retryPendingReward({'data-kind':'giftcode','data-delivery-id':'23'}); assert.equal(posts.length,2);
});

const executeFunction = indexSource.slice(indexSource.indexOf('function executeForm(form, btn){'), indexSource.indexOf('\nfunction checkUserStatus(){'));
function exerciseForm(action, response, networkFailure) {
    let request, marked=0, refreshed=0, confetti=0;
    const button={length:1,disabled:false,markup:'Nhận',prop(key,value){if(arguments.length===1)return this[key];this[key]=value;return this;},
        html(value){if(!arguments.length)return this.markup;this.markup=value;return this;},text(value){this.markup=value;return this;},
        removeClass(){return this;},addClass(){return this;}};
    const valueField={val:()=>action};
    const form={find:selector=>selector.includes('action')?valueField:selector==='button'?button:{val:()=> 'QA_GIFT'},serialize:()=> 'action='+action,
        hasClass:()=>false,0:{reset:()=>{}}};
    function jq(value){if(value===button)return button;return {val:()=>{},text:()=>{}};}
    jq.post=(url,data,callback)=>{request={callback};return {fail(fn){request.fail=fn;return this;},always(fn){request.always=fn;return this;}};};
    const sandbox={window:{lhsWebContext:{isExpired:()=>false,handleResponse:()=>false}},$:jq,parseInt,Array,
        appLoading:()=>{},appToast:()=>{},triggerConfetti:()=>{confetti++;},setCurrentXuWeb:()=>{},
        markGiftcodeClaimed:()=>{marked++;},loadPendingRewards:()=>{refreshed++;},refreshRechargeStatus:()=>{},
        Swal:{close:()=>{},fire:()=>{}}};
    vm.runInNewContext(executeFunction,sandbox);sandbox.executeForm(form,button);
    if(networkFailure)request.fail();else request.callback(response);request.always();
    return {button,marked,refreshed,confetti};
}
check('failed daily claim releases button for an explicit safe retry',()=>{
    assert.equal(exerciseForm('claim_daily_checkin',{status:'error',message:'QA error'}).button.disabled,false);
});
check('daily network failure releases button without auto retry',()=>{
    assert.equal(exerciseForm('claim_daily_checkin',null,true).button.disabled,false);
});
check('confirmed daily success remains disabled',()=>{
    assert.equal(exerciseForm('claim_daily_checkin',{status:'success'}).button.disabled,true);
});
check('pending milestone keeps original button closed and refreshes saved delivery',()=>{
    const result=exerciseForm('claim_recharge_milestone',{status:'success',pending:true,delivered:false});
    assert.equal(result.button.disabled,true);assert.equal(result.refreshed,1);assert.equal(result.confetti,0);
});
check('pending gift is not marked delivered and permits a different code',()=>{
    const result=exerciseForm('submit_giftcode',{status:'success',pending:true,delivered:false,code_claimed:'QA_GIFT'});
    assert.equal(result.marked,0);assert.equal(result.button.disabled,false);assert.equal(result.refreshed,1);
});
check('gift is marked claimed only after explicit delivery confirmation',()=>{
    const result=exerciseForm('submit_giftcode',{status:'success',pending:false,delivered:true,code_claimed:'QA_GIFT'});
    assert.equal(result.marked,1);assert.equal(result.refreshed,1);
});
process.stdout.write(JSON.stringify({status:'PASS', checks:passed, candidate}) + '\n');
