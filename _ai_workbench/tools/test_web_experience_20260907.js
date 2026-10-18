'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve('_ai_workbench/temp/web_admin_upgrade_20260907/candidate');let checks=0;
function check(name,fn){fn();checks++;process.stdout.write('PASS '+name+'\n');}
const code=fs.readFileSync(path.join(root,'assets/js/web-experience.js'),'utf8');
let listeners={},classes=new Set(),tick,perf=0,clock={textContent:'',getAttribute:()=> 'day',classList:{add(){}}},button;
const documentScroller={scrollTop:250,scrollTo(o){this.scrollTop=o.top;}};
const panel={nodeType:1,scrollTop:300,scrollHeight:1000,clientHeight:300,scrollTo(o){this.scrollTop=o.top;}};
const document={scrollingElement:documentScroller,body:{appendChild(b){button=b;}},createElement(){return{setAttribute(){},classList:{toggle(c,v){if(v)classes.add(c);else classes.delete(c);}},addEventListener(n,f){listeners[n]=f;}};},addEventListener(n,f){listeners[n]=f;},querySelectorAll(s){return s==='[data-reset-period]'?[clock]:[];},getElementById(){return{textContent:JSON.stringify({server_now:1000,day:61000})};}};
const window={matchMedia:()=>({matches:true}),scrollTo(){},setInterval(f){tick=f;}};
vm.runInNewContext(code,{document,window,performance:{now:()=>perf},getComputedStyle:()=>({overflowY:'auto'}),Set,Array,String,Number,Math,JSON});
check('button visible when page scrolled',()=>assert(classes.has('is-visible')));
check('countdown uses server clock not local wall time',()=>assert(clock.textContent.includes('00:01:00')));
listeners.scroll({target:panel});listeners.click();check('back-top scrolls nested panel and page',()=>assert(documentScroller.scrollTop===0&&panel.scrollTop===0));
perf=61000;tick();check('expired countdown asks refresh without negative time',()=>assert(clock.textContent.includes('Đã sang kỳ mới')));
const admin=fs.readFileSync(path.join(root,'admin/index.php'),'utf8'),js=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8'),extra=fs.readFileSync(path.join(root,'assets/js/admin-management.js'),'utf8');
check('single admin server selector',()=>assert(admin.includes('id="adminServerSwitch"')&&!admin.includes('id="userServerFilter"')));
check('status buttons and finance panel exist',()=>assert(admin.includes('data-log-status="error"')&&admin.includes('data-log-status="warning"')&&admin.includes('id="sepayFinancialSummary"')));
check('gift creation exposes timezone and expiry input',()=>assert(admin.includes('name="expire_at"')&&admin.includes('Hết hạn lúc (GMT+7)')));
check('stale search replies are discarded',()=>assert(js.includes('requestNo!==userListRequestNo')));
check('GM uses identified recipient and immutable serialized payload',()=>assert(js.includes('gmPayload=$form.serialize()')&&js.includes('liveTarget.role_id!==target.role_id')));
check('admin UI revision header restricted to same origin',()=>assert(extra.includes("target.origin===window.location.origin")&&extra.includes('X-LHS-Admin-UI')));
for(const file of ['index.php','login.php']){const text=fs.readFileSync(path.join(root,file),'utf8');check(file+' user branding hides WebGM labels',()=>assert(!/WebGM|GM Panel|Công cụ GM/.test(text.replace(/<!--[\s\S]*?-->/g,''))&&text.includes('Web quản lý tài khoản Linh Họa Sư')));}
process.stdout.write(JSON.stringify({result:'PASS',checks})+'\n');
