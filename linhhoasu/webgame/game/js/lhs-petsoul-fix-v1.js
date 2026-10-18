/* PetSoul box route and safe one-key star-up selection. */
(function (root) {
  'use strict';

  var VERSION = '20261002_petsoul_box_star_v2';
  if (root.LhsPetSoulFixV1 && root.LhsPetSoulFixV1.version === VERSION) return;
  var api = root.LhsPetSoulFixV1 = { version: VERSION, installed: false, attempts: 0 };

  function manager() {
    return root.GlobalManager || root.GameGlobalYDXZ || root.W || null;
  }

  function installConfig(config) {
    var asset = config.AssetsConfig && (config.AssetsConfig[100802] || config.AssetsConfig['100802']);
    if (!asset || asset.icon !== 'random_petsoul_02' || Number(asset.quality) !== 6) return false;
    config.AssetsUseConfig = config.AssetsUseConfig || {};
    config.AssetsUseConfig[100802] = Object.assign({}, config.AssetsUseConfig[100802] || {}, {
      id: 100802,
      type: 102,
      attrs: [],
      conditions: [],
    });
    // The native ItemModel red/use check reads both tables in different builds.
    asset.useType = 102;
    asset.ifShow = 1;
    asset.ifShowNum = 1;
    api.boxConfigInstalled = true;
    return true;
  }

  function patchOneKey(model, config, itemModel) {
    if (!model || typeof model.getOneKeyStarUpSelectItems !== 'function'
      || model.__lhsPetSoulOneKeyV1) return !!(model && model.__lhsPetSoulOneKeyV1);
    var original = model.getOneKeyStarUpSelectItems;
    model.getOneKeyStarUpSelectItems = function (soulId) {
      try {
        var soulCfg = config.PetSoulConfig && (config.PetSoulConfig[soulId] || config.PetSoulConfig[String(soulId)]);
        var soul = typeof model.getPetSoulData === 'function' ? model.getPetSoulData(soulId) : null;
        var row = soulCfg && soul && typeof model.getUpgradeConfig === 'function'
          ? model.getUpgradeConfig(soulCfg.quality, soul.star) : null;
        var materials = config.PetSoulUpgradeMaterialConfig || {};
        var base = config.PetSoulBaseConfig || {};
        var requireScore = Math.max(0, Math.floor(Number(row && row.require) || 0));
        var maxSlots = Math.max(1, Math.floor(Number(base.maxUpgradeSlotCount) || 6));
        if (!soulCfg || !soul || requireScore <= 0 || !itemModel || typeof itemModel.GetItemCount !== 'function') {
          return original.apply(this, arguments);
        }
        var candidates = [];
        Object.keys(materials).forEach(function (key) {
          var material = materials[key], id = Number(key);
          var count = Math.max(0, Math.floor(Number(itemModel.GetItemCount(id)) || 0));
          var score = Math.max(0, Math.floor(Number(material && material.score) || 0));
          if (!Number.isSafeInteger(id) || id <= 0 || count <= 0 || score <= 0) return;
          var same = Number(material.element) === Number(soulCfg.races);
          var unit = score * (1 + (Math.max(0, Number(base.extraValuePercent) || 0) / 10000));
          candidates.push({ id: id, count: count, unit: Math.max(1, same ? unit : score), same: same, sort: Number(material.sort) || id });
        });
        // Compare low-score-first, high-score-first and single-material plans.
        // Prefer the smallest score that reaches 100%, not the rarest material.
        var plans = [];
        function makePlan(rows) {
          var selected = {}, remaining = requireScore, score = 0, slots = 0;
          rows.forEach(function (candidate) {
            if (remaining <= 0 || slots >= maxSlots) return;
            var take = Math.min(candidate.count, Math.ceil(remaining / candidate.unit));
            if (take <= 0) return;
            selected[candidate.id] = take;
            score = model.getStartUpItemsScore(soulId, selected);
            remaining = requireScore - score;
            slots += 1;
          });
          plans.push({ items: selected, score: score });
        }
        candidates.sort(function (a, b) { return a.unit - b.unit || a.sort - b.sort; });
        makePlan(candidates);
        makePlan(candidates.slice().reverse());
        candidates.forEach(function (candidate) { makePlan([candidate]); });
        plans.sort(function (a, b) {
          var aReady = a.score >= requireScore, bReady = b.score >= requireScore;
          return aReady !== bReady ? (aReady ? -1 : 1) : aReady ? a.score - b.score : b.score - a.score;
        });
        return plans.length ? plans[0].items : {};
      } catch (_) {
        return original.apply(this, arguments);
      }
    };
    model.__lhsPetSoulOneKeyV1 = true;
    api.oneKeyPatched = true;
    return true;
  }

  function patchPanels(m) {
    var Select = root.PetSoulInfoStarUpSelectPanel;
    var Star = root.PetSoulInfoStarUpPanel;
    if (!Select || !Star) return false;
    var proto = Select.prototype;
    if (!proto.__lhsPetSoulSelectV2) {
      var initEvent = proto.initEvent;
      proto.initEvent = function () {
        var panel = this, addClick = this.AddClick;
        // Retain all native listeners and OnClose callback. Only intercept the
        // confirm click when enough material has already been selected.
        this.AddClick = function (target, callback) {
          var args = Array.prototype.slice.call(arguments);
          if (target === panel.setBtn) args[1] = function () {
            var model = m.PetSoulModel, id = model.petSoulId;
            var soul = model.getPetSoulData(id), cfg = m.Config.PetSoulConfig[id];
            var row = soul && cfg && model.getUpgradeConfig(cfg.quality, soul.star);
            if (row && row.require > 0 && model.getStartUpItemsScore(id, panel._selectItems) >= row.require) {
              panel.CloseSelf();
              return;
            }
            return callback.apply(this, arguments);
          };
          return addClick.apply(this, args);
        };
        try { return initEvent.apply(this, arguments); }
        finally { this.AddClick = addClick; }
      };
      proto.__lhsPetSoulSelectV2 = true;
    }
    // Probability is capped at 100%; selected material remains untouched.
    [[proto, 'updateRate'], [Star.prototype, 'updateUI']].forEach(function (entry) {
      var p = entry[0], key = entry[1], marker = '__lhsRate_' + key;
      if (p[marker]) return;
      var original = p[key];
      p[key] = function () {
        var result = original.apply(this, arguments);
        if (this.rateLab && parseFloat(this.rateLab.text) > 100) this.rateLab.text = '100%';
        return result;
      };
      p[marker] = true;
    });
    var Detail = root.PetDetailView, events = root.MessageDef;
    if (Detail && events && !Detail.prototype.__lhsSoulRefreshV2) {
      var onOpen = Detail.prototype.OnOpen;
      Detail.prototype.OnOpen = function () {
        var result = onOpen.apply(this, arguments);
        this.observe(events.PET_SOUL_STAR_UPDATE, this.update);
        this.observe(events.PET_SOUL_DATA_UPDATE, this.update);
        return result;
      };
      Detail.prototype.__lhsSoulRefreshV2 = true;
    }
    api.panelsPatched = true;
    return true;
  }

  function install() {
    api.attempts += 1;
    var m = manager(), config = m && m.Config, model = m && m.PetSoulModel;
    if (!config || !config.AssetsConfig || !config.PetSoulConfig || !model) {
      if (api.attempts < 600) root.setTimeout(install, 250);
      return false;
    }
    installConfig(config);
    patchOneKey(model, config, m.ItemModel);
    patchPanels(m);
    api.installed = !!(api.boxConfigInstalled && api.oneKeyPatched && api.panelsPatched);
    if (!api.installed && api.attempts < 600) root.setTimeout(install, 250);
    return api.installed;
  }

  api.install = install;
  install();
}(window));
