(function (root) {
  'use strict';
  if (root.LhsSocketSendV3) return;
  // Load before engine/plugins can replace WebSocket.prototype.send. Never
  // recover a sender from mutable _nativeSend or from a different JS realm.
  var NativeSocket = root.WebSocket;
  var nativePrototype = NativeSocket && NativeSocket.prototype;
  var sendDescriptor = nativePrototype && Object.getOwnPropertyDescriptor(nativePrototype, 'send');
  var stateDescriptor = nativePrototype && Object.getOwnPropertyDescriptor(nativePrototype, 'readyState');
  var nativeSend = sendDescriptor && sendDescriptor.value;
  var nativeState = stateDescriptor && stateDescriptor.get;
  var apply = Reflect.apply;
  var connections = new WeakMap();
  var debug = { build: 'lhs-socket-send-v3', installed: false, lastError: null, recoveredSenderCount: 0 };

  function fail(code) {
    debug.lastError = { code: code };
    var error = new Error(code);
    error.code = code;
    throw error;
  }

  function getState(socket) {
    if (typeof nativeState !== 'function') {
      return fail('LHS_SOCKET_NATIVE_UNAVAILABLE');
    }
    if (!socket) return fail('LHS_SOCKET_NOT_INITIALIZED');
    try {
      // The captured browser getter performs a real internal-slot brand
      // check; instanceof alone accepts Object.create(WebSocket.prototype).
      return apply(nativeState, socket, []);
    } catch (_error) {
      return fail('LHS_SOCKET_INVALID_RECEIVER');
    }
  }

  function install() {
    var Type = root.egret && root.egret.web && root.egret.web.HTML5WebSocket;
    var proto = Type && Type.prototype;
    if (!proto || typeof proto._setSocket !== 'function') return false;
    if (proto.__lhsNativeSendGuardV3) return true;
    var setSocket = proto._setSocket;
    proto._setSocket = function () {
      // Invalidate before creating the replacement. If connect throws, a
      // previous still-open transport must never receive a new-generation RPC.
      var previous = connections.get(this);
      connections.set(this, { socket: null, generation: previous ? previous.generation + 1 : 1 });
      var result;
      try {
        result = apply(setSocket, this, arguments);
      } catch (error) {
        debug.lastError = { code: 'LHS_SOCKET_CONNECT_FAILED' };
        throw error;
      }
      var socket = this._nativeSocket;
      getState(socket);
      if (socket !== this.socket) return fail('LHS_SOCKET_CONNECT_HOLDER_MISMATCH');
      var current = connections.get(this);
      current.socket = socket;
      // Some embedded WebViews expose WebSocket only after the loader starts.
      // Resolve the descriptor lazily, but never call through a mutable holder.
      if (typeof nativeSend !== 'function') {
        var lateDescriptor = root.WebSocket && root.WebSocket.prototype
          && Object.getOwnPropertyDescriptor(root.WebSocket.prototype, 'send');
        nativeSend = lateDescriptor && lateDescriptor.value;
      }
      if (typeof nativeSend !== 'function') return fail('LHS_SOCKET_NATIVE_UNAVAILABLE');
      current.sender = function (data) { return apply(nativeSend, socket, [data]); };
      this._nativeSend = current.sender;
      return result;
    };
    proto.send = function (data) {
      var current = connections.get(this);
      if (!current || !current.socket) return fail('LHS_SOCKET_NOT_INITIALIZED');
      if (this._nativeSocket !== current.socket) return fail('LHS_SOCKET_STALE_GENERATION');
      if (getState(current.socket) !== 1) return fail('LHS_SOCKET_NOT_OPEN');
      if (this._nativeSend !== current.sender) {
        debug.recoveredSenderCount += 1;
        this._nativeSend = current.sender;
      }
      // A mutable holder may point elsewhere: only the actual transport
      // registered by _setSocket is authoritative. No fallback to that holder.
      try {
        return apply(nativeSend, current.socket, [data]);
      } catch (error) {
        // Preserve real native send errors; never turn a failure into success,
        // retry implicitly, swallow a packet, or record its payload/message.
        debug.lastError = { code: 'LHS_SOCKET_SEND_FAILED' };
        throw error;
      }
    };
    proto.__lhsNativeSendGuardV3 = true;
    debug.installed = true;
    return true;
  }
  root.LhsSocketSendV3 = Object.freeze({ install: install, debug: debug });
}(window));
