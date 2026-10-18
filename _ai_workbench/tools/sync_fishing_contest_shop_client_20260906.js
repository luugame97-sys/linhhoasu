'use strict';
// Exact mechanical transformation already tested in the candidate, with drift guard.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const wb=path.resolve(__dirname,'..'),root=path.join(wb,'temp/fishing_contest_shop_20260906'),game=path.resolve(wb,'../linhhoasu/webgame/game'),backup=path.join(wb,'backups/fishing_contest_shop_20260906/local');
fs.mkdirSync(backup,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(root,'client-build.json'),'utf8'));
const target=path.join(game,'js/main.min_a6195824.js');let source=fs.readFileSync(target,'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'main.js'),'utf8'),'LOCAL_MAIN_DRIFT');
assert.equal(source.split(build.before).length-1,1);
const after=source.replace(build.before,build.after);assert.equal(after,fs.readFileSync(path.join(root,'main.fixed.js'),'utf8'));
fs.copyFileSync(target,path.join(backup,'main.min_a6195824.js'));fs.writeFileSync(target,after);
const index=path.join(game,'index.html'),old=fs.readFileSync(index,'utf8');
assert.equal(old.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'index.before.html'),'utf8').replace(/\r\n/g,'\n'),'LOCAL_INDEX_DRIFT');
const next=old.replace(/(js\/main\.min_a6195824\.js)(?:\?[^\s"'<>]*)?/g,'$1?v=20260906_fishing_shop_v1');
assert.equal(next.replace(/\r\n/g,'\n'),fs.readFileSync(path.join(root,'index.fixed.html'),'utf8').replace(/\r\n/g,'\n'));
fs.copyFileSync(index,path.join(backup,'index.html'));fs.writeFileSync(index,next);
console.log('LOCAL_NATIVE_CLIENT_SYNCED_EXACT_TRANSFORM');
