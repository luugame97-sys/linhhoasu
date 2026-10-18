/* One server-authoritative self-power value for HUD/profile/rank. No combat-attr writes. */
(function (root) {
  'use strict';
  var VERSION = '20260927_power_authoritative_v4', TAG = 6198;
  if (root.LhsPowerAuthoritativeV1 && root.LhsPowerAuthoritativeV1.version === VERSION) return;
  var api = root.LhsPowerAuthoritativeV1 = {
    version: VERSION, tag: TAG, installed: false, requested: 0, applied: 0,
    rejected: 0, seeded: 0, last: null, tipInstalled: false, deltaEmitted: 0,
    localTipsSuppressed: 0, tipErrors: 0, renderErrors: 0, rendererMissing: 0,
    lastDelta: null
  };
  var currentOwner = '', generation = 0, socketRef = null, pending = null;
  var lastRequestAt = -Infinity, tickTimer = null, loginRef = null;
  var wasConnected = false, cells = [], stopped = false;
  var tipOriginal = null, tipTypeRef = null, lifecycleCenter = null;
  var awaitingLogin = false;
  var selfViews = ['MainPanel', 'MainPanelNew', 'PlayerInfoPanel', 'RoleInfoPanel',
    'ArenaChallengeView', 'CrossArenaChallengeView'];
  // These contain CURRENT character power, unlike immutable battle/log cards.
  var selfSkins = ['MainPanelSkin', 'MainPanelNewSkin', 'PlayerInfoPanelSkin', 'RoleInfoPanelSkin',
    'ArenaChallengeViewSkin', 'CrossArenaChallengeViewSkin'];
  var rankSkins = ['RankItemSkin', 'RankShowItemSkin', 'DoubleTowerRankItemSkin',
    'HorseRaceRankItemSkin', 'TeamFightTopRankItemSkin'];

  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || {}; }
  function type(name) {
    return root[name] || (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName(name));
  }
  function socket() {
    var Type = type('GameSocket');
    return Type && typeof Type.ins === 'function' ? Type.ins() : null;
  }
  function identity() {
    var m = manager(), u = root.UserInfo || {}, actor = m.ActorModel || {};
    var id = actor.actorID != null ? actor.actorID : actor.playerId;
    var sid = Number(u.ServerID != null ? u.ServerID : u.serverId);
    return id != null && id !== '' && sid > 0 && isFinite(sid)
      ? { id: String(id), sid: sid, key: sid + ':' + id } : null;
  }
  function info() { return manager().PlayerInfoModel && manager().PlayerInfoModel.playerInfo; }
  function number(value) {
    if (value == null || typeof value === 'boolean' || value === '') return null;
    var n = Number(value);
    return isFinite(n) && n >= 0 && n <= 9007199254740991 && Math.floor(n) === n ? n : null;
  }
  function clearState() {
    generation++; pending = null; api.last = null; lastRequestAt = -Infinity;
    api.lastDelta = null;
    var role = manager().RoleModel;
    if (role) { role._lhsServerPower = null; role._oldPower = 0; }
  }
  function ensureOwner() {
    var owner = identity(), key = owner ? owner.key : '';
    if (currentOwner !== key) {
      // Never seed a switched owner from the previous owner's login document.
      // The next login may reuse the same object shape; invalidate the old
      // reference explicitly so a switched account cannot inherit its value.
      loginRef = null;
      currentOwner = key;
      clearState();
    }
    return owner;
  }
  function loginValid(data, owner) {
    return !!(owner && data && Number(data.serverId) === owner.sid
      && data.powerUnit === 'native-weighted-point' && data.roleInfo && data.equipInfo
      && number(data.power) != null && number(data.powerScore) != null
      && (!data.playerId || String(data.playerId) === owner.id));
  }
  function seedLogin(data) {
    var owner = ensureOwner();
    if (data === loginRef || !loginValid(data, owner)) return false;
    loginRef = data;
    // A full self login starts a new stream (revisions are connection-local).
    clearState();
    api.last = { owner: owner.key, playerId: owner.id, serverId: owner.sid,
      power: Number(data.power), powerScore: Number(data.powerScore), revision: 0, source: 'tag500' };
    api.seeded++;
    var role = manager().RoleModel;
    if (role) { role._lhsServerPower = api.last.power; role._oldPower = api.last.power; }
    return true;
  }
  function value() {
    ensureOwner();
    // Handles model construction after the addon and native tag500 callbacks
    // captured before a prototype wrapper was installed.
    seedLogin(info());
    return api.last && api.last.owner === currentOwner ? api.last.power : null;
  }
  function dispatch(name, power) {
    var Type = type('MessageCenter'), center = Type && Type.ins && Type.ins();
    var def = root.MessageDef || {};
    if (center && center.dispatch) center.dispatch(def[name] || name, power);
  }
  function installPowerTips() {
    var Type = type('UserTips'), proto = Type && Type.prototype;
    if (!proto || typeof proto.showPowerTip !== 'function') return false;
    var original = proto.showPowerTip;
    if (!original.__lhsPowerAuthorityTip) {
      var wrapped = function () {
        // The two native callers use local role power or an inactive preset.
        // Neither is the server-confirmed current character total. OldTrek
        // uses its own view directly and is intentionally unaffected.
        api.localTipsSuppressed++;
      };
      wrapped.__lhsPowerAuthorityTip = true;
      wrapped.__lhsPowerAuthorityOriginal = original;
      proto.showPowerTip = wrapped;
    }
    tipTypeRef = Type;
    tipOriginal = proto.showPowerTip.__lhsPowerAuthorityOriginal;
    api.tipInstalled = true;
    return true;
  }
  function showDelta(previous, next) {
    // A tag500 login or the first tag6198 of a connection is a silent baseline.
    // Only consecutive accepted server snapshots can produce a delta.
    if (!previous || previous.source !== 'tag6198' || previous.owner !== next.owner
      || previous.power === next.power || stopped || !connected(socket())) return;
    try {
      if (!installPowerTips()) return;
      var tips = tipTypeRef && typeof tipTypeRef.ins === 'function' && tipTypeRef.ins();
      if (!tips || typeof tipOriginal !== 'function') return;
      tipOriginal.call(tips, previous.power, next.power);
      api.deltaEmitted++;
      api.lastDelta = { before: previous.power, after: next.power,
        delta: next.power - previous.power, revision: next.revision };
    } catch (err) {
      // A visual effect failure must not break packet processing or HUD sync.
      api.tipErrors++;
      if (root.console && root.console.warn) root.console.warn('[LHS] server power tip failed:', err);
    }
  }
  function bindLifecycle() {
    var Type = type('MessageCenter'), center = Type && Type.ins && Type.ins();
    if (!center || !center.addListener || center === lifecycleCenter) return;
    var socketDef = type('SocketMessageDef') || {}, def = type('MessageDef') || {};
    center.addListener(socketDef.SOCKET_CLOSE || 'SOCKET_CLOSE', function () {
      // Invalidate immediately, including reconnects faster than the 1s tick.
      loginRef = null;
      awaitingLogin = true;
      clearState();
      renderSelf();
    }, api);
    function onConnected() {
      loginRef = null;
      awaitingLogin = true;
      clearState();
      renderSelf();
    }
    function onLoginInfo() {
      loginRef = null;
      awaitingLogin = false;
      clearState();
      seedLogin(info());
      renderSelf();
    }
    center.addListener(socketDef.SOCKET_CONNECTED || 'SOCKET_CONNECTED', onConnected, api);
    center.addListener(def.ON_LOGIN_INFO_UPDATE || 'ON_LOGIN_INFO_UPDATE', onLoginInfo, api);
    lifecycleCenter = center;
  }
  function ownerOf(cell) {
    for (var p = cell.parent, i = 0; p && i < 8; i++, p = p.parent) {
      if (p.power === cell || p.powerCell === cell) return p;
    }
    return null;
  }
  function isSelfCell(cell) {
    var view = ownerOf(cell);
    if (!view) return false;
    if (selfSkins.indexOf(view.skinName) >= 0) return true;
    if (rankSkins.indexOf(view.skinName) < 0) return false;
    var data = view.data, owner = identity();
    if (!data || !owner || (data.serverId && Number(data.serverId) !== owner.sid)) return false;
    var id = data.playerIconData && data.playerIconData.playerId;
    id = id != null ? id : (data.playerId != null ? data.playerId : data.dbid);
    return id != null ? String(id) === owner.id : data.isSelf === true;
  }
  function untrack(cell) {
    var index = cells.indexOf(cell);
    if (index >= 0) cells.splice(index, 1);
  }
  function track(cell) {
    if (cells.indexOf(cell) < 0 && cell.stage) cells.push(cell);
    if (cell.__lhsPowerAuthorityEvents || !cell.addEventListener || !root.egret) return;
    cell.__lhsPowerAuthorityEvents = true;
    cell.addEventListener(root.egret.Event.REMOVED_FROM_STAGE, function () { untrack(cell); }, cell);
    cell.addEventListener(root.egret.Event.ADDED_TO_STAGE, function () {
      if (isSelfCell(cell)) { track(cell); draw(cell, value()); }
    }, cell);
  }
  function draw(cell, power) {
    if (!cell) return;
    // Unknown is not zero and must never display a previous owner's value.
    cell.data = power == null ? '…' : power;
    var renderer = cell.__lhsFullPowerHud ? root.LhsHudPowerFullV1 : root.LhsPowerCellsFullV1;
    if (!renderer || typeof renderer.render !== 'function') {
      // A lazy-loaded addon may not have exposed its capability yet.  Keep
      // the authoritative cell value and let its own retry install later;
      // never abort apply() before showDelta() can run.
      api.rendererMissing++;
      return;
    }
    try {
      renderer.render(cell, power == null ? undefined : power);
    } catch (err) {
      // Rendering is presentation-only.  A malformed/old renderer must not
      // drop the accepted server snapshot or suppress the +/- effect.
      api.renderErrors++;
      if (root.console && root.console.warn) root.console.warn('[LHS] power renderer failed:', err);
    }
  }
  function renderSelf() {
    var power = value(), m = manager(), Type = m.ViewManager || type('ViewManager');
    var views = Type && (typeof Type.ins === 'function' ? Type.ins() : Type);
    selfViews.forEach(function (name) {
      var Panel = type(name), view = Panel && views && views.getView && views.getView(Panel);
      if (view) draw(view.powerCell || view.power, power);
    });
    cells.slice().forEach(function (cell) {
      if (!cell.stage || !isSelfCell(cell)) { untrack(cell); return; }
      draw(cell, power);
    });
  }
  function installModels() {
    // Keep RoleModel.calAllPower native. It is also used by client battle
    // decisions and must not be replaced with a presentation-only value.
    var Player = type('PlayerInfoModel'), model = manager().PlayerInfoModel;
    var playerProto = Player && Player.prototype || model;
    if (playerProto && typeof playerProto.onPlayerInfo === 'function'
      && !playerProto.onPlayerInfo.__lhsPowerAuthority) {
      var original = playerProto.onPlayerInfo;
      var login = function (data) {
        seedLogin(data);
        var result = original.apply(this, arguments);
        renderSelf();
        return result;
      };
      login.__lhsPowerAuthority = true;
      playerProto.onPlayerInfo = login;
    }
  }
  function installCells() {
    var Type = type('PowerCell'), p = Type && Type.prototype;
    if (!p || !p.dataChanged || p.dataChanged.__lhsPowerAuthority) return;
    var original = p.dataChanged;
    var wrapped = function () {
      if (isSelfCell(this)) {
        track(this);
        var power = value();
        var expected = power == null ? '…' : power;
        if (this.data !== expected) this.data = expected;
      } else untrack(this);
      return original.apply(this, arguments);
    };
    wrapped.__lhsPowerAuthority = true;
    p.dataChanged = wrapped;
  }
  function apply(payload) {
    if (stopped) return false;
    var owner = ensureOwner();
    if (!awaitingLogin) seedLogin(info());
    var power = number(payload && payload.power), score = number(payload && payload.powerScore);
    var revision = number(payload && payload.revision);
    if (!owner || !payload || payload.result !== 0 || payload.powerUnit !== 'native-weighted-point'
      || String(payload.playerId) !== owner.id || Number(payload.serverId) !== owner.sid
      || power == null || score == null || revision == null || revision <= 0
      || (api.last && revision < api.last.revision)
      || (api.last && revision === api.last.revision && (power !== api.last.power || score !== api.last.powerScore))) {
      api.rejected++;
      return false;
    }
    if (api.last && revision === api.last.revision) return true;
    var previous = api.last, epoch = generation;
    api.last = { owner: owner.key, playerId: owner.id, serverId: owner.sid,
      power: power, powerScore: score, revision: revision, source: 'tag6198' };
    api.applied++;
    awaitingLogin = false;
    var role = manager().RoleModel;
    var next = api.last;
    if (role) { role._lhsServerPower = power; role._oldPower = power; }
    renderSelf();
    dispatch('MAINPANEL_POWER_REFRESH', power);
    dispatch('ROLE_ATTR_UPDATE');
    if (generation === epoch && api.last === next) showDelta(previous, next);
    return true;
  }
  function connected(current) {
    if (!current) return false;
    if (current.connected === true) return true;
    var state = current.GetSocketState && Number(current.GetSocketState());
    return state === 2 || state === 3;
  }
  function bindSocket() {
    var current = socket();
    if (!current || !current.AddHandler || !current.Rpc) return false;
    if (current === socketRef) return true;
    if (socketRef) { loginRef = null; awaitingLogin = true; clearState(); }
    socketRef = current;
    current.AddHandler(TAG, function (payload) {
      if (current === socketRef && connected(current)) apply(payload);
    }, api);
    api.installed = true;
    return true;
  }
  function request(force) {
    var current = socket(), owner = ensureOwner(), now = Date.now();
    if (!owner || !current || !connected(current) || !current.Rpc) return false;
    if (pending && now - pending.at < 15000) return false;
    if (!force && now - lastRequestAt < (api.last ? 30000 : 5000)) return false;
    var token = { at: now, owner: owner.key, generation: generation, socket: current };
    pending = token;
    lastRequestAt = now;
    api.requested++;
    function stillCurrent() {
      return token.generation === generation && currentOwner === token.owner && socket() === token.socket;
    }
    try {
      current.Rpc(TAG, {}, function (payload) {
        ensureOwner();
        if (pending === token) pending = null;
        if (stillCurrent() && connected(current)) apply(payload);
      }, current, function () { if (pending === token) pending = null; });
      return true;
    } catch (_) { if (pending === token) pending = null; return false; }
  }
  function tick() {
    if (stopped) return;
    tickTimer = null;
    ensureOwner();
    installModels();
    installCells();
    installPowerTips();
    bindLifecycle();
    bindSocket();
    var ready = connected(socket());
    if (wasConnected && !ready) {
      loginRef = null;
      awaitingLogin = true;
      clearState();
      renderSelf();
    }
    wasConnected = ready;
    if (seedLogin(info())) renderSelf();
    request(false);
    tickTimer = root.setTimeout(tick, 1000);
  }
  // Install on prototypes before GlobalManager constructs model instances.
  // The initModule wrapper covers lazy construction before ShowGame renders.
  var m = manager(), init = m.initModule;
  if (typeof init === 'function' && !init.__lhsPowerAuthority) {
    var wrappedInit = function () {
      installModels();
      var result = init.apply(this, arguments);
      installModels(); installCells(); installPowerTips(); bindLifecycle();
      return result;
    };
    wrappedInit.__lhsPowerAuthority = true;
    m.initModule = wrappedInit;
  }
  api.apply = apply;
  api.getDisplayPower = value;
  api.renderSelf = renderSelf;
  api.bindSocket = bindSocket;
  api.request = request;
  api.install = function () { installModels(); installCells(); installPowerTips(); bindLifecycle(); };
  api.reset = function () { loginRef = null; clearState(); renderSelf(); };
  api.stop = function () { stopped = true; if (tickTimer != null) root.clearTimeout(tickTimer); tickTimer = null; };
  tick();
}(typeof window !== 'undefined' ? window : this));
