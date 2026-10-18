const fs = require('fs');
const vm = require('vm');

const mainPath = process.argv[2];
if (!mainPath) throw new Error('main bundle path required');
const source = fs.readFileSync(mainPath, 'utf8');

function between(left, right) {
  const start = source.indexOf(left);
  if (start < 0) throw new Error(`missing left anchor: ${left}`);
  const end = source.indexOf(right, start);
  if (end < 0) throw new Error(`missing right anchor: ${right}`);
  return source.slice(start, end);
}

const constructorSource = between('function jRt(){', 'function zRt(){}');
const socketProtoSource = between('l=jRt.prototype,', ',l.reLogin=function');

function buildContext(sendImpl = () => true) {
  const warnings = [];
  const errors = [];
  const context = {
    clearTimeout,
    setTimeout,
    console: {
      warn: (...args) => warnings.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
      log() {},
    },
    egret: { ByteArray: function ByteArray() {} },
    l: {},
    warnings,
    errors,
  };
  vm.runInNewContext(`${constructorSource};l=jRt.prototype;${socketProtoSource}`, context);
  const socket = new context.jRt();
  socket.localNetMsgLog = () => {};
  socket.Pack = () => ({});
  socket.send = sendImpl;
  return { context, socket };
}

async function run() {
  {
    let errorCalls = 0;
    const { socket } = buildContext(() => false);
    const ok = socket.Rpc(99, {}, () => { throw new Error('success should not run'); }, null, () => { errorCalls += 1; });
    if (ok !== false || errorCalls !== 1) throw new Error('send=false contract failed');
    if (Object.keys(socket._resListenerMap).length || Object.keys(socket._resListenerErrorMap).length || Object.keys(socket._lhsRpcTimerMap).length) {
      throw new Error('send=false leaked listeners');
    }
  }

  {
    const waitSource = between('TPt.waitPlayEnd=function', '},TPt.waitLoopStart=function') + '}';
    const listeners = new Map();
    const context = {
      TPt: {},
      clearTimeout,
      setTimeout,
      console: { warn() {} },
    };
    vm.runInNewContext(waitSource, context);
    const track = {
      on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      off(type, callback) {
        if (listeners.has(type)) listeners.get(type).delete(callback);
      },
      emit(type) {
        for (const callback of [...(listeners.get(type) || [])]) callback();
      },
    };
    let settled = false;
    const waiting = context.TPt.waitPlayEnd.call(track).then(() => { settled = true; });
    track.emit(4);
    await waiting;
    if (!settled || [...listeners.values()].some((rows) => rows.size > 0)) {
      throw new Error('waitPlayEnd interrupt guard failed');
    }
  }

  {
    for (const responseValue of [null, false, 0]) {
      let successCalls = 0;
      let received = 'unset';
      const { context, socket } = buildContext(() => true);
      socket.socket_ = { readBytes() {} };
      socket.recvPack = { length: 0 };
      socket.Unpack = () => [{ tag: 77, msgUid: 1, data: responseValue }];
      socket.Rpc(77, {}, (value) => { successCalls += 1; received = value; });
      vm.runInNewContext('socket.onSocketRead()', { ...context, socket });
      if (successCalls !== 1 || received !== responseValue) throw new Error('falsy response did not complete success');
      if (Object.keys(socket._lhsRpcTimerMap).length) throw new Error('normal response leaked timer');
    }
  }

  {
    let errorCalls = 0;
    const { socket } = buildContext(() => true);
    socket._lhsRpcTimeoutMs = 15;
    socket.Rpc(88, {}, () => { throw new Error('timeout success should not run'); }, null, () => { errorCalls += 1; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (errorCalls !== 1) throw new Error('timeout error callback count mismatch');
    if (Object.keys(socket._resListenerMap).length || Object.keys(socket._resListenerErrorMap).length || Object.keys(socket._lhsRpcTimerMap).length) {
      throw new Error('timeout leaked listeners');
    }
  }

  {
    let successCalls = 0;
    let errorCalls = 0;
    const { context, socket } = buildContext(() => true);
    socket.updateStatus = () => {};
    socket._onClosed = null;
    context.T = { mOtherLogin: true };
    socket.Rpc(66, {}, () => { successCalls += 1; }, null, () => { errorCalls += 1; });
    vm.runInNewContext('socket.onSocketClose()', { ...context, socket });
    if (successCalls !== 0 || errorCalls !== 1) throw new Error('close callback count mismatch');
    if (Object.keys(socket._resListenerMap).length || Object.keys(socket._resListenerErrorMap).length || Object.keys(socket._lhsRpcTimerMap).length) {
      throw new Error('close leaked listeners');
    }
    socket.socket_ = { readBytes() {} };
    socket.recvPack = { length: 0 };
    socket.Unpack = () => [{ tag: 66, msgUid: 1, data: { result: 0 } }];
    socket.onSocketRead();
    if (successCalls !== 0 || errorCalls !== 1) throw new Error('late response double-called callback');
  }

  if (/setAnimation\([^)]*,!0\)\.waitPlayEnd/.test(source)) {
    throw new Error('loop animation still waits for impossible completion');
  }

  {
    const showSource = between('Cwt.prototype.setData=function', '},t(Id=Cwt,"CloudComp")') + '}';
    const animations = [];
    const context = {
      Cwt: function Cwt() {},
      clearTimeout,
      setTimeout,
      console: { warn() {}, error() {} },
      Ad: {
        createAsyncSpine() {
          return {
            horizontalCenter: 0,
            verticalCenter: 0,
            setAnimation(_track, name) {
              animations.push(name);
              return { waitPlayEnd: () => new Promise(() => {}) };
            },
          };
        },
      },
    };
    vm.runInNewContext(showSource, context);
    const cloud = new context.Cwt();
    cloud.contentGt = { addChild() {} };
    const started = Date.now();
    await cloud.setData();
    if (Date.now() - started > 3200 || !animations.includes('a_2')) {
      throw new Error('cloud show watchdog failed');
    }
  }

  {
    const hideSource = between('l.hideCloud=function', '},l.setCallbackAndObj=function') + '}';
    let callbackCalls = 0;
    let removeCalls = 0;
    const context = {
      l: {},
      clearTimeout,
      setTimeout,
      console: { warn() {}, error() {} },
      nc: { removeFromParent() { removeCalls += 1; } },
    };
    vm.runInNewContext(hideSource, context);
    const manager = {
      cloudComp: {
        spine: { setAnimation() { return { waitPlayEnd: () => new Promise(() => {}) }; } },
      },
      cloudHoldingPromise: null,
    };
    const started = Date.now();
    context.l.hideCloud.call(manager, () => { callbackCalls += 1; }, null);
    await new Promise((resolve) => setTimeout(resolve, 2700));
    if (Date.now() - started > 3300 || callbackCalls !== 1 || removeCalls !== 1 || manager.cloudComp !== null) {
      throw new Error('cloud hide watchdog failed');
    }
  }

  console.log(JSON.stringify({ result: 'ok', rpcLifecycle: true, falsyResponse: true, timeoutCleanup: true, closeCleanup: true, fishingQueues: true, cloudWatchdog: true, spineInterrupt: true }));
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
