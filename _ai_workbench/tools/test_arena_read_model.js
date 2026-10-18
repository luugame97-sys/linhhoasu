'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const svc = require('../../linhhoasu/lhs/newServer/src/services/ArenaReadModelService');
const battle = require('../../linhhoasu/lhs/newServer/src/services/BattleService');
const p = {_id: '0123456789abcdef01234567', playerId: 'p1', name: 'A', level: 3, arenaScore: 1200, roleInfo: {kungfuId: 4}};
const v = svc.buildPlayerView(p, 1001);
assert.strictEqual(v.publicRow.dbid, p._id); assert(v.publicRow.power > 0); assert(v.attrs[1] > 0);
assert.throws(() => svc.buildPlayerView({_id: 'p_bad'}, 1), e => e.code === 'ARENA_PLAYER_DBID_INVALID');
const c = ['a','b','c','d','e','f'].map((dbid, i) => ({dbid, arenaScore: i}));
const r = svc.chooseOpponents(c, ['a','b','c','d','e'], 5, () => .5);
assert.strictEqual(r.changed, true); assert(r.opponents.some(x => x.dbid === 'f'));
assert.strictEqual(svc.chooseOpponents(c.slice(0, 5), ['a','b','c','d','e'], 5, () => .5).noChange, true);
assert.strictEqual(svc.rankRows([{...p,playerId:'a',arenaScore:1},{...p,playerId:'b',arenaScore:1},{...p,playerId:'bot',arenaScore:9,isBot:true}], 5)[0].playerId, 'b');
const complex = {...p, secret: 'must-not-project', boxInfo:{level:40}, spiritInfo:{}, other_attr_info:{},
  equipInfo:{curIndex:0,equipSetMap:{0:{1:{attrs:{1:220000,2:70000}}}}},
  petInfo:{pets:[{id:10001,slot:-1,level:1}]}, items:{}};
const before = JSON.stringify(complex);
const full = svc.buildPlayerView(complex, 1001);
assert.strictEqual(JSON.stringify(complex), before);
assert.strictEqual(full.publicRow.power, svc.displayPower(full.attrs));
assert.strictEqual(full.publicRow.powerScore, battle.calcPowerScore(full.attrs));
assert.strictEqual(full.playerSnapshot.power, battle.calcPowerScore(full.attrs));
assert(full.publicRow.power > v.publicRow.power);
assert(!('secret' in full.playerSnapshot));
assert(!('attrs' in full.publicRow));
assert.deepStrictEqual(full.playerSnapshot.parts, {'10100':10001});
assert.strictEqual(full.publicRow.petId, 10001);
full.playerSnapshot.attrs[1] = 1;
assert.notStrictEqual(full.attrs[1], 1);
for (const filename of ['BattleService.js','RoleAppearanceService.js','HomelandSkinUnlockService.js']) {
  const source = fs.readFileSync(path.join(__dirname,'../../linhhoasu/lhs/newServer/src/services',filename),'utf8');
  for (const match of source.matchAll(/\bplayer(?:\?\.)?\.([A-Za-z_][A-Za-z_0-9]*)/g)) {
    assert(svc.PLAYER_PROJECTION[match[1]], 'missing power/appearance projection: '+match[1]);
  }
}
const population = [{...p,playerId:'a',arenaScore:0},{...p,playerId:'b',arenaScore:100},
  {...p,playerId:'c',arenaScore:100},{...p,playerId:'x',isBot:true},
  {...p,playerId:'lhs_real_bot_2'},{...p,playerId:'excluded'}];
assert.deepStrictEqual(svc.buildRanking(population,'b',1,['excluded']),{rows:[population[2]], count:3,selfRank:2});
for (let seed=0;seed<50;seed++) {
  let state=seed;
  const rng=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  const picked=svc.chooseOpponents(c.concat(c),['a','b','c','d','e'],5,rng);
  assert(picked.changed); assert.strictEqual(picked.noChange,false);
  assert.strictEqual(new Set(picked.opponents.map(x=>x.dbid)).size,5);
}
assert.strictEqual(svc.chooseOpponents([],[],5,()=>0).noChange,true);
assert.throws(()=>svc.chooseOpponents(c,[],5,()=>NaN),/ARENA_RNG_INVALID/);
const robots=svc.robotCandidates();
assert(robots.length>0); assert(robots.every(r=>/^\d+$/.test(r.dbid)&&r.isRobot&&r.robotAttrs));
console.log(JSON.stringify({result:'PASS', checks:24, randomizedRefreshCases:50, projectionSourceAudit:true}));
