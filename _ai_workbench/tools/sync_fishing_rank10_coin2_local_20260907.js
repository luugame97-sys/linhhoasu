'use strict';
// Generated binary install only after live verification; retain unrelated local table drift.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const {decode}=require('./build_fishing_rank_x10_20260907');
const WORK=path.resolve(__dirname,'../..'),ROOT=path.join(WORK,'_ai_workbench/temp/fishing_rank_x10_20260907'),BACKUP=path.join(WORK,'_ai_workbench/backups/fishing_rank10_coin2_local_20260907');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state=JSON.parse(fs.readFileSync(path.join(ROOT,'release.json')));assert.equal(state.result,'DEPLOYED');assert(state.verifiedAt);
const build=JSON.parse(fs.readFileSync(path.join(ROOT,'build.json'))),lang=JSON.parse(fs.readFileSync(path.join(ROOT,'currency-build.json')));
const plan=[
 {name:'server',file:'server.local-next.bin',rel:'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',meta:build.results.find(r=>r.name==='local-server'),allowed:'Activity6RankConfig'},
 {name:'client',file:'client.local-next.bin',rel:'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',meta:build.results.find(r=>r.name==='local-client'),allowed:'Activity6RankConfig'},
 {name:'lang',file:'lang.local.next.bin',rel:'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',meta:lang.results.find(r=>r.name==='lang.local'),allowed:'LanguageConfig'}
];
for(const p of plan){assert.equal(hash(fs.readFileSync(path.join(WORK,p.rel))),p.meta.beforeHash,'LOCAL_DRIFT_'+p.name);assert.equal(hash(fs.readFileSync(path.join(ROOT,p.file))),p.meta.afterHash,'CANDIDATE_DRIFT_'+p.name);}
const results=[];
for(const p of plan){const target=path.join(WORK,p.rel),bytes=fs.readFileSync(target),old=decode(bytes),next=fs.readFileSync(path.join(ROOT,p.file)),decoded=decode(next);for(let i=0;i<old.length;i++)if(old[i].name!==p.allowed)assert(old[i].raw.equals(decoded[i].raw),'UNRELATED_LOCAL_TABLE_CHANGE');const backup=path.join(BACKUP,p.name+'.before.bin');assert(!fs.existsSync(backup),'BACKUP_ALREADY_EXISTS');fs.copyFileSync(target,backup);fs.writeFileSync(target,next);assert.equal(hash(fs.readFileSync(target)),p.meta.afterHash);const liveBefore=decode(fs.readFileSync(path.join(ROOT,p.name+'.before.bin')));const preserved=old.filter(r=>r.name!==p.allowed&&JSON.stringify(r.value)!==JSON.stringify(liveBefore.find(x=>x.name===r.name)?.value)).map(r=>r.name);results.push({path:p.rel,sha256:p.meta.afterHash,preservedLocalDifferentTables:preserved});}
assert.equal(hash(fs.readFileSync(path.join(WORK,'linhhoasu/lhs/newServer/src/config/fishingEconomy.json'))),state.expected['/linhhoasu/lhs/newServer/src/config/fishingEconomy.json']);
const index=fs.readFileSync(path.join(WORK,'linhhoasu/webgame/game/index.html'),'utf8').replace(/\r\n/g,'\n');assert.equal(index,fs.readFileSync(path.join(ROOT,'index.next.html'),'utf8').replace(/\r\n/g,'\n'));
fs.writeFileSync(path.join(ROOT,'local-sync.json'),JSON.stringify({result:'PASS',results},null,2));console.log(JSON.stringify({result:'PASS',results}));
