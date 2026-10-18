'use strict';
const Module=require('module'),path=require('path');
const app=path.resolve(process.env.AUTO_EQUIP_APP_ROOT);
const redirects=new Map([
  [path.join(app,'src','services','EquipService.js'),path.join(app,'src','services','EquipService.auto-equip-candidate.js')],
  [path.join(app,'src','handlers','item.js'),path.join(app,'src','handlers','item.auto-equip-candidate.js')],
  [path.join(app,'src','services','MapMonsterService.js'),path.join(app,'src','services','MapMonsterService.density-candidate.js')],
]);
const original=Module._load;
Module._load=function(request,parent,isMain){
  let resolved='';try{resolved=Module._resolveFilename(request,parent,isMain)}catch(_e){}
  const target=redirects.get(resolved);
  if(target && !require('fs').existsSync(target))return original.call(this,request,parent,isMain);
  return target?original.call(this,target,parent,isMain):original.call(this,request,parent,isMain);
};
