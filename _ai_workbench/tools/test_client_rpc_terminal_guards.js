const fs = require('fs');
const vm = require('vm');

const mainPath = process.argv[2];
const indexPath = process.argv[3];
if (!mainPath || !indexPath) throw new Error('usage: node test_client_rpc_terminal_guards.js <main.js> <index.html>');
const source = fs.readFileSync(mainPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function between(left, right) {
  const start = source.indexOf(left);
  if (start < 0) throw new Error(`missing left anchor: ${left}`);
  const end = source.indexOf(right, start);
  if (end < 0) throw new Error(`missing right anchor: ${right}`);
  return source.slice(start, end);
}

async function run() {
  assert((index.match(/20260831_stage_touch_recovery_guard10/g) || []).length === 2, 'cache token count mismatch');
  assert(source.includes('Array.isArray(t.changed)&&t.changed.length'), 'artifact item sync was lost');
  assert(source.includes('_lhsActiveTracks'), 'phase 1 Spine lifecycle guard was lost');
  assert(source.includes('setTimeout(a,8e3)'), 'Pet replacement watchdog missing');
  assert(source.includes('i&&(i.globalMask.visible=!1,i.autoCheck.selected=!1)'), 'KnifeReward cleanup missing');
  assert((source.match(/changeAutoComposeState\(0\)/g) || []).length >= 5, 'Pet auto-compose terminal stops missing');

  {
    const timers = [];
    const context = {
      m: { _rpcRecordMap: {} },
      T: { serverTimeMilli: 1000 },
      S: { ins: () => ({ showTipsByLangId() { context.tipCount += 1; } }) },
      tipCount: 0,
      setTimeout(callback) { timers.push(callback); },
    };
    const methods = 'm' + between('.setRpcRecord=function', ',t(m5=VGe');
    vm.runInNewContext(methods, context);
    context.m.setRpcRecord(42, 2);
    assert(context.m.checkRpc(42) === false && context.tipCount === 1, 'pending RepeatRpc must remain blocked');
    assert(timers.length === 1, 'RepeatRpc reset timer missing');
    timers[0]();
    assert(context.m.checkRpc(42) === true, 'RepeatRpc timer did not unblock tag');
    context.m.setRpcRecord(43, 2);
    context.T.serverTimeMilli = 17001;
    assert(context.m.checkRpc(43) === true, 'stale RepeatRpc did not pass on first retry');
  }

  for (const spec of [
    ['a.sendUseEgg=function', ',a.updatePetData=function', [24, () => {}, null]],
    ['a.sendCompose=function', ',Object.defineProperty(a,"nowUpgradeTimes"', [1, 2, 3, 4, () => {}, null]],
    ['a.sendPetEat=function', ',a.sendPetSwap=function', [1, 2, 3, 4, () => {}, null]],
    ['a.sendPetSwap=function', ',a.sendPetSetWish=function', [1, 2, [], null]],
  ]) {
    let terminalCalls = 0;
    spec[2][spec[2].length - 1] = () => { terminalCalls += 1; };
    const context = { a: {} };
    vm.runInNewContext(between(spec[0], spec[1]), context);
    context.a.Rpc = (_tag, _data, _success, _progress, error) => { error(); };
    const methodName = spec[0].slice(2, spec[0].indexOf('='));
    context.a[methodName](...spec[2]);
    assert(terminalCalls === 1, `${methodName} did not forward RPC terminal error`);
  }

  {
    const panel = { globalMask: { visible: false } };
    const context = {
      m: {
        _bindPanel: panel,
        getPlacedGemPos() { return null; },
        getPlanId() { return 1; },
        getEchoLv() { return 0; },
        Rpc(_tag, _data, _success, _progress, error) { error(); },
      },
      Y: { SoundManager: { PlayEffect() {} } },
    };
    vm.runInNewContext(between('m.sendSetGem=function', ',m.sendBuyField=function'), context);
    context.m.sendSetGem(10, 0, 0, false);
    assert(panel.globalMask.visible === false, 'Gem RPC error left globalMask visible');
  }

  {
    let resetCalls = 0;
    const context = {
      f: { Rpc(_tag, _data, _success, _progress, error) { error(); } },
      Ap: { getActivityData: () => ({ resetBlockFlag() { resetCalls += 1; } }) },
    };
    vm.runInNewContext(between('f.sendMakeMooncake=function', ',f.sendActivityPetsoulInfo=function'), context);
    context.f.sendMakeMooncake(1, 2, 3, []);
    assert(resetCalls === 1, 'Mooncake RPC error left block flag set');
  }

  {
    let forwarded = 0;
    const context = {
      f: { Rpc(_tag, _data, _success, _progress, error) { error(); } },
    };
    vm.runInNewContext(between('f.sendActivityOperate=function', ',f.getActivityDataById=function'), context);
    context.f.sendActivityOperate(1, 2, 3, null, null, () => { forwarded += 1; });
    assert(forwarded === 1, 'ActivityModel did not forward RPC error callback');
  }

  {
    const timers = [];
    const petHandlers = [];
    const midHandlers = [];
    let queueCalls = 0;
    let rewardCalls = 0;
    let resetCalls = 0;
    const button = () => ({ enabled: true, setTouchEnabled(value) { this.enabled = value; } });
    const context = {
      _: {},
      setTimeout(callback) { timers.push(callback); },
      Y: { Config: { PetConfig: { 9: {} } } },
      P: { ins: () => ({ AddQueueOpen() { queueCalls += 1; } }) },
      Er: { Open() { rewardCalls += 1; } },
      L7: function L7() {},
    };
    vm.runInNewContext(between('_.onPetReplace=function', ',_.resetView=function'), context);
    const view = {
      onPetReplace: context._.onPetReplace,
      commonWin: { closeBtn: button(), bg: button() },
      maskGroup: { visible: false },
      replaceBtn: { visible: false },
      petSpine: {
        registerSpineEventHandler(cb) { petHandlers.push(cb); },
        setAnimation() {},
      },
      midSpine: {
        registerSpineEventHandler(cb) { midHandlers.push(cb); },
        setAnimation() {},
      },
      resultSpine: {
        registerSpineEventHandler() {},
        setAnimation() { return { waitPlayEnd: () => Promise.resolve() }; },
      },
      costSpine: { setAnimation() {} },
      composeItem: { visible: true },
      petIconItem: { visible: false, setAdd() {} },
      itemIcon: { visible: true },
      resultItem: { visible: false, data: null },
      questionMarkImg: { visible: true },
      resetView() { resetCalls += 1; },
    };
    view.onPetReplace({ data: { id: 9 }, rewardInfo: { items: [] } });
    assert(view.maskGroup.visible === true, 'Pet replacement did not enter guarded state');
    assert(view.commonWin.closeBtn.enabled === false && view.commonWin.bg.enabled === false, 'Pet replacement buttons not blocked');
    assert(timers.length === 1, 'Pet replacement watchdog timer missing');
    timers[0]();
    assert(view.maskGroup.visible === false, 'Pet replacement watchdog did not release mask');
    assert(view.commonWin.closeBtn.enabled && view.commonWin.bg.enabled && view.replaceBtn.visible, 'Pet replacement controls not restored');
    assert(queueCalls === 1 && rewardCalls === 1 && resetCalls === 1, 'Pet replacement terminal reward state mismatch');
    midHandlers[0]({ eventData: { name: 'e_hit' } });
    await Promise.resolve();
    assert(queueCalls === 1 && rewardCalls === 1 && resetCalls === 1, 'Pet replacement finalizer ran more than once');
  }

  console.log(JSON.stringify({
    result: 'ok',
    repeatRpcAutoReset: true,
    rpcTerminalCallbacks: true,
    gemCleanup: true,
    mooncakeCleanup: true,
    petAutoComposeStop: true,
    petReplacementWatchdog: true,
    itemSyncPreserved: true,
    phase1Preserved: true,
  }));
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
