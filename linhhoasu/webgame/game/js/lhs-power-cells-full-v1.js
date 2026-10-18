/* Full raw combat-power display for profile/rank/shared power cells. No model writes. */
(function (root) {
  'use strict';
  if (root.LhsPowerCellsFullV1) return;
  var api = root.LhsPowerCellsFullV1 = { version: '20260917_power_cells_full_v1', installed: false, attempts: 0 };
  function numeric(value, fallback) { var n = Number(value); return isFinite(n) ? n : fallback; }
  function format(value) {
    // Preserve deliberately hidden power and server-provided nonnumeric labels.
    if (typeof value === 'string' && !/^\d+$/.test(value)) return value;
    return root.LhsHudPowerFullV1.format(value);
  }
  function hud(cell) { return !!cell.__lhsFullPowerHud; }
  function cancel(cell) {
    if (cell.__lhsAllPowerTimer != null) root.clearTimeout(cell.__lhsAllPowerTimer);
    cell.__lhsAllPowerTimer = null;
  }
  function later(cell) {
    if (hud(cell) || cell.__lhsAllPowerClosed || cell.__lhsAllPowerTimer != null
      || numeric(cell.__lhsAllPowerRetries, 0) >= 60) return;
    cell.__lhsAllPowerRetries = numeric(cell.__lhsAllPowerRetries, 0) + 1;
    cell.__lhsAllPowerTimer = root.setTimeout(function () {
      cell.__lhsAllPowerTimer = null;
      draw(cell, cell.__lhsAllPowerValue);
    }, 50);
  }
  function owner(cell) {
    var p = cell.parent;
    for (var i = 0; p && i < 8; i++, p = p.parent) if (p.power === cell || p.powerCell === cell) return p;
    return null;
  }
  function budget(cell) {
    // EUI explicit width (the engine's native measurement contract), not a
    // previous abbreviated string's measured width. Preserve fixed card sizes.
    if (cell.__lhsAllPowerExplicitWidth == null) {
      var explicit = cell.$UIComponent && Number(cell.$UIComponent[8]);
      cell.__lhsAllPowerExplicitWidth = explicit > 80 && isFinite(explicit) ? explicit : 0;
    }
    var max = cell.__lhsAllPowerExplicitWidth || 380;
    var p = cell.parent, scale = Math.abs(numeric(cell.scaleX, 1)) || 1;
    var parentExplicit = p && p.$UIComponent && Number(p.$UIComponent[8]);
    var parentAnchored = p && isFinite(Number(p.left)) && isFinite(Number(p.right));
    if (p && p.width > 0 && (parentExplicit > 0 || parentAnchored)) {
      var offset = isFinite(Number(cell.left)) ? Number(cell.left) : 0;
      // Centered cards can use their parent's full width; left-anchored rows
      // retain space at the right edge and do not change row geometry.
      var room = (p.width - offset - 8) / scale;
      if (room > 100) max = Math.min(max, room);
    }
    return Math.max(100, max);
  }
  function watch(cell, label) {
    if (!label || typeof label.$setFontData !== 'function' || label.__lhsAllPowerOwner === cell) return;
    label.__lhsAllPowerOwner = cell;
    var original = label.$setFontData;
    label.$setFontData = function () {
      var result = original.apply(this, arguments);
      if (result && this === cell.powerLabel && !hud(cell) && !cell.__lhsAllPowerClosed) {
        cell.__lhsAllPowerRetries = 0;
        draw(cell, cell.__lhsAllPowerValue);
      }
      return result;
    };
  }
  function bind(cell) {
    if (cell.__lhsAllPowerEvents || typeof cell.addEventListener !== 'function' || !root.egret) return;
    cell.__lhsAllPowerEvents = true;
    cell.addEventListener(root.egret.Event.ADDED_TO_STAGE, function () {
      cell.__lhsAllPowerClosed = false; cell.__lhsAllPowerRetries = 0;
      draw(cell, cell.__lhsAllPowerValue);
    }, cell);
    cell.addEventListener(root.egret.Event.REMOVED_FROM_STAGE, function () {
      cell.__lhsAllPowerClosed = true; cancel(cell);
    }, cell);
  }
  function draw(cell, value) {
    if (!cell || hud(cell)) { if (cell) cancel(cell); return; }
    cell.__lhsAllPowerValue = value;
    if (cell.__lhsAllPowerClosed || cell.__lhsAllPowerDrawing || cell.__lhsAllPowerAnimating) return;
    bind(cell);
    var label = cell.powerLabel;
    if (!label) { later(cell); return; }
    cell.__lhsAllPowerDrawing = true;
    try {
      watch(cell, label);
      var max = budget(cell), group = label.parent;
      cell.width = max;
      if (group) {
        group.width = max;
        for (var i = 0; i < numeric(group.numChildren, 0); i++) {
          var child = group.getChildAt(i);
          if (child && child.source === 'main_bm_zhanliBG') child.width = max;
        }
      }
      var panel = owner(cell), button = panel && panel.treeBlessBtn;
      if (button && button.parent === cell.parent) {
        if (button.__lhsAllPowerBaseLeft == null) button.__lhsAllPowerBaseLeft = numeric(button.left, 280);
        button.left = Math.max(button.__lhsAllPowerBaseLeft, numeric(cell.left, 110) + max * Math.abs(numeric(cell.scaleX, 1)) + 12);
      }
      label.text = format(value);
      label.maxWidth = 100000;
      label.width = Math.max(4096, label.text.length * 100);
      label.wordWrap = false;
      label.letterSpacing = -1;
      label.scaleX = label.scaleY = 1;
      if (typeof label.validateNow === 'function') label.validateNow();
      var measured = numeric(label.textWidth, 0);
      if (measured <= 0 && label.text) { later(cell); return; }
      cancel(cell); cell.__lhsAllPowerRetries = 0;
      label.width = measured + 2;
      var left = isFinite(Number(label.left)) ? Number(label.left) : 40;
      var available = Math.max(20, max - left - 8);
      // Some rank rows put a title/score beside power on the same line.
      // Respect those rendered bounds rather than moving unrelated controls.
      if (panel && cell.parent && typeof label.getTransformedBounds === 'function') {
        var labelBox = label.getTransformedBounds(cell.parent);
        var scale = Math.abs(numeric(cell.scaleX, 1)) || 1;
        ['titleItem', 'labScore', 'scoreLabel', 'btnChallenge'].forEach(function (key) {
          var peer = panel[key];
          if (!peer || peer.visible === false || typeof peer.getTransformedBounds !== 'function') return;
          var b = peer.getTransformedBounds(cell.parent);
          if (b.width > 0 && b.height > 0 && b.x > labelBox.x && b.y < labelBox.bottom && b.bottom > labelBox.y) {
            available = Math.min(available, Math.max(20, (b.x - labelBox.x - 8) / scale));
          }
        });
      }
      if (measured > available) label.scaleX = label.scaleY = available / measured;
    } finally { cell.__lhsAllPowerDrawing = false; }
  }
  function patchCells(Type) {
    var p = Type && Type.prototype;
    if (!p || typeof p.dataChanged !== 'function') return false;
    if (p.__lhsAllPowerPatched) return true;
    var changed = p.dataChanged, set = p.setValue, part = p.partAdded, animate = p.playAnim, stop = p.stopAnim;
    p.dataChanged = function () {
      if (hud(this)) return changed.apply(this, arguments);
      draw(this, this.data);
      if (!this.__lhsAllPowerQueued && root.egret && root.egret.callLater) {
        var cell = this; cell.__lhsAllPowerQueued = true;
        root.egret.callLater(function () { cell.__lhsAllPowerQueued = false; draw(cell, cell.__lhsAllPowerValue); }, cell);
      }
    };
    p.setValue = function (value) {
      var result = set && set.apply(this, arguments);
      if (!hud(this)) draw(this, value);
      return result;
    };
    p.partAdded = function (name, instance) {
      var result = part && part.apply(this, arguments);
      if (!hud(this) && name === 'powerLabel') {
        this.__lhsAllPowerRetries = 0; watch(this, instance); draw(this, this.data);
      }
      return result;
    };
    if (animate) p.playAnim = function (value, callback) {
      if (hud(this)) return animate.apply(this, arguments);
      var cell = this; cancel(cell); cell.__lhsAllPowerAnimating = true;
      var result = animate.call(cell, value, function () {
        cell.__lhsAllPowerAnimating = false; draw(cell, value);
        // Egret invokes Tween.onChange after its completion actions; that
        // last native updateText writes plain digits. Reformat next frame.
        if (root.egret && root.egret.callLater) root.egret.callLater(function () {
          if (!cell.__lhsAllPowerAnimating) draw(cell, cell.__lhsAllPowerValue);
        }, cell);
        if (callback) callback.apply(this, arguments);
      });
      // Native same-value animation does not invoke a completion callback.
      if (Number(cell.data) === Number(value)) { cell.__lhsAllPowerAnimating = false; draw(cell, value); }
      return result;
    };
    if (stop) p.stopAnim = function () {
      var result = stop.apply(this, arguments);
      if (!hud(this)) {
        this.__lhsAllPowerAnimating = false;
        draw(this, this.powerLabel && typeof this.powerLabel.num === 'number' ? this.powerLabel.num : this.__lhsAllPowerValue);
      }
      return result;
    };
    p.__lhsAllPowerPatched = true;
    return true;
  }
  function patchOtherItem(Type) {
    var p = Type && Type.prototype;
    if (!p || typeof p.dataChanged !== 'function' || p.__lhsOtherPowerPatched) return;
    var old = p.dataChanged;
    p.dataChanged = function () {
      var result = old.apply(this, arguments);
      if (this.data) draw(this, this.data.isUnknow ? this.powerLabel.text : this.data.power);
      return result;
    };
    p.__lhsOtherPowerPatched = true;
  }
  function patchComparison(Type) {
    var p = Type && Type.prototype;
    if (!p || typeof p.dataChanged !== 'function' || p.__lhsPowerComparePatched) return;
    var old = p.dataChanged;
    p.dataChanged = function () {
      for (var k = 0; k < 2; k++) {
        var part = this['powerLab' + k], previous = part && part.__lhsPowerCompareStyle;
        if (previous) { part.width = previous.width; part.maxWidth = previous.maxWidth; part.scaleX = previous.scaleX; part.scaleY = previous.scaleY; }
      }
      var result = old.apply(this, arguments);
      if (this.data && this.data.isPower) for (var i = 0; i < 2; i++) {
        var label = this['powerLab' + i];
        if (!label) continue;
        if (!label.__lhsPowerCompareStyle) label.__lhsPowerCompareStyle = { width: label.width, maxWidth: label.maxWidth, scaleX: label.scaleX, scaleY: label.scaleY };
        label.text = format(this.data['value' + i]); label.maxWidth = 100000; label.width = 4096;
        label.scaleX = label.scaleY = 1;
        if (label.validateNow) label.validateNow();
        var width = numeric(label.textWidth, 0); label.width = width + 2;
        if (width > 170) label.scaleX = label.scaleY = 170 / width;
      }
      return result;
    };
    p.__lhsPowerComparePatched = true;
  }
  function install() {
    if (api.installed) return true;
    api.attempts++;
    if (!root.LhsHudPowerFullV1 || !root.LhsHudPowerFullV1.installed || !patchCells(root.PowerCell)) return false;
    patchOtherItem(root.OldTrekPowerItem);
    patchComparison(root.TempleAttrPkCell);
    api.installed = true;
    if (root.console && root.console.info) root.console.info('[LHS][PowerCellsFull] installed ' + api.version);
    return true;
  }
  api.format = format;
  api.render = draw;
  api.install = install;
  (function retry() { if (!install() && api.attempts < 120) root.setTimeout(retry, 250); }());
}(window));
