'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../temp/fishing_rooms_release_20260906'),local=path.resolve(__dirname,'../../linhhoasu/webgame/game/js/main.min_a6195824.js');
const old=JSON.parse(fs.readFileSync(path.join(root,'client-build.v1.json'),'utf8')),now=JSON.parse(fs.readFileSync(path.join(root,'client-build.json'),'utf8'));
let text=fs.readFileSync(local,'utf8');let changes=0;
old.edits.forEach((e,i)=>{const n=now.edits[i];if(JSON.stringify(e)===JSON.stringify(n))return;assert(e.insert&&n.insert);assert.equal(text.split(e.insert).length-1,1);text=text.replace(e.insert,n.insert);changes++;});
assert.equal(changes,1);assert.equal(text,fs.readFileSync(path.join(root,'main.fixed.js'),'utf8'));fs.writeFileSync(local,text);console.log('Local UI v2 exact match');
