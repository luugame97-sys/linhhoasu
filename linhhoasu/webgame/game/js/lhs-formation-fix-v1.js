/* Formation (Pháp tướng) client response guard and event synchronization. */
(function (root) {
    'use strict';

    var VERSION = '20260915_formation_singleflight_v3';
    if (root.LhsFormationFixV1 && root.LhsFormationFixV1.version === VERSION) return;

    var api = root.LhsFormationFixV1 = {
        version: VERSION,
        installed: false,
        patchedMethods: [],
        attempts: 0
    };

    function manager() {
        return root.GlobalManager || root.GameGlobalYDXZ || root.W || null;
    }

    function event(name) {
        return root.MessageDef && root.MessageDef[name] ? root.MessageDef[name] : name;
    }

    function dispatch(name, value) {
        var centerType = root.MessageCenter;
        if (!centerType || typeof centerType.ins !== 'function') return;
        var center = centerType.ins();
        if (center && typeof center.dispatch === 'function') center.dispatch(event(name), value);
    }

    function playSound(name) {
        var m = manager();
        if (m && m.SoundManager && typeof m.SoundManager.PlayEffect === 'function') {
            m.SoundManager.PlayEffect(name);
        }
    }

    function mergeInfo(model, data, tag) {
        var info = model && model._formationInfo;
        if (!info || !data) return false;
        var changed = false;
        if (data.exp != null && Number.isFinite(Number(data.exp))) {
            info.exp = Number(data.exp);
        }
        if (tag === 3001 && data.level != null && Number(data.level) > 0 && info.level !== Number(data.level)) {
            info.level = Number(data.level);
            changed = true;
        }
        if (tag === 3002) {
            if (data.grade != null && Number(data.grade) > 0) info.grade = Number(data.grade);
            if (data.level != null && Number(data.level) > 0) info.level = Number(data.level);
            if (data.exp != null && Number.isFinite(Number(data.exp))) info.exp = Number(data.exp);
            changed = true;
        }
        return changed;
    }

    function prototypeOf(model) {
        if (!model) return null;
        if (model.constructor && model.constructor.prototype) return model.constructor.prototype;
        return Object.getPrototypeOf ? Object.getPrototypeOf(model) : null;
    }

    function patchUpgrade(proto) {
        if (!proto || typeof proto.sendFormationUpgrade !== 'function') return false;
        var original = proto.sendFormationUpgrade;
        if (original.__lhsFormationFixV1) return true;
        proto.sendFormationUpgrade = function (count, callback) {
            var self = this;
            if (self.__lhsFormationUpgradePending) return false;
            self.__lhsFormationUpgradePending = true;
            return self.Rpc(3001, { count: count }, function (data) {
                self.__lhsFormationUpgradePending = false;
                data = data || {};
                var ok = Number(data.result) === 0;
                if (!ok) {
                    dispatch('FORMATION_INFO_REFRESH');
                    return;
                }
                var levelChanged = mergeInfo(self, data, 3001);
                dispatch('FORMATION_INFO_REFRESH');
                playSound('common_levelup_1_mp3');
                if (typeof callback === 'function') callback(levelChanged);
                dispatch('ATTR_CHANGE', 3);
            }, function () { self.__lhsFormationUpgradePending = false; });
        };
        proto.sendFormationUpgrade.__lhsFormationFixV1 = true;
        proto.sendFormationUpgrade.__lhsFormationFixV1Original = original;
        api.patchedMethods.push('sendFormationUpgrade');
        return true;
    }

    function patchGrade(proto) {
        if (!proto || typeof proto.sendFormationUpgradeGrade !== 'function') return false;
        var original = proto.sendFormationUpgradeGrade;
        if (original.__lhsFormationFixV1) return true;
        proto.sendFormationUpgradeGrade = function (callback) {
            var self = this;
            if (self.__lhsFormationGradePending) return false;
            self.__lhsFormationGradePending = true;
            return self.Rpc(3002, {}, function (data) {
                self.__lhsFormationGradePending = false;
                data = data || {};
                var ok = Number(data.result) === 0;
                if (!ok) {
                    dispatch('FORMATION_INFO_REFRESH');
                    return;
                }
                mergeInfo(self, data, 3002);
                dispatch('FORMATION_INFO_REFRESH');
                playSound('effect_realmWin_mp3');
                if (typeof callback === 'function') callback(data);
                dispatch('ATTR_CHANGE', 3);
            }, function () { self.__lhsFormationGradePending = false; });
        };
        proto.sendFormationUpgradeGrade.__lhsFormationFixV1 = true;
        proto.sendFormationUpgradeGrade.__lhsFormationFixV1Original = original;
        api.patchedMethods.push('sendFormationUpgradeGrade');
        return true;
    }

    function install() {
        api.attempts += 1;
        var m = manager();
        var proto = prototypeOf(m && m.FormationModel);
        var a = patchUpgrade(proto);
        var b = patchGrade(proto);
        if (a && b) {
            api.installed = true;
            return;
        }
        if (api.attempts < 120 && typeof root.setTimeout === 'function') root.setTimeout(install, 100);
    }

    install();
}(window));
