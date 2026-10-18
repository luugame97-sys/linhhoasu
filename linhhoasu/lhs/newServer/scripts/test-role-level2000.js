'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict');
const clone = v => JSON.parse(JSON.stringify(v));
process.env.ROLE_LEVEL_2000_DISABLED = '1'; process.env.SERVER_ID = '1001';
const lp = require.resolve('../src/logger'); require.cache[lp] = { id: lp, filename: lp, loaded: true, exports: { info() {}, warn() {}, error() {}, debug() {} } };
const config = require('../src/services/ConfigService'), shared = require('../src/config/roleLevel2000');
const base = clone(config.loadAllTables()), tables = clone(base), before = clone(base);
shared.extend(tables);
let checks = 0;
function test(name, fn) { try { fn(); checks++; } catch(e) { e.message = name + ': ' + e.message; throw e; } }
test('level cap, monotonic EXP, no2001', () => {
  assert.equal(Object.keys(tables.RoleLevelConfig).length, 2000); assert.equal(tables.RoleLevelConfig[2001], undefined);
  for (let n=1;n<=1305;n++) assert.deepEqual(tables.RoleLevelConfig[n],base.RoleLevelConfig[n]);
  for (let n=1306;n<=2000;n++) assert(Number.isSafeInteger(tables.RoleLevelConfig[n].exp) && tables.RoleLevelConfig[n].exp > tables.RoleLevelConfig[n-1].exp);
  assert.equal(tables.RoleLevelConfig[2000].exp,282121830);
});
test('old realms and unrelated tables unchanged', () => {
  for(let n=1;n<45;n++) assert.deepEqual(tables.RoleStageConfig[n],base.RoleStageConfig[n]);
  for(const k of ['attr','name','levelMax','rewards']) assert.deepEqual(tables.RoleStageConfig[45][k],base.RoleStageConfig[45][k]);
  const allowed = new Set(['RoleLevelConfig','RoleStageConfig','TaskConfig','MonsterConfig','DemonBossConfig','LanguageConfig']);
  for(const k of Object.keys(base)) if(!allowed.has(k)) assert.deepEqual(tables[k],base[k],k);
});
test('45 unlocked;48 terminal;later systems locked', () => {
  assert.equal(tables.RoleStageConfig[45].successRate,2000); assert.equal(tables.RoleStageConfig[45].taskGroup.length,3);
  assert.equal(Object.keys(tables.RoleStageConfig).length,48);
  assert.equal(tables.RoleStageConfig[48].levelMax,2000); assert.deepEqual(tables.RoleStageConfig[48].taskGroup,[]);
  assert.equal(tables.RoleStageConfig[49],undefined);
  assert.equal(shared.systemForLevel(2000).id,'pham_nhan'); assert.equal(shared.systemForLevel(2001).id,'tien_nghich');
  for(const n of [2001,4001,6001,8001]) assert.equal(shared.systemForLevel(n).unlocked,false);
});
test('all new references, names and tasks valid', () => {
  const ids=new Set();
  for(let s=45;s<=48;s++){
    const row=tables.RoleStageConfig[s];
    if(s>45) assert(tables.LanguageConfig[row.name].cn.startsWith('Đạo Tổ'));
    for(const id of row.itemIds) assert(tables.AssetsConfig[id]);
    assert(tables.AlchemyFormulaConfig[row.alchemyId]);
    for(const id of row.taskGroup){assert(!ids.has(id));ids.add(id);const t=tables.TaskConfig[id];assert(t);assert(tables.LanguageConfig[t.textId]);if(t.activeId===7)assert(tables.LevelConfig[t.taskValue1]);}
    assert(tables.RoleLevelConfig[row.levelMax]);assert(tables.MonsterConfig[tables.DemonBossConfig[s].monsterId]);
  }
  assert.equal(ids.size,9);
});
test('idempotent, collision atomic, version and flag guards', () => {
  const t=clone(tables),saved=clone(t);shared.extend(t);assert.deepEqual(t,saved);
  for(const [name,id] of [['RoleLevelConfig',1306],['RoleStageConfig',46],['TaskConfig',980450],['LanguageConfig',39802046],['DemonBossConfig',46],['MonsterConfig',200046]]){
    const bad=clone(base);bad[name] ||= {};bad[name][id]={collision:true};const pre=clone(bad);assert.throws(()=>shared.extend(bad));assert.deepEqual(bad,pre);
  }
  assert.equal(shared.enabled(),false);delete process.env.ROLE_LEVEL_2000_DISABLED;process.env.ROLE_LEVEL_2000_ENABLED='0';assert.equal(shared.enabled(),false);
  process.env.ROLE_LEVEL_2000_ENABLED='1';assert.equal(shared.enabled(),true);
});
const dataFile = path.resolve(__dirname,'../../../webgame/game/js/lhs-role-level2000-data-v1.js');
const boot = fs.readFileSync(path.resolve(__dirname,'../../../webgame/game/js/lhs-role-level2000-v1.js'),'utf8');
test('server/browser share identical generator bytes',()=>assert.equal(fs.readFileSync(dataFile,'utf8'),fs.readFileSync(path.resolve(__dirname,'../src/config/roleLevel2000.js'),'utf8')));
test('native lifecycle hookup, before login, repeated login and safe old-server',()=>{
  let seen=null,sent=null;
  function Player(){} Player.prototype.onPlayerInfo=function(p){seen=this.cfg.RoleLevelConfig[2000];return p.name;};
  function Role(){} Role.prototype.Rpc=function(tag,p,cb){sent={tag,params:p,cb};return 'sent';};
  const callbacks=[],ctx={window:null,PlayerInfoModel:Player,RoleModel:Role,GlobalManager:{Config:clone(base)},console:{info(){},warn(){},error(){}},setTimeout:fn=>callbacks.push(fn)};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(dataFile,'utf8'),ctx);vm.runInContext(boot,ctx);
  const player=new Player();player.cfg=ctx.GlobalManager.Config;
  player.onPlayerInfo({name:'old'});assert.equal(seen,undefined);
  player.onPlayerInfo({name:'new',cultivation:{version:shared.VERSION}});assert.equal(seen.lv,2000);
  for(const key of ['RoleLevelConfig','RoleStageConfig','TaskConfig','DemonBossConfig','MonsterConfig'])assert.deepEqual(clone(ctx.GlobalManager.Config[key]),tables[key],key);
  const fields=['getMainPanelThemeType','checkTaskComplete'];const role=new Role();
  role.Rpc(3103,{stage:46,items:[]},()=>{});assert.equal(sent.params.cultivationVersion,shared.VERSION);assert.match(sent.params.requestId,/^realm_v2_/);
  const params={stage:44};role.Rpc(3103,params);assert.equal(sent.params,params);
  ctx.GlobalManager.Config=clone(base);player.cfg=ctx.GlobalManager.Config;player.onPlayerInfo({cultivation:{version:shared.VERSION}});
  assert.equal(player.cfg.RoleStageConfig[48].levelMax,2000);
  player.cfg.LanguageConfig={};player.onPlayerInfo({cultivation:{version:shared.VERSION}});
  assert.equal(player.cfg.LanguageConfig[39802046].cn,'Đạo Tổ sơ kỳ');
});
test('late class availability retry installs exactly once',()=>{
  const queued=[],ctx={window:null,setTimeout:fn=>queued.push(fn),console:{info(){},warn(){},error(){}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(boot,ctx);assert.equal(ctx.LhsRoleLevel2000V1.installed,false);
  function Player(){} Player.prototype.onPlayerInfo=()=>{};function Role(){}Role.prototype.Rpc=()=>{};
  ctx.PlayerInfoModel=Player;ctx.RoleModel=Role;queued.shift()();assert.equal(ctx.LhsRoleLevel2000V1.installed,true);
});
test('binary packet roundtrip of new names metadata levels and EXP',()=>{
  const {BinJsonUtil,ByteArray}=require('../src/protocol/BinJsonUtil');
  const sample={level:2000,stage:48,exp:tables.RoleLevelConfig[2000].exp,cultivation:{version:shared.VERSION,maxLevel:2000},name:tables.LanguageConfig[39802048].cn};
  const ba=new ByteArray();BinJsonUtil.json2bin(sample,ba);ba.position=0;assert.deepEqual(BinJsonUtil.readFullJson(ba),sample);
});
assert.deepEqual(base,before,'generator changed baseline snapshot');
console.log(JSON.stringify({result:'PASS',checks,maxLevel:2000,maxStage:48,newStages:3,productionWrites:0}));
