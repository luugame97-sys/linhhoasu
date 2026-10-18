'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../temp/fishing_full_candidate_20260906'),target=path.resolve(__dirname,'../../linhhoasu/webgame/game/js/main.min_a6195824.js'),backup=path.resolve(__dirname,'../backups/fishing_full_release_local_20260906/main.min_a6195824.js');
let source=fs.readFileSync(target,'utf8');assert.equal(source,fs.readFileSync(path.join(root,'main.js'),'utf8'),'LOCAL_CLIENT_DRIFT');fs.copyFileSync(target,backup);
const edits=JSON.parse(fs.readFileSync(path.join(root,'gameplay-client-build.json'),'utf8')).edits;
for(const edit of edits){assert.equal(source.split(edit.before).length-1,1,edit.marker);source=source.replace(edit.before,edit.after);}
assert.equal(source,fs.readFileSync(path.join(root,'main.fixed.js'),'utf8'));fs.writeFileSync(target,source);console.log('Local client generated from exact verified transforms');
