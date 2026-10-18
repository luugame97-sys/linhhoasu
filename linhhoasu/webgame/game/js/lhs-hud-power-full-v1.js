/* Full raw combat-power text on the two self HUDs only. No gameplay/state writes. */
(function (root) {
  'use strict';
  if (root.LhsHudPowerFullV1) return;
  var api = root.LhsHudPowerFullV1 = { version: '20260927_hud_power_full_v3', installed: false, attempts: 0 };

  function number(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }
  function fullText(value) {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return value.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    if (typeof value !== 'number' || !isFinite(value) || value > 9007199254740991) return '？';
    return String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function cancelRetry(cell) {
    if (!cell) return;
    if (cell.__lhsFullPowerRetry != null) root.clearTimeout(cell.__lhsFullPowerRetry);
    cell.__lhsFullPowerRetry = null;
  }
  function retryRender(cell) {
    if (!cell || cell.__lhsFullPowerClosed || cell.__lhsFullPowerRetry != null
      || number(cell.__lhsFullPowerRetryCount, 0) >= 60) return;
    cell.__lhsFullPowerRetryCount = number(cell.__lhsFullPowerRetryCount, 0) + 1;
    cell.__lhsFullPowerRetry = root.setTimeout(function () {
      cell.__lhsFullPowerRetry = null;
      if (!cell.__lhsFullPowerClosed) render(cell, cell.data);
    }, 50);
  }
  function watchFont(cell, label) {
    if (!label || typeof label.$setFontData !== 'function' || label.__lhsFullPowerFontOwner === cell) return;
    label.__lhsFullPowerFontOwner = cell;
    var original = label.$setFontData;
    // This instance-only hook runs after BitmapLabel accepts its async font.
    // Keep the engine's stale-font-key guard and original return value.
    label.$setFontData = function () {
      var result = original.apply(this, arguments);
      if (result && this === cell.powerLabel && !cell.__lhsFullPowerClosed) {
        cell.__lhsFullPowerRetryCount = 0;
        if (cell.__lhsFullPowerRendering) retryRender(cell);
        else render(cell, cell.data);
      }
      return result;
    };
  }
  function render(cell, value) {
    if (!cell || !cell.__lhsFullPowerHud || cell.__lhsFullPowerClosed || cell.__lhsFullPowerRendering) return;
    if (!cell.powerLabel) { retryRender(cell); return; }
    cell.__lhsFullPowerRendering = true;
    try {
      var label = cell.powerLabel;
      watchFont(cell, label);
      label.text = fullText(value);
      // BitmapLabel wraps per glyph when NaN maxWidth reaches EUI layout.
      // Measure on an explicitly wide single line, then constrain by scale.
      label.maxWidth = 100000;
      label.width = Math.max(4096, label.text.length * 100);
      label.wordWrap = false;
      label.letterSpacing = -1;
      label.scaleX = label.scaleY = 1;
      if (typeof label.validateNow === 'function') label.validateNow();
      // textWidth is the measured glyph width. Explicit layout width is NOT
      // a measurement: before the font arrives it is just the 4096px probe.
      var width = number(label.textWidth, 0);
      cell.__lhsFullPowerText = label.text;
      if (width <= 0) { retryRender(cell); return; }
      cancelRetry(cell);
      cell.__lhsFullPowerRetryCount = 0;
      label.width = width + 2;
      var available = Math.max(1, number(cell.__lhsFullPowerLocalWidth, 350) - number(label.left, 64) - 8);
      if (width > available) label.scaleX = label.scaleY = available / width;
    } finally {
      cell.__lhsFullPowerRendering = false;
    }
  }
  function layout(view) {
    var cell = view && view.powerCell;
    if (!cell || !cell.parent || view.__lhsFullPowerClosed) return false;
    var parent = cell.parent, top = view.topGroup;
    var left = number(cell.left, number(cell.x, 0));
    var parentX = number(parent.left, number(parent.x, 0));
    if (top && parent.parent !== top && typeof parent.getTransformedBounds === 'function') {
      parentX = parent.getTransformedBounds(top).x;
    }
    var privilege = view.IdlePrivilegeCardOnTopBtn && view.IdlePrivilegeCardOnTopBtn.parent;
    var hasSiblingButtons = privilege && privilege.parent === parent;
    var space = top ? number(top.width, 720) - parentX - left - 16 : number(parent.width, 420) - left - 8;
    var budget = Math.max(80, Math.min(hasSiblingButtons ? 260 : 320, space - (hasSiblingButtons ? 100 : 0)));
    var scale = Math.abs(number(cell.scaleX, 0.65)) || 0.65;
    cell.__lhsFullPowerHud = true;
    cell.__lhsFullPowerView = view;
    cell.__lhsFullPowerLocalWidth = budget / scale;
    cell.width = cell.__lhsFullPowerLocalWidth;
    // Keep the existing name/HP geometry. Move only old-HUD privilege buttons
    // into the unused space to the right of the full combat-power display.
    if (hasSiblingButtons) {
      if (privilege.__lhsFullPowerBaseLeft == null) privilege.__lhsFullPowerBaseLeft = number(privilege.left, number(privilege.x, 305));
      privilege.left = Math.max(privilege.__lhsFullPowerBaseLeft, left + budget + 45);
    }
    if (cell.powerLabel && cell.powerLabel.parent) {
      var group = cell.powerLabel.parent;
      group.width = cell.width;
      for (var i = 0; i < number(group.numChildren, 0); i++) {
        var child = group.getChildAt(i);
        if (child && child.source === 'main_bm_zhanliBG') child.width = cell.width;
      }
    }
    render(cell, cell.data);
    return true;
  }
  function bind(view) {
    var cell = view && view.powerCell;
    if (!cell || view.__lhsFullPowerClosed) return;
    cell.__lhsFullPowerHud = true;
    layout(view);
    var egret = root.egret;
    if (egret && typeof egret.callLater === 'function' && !view.__lhsFullPowerQueued) {
      view.__lhsFullPowerQueued = true;
      egret.callLater(function () { view.__lhsFullPowerQueued = false; if (!view.__lhsFullPowerClosed) layout(view); }, view);
    }
  }
  function wrapPanel(Type) {
    var proto = Type && Type.prototype;
    if (!proto || typeof proto.OnOpen !== 'function' || typeof proto.updatePower !== 'function') return false;
    if (Object.prototype.hasOwnProperty.call(proto, '__lhsFullPowerWrapped')) return true;
    ['OnOpen', 'initPower', 'updatePower'].forEach(function (name) {
      var original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function () {
        if (name === 'OnOpen') {
          this.__lhsFullPowerClosed = false;
          if (this.powerCell) { this.powerCell.__lhsFullPowerClosed = false; this.powerCell.__lhsFullPowerRetryCount = 0; }
        }
        if (this.powerCell) this.powerCell.__lhsFullPowerHud = true;
        var result = original.apply(this, arguments);
        bind(this);
        return result;
      };
    });
    var close = proto.OnClose;
    proto.OnClose = function () {
      this.__lhsFullPowerClosed = true;
      if (this.powerCell) { this.powerCell.__lhsFullPowerClosed = true; cancelRetry(this.powerCell); }
      return close && close.apply(this, arguments);
    };
    proto.__lhsFullPowerWrapped = true;
    return true;
  }
  function install() {
    if (api.installed) return true;
    api.attempts++;
    var get = root.egret && root.egret.getDefinitionByName;
    var PowerCell = root.PowerCell || (get && get('PowerCell'));
    var MainPanel = root.MainPanel || (get && get('MainPanel'));
    var MainPanelNew = root.MainPanelNew || (get && get('MainPanelNew'));
    var proto = PowerCell && PowerCell.prototype;
    if (!proto || typeof proto.dataChanged !== 'function') return false;
    if (!proto.__lhsFullPowerWrapped) {
      var changed = proto.dataChanged, setValue = proto.setValue, partAdded = proto.partAdded;
      proto.partAdded = function (name, instance) {
        var result = partAdded && partAdded.apply(this, arguments);
        if (this.__lhsFullPowerHud && name === 'powerLabel') {
          this.__lhsFullPowerRetryCount = 0;
          watchFont(this, instance);
          render(this, this.data);
        }
        return result;
      };
      proto.dataChanged = function () {
        if (!this.__lhsFullPowerHud) return changed.apply(this, arguments);
        render(this, this.data);
      };
      proto.setValue = function (value) {
        var result = setValue && setValue.apply(this, arguments);
        if (this.__lhsFullPowerHud) render(this, value);
        return result;
      };
      proto.__lhsFullPowerWrapped = true;
    }
    if (!wrapPanel(MainPanel) || !wrapPanel(MainPanelNew)) return false;
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS][HudPowerFull] installed ' + api.version);
    return true;
  }
  api.format = fullText;
  api.layout = layout;
  // Authoritative-power sync calls this renderer after replacing the cell
  // value.  Keep the capability explicit so an older/partially loaded HUD
  // addon cannot make the sync path throw before it emits +/- feedback.
  api.render = render;
  api.install = install;
  (function retry() { if (!install() && api.attempts < 120) root.setTimeout(retry, 250); }());
}(window));
