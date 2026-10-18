'use strict';
// Read-only comparison: original CN reference, pre-auto-patch snapshot and current client.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const cp=require('child_process');
const root=path.resolve(__dirname,'../..');
const inputs={cnReference:'_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js',
 preAutoPatch:'_ai_workbench/temp/fishing_auto_20260906/main.js',
 current:'linhhoasu/webgame/game/js/main.min_a6195824.js'};
const output={at:new Date().toISOString(),readOnly:true,sources:{},limitations:'CN reference is the stored client copy, not verified official server source or current CN live behavior.'};
for(const [key,rel]of [...Object.entries(inputs),['deliveredArchive','server.zip!linhhoasu/webgame/game/js/main.min_a6195824.js']]){
 const bytes=key==='deliveredArchive'
  ? cp.execFileSync('python',['-c',"import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);sys.stdout.buffer.write(z.read('linhhoasu/webgame/game/js/main.min_a6195824.js'))",path.join(root,'server.zip')],{maxBuffer:30*1024*1024})
  : fs.readFileSync(path.join(root,rel));
 const s=bytes.toString('utf8');
 const row={file:rel,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),matches:[]};
 for(const needle of ['.backExit=function','.isNeedSlientMode=function','.updateFishMapRaidTime=function']){
  let at=-1,n=0;while((at=s.indexOf(needle,at+1))>=0&&n++<4)row.matches.push({needle,offset:at,code:s.slice(Math.max(0,at-2),at+430)});
 }
 let at=-1;while((at=s.indexOf('.backExit()',at+1))>=0)row.matches.push({needle:'call backExit',offset:at,code:s.slice(Math.max(0,at-130),at+100)});
 row.hasBackgroundReturn=/isAutoFish\?[^;]{0,90}\.backExit\(\):/.test(s);
 row.hasSilentOutside=/isNeedSlientMode=function\(\)\{[^}]*isAutoFish[^}]*isInFishRoom/.test(s);
 row.keepsRaidWhenBack=/\.backExit=function\(\)\{this\.RemoveAllEntity\(\),this\.fishMainView=null\}/.test(s);
 output.sources[key]=row;
}
const dir=path.join(root,'_ai_workbench/temp/fishing_background_design_20260907');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(output.sources).map(([key,row])=>[key,{sha256:row.sha256,hasBackgroundReturn:row.hasBackgroundReturn,hasSilentOutside:row.hasSilentOutside,keepsRaidWhenBack:row.keepsRaidWhenBack}]))));
