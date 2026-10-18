'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'_ai_workbench/temp/formation_grade1000_20260913');
const app=path.join(root,'linhhoasu/lhs/newServer');
const svc=require(path.join(app,'src/services/ConfigService'));
const {totals}=require('./build_formation_grade1000_20260913');
const configs=['server','client','client-fashion'].map(name=>{
 const before=svc.decodeTables(fs.readFileSync(path.join(out,name+'.before.bin'))),after=svc.decodeTables(fs.readFileSync(path.join(out,name+'.next.bin')));
 for(const k of Object.keys(before))if(k!=='FormationGradeConfig')assert.deepEqual(after[k],before[k],name+':'+k);
 for(let g=1;g<=10;g++)assert.deepEqual(after.FormationGradeConfig[g],before.FormationGradeConfig[g]);
 assert.equal(Object.keys(after.FormationGradeConfig).length,1000);
 return after;
});
assert.deepEqual(configs[0].FormationGradeConfig,configs[1].FormationGradeConfig);
assert.deepEqual(configs[0].FormationGradeConfig,configs[2].FormationGradeConfig);
const table=configs[0].FormationGradeConfig;
// Execute the deployed handler bodies in an isolated sandbox: no DB/network,
// task side effects or real player. Use exact live-baseline merged release.
const source=fs.readFileSync(path.join(root,'_ai_workbench/temp/formation_fix_deploy_20260913/upgrade.js'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
let taskCount=0,saves=0;
const context={Math,Number,Array,Promise,
 toSafeInt:(n,f=0)=>Number.isFinite(Number(n))?Math.floor(Number(n)):f,
 ensureFormationInfo:p=>p.formationInfo,isFormationSystemUnlocked:()=>true,
 getFormationGradeRow:g=>table[g],getFormationLevelUpExpValue:()=>1,
 buildFormationResponseData:(i,e)=>({...i,...e}),
 hasEnoughCost:(p,c)=>p.items[c.id]>=c.count,
 consumeCost:(p,c)=>{p.items[c.id]-=c.count;},
 addSpiritUpgradeCount:(p,n)=>{taskCount+=n;},refreshMainTaskProgress(){},refreshRealmStageTasks(){},
 playerService:{savePlayer:async()=>{saves++;}},buildCostSyncPacket:c=>({tag:1202,data:{items:[{id:c.id,count:-c.count}]}}),buildTaskUpdatePacketsSafe:()=>[]};
vm.createContext(context);
vm.runInContext(extract('async function handleFormationUpgrade(params','// 阵法升阶'),context);
vm.runInContext(extract('async function handleFormationUpgradeGrade(', '// 阵法附灵'),context);
(async()=>{
 const initial7=totals().item7,initial8=totals().item8;
 const player={formationInfo:{grade:1,level:1,exp:0},items:{7:initial7,8:initial8}};
 const session={userId:'memory-only',player};
 for(let g=1;g<=1000;g++){
  const before=player.items[7];
  await context.handleFormationUpgrade({count:Number.MAX_SAFE_INTEGER},session,g);
  assert.equal(player.items[7],before-(table[g].level-1)*table[g].exp);
  assert.equal(player.formationInfo.level,table[g].level);assert.equal(player.formationInfo.exp,table[g].exp);
  if(g<1000){await context.handleFormationUpgradeGrade({},session,g);assert.equal(player.formationInfo.grade,g+1);}
 }
 assert.equal(player.items[7],0);assert.equal(player.items[8],0);assert.equal(taskCount,initial7);
 const max=await context.handleFormationUpgradeGrade({},session,1001);assert.equal(max.data.result,-1);
 const evidence={result:'PASS',scope:'isolated deployed-handler bodies plus actual candidate config; no native UI',grades:1000,preservedTables:713,preservedOldGrades:10,simulatedSaves:saves,total:{item7:initial7,item8:initial8},fromGrade10Max:{item7:totals(11).item7,item8:totals(11).item8+4200}};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
 const build=JSON.parse(fs.readFileSync(path.join(out,'build.json')));build.fullGrade1To1000=evidence.total;build.fromGrade10Max=evidence.fromGrade10Max;build.costBasis='actual handler: (level-1)*exp';fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(build,null,2)+'\n');
 console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e);process.exitCode=1;});
