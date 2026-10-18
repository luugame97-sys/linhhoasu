const fs=require('fs');
const p=require('path').resolve(__dirname,'..','temp','ui_freeze_20261013','lhs-artifact-forge-cn.js');
const s=fs.readFileSync(p,'utf8');
if(s.includes('var originalList = model.getAllCanForgeArtifact')) throw new Error('CN list override must remain native');
if(!s.includes('getArtifactFitSkillGroupIdByData')) throw new Error('CN fit mapping missing');
if(!s.includes('model.checkArtifactCanForge')) throw new Error('checkArtifactCanForge hook missing');
console.log(JSON.stringify({pass:true,bytes:Buffer.byteLength(s),nativeListLogic:true,fitMapping:true}));
