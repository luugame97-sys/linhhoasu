'use strict';

// Executes the native Mine / RoleShowSpine methods extracted from the deployed
// baseline. Rendering, load completion and the animation clock are controlled
// locally; no game connection, account, database, or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'temp/mine_fix_20260920/baseline_v2/main.min_drop100.js');
const candidatePath = path.join(root, 'temp/mine_motion_callback_20260920/main.min_drop100.js');
const baseline = fs.readFileSync(baselinePath, 'utf8');
const candidate = fs.readFileSync(candidatePath, 'utf8');
const evidence = [];

function between(source, prefix, suffix) {
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, prefix);
  const from = start + prefix.length;
  const end = source.indexOf(suffix, from);
  assert.notEqual(end, -1, suffix);
  return { start, code: source.slice(from, end) };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function harness(source) {
  const timers = new Map();
  let now = 0, timerId = 0;
  const world = { panel: null, warnings: [], calls: [], timers };
  const context = vm.createContext({
    Promise,
    Number,
    console: { warn: (...v) => world.warnings.push(v.join(' ')), error: (...v) => world.warnings.push(v.join(' ')), debug() {} },
    setTimeout: (cb, ms) => { const id = ++timerId; timers.set(id, { at: now + ms, cb }); return id; },
    clearTimeout: id => timers.delete(id),
    Date: { now: () => now },
    xRt: {},
    et: { RIDE: 1 },
    nt: { kuzi: 4, spirit: 13, toy_b: 21, toy_f: 22, wuqiEff: 10, wuqi: 6 },
    Vt: { DungeonActor: 100 },
    Dht: { BathrobeActionTransform: {} },
    yht: { 102: ['m_stand_1'] },
    Y: { MineModel: { getPanel: () => world.panel } },
  });
  const methods = {};
  const anchors = {
    roleSet: ['a.setAnimtion=', ',a.setLoadCallBack='],
    roleStop: ['a.stopAll=', ',a.setTimeScale='],
    mineSet: ['f.setEntityAnimtion=', ',f.setSpAniState='],
    actionInit: ['(f=xFe.prototype).onInit=', ',f.onUpdate='],
    waitEnd: ['TPt.waitPlayEnd=', ',TPt.waitLoopStart='],
  };
  for (const [name, pair] of Object.entries(anchors)) {
    const extracted = between(source, ...pair);
    methods[name] = vm.runInContext('(' + extracted.code + ')', context);
  }
  function role(loaded = true) {
    const load = deferred();
    const tracks = [];
    const r = { _speed: 1, showPartMap: {}, entityType: 0, setAnimtion: methods.roleSet, stopAll: methods.roleStop, setTimeScale(value) { this._speed = value; } };
    r.setEntityAnimtion = function (...args) { return this.setAnimtion(...args); };
    const model = {
      ready: loaded,
      loaded() { return this.ready; },
      skeletonData: loaded ? { findAnimation: () => ({ duration: 2.4 }) } : null,
      loadEnsure: () => load.promise,
      setTimeScale() {},
      setAnimation(trackId, name, loop) {
        world.calls.push({ trackId, name, loop, at: now });
        const track = new EventEmitter();
        track.waitPlayEnd = methods.waitEnd;
        track.disposed = false;
        track.complete = function () { this.emit(1); this.disposed = true; this.emit(6); };
        track.interrupt = function () { this.disposed = true; this.emit(4); };
        tracks.push(track);
        return track;
      },
    };
    r.tuiModel = model;
    return {
      role: r, model, tracks,
      load() { model.ready = true; model.skeletonData = { findAnimation: () => ({ duration: 2.4 }) }; load.resolve(model); },
      failLoad() { load.reject(new Error('fixture resource missing')); },
    };
  }
  function minePlayer(r) { return { _player: r, setEntityAnimtion: methods.mineSet }; }
  function action(player) {
    world.panel = { getPlayer: () => player };
    const a = { aniName: 'm_dash_1_2', isLoop: false, isFin: false };
    a.init = () => methods.actionInit.call(a);
    return a;
  }
  async function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.cb();
    await flush();
  }
  return { ...world, role, minePlayer, action, advance, methods };
}

// Proposed Mine-only contract. It uses the existing native role callback,
// which survives null return values during resource loading. A new animation
// or Mine player disposal settles the prior waiter and invalidates stale work.
function installCallbackWrapper(player) {
  player.setEntityAnimtion = function (name, loop) {
    // This local wrapper intentionally treats loops as fire-and-forget.
    // Native RoleShowSpine invokes a provided loop callback immediately.
    if (loop) {
      if (this._player) this._player.setEntityAnimtion(0, name, true);
      return { waitPlayEnd: () => Promise.resolve() };
    }
    this._mineMotionSeq = (this._mineMotionSeq || 0) + 1;
    const seq = this._mineMotionSeq;
    if (this._mineMotionFinish) this._mineMotionFinish();
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (this._mineMotionFinish === finish) this._mineMotionFinish = null;
      resolve();
    };
    this._mineMotionFinish = finish;
    if (!this._player) finish();
    else this._player.setEntityAnimtion(0, name, loop, () => {
      if (this._mineMotionSeq === seq) finish();
    });
    return { waitPlayEnd: () => promise };
  };
  player.disposeMotion = function () {
    this._mineMotionSeq = (this._mineMotionSeq || 0) + 1;
    if (this._mineMotionFinish) this._mineMotionFinish();
    if (this._player) this._player.stopAll();
    this._player = null;
  };
}

