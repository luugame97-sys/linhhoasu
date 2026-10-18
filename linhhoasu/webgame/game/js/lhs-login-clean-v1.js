/* LHS Clean Login UI: Completely hide Chinese advice notice and CADPA badge */
(function (root) {
  'use strict';

  var VERSION = '20260920_login_clean_v1';
  if (root.__lhsLoginCleanV1 && root.__lhsLoginCleanV1.version === VERSION) return;

  var targetNames = {
    'adviceGroup': true,
    'adviceImg': true,
    'beianGroup': true,
    'beianLabel': true,
    'tipsBg': true
  };

  function hideTarget(target) {
    if (!target) return;
    try {
      target.visible = false;
      target.includeInLayout = false;
      target.alpha = 0;
      target.width = 0;
      target.height = 0;
      if (typeof target.touchEnabled !== 'undefined') target.touchEnabled = false;
      if (typeof target.touchChildren !== 'undefined') target.touchChildren = false;

      if (!target.__lhsCleanLocked) {
        target.__lhsCleanLocked = true;
        try {
          Object.defineProperty(target, 'visible', {
            get: function () { return false; },
            set: function () {},
            configurable: true
          });
        } catch (_) {}
        try {
          Object.defineProperty(target, 'includeInLayout', {
            get: function () { return false; },
            set: function () {},
            configurable: true
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  function cleanContainer(node) {
    if (!node) return;
    try {
      if (targetNames[node.name]) {
        hideTarget(node);
      }
      for (var key in targetNames) {
        if (node[key]) {
          hideTarget(node[key]);
        }
      }
    } catch (_) {}
  }

  function walk(node, depth) {
    if (!node || (depth || 0) > 32) return;
    cleanContainer(node);
    if (typeof node.numChildren === 'number') {
      for (var i = 0; i < node.numChildren; i++) {
        try {
          var child = node.getChildAt(i);
          if (child) walk(child, (depth || 0) + 1);
        } catch (_) {}
      }
    }
  }

  // 1. Hook eui.Component lifecycle
  function hookEUI() {
    var eui = root.eui;
    if (!eui || !eui.Component || !eui.Component.prototype) return false;
    var proto = eui.Component.prototype;
    if (proto.__lhsCleanHooked) return true;
    proto.__lhsCleanHooked = true;

    var originalPartAdded = proto.partAdded;
    proto.partAdded = function (partName, instance) {
      if (targetNames[partName]) {
        hideTarget(instance);
      }
      if (typeof originalPartAdded === 'function') {
        originalPartAdded.apply(this, arguments);
      }
      if (targetNames[partName]) {
        hideTarget(instance);
      }
    };

    var originalChildrenCreated = proto.childrenCreated;
    proto.childrenCreated = function () {
      if (typeof originalChildrenCreated === 'function') {
        originalChildrenCreated.apply(this, arguments);
      }
      cleanContainer(this);
    };

    return true;
  }

  // 2. Hook specific login/loading view classes
  function hookLoginClasses() {
    var classes = ['LoginUI', 'LoginUINew', 'LoginAnimUI', 'LoginAnimUINew', 'LoadingUI', 'StartView'];
    for (var i = 0; i < classes.length; i++) {
      var cName = classes[i];
      var cls = (root.egret && root.egret.getDefinitionByName ? root.egret.getDefinitionByName(cName) : null) || root[cName];
      if (cls && cls.prototype && !cls.prototype.__lhsCleanClassHooked) {
        cls.prototype.__lhsCleanClassHooked = true;
        (function (c) {
          var origOpen = c.prototype.OnOpen;
          if (typeof origOpen === 'function') {
            c.prototype.OnOpen = function () {
              var res = origOpen.apply(this, arguments);
              cleanContainer(this);
              return res;
            };
          }
          var origChildrenCreated = c.prototype.childrenCreated;
          if (typeof origChildrenCreated === 'function') {
            c.prototype.childrenCreated = function () {
              var res = origChildrenCreated.apply(this, arguments);
              cleanContainer(this);
              return res;
            };
          }
        })(cls);
      }
    }
  }

  // 3. Periodic stage sweep during login/loading
  var timer = null;
  var sweepCount = 0;
  function sweep() {
    sweepCount++;
    hookEUI();
    hookLoginClasses();

    var stage = null;
    try {
      if (root.egret && root.egret.lifecycle && root.egret.lifecycle.stage) {
        stage = root.egret.lifecycle.stage;
      }
    } catch (_) {}

    if (stage) {
      walk(stage, 0);
    }

    // After entering main game world, stop the interval
    try {
      var MainClass = root.Main;
      if (MainClass && MainClass.Instance && sweepCount > 100) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
    } catch (_) {}

    if (sweepCount > 600 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  hookEUI();
  hookLoginClasses();
  timer = setInterval(sweep, 100);

  root.__lhsLoginCleanV1 = {
    version: VERSION,
    hideTarget: hideTarget,
    cleanContainer: cleanContainer,
    walk: walk,
    hookEUI: hookEUI,
    hookLoginClasses: hookLoginClasses,
    sweep: sweep
  };
})(typeof window !== 'undefined' ? window : this);
