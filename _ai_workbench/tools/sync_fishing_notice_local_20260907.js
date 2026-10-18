'use strict';
// Deterministic generated-bundle rewrite from exact tested transformation.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../temp/fishing_notice_20260907'),game=path.resolve(__dirname,'../../linhhoasu/webgame/game');
const state=JSON.parse(fs.readFileSync(path.join(root,'release.json'))),edit=JSON.parse(fs.readFileSync(path.join(root,'client-edit.json')));
const h=x=>crypto.createHash('sha256').update(x).digest('hex');
const main=path.join(game,'js/main.min_a6195824.js'),index=path.join(game,'index.html');
const b=fs.readFileSync(main);assert.equal(h(b),state.beforeMainHash,'LOCAL_SOURCE_DRIFT');
let s=b.toString('utf8');assert.equal(s.split(edit.before).length-1,1);s=s.replace(edit.before,edit.after);assert.equal(h(s),state.mainHash);
const ix=fs.readFileSync(index,'utf8'),remoteBefore=fs.readFileSync(path.join(root,'index.before.html'),'utf8');
assert.equal(ix.replace(/\r\n/g,'\n').trimEnd(),remoteBefore.replace(/\r\n/g,'\n').trimEnd(),'LOCAL_INDEX_CONTENT_DRIFT');
const backup=path.resolve(__dirname,'../backups/fishing_notice_local_20260907');fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(main,path.join(backup,'main.before.js'));fs.copyFileSync(index,path.join(backup,'index.before.html'));
fs.writeFileSync(main,s);fs.writeFileSync(index,fs.readFileSync(path.join(root,'index.fixed.html')));
console.log(JSON.stringify({synced:true,mainHash:h(fs.readFileSync(main)),indexHash:h(fs.readFileSync(index)),backup}));