async function run() {
  {
    const h = harness(baseline), r = h.role(false), p = h.minePlayer(r.role), a = h.action(p);
    let error;
    try { a.init(); } catch (e) { error = e; }
    assert.match(String(error), /null.*waitPlayEnd/);
    r.load(); await flush();
    assert.equal(h.calls.length, 0);
    assert.equal(a.isFin, false);
    evidence.push({ case: 'baseline-cold-load', result: 'REPRODUCED', error: String(error), replayCallsAfterLoad: h.calls.length, actionFinished: a.isFin });
  }
  {
    const h = harness(candidate), r = h.role(false), p = h.minePlayer(r.role), a = h.action(p);
    a.init(); assert.equal(a.isFin, false);
    r.load(); await flush();
    assert.equal(h.calls.length, 1); assert.equal(a.isFin, false);
    r.tracks[0].complete(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'candidate-cold-load', result: 'PASS', replayCallsAfterLoad: h.calls.length, actionFinishedAfterNativeComplete: a.isFin });
  }
  {
    const h = harness(candidate), r = h.role(), p = h.minePlayer(r.role), a = h.action(p);
    a.init(); await h.advance(1800);
    assert.equal(a.isFin, false); assert.equal(r.tracks[0].disposed, false);
    await h.advance(600); r.tracks[0].complete(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'candidate-healthy-long-animation', result: 'PASS', actionFinishedAtMs: 2400, nativeTrackStillPlayingAt1800: true });
  }
  {
    const h = harness(baseline), r = h.role(false), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const a = h.action(p); a.init(); assert.equal(a.isFin, false);
    r.load(); await flush();
    assert.equal(h.calls.length, 1); assert.equal(a.isFin, false);
    r.tracks[0].complete(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'callback-cold-load', result: 'PASS', replayCallsAfterLoad: h.calls.length, waitsForNativeComplete: true });
  }
  {
    const h = harness(baseline), r = h.role(), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const a = h.action(p); a.init(); await h.advance(1800); assert.equal(a.isFin, false);
    await h.advance(600); r.tracks[0].complete(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'callback-healthy-long-animation', result: 'PASS', completedAtMs: 2400, truncated: false });
  }
  {
    const h = harness(baseline), r = h.role(false), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const a = h.action(p); a.init(); r.failLoad(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'callback-load-failure', result: 'PASS', actionFinished: true });
  }
  {
    const h = harness(baseline), r = h.role(false), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const first = p.setEntityAnimtion('m_dash_1_2', false), second = p.setEntityAnimtion('m_attack_1_a', false);
    let firstDone = 0, secondDone = 0;
    first.waitPlayEnd().then(() => firstDone++); second.waitPlayEnd().then(() => secondDone++);
    await flush(); assert.equal(firstDone, 1); assert.equal(secondDone, 0);
    r.load(); await flush(); assert.deepEqual(h.calls.map(x => x.name), ['m_attack_1_a']);
    r.tracks[0].complete(); await flush(); assert.equal(firstDone, 1); assert.equal(secondDone, 1);
    evidence.push({ case: 'callback-replaced-cold-request', result: 'PASS', replayNames: h.calls.map(x => x.name), firstDone, secondDone });
  }
  {
    const h = harness(baseline), r = h.role(false), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const a = h.action(p); a.init(); p.disposeMotion(); await flush(); assert.equal(a.isFin, true);
    r.load(); await flush(); assert.equal(h.calls.length, 0);
    evidence.push({ case: 'callback-dispose-while-loading', result: 'PASS', actionFinished: true, replayCallsAfterDispose: h.calls.length });
  }
  {
    const h = harness(baseline), r = h.role(), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const a = h.action(p); a.init(); r.tracks[0].interrupt(); await flush(); assert.equal(a.isFin, true);
    evidence.push({ case: 'callback-track-interrupted', result: 'PASS', actionFinished: true });
  }
  {
    const h = harness(baseline), r = h.role(), p = h.minePlayer(r.role);
    installCallbackWrapper(p);
    const loop = p.setEntityAnimtion('m_stand_1', true);
    assert.equal(await loop.waitPlayEnd(), undefined);
    assert.deepEqual(h.calls.map(x => x.name), ['m_stand_1']);
    assert.equal(r.role._lhsAnimFinish, null);
    evidence.push({ case: 'callback-loop-no-stale-finish', result: 'PASS', replayNames: h.calls.map(x => x.name), staleFinish: false });
  }
  {
    const h = harness(candidate), r = h.role(), p = h.minePlayer(r.role);
    p.setEntityAnimtion('m_dash_1_2', false);
    r.role.setTimeScale(2.5);
    p.setEntityAnimtion('m_attack_1_a', false);
    await flush();
    evidence.push({ case: 'candidate-dash-to-attack-speed', result: r.role._speed === 2.5 ? 'PASS' : 'FAIL', expectedAttackSpeed: 2.5, actualAttackSpeed: r.role._speed });
  }
  const report = { result: evidence.some(row => row.result === 'FAIL') ? 'FAIL' : 'PASS', nativeBehaviorChecks: evidence.length, baselinePath, candidatePath, evidence, productionWrites: 0, playerWrites: 0, limitation: 'Deterministic extracted-native fixture; the synthetic 2400 ms track demonstrates guard truncation, not the duration of the user current asset. A live warm-animation hang remains to be correlated with native track state.' };
  const target = path.join(root, 'temp/mine_motion_guard_20260920/callback-fixture.json');
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; });
