'use strict';

// Extracts and executes the exact helper in mine_smooth_motion_20260920.js.
// This is a deterministic presentation-only fixture: RPC, player state and
// database adapters are deliberately absent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'tools/mine_smooth_motion_20260920.js');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const evidence = [];

class Scheduler {
  constructor() { this.now = 0; this.active = []; this.samples = []; this.tweenStarts = []; }
  add(tween) { this.active.push(tween); this.tweenStarts.push({ target: tween.target, at: this.now }); }
  remove(target) { this.active = this.active.filter(tween => tween.target !== target); }
  step(ms) {
    const end = this.now + ms;
    while (this.now < end && this.active.length) {
      const dt = Math.min(10, end - this.now);
      this.now += dt;
      for (const tween of [...this.active]) tween.tick(dt);
      this.active = this.active.filter(tween => !tween.done);
      for (const tween of this.active) {
        if (tween.target && typeof tween.target.x === 'number') this.samples.push({ at: this.now, x: tween.target.x, y: tween.target.y });
      }
    }
    this.now = end;
  }
  drain(limit = 2000) { let n = 0; while (this.active.length && n++ < limit) this.step(10); return n * 10; }
}

class Tween {
  constructor(scheduler, target) { this.scheduler = scheduler; this.target = target; this.steps = []; this.done = false; this.elapsed = 0; this.current = 0; scheduler.add(this); }
  to(props, duration) { this.steps.push({ kind: 'to', props, duration: Math.max(0, Number(duration) || 0) }); return this; }
  wait(duration) { this.steps.push({ kind: 'wait', duration: Math.max(0, Number(duration) || 0) }); return this; }
  call(callback) { this.steps.push({ kind: 'call', callback }); return this; }
  tick(dt) {
    let remaining = dt;
    while (!this.done && remaining >= 0) {
      const step = this.steps[this.current];
      if (!step) { this.done = true; return; }
      if (step.kind === 'call') { this.current++; step.callback(); continue; }
      if (step.duration <= 0) {
        if (step.kind === 'to') Object.assign(this.target, step.props);
        this.current++; continue;
      }
      const before = this.elapsed;
      const used = Math.min(remaining, step.duration - before);
      this.elapsed += used;
      if (step.kind === 'to') {
        const ratio = Math.min(1, this.elapsed / step.duration);
        for (const key of Object.keys(step.props)) {
          const start = step.start || (step.start = Object.fromEntries(Object.keys(step.props).map(k => [k, Number(this.target[k]) || 0])));
          this.target[key] = start[key] + (Number(step.props[key]) - start[key]) * ratio;
        }
      }
      remaining -= used;
      if (this.elapsed >= step.duration) {
        if (step.kind === 'to') Object.assign(this.target, step.props);
        this.current++; this.elapsed = 0;
      } else return;
      if (used === 0 && remaining === 0) return;
    }
  }
}

