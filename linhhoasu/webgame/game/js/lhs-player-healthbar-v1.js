/* Player-only health bars for every map raid. NPC and monster entities are unchanged. */
(function (root) {
  'use strict';
  if (root.LhsPlayerHealthBarV1) return;

  var api = root.LhsPlayerHealthBarV1 = {
    version: '20260917_player_healthbar_reanchor_v8',
    installed: false,
    attempts: 0,
    shown: 0,
    errors: 0
  };
  var NAME_RAISE_Y = 18;
  var NAME_BAR_GAP = 3;

  function number(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function isPlayerData(raid, data) {
    return !!(raid && data && String(data.dbid || '') && raid.roleEnityType != null
      && Number(data.type) === Number(raid.roleEnityType));
  }

  function isPlayerEntity(raid, entity) {
    if (!raid || !entity || typeof entity.GetInfo !== 'function') return false;
    var info = entity.GetInfo();
    return !!(info && String(info.dbid || '') && raid.roleEnityType != null
      && Number(info.type) === Number(raid.roleEnityType));
  }

  function isPlayerMapEntity(entity) {
    if (!entity || typeof entity.GetInfo !== 'function') return false;
    var info = entity.GetInfo();
    if (!info || !String(info.dbid || '')) return false;
    return isPlayerEntity(entity.mRaid, entity);
  }

  function renderedBounds(part, parent) {
    if (!part || typeof part.getTransformedBounds !== 'function') return null;
    var rect = part.getTransformedBounds(parent);
    return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function syncPlayerNameAndBar(entity, applyNameOffset) {
    if (!isPlayerMapEntity(entity) || entity.__lhsBarPositionSyncing) return false;
    var name = entity.m_NameTxt;
    if (!name) return false;

    if (applyNameOffset && name.visible !== false) {
      // Native UpateName resets y first. Preserve the existing name offset.
      name.y = number(name.y, 0) - NAME_RAISE_Y;
      if (entity.catchGroup) entity.catchGroup.y = name.y - 60;
    }

    // Do not create a ProgressBar while native entity/skin initialization is
    // in progress. AddTeam/show owns creation; layout only moves existing UI.
    var bar = entity.m_HpBar;
    if (!bar || !bar.parent || name.visible === false || entity.visible === false) return false;
    entity.__lhsBarPositionSyncing = true;
    try {
      var row = typeof name.getPlayerNamePart === 'function'
        ? name.getPlayerNamePart() : name.txt;
      if (!row || row.visible === false) return false;
      if (applyNameOffset) {
        if (typeof name.validateNow === 'function') name.validateNow();
        if (typeof bar.validateNow === 'function') bar.validateNow();
      }
      var label = renderedBounds(row, bar.parent);
      // BattleHpBarSkin renders the track in a nested, centered group.
      // Its origin is not the top-left of the visible bar. Use the track
      // group rather than the clipped thumb so low HP cannot shift alignment.
      var track = bar.thumb && bar.thumb.parent;
      var visibleBar = renderedBounds(track, bar.parent);
      if (!label || !visibleBar) return false;
      bar.x += label.x + label.width / 2 - (visibleBar.x + visibleBar.width / 2);
      bar.y += label.y + label.height + NAME_BAR_GAP - visibleBar.y;
      bar.__lhsPlayerNameAnchor = true;
      return true;
    } catch (error) {
      api.errors += 1;
      return false;
    } finally {
      entity.__lhsBarPositionSyncing = false;
    }
  }

  function show(entity, data) {
    if (!entity || typeof entity.ShowBloodBar !== 'function') return false;
    try {
      entity.ShowBloodBar();
      var mapBar = typeof entity.GetHpBar === 'function' ? entity.GetHpBar() : null;
      if (mapBar) mapBar.scaleY = 1;
      var rawBlood = data && data.bloodPer;
      var value = rawBlood == null ? NaN : number(rawBlood, NaN);
      if (!Number.isFinite(value)) {
        var info = typeof entity.GetInfo === 'function' ? entity.GetInfo() : null;
        var attrs = info && info.attributeData;
        var hpKey = root.VariableType && root.VariableType.Hp;
        var maxKey = root.VariableType && root.VariableType.MaxHp;
        var hp = attrs && hpKey != null ? number(attrs[hpKey], NaN) : NaN;
        var max = attrs && maxKey != null ? number(attrs[maxKey], NaN) : NaN;
        if (Number.isFinite(hp) && Number.isFinite(max) && max > 0) {
          if (typeof entity.SetHpBarValue === 'function') entity.SetHpBarValue(hp, max);
        } else if (typeof entity.SetHpBarValue === 'function') {
          entity.SetHpBarValue(10000, 10000);
        }
      } else if (typeof entity.SetHpBarValue === 'function') {
        entity.SetHpBarValue(Math.max(0, Math.min(10000, value)), 10000);
      }
      if (!syncPlayerNameAndBar(entity, false)
        && typeof entity.UpdateBloodPos === 'function' && entity.m_Model
        && typeof entity.m_Model.GetTopPos === 'function') {
        entity.UpdateBloodPos(entity.m_Model.GetTopPos());
      }
      api.shown += 1;
      return true;
    } catch (error) {
      api.errors += 1;
      if (root.console && typeof root.console.warn === 'function') {
        root.console.warn('[LHS][PlayerHealthBar] show failed', error && error.message || error);
      }
      return false;
    }
  }

  function patchPlayerNames(getDefinition) {
    var MapEntity = root.MapEntity || (getDefinition && getDefinition('MapEntity'));
    var proto = MapEntity && MapEntity.prototype;
    if (!proto || typeof proto.UpateName !== 'function') return false;
    function wrap(target) {
      if (!target || typeof target.UpateName !== 'function') return false;
      if (target.UpateName.__lhsPlayerNameRaisedV5) return true;
      var original = target.UpateName;
      target.UpateName = function () {
        // Some map subclasses call the base UpateName and then add their own
        // styling. Defer the sync to the outermost wrapper so one invocation
        // cannot apply NAME_RAISE_Y twice.
        var nested = !!this.__lhsPlayerNameSyncing;
        this.__lhsPlayerNameSyncing = true;
        var result;
        try {
          result = original.apply(this, arguments);
        } finally {
          if (!nested) {
            this.__lhsPlayerNameSyncing = false;
            syncPlayerNameAndBar(this, true);
          }
        }
        return result;
      };
      target.UpateName.__lhsPlayerNameRaisedV5 = true;
      return true;
    }
    var base = wrap(proto);

    // Native UpdateInfo/load-end code still calls UpdateBloodPos with the
    // skeleton's p_o point. Intercept that call for players so a later skin
    // callback cannot put the bar back at the old independent anchor.
    function wrapBloodPosition(target) {
      if (!target || typeof target.UpdateBloodPos !== 'function') return false;
      if (target.UpdateBloodPos.__lhsPlayerNameAnchorV1) return true;
      var original = target.UpdateBloodPos;
      target.UpdateBloodPos = function (position) {
        if (!syncPlayerNameAndBar(this, false)) return original.apply(this, arguments);
        return undefined;
      };
      target.UpdateBloodPos.__lhsPlayerNameAnchorV1 = true;
      return true;
    }
    var bloodPosition = wrapBloodPosition(proto);
    // Reuse the entity's native tick (and its native Dispose cleanup). EUI
    // can finish layout after UpateName; recheck the rendered label next frame
    // without forcing layout, altering HP, or tracking skeleton animation.
    if (typeof proto.updateLastSpinePos === 'function'
      && !proto.updateLastSpinePos.__lhsNameTrackV8) {
      var update = proto.updateLastSpinePos;
      proto.updateLastSpinePos = function () {
        var result = update.apply(this, arguments);
        syncPlayerNameAndBar(this, false);
        return result;
      };
      proto.updateLastSpinePos.__lhsNameTrackV8 = true;
    }
    // DungeonMapEntity implements its own UpateName instead of calling the
    // base implementation; wrap it once as well. HotSpring calls the base and
    // must not be wrapped twice.
    var DungeonMapEntity = root.DungeonMapEntity
      || (getDefinition && getDefinition('DungeonMapEntity'));
    var dungeon = DungeonMapEntity && DungeonMapEntity.prototype;
    var dungeonName = !dungeon || !Object.prototype.hasOwnProperty.call(dungeon, 'UpateName') || wrap(dungeon);
    return base && bloodPosition && dungeonName;
  }

  function playerHp() {
    var m = root.GlobalManager || root.GameGlobalYDXZ || root.W || null;
    var attrs = m && m.RoleModel && typeof m.RoleModel.getAllAttr === 'function'
      ? m.RoleModel.getAllAttr() : {};
    var maximum = Math.max(1, Math.floor(number(attrs && attrs[1], 1)));
    var current = maximum;
    var raid = m && m.RaidMgr && m.RaidMgr.mMapRaid;
    var actor = m && m.ActorModel && m.ActorModel.actorID;
    var entity = raid && typeof raid.GetEntity === 'function' && actor != null
      ? (raid.GetEntity(actor) || raid.GetEntity(String(actor))) : null;
    var info = entity && typeof entity.GetInfo === 'function' ? entity.GetInfo() : null;
    if (info) {
      var hpKey = root.VariableType && root.VariableType.Hp;
      var maxKey = root.VariableType && root.VariableType.MaxHp;
      var hp = typeof info.getAtt === 'function' ? number(info.getAtt(hpKey), NaN)
        : number(info.attributeData && info.attributeData[hpKey], NaN);
      var max = typeof info.getAtt === 'function' ? number(info.getAtt(maxKey), NaN)
        : number(info.attributeData && info.attributeData[maxKey], NaN);
      if (Number.isFinite(hp) && Number.isFinite(max) && max > 0) {
        current = Math.max(0, Math.min(maximum, Math.round(maximum * hp / max)));
      }
    }
    return { current: current, maximum: maximum, text: current + '/' + maximum };
  }

  function updateHud(view) {
    var bar = view && view.__lhsHudHealthBar;
    if (!bar) return;
    var hp = playerHp();
    bar.maximum = hp.maximum;
    bar.value = hp.current;
    bar.__lhsText = hp.text;
    if (bar.labelDisplay) {
      bar.labelDisplay.visible = true;
      bar.labelDisplay.text = hp.text;
      bar.labelDisplay.size = hp.text.length > 19 ? 10 : hp.text.length > 15 ? 12 : 14;
    }
  }

  function ensureHud(view) {
    if (!view || !view.playerNameLabel || !view.playerNameLabel.parent || !view.powerCell) return false;
    var eui = root.eui;
    if (!eui || typeof eui.ProgressBar !== 'function') return false;
    var parent = view.playerNameLabel.parent;
    if (view.__lhsHudParentBaseTop == null) {
      view.__lhsHudParentBaseTop = number(parent.top, 27);
    }
    parent.top = 16;
    parent.height = 55;
    view.playerNameLabel.verticalCenter = -13;
    if (!view.__lhsHudHealthBar) {
      var bar = view.__lhsHudHealthBar = new eui.ProgressBar();
      bar.name = 'lhsPlayerHealthBar';
      bar.skinName = 'ProgressBar1Skin';
      bar.x = 0;
      bar.y = 27;
      bar.width = 160;
      bar.height = 23;
      bar.slideDuration = 0;
      bar.touchEnabled = false;
      bar.touchChildren = false;
      bar.labelFunction = function () { return bar.__lhsText || ''; };
      parent.addChild(bar);
      if (typeof bar.validateNow === 'function') bar.validateNow();
      if (bar.thumb) bar.thumb.source = 'battle_bm_bloodBar_g';
      if (bar.labelDisplay) {
        bar.labelDisplay.visible = true;
        bar.labelDisplay.bold = true;
        bar.labelDisplay.stroke = 2;
      }
    }
    if (view.__lhsHudPowerBaseLeft == null) {
      view.__lhsHudPowerBaseLeft = number(view.powerCell.left, 0);
    }
    view.powerCell.left = view.__lhsHudPowerBaseLeft + 45;
    updateHud(view);
    if (!view.__lhsHudHealthTimer) {
      view.__lhsHudHealthTimer = root.setInterval(function () { updateHud(view); }, 250);
    }
    return true;
  }

  function patchMainPanel(Type) {
    var proto = Type && Type.prototype;
    if (!proto || typeof proto.OnOpen !== 'function') return false;
    if (proto.OnOpen.__lhsPlayerHudV4) return true;
    var open = proto.OnOpen, close = proto.OnClose;
    proto.OnOpen = function () {
      var result = open.apply(this, arguments);
      ensureHud(this);
      return result;
    };
    proto.OnOpen.__lhsPlayerHudV4 = true;
    proto.OnClose = function () {
      if (this.__lhsHudHealthTimer) {
        root.clearInterval(this.__lhsHudHealthTimer);
        this.__lhsHudHealthTimer = null;
      }
      return close && close.apply(this, arguments);
    };
    return true;
  }

  function install() {
    if (api.installed) return true;
    api.attempts += 1;
    var getDefinition = root.egret && root.egret.getDefinitionByName;
    var MapRaid = root.MapRaid || (getDefinition && getDefinition('MapRaid'));
    if (!MapRaid || !MapRaid.prototype || typeof MapRaid.prototype.AddTeam !== 'function') return false;

    var mapProto = MapRaid.prototype;
    if (!mapProto.AddTeam.__lhsPlayerHealthBarV1) {
      var originalAddTeam = mapProto.AddTeam;
      mapProto.AddTeam = function (handle, members) {
        var team = originalAddTeam.apply(this, arguments);
        var data = members && members[0];
        if (team && isPlayerData(this, data) && typeof team.GetMapEntity === 'function') {
          show(team.GetMapEntity(), data);
        }
        return team;
      };
      mapProto.AddTeam.__lhsPlayerHealthBarV1 = true;
    }

    var DungeonMapRaid = root.DungeonMapRaid
      || (getDefinition && getDefinition('DungeonMapRaid'));
    if (DungeonMapRaid && DungeonMapRaid.prototype
      && typeof DungeonMapRaid.prototype.MapentityHpChange === 'function'
      && !DungeonMapRaid.prototype.MapentityHpChange.__lhsPlayerHealthBarV1) {
      DungeonMapRaid.prototype.MapentityHpChange = function (handle, hp, maxHp) {
        var entity = typeof this.GetEntity === 'function'
          ? (this.GetEntity(handle) || this.GetEntity(String(handle))) : null;
        if (!isPlayerEntity(this, entity)) return;
        show(entity, null);
        if (typeof entity.SetHpBarValue === 'function') {
          var maximum = Math.max(1, number(maxHp, 10000));
          entity.SetHpBarValue(Math.max(0, Math.min(maximum, number(hp, maximum))), maximum);
        }
      };
      DungeonMapRaid.prototype.MapentityHpChange.__lhsPlayerHealthBarV1 = true;
    }

    var names = patchPlayerNames(getDefinition);
    var oldPanel = root.MainPanel || (getDefinition && getDefinition('MainPanel'));
    var newPanel = root.MainPanelNew || (getDefinition && getDefinition('MainPanelNew'));
    var panels = patchMainPanel(oldPanel) && patchMainPanel(newPanel);
    if (!names || !panels) return false;
    api.installed = true;
    if (root.console && typeof root.console.info === 'function') {
      root.console.info('[LHS][PlayerHealthBar] installed ' + api.version);
    }
    return true;
  }

  api.install = install;
  (function retry() {
    if (!install()) root.setTimeout(retry, 250);
  }());
}(window));
