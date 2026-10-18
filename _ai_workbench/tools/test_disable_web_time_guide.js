const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..','..');
const bundle=fs.readFileSync(path.join(root,'linhhoasu','webgame','game','js','main.min_a6195824.js'),'utf8');
const index=fs.readFileSync(path.join(root,'linhhoasu','webgame','game','index.html'),'utf8');
function assert(c,m){if(!c)throw new Error(m)}
assert(bundle.includes('AppInfo.ckState&&RuntimeUtil.isRuntime&&!this.isDuringGuide()'),'H5 time guide is not runtime-gated');
assert(!bundle.includes('AppInfo.ckState&&!this.isDuringGuide()'),'ungated time guide remains');
assert(/20260904_(?:task_guide_restore1|auto_equip_new_accounts1|auto_equip_fsm_v3|auto_delegate_clean_v4)/.test(index),'cache token mismatch');
let starts=0;const app={ckState:true};const runtime={isRuntime:false};const during=false;function shouldStart(){return app.ckState&&runtime.isRuntime&&!during};assert(!shouldStart(),'H5 must not auto-start idle guide');runtime.isRuntime=true;assert(shouldStart(),'native idle guide gate changed');
console.log('PASS H5 idle guide disabled, native idle guide preserved');