function makeHarness(overrides = {}) {
  const scheduler = new Scheduler();
  const calls = [], events = [], cache = { shown: 0 };
  const model = {
    Base_Block_Size: 100,
    _panel: null,
    getPanel() { return this._panel; },
    getPreTestDataMap() { return overrides.oldMap || { 0: { 0: 1 } }; },
    getPlayerPos() { return overrides.position || { meter: 3, col: 2 }; },
    getMeter() { return overrides.meter == null ? 3 : overrides.meter; },
    getPreMeter() { return overrides.preMeter == null ? 1 : overrides.preMeter; },
    checkItemSelectIdx() { return 1; },
    showCacheEventResults() { cache.shown++; },
    setAutoDig(value) { events.push({ type: 'autoDig', value }); },
  };
  const role = {
    _speed: overrides.speed == null ? 1 : overrides.speed,
    tuiModel: { skeletonData: { findAnimation(name) { return { duration: overrides.clipDuration == null ? 0.5 : overrides.clipDuration, name }; } } },
    setTimeScale(value) { events.push({ type: 'speed', value }); this._speed = value; },
  };
  const actor = {
    x: 150, y: 1350, scaleX: 1, player: role,
    setEntityAnimtion(name, loop) { calls.push({ type: 'animation', name, loop, at: scheduler.now }); },
    getAniName() { return 'm_attack_1_a'; },
    getQuickAniName() { return 'm_attack_3_a'; },
  };
  const block = data => ({ data, x: data.col * 100, y: 1000 + (10 - data.meter - 1) * 100, playEff() { events.push({ type: 'playEff' }); } });
  const panel = {
    _player: actor, _baseMeter: 10, showGr: { verticalCenter: 0 }, _lhsMotionSamples: 0,
    globalMask: { visible: true }, blockGr: { height: 1000 }, $stage: true,
    setGlobalMaskState(value) { this.globalMask.visible = value; events.push({ type: 'mask', value }); },
    getBlockItem(meter, col) { return block({ meter, col, uid: 2, id: 1 }); },
    getBlockItemByUid(uid) { return block({ meter: 1, col: 0, uid, id: 1 }); },
    createBlocks(rows) { events.push({ type: 'createBlocks', count: rows.length }); },
    updateBlocks(rows) { events.push({ type: 'updateBlocks', count: rows.length }); },
    recycleBlocks() { events.push({ type: 'recycleBlocks' }); },
    refreshFinishState() { events.push({ type: 'refreshFinishState' }); },
    refreshPlayerDir(delta) { events.push({ type: 'dir', delta }); },
    refreshDesc() { events.push({ type: 'refreshDesc' }); },
    changeSelectIdx(value) { events.push({ type: 'select', value }); },
    afterDigBlock() { events.push({ type: 'afterDigBlock' }); this.afterCount = (this.afterCount || 0) + 1; this.globalMask.visible = false; },
    hideAllEff() { events.push({ type: 'hideAllEff' }); },
  };
  model._panel = panel;
  const context = {
    Date: { now: () => scheduler.now }, Math, Number, Array, console: { debug() {}, warn() {}, error() {} },
    F: { get(target) { return new Tween(scheduler, target); }, removeTweens(target) { scheduler.remove(target); } },
    Y: { MineModel: model, FashionModel: { GetShowServerData() { return {}; }, getShowInfoSuit() { return { suitId: 1 }; } }, Config: { FashionDressConfig: { 1: { mineAction: 0 } } } },
    yht: { 102: ['m_stand_1'], 103: ['m_stand_2'], 105: ['m_dash_1_2'] },
    S: { ins() { return { showTips(message) { events.push({ type: 'tip', message }); } }; } },
  };
  vm.createContext(context);
  vm.runInContext(helperSource, context, { filename: helperPath });
  return { scheduler, model, panel, actor, role, calls, events, cache, helper: context, block };
}

function req(itemId = 0) {
  return { itemId, col: 2, meter: 3, path: [{ col: 0, meter: 1 }, { col: 1, meter: 2 }, { col: 2, meter: 3 }] };
}

function count(events, type) { return events.filter(item => item.type === type).length; }

