'use strict';
const Module=require('node:module'),path=require('node:path');
const app=path.resolve(process.env.LOGIN_PRIVILEGE_APP_ROOT||'/linhhoasu/lhs/newServer');
const candidates={
  activity:path.resolve(process.env.LOGIN_PRIVILEGE_ACTIVITY_CANDIDATE),
  account:path.resolve(process.env.LOGIN_PRIVILEGE_ACCOUNT_CANDIDATE),
  activity9:path.resolve(process.env.LOGIN_PRIVILEGE_ACTIVITY9_CANDIDATE||path.join(app,'src/services/Activity9Service.js')),
  compat:path.resolve(process.env.LOGIN_PRIVILEGE_COMPAT_CANDIDATE||path.join(app,'src/handlers/compat.js')),
  recharge:path.resolve(process.env.LOGIN_PRIVILEGE_RECHARGE_CANDIDATE||path.join(app,'src/handlers/recharge.js')),
  rechargeBenefit:path.resolve(process.env.LOGIN_PRIVILEGE_RECHARGE_BENEFIT_CANDIDATE||path.join(app,'src/services/RechargeBenefitService.js')),
};
const targets={
  activity:path.resolve(app,'src/handlers/activity.js'),
  account:path.resolve(app,'src/handlers/account.js'),
  activity9:path.resolve(app,'src/services/Activity9Service.js'),
  compat:path.resolve(app,'src/handlers/compat.js'),
  recharge:path.resolve(app,'src/handlers/recharge.js'),
  rechargeBenefit:path.resolve(app,'src/services/RechargeBenefitService.js'),
};
const original=Module._load;
function sameRequest(request,target){const raw=path.resolve(String(request));return raw===target||raw+'.js'===target}
Module._load=function(request,parent,isMain){
  let resolved='';try{resolved=path.resolve(Module._resolveFilename(request,parent,isMain))}catch(_error){}
  if(resolved===targets.activity||sameRequest(request,targets.activity))return original.call(this,candidates.activity,parent,isMain);
  if(resolved===targets.account||sameRequest(request,targets.account))return original.call(this,candidates.account,parent,isMain);
  if(resolved===targets.activity9||sameRequest(request,targets.activity9))return original.call(this,candidates.activity9,parent,isMain);
  if(resolved===targets.compat||sameRequest(request,targets.compat))return original.call(this,candidates.compat,parent,isMain);
  if(resolved===targets.recharge||sameRequest(request,targets.recharge))return original.call(this,candidates.recharge,parent,isMain);
  if(resolved===targets.rechargeBenefit||sameRequest(request,targets.rechargeBenefit))return original.call(this,candidates.rechargeBenefit,parent,isMain);
  if(parent){const parentFile=path.resolve(parent.filename||'');
    if(parentFile===candidates.activity){
      if(request==='../services/Activity9Service')return original.call(this,candidates.activity9,parent,isMain);
      if(request.startsWith('../')||request.startsWith('./'))return original.call(this,path.resolve(app,'src/handlers',request),parent,isMain);
    }
    if(parentFile===candidates.account){
      if(request==='../services/Activity9Service')return original.call(this,candidates.activity9,parent,isMain);
      if(request==='./activity')return original.call(this,candidates.activity,parent,isMain);
      if(request.startsWith('../')||request.startsWith('./'))return original.call(this,path.resolve(app,'src/handlers',request),parent,isMain);
    }
    if(parentFile===candidates.activity9&&request==='./ConfigService')return original.call(this,path.resolve(app,'src/services/ConfigService.js'),parent,isMain);
    if(parentFile===candidates.compat){
      if(request==='../services/Activity9Service')return original.call(this,candidates.activity9,parent,isMain);
      if(request==='../services/RechargeBenefitService')return original.call(this,candidates.rechargeBenefit,parent,isMain);
      if(request.startsWith('../')||request.startsWith('./'))return original.call(this,path.resolve(app,'src/handlers',request),parent,isMain);
    }
    if(parentFile===candidates.recharge){
      if(request==='../services/Activity9Service')return original.call(this,candidates.activity9,parent,isMain);
      if(request==='../services/RechargeBenefitService')return original.call(this,candidates.rechargeBenefit,parent,isMain);
      if(request.startsWith('../')||request.startsWith('./'))return original.call(this,path.resolve(app,'src/handlers',request),parent,isMain);
    }
    if(parentFile===candidates.rechargeBenefit){
      if(request==='./Activity9Service')return original.call(this,candidates.activity9,parent,isMain);
      if(request.startsWith('../')||request.startsWith('./'))return original.call(this,path.resolve(app,'src/services',request),parent,isMain);
    }
  }
  return original.call(this,request,parent,isMain);
};
