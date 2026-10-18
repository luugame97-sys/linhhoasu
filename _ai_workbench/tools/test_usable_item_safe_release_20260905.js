'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const helper = require('./test_usable_item_fixes_20260905');
const app = process.env.LHS_APP_ROOT || path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const item = require(path.join(app, 'src/handlers/item'));
const uses = config.get('AssetsUseConfig');
let seed = 9;
Math.random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
(async () => {
  let selected = 0;
  for (const id of [90044, 90045, 90046]) {
    for (const [index, option] of uses[id].rewards.entries()) {
      const x = await helper.use(id, { selects: { [index]: 1 } });
      assert.equal(x.response.data.result, 0);
      assert.equal(x.info.artifacts.length, 1);
      const art = x.info.artifacts[0];
      const special = (config.get('SpecialArtifactConfig') || {})[option.id];
      assert.equal(art.id, special ? special.showId : option.id);
      if (special) assert.equal(art.sourceSpecialArtifactId, option.id);
      assert.equal(x.player.items[id], 9);
      selected++;
    }
    for (const params of [{}, {selects:{0:1,1:1}}, {selects:{999:1}}, {selects:{'0.2':1}},
      {selects:{0:1.5}}, {selects:{0:'1'}}, {selects:{0:-1}}, {selects:{0:1,999:1},count:2},
      {selects:[1]}, {selects:{0:1},count:1.5}]) {
      const x=await helper.use(id,params);assert.equal(x.response.data.result,-1);assert.equal(x.player.items[id],10);
    }
  }
  let blocked=0,granted=0;
  const fixed={100080:25032,100810:25051,100811:25052,100812:25053,100813:25054};
  for(const cfg of Object.values(uses).filter(x=>x.type===102)) {
    const x=await helper.use(cfg.id);
    if(x.response.data.result===0) {granted++;assert.equal(x.player.items[cfg.id],9);assert(helper.rewardTotal(x.info)>0);
      if(fixed[cfg.id]){assert.equal(x.info.gems.length,1);assert.equal(x.info.gems[0].id,fixed[cfg.id]);}
    } else {blocked++;assert.equal(x.response.data.code,'ITEM_REWARD_POOL_UNVERIFIED');assert.equal(x.player.items[cfg.id],10);}
  }
  assert.equal(granted,42);assert.equal(blocked,111);
  let pills=0;
  for(const cfg of Object.values(uses).filter(x=>x.type===103&&x.rewards?.length>0&&Array.isArray(x.attrs))) {
    const x=await helper.use(cfg.id);assert.equal(x.response.data.result,-1);assert.equal(x.player.items[cfg.id],10);pills++;
  }
  assert.equal(pills,150);
  for(const id of [90021,90022]){const x=await helper.use(id,{selects:{0:1}});assert.equal(x.response.data.result,-1);assert.equal(x.player.items[id],10);}
  const regression=await helper.use(110131);assert.equal(regression.response.data.result,0);assert.equal(regression.player.other_attr_info.record[110131],1);
  console.log('SAFE_RELEASE='+JSON.stringify({result:'PASS',selected,randomGranted:granted,randomBlocked:blocked,pillsHeld:pills}));
})().catch(e=>{console.error(e);process.exitCode=1;});