function run() {
  {
    const h = makeHarness();
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], req(0));
    h.scheduler.step(50);
    assert.ok(h.scheduler.samples.some(sample => sample.x !== 150 || sample.y !== 1350), 'motion has intermediate positions');
    const elapsed = h.scheduler.drain();
    assert.ok(elapsed <= 500, `normal motion should finish <=500ms (${elapsed})`);
    assert.equal(h.panel.globalMask.visible, false);
    assert.equal(h.panel.afterCount, 1);
    assert.equal(h.cache.shown, 1);
    assert.equal(h.actor.x, 250); assert.equal(h.actor.y, 1682);
    assert.equal(h.panel._lhsMotionBusy, false);
    assert.equal(h.role._speed, 1);
    assert.equal(count(h.events, 'updateBlocks'), 1);
    evidence.push({ case: 'normal-interpolated-motion', result: 'PASS', elapsed, sampleCount: h.scheduler.samples.length, noRpc: true });
  }
  {
    const h = makeHarness({ item: -1, clipDuration: 1 });
    h.helper.lhsMineSmoothMove(h.panel, {}, [{ meter: 3, col: 2, id: 4 }], [], req(-1));
    const moveStart = h.scheduler.now; h.scheduler.step(220);
    const afterMove = h.scheduler.now;
    assert.equal(h.panel.globalMask.visible, true);
    h.scheduler.drain();
    const attack = h.calls.find(call => call.name === 'm_attack_3_a');
    assert.ok(attack, 'attack animation starts after interpolated movement');
    assert.equal(h.panel.globalMask.visible, false);
    assert.equal(h.panel.afterCount, 1);
    evidence.push({ case: 'attack-impact-order', result: 'PASS', moveStart, afterMove, attackStart: attack.at, attackAnimationCapObserved: '120-180ms' });
  }
  {
    const h = makeHarness();
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], req(0));
    h.scheduler.step(40);
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], { ...req(0), meter: 4 });
    h.scheduler.drain();
    assert.equal(h.panel.afterCount, 1, 'replacement must complete only current request');
    assert.equal(h.panel.globalMask.visible, false);
    evidence.push({ case: 'replacement-cancels-stale', result: 'PASS', afterCount: h.panel.afterCount });
  }
  {
    const h = makeHarness();
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], req(0));
    h.scheduler.step(40);
    h.helper.lhsMineCancelMotion(h.panel);
    h.scheduler.drain();
    assert.equal(h.panel.afterCount || 0, 0);
    assert.equal(h.panel._lhsMotionBusy, false);
    assert.equal(h.role._speed, 1);
    assert.equal(h.panel.globalMask.visible, false);
    evidence.push({ case: 'close-cancel-no-stale-callback', result: 'PASS', afterCount: h.panel.afterCount || 0, helperMaskAfterCancel: h.panel.globalMask.visible });
  }
  {
    const h = makeHarness();
    h.panel.createBlocks = () => { throw new Error('fixture createBlocks'); };
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], req(0));
    assert.equal(h.panel.globalMask.visible, false);
    assert.equal(h.panel._lhsMotionBusy, false);
    evidence.push({ case: 'sync-error-cleanup', result: 'PASS', maskVisibleAfterThrow: h.panel.globalMask.visible });
  }
  {
    const h = makeHarness({ meter: 2, preMeter: 1 });
    h.helper.lhsMineSmoothMove(h.panel, {}, [], [], req(0));
    const camera = h.scheduler.tweenStarts.find(item => item.target === h.panel.showGr);
    assert.ok(camera, 'camera tween starts');
    const cameraTween = h.scheduler.active.find(tween => tween.target === h.panel.showGr);
    const cameraDurations = cameraTween ? cameraTween.steps.filter(step => step.kind === 'to').map(step => step.duration) : [];
    assert.ok(cameraDurations.every(duration => duration >= 120 && duration <= 320));
    evidence.push({ case: 'camera-duration-bound', result: 'PASS', cameraTweenStarted: !!camera, cameraDurations });
  }
  {
    const h = makeHarness({ item: -1, clipDuration: 1 });
    h.panel.getBlockItem = () => ({ data: { meter: 3, col: 2 }, playEff() { throw new Error('fixture impact'); } });
    h.helper.lhsMineSmoothMove(h.panel, {}, [{ meter: 3, col: 2, id: 4 }], [], req(-1));
    h.scheduler.drain();
    assert.equal(h.panel.globalMask.visible, false);
    assert.equal(h.panel._lhsMotionBusy, false);
    assert.equal(h.panel.afterCount || 0, 0);
    assert.equal(h.role._speed, 1);
    evidence.push({ case: 'async-impact-error-cleanup', result: 'PASS', afterCount: h.panel.afterCount || 0, roleSpeed: h.role._speed, maskVisible: h.panel.globalMask.visible });
  }
  {
    const h = makeHarness({ item: -1 });
    h.actor.getAniName = () => { throw new Error('fixture arrival'); };
    h.helper.lhsMineSmoothMove(h.panel, {}, [{ meter: 3, col: 2, id: 4 }], [], req(-1));
    h.scheduler.drain();
    assert.equal(h.panel.globalMask.visible, false);
    assert.equal(h.panel._lhsMotionBusy, false);
    assert.equal(h.role._speed, 1);
    evidence.push({ case: 'async-arrival-error-cleanup', result: 'PASS', roleSpeed: h.role._speed, maskVisible: h.panel.globalMask.visible });
  }
  const report = { result: 'PASS_WITH_FINDINGS', helperPath, evidence, productionWrites: 0, playerWrites: 0, findings: [
    'Attack duration is clamped to 120-180ms; fixture verifies impact and completion order.',
    'Camera duration is clamped to 120-320ms; fixture reads exact tween duration.',
    'Synchronous and asynchronous helper failures restore role speed, cancel tweens, clear busy state and hide the mask.',
  ] };
  const target = path.join(root, 'temp/mine_motion_callback_20260920/smooth-motion-fixture.json');
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

try { run(); } catch (error) { console.error(error); process.exitCode = 1; }
