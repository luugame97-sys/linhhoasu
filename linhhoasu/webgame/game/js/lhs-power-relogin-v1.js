/* LHS relog power synchronization V5. Client-only presentation/state refresh; no reward or DB mutation. */
(function (root) {
    'use strict';

    var VERSION = '20260927_power_relogin_v5';
    if (root.LhsPowerReloginFix && root.LhsPowerReloginFix.version === VERSION) return;

    var api = root.LhsPowerReloginFix = {
        version: VERSION,
        patchedParts: [],
        refreshes: 0,
        fullSyncs: 0,
        installed: false,
        installAttempts: 0
    };
    var pending = {};
    var flushTimer = null;
    var refreshRetryTimer = null;
    var installRetryTimer = null;
    var powerRetryTimer = null;
    var refreshRetryCount = 0;
    var powerRetryCount = 0;
    var warned = false;
    var loginListenerBound = false;

    function getManager() {
        return root.GameGlobalYDXZ || root.GlobalManager || root.W ||
            (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('GlobalManager')) || null;
    }

    function getMessageCenter() {
        var centerType = root.MessageCenter ||
            (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('MessageCenter'));
        return centerType && typeof centerType.ins === 'function' ? centerType.ins() : null;
    }

    function getMessageDef() {
        return root.MessageDef ||
            (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('MessageDef')) || {};
    }

    function numericPower(value) {
        var n = Number(value);
        return isFinite(n) && n >= 0 && Math.floor(n) === n && n > 0 ? n : null;
    }

    function authoritativePower(manager) {
        var role = manager && manager.RoleModel;
        var power = numericPower(role && role._lhsServerPower);
        if (power != null) return power;
        var auth = root.LhsPowerAuthoritativeV1;
        if (auth && typeof auth.getDisplayPower === 'function') {
            power = numericPower(auth.getDisplayPower());
            if (power != null) return power;
        }
        var info = manager && manager.PlayerInfoModel && manager.PlayerInfoModel.playerInfo;
        return numericPower(info && info.power);
    }

    function setPowerCell(view, power) {
        if (!view) return;
        var cell = view.powerCell || view.power;
        if (!cell || typeof cell !== 'object' || !('data' in cell)) return;
        cell.__lhsFullPowerHud = true;
        cell.data = power == null ? '…' : power;
        if (power != null && root.LhsHudPowerFullV1 && typeof root.LhsHudPowerFullV1.render === 'function') {
            root.LhsHudPowerFullV1.render(cell, power);
        }
    }

    function renderAuthoritative(power) {
        var auth = root.LhsPowerAuthoritativeV1;
        if (auth && typeof auth.renderSelf === 'function' && power != null) auth.renderSelf(power);
    }

    function dispatchAuthoritativePower(power) {
        var center = getMessageCenter();
        if (!center || typeof center.dispatch !== 'function' || power == null) return;
        var msgDef = getMessageDef();
        center.dispatch(msgDef.MAINPANEL_POWER_REFRESH || 'MAINPANEL_POWER_REFRESH', power);
    }

    function powerModelReady(manager) {
        var equipModel = manager && manager.EquipModel;
        if (!equipModel || typeof equipModel.getAttrs !== 'function') return false;
        // Native EquipModel.getPresetIdx dereferences _equipInfo.curIndex.
        // During early login _equipInfo is not populated yet; do not call the
        // whole RoleModel calculator until this dependency is ready.
        if (typeof equipModel.getPresetIdx === 'function') {
            try {
                equipModel.getPresetIdx();
            } catch (_) {
                return false;
            }
        }
        return true;
    }

    function queuePowerRetry() {
        if (powerRetryTimer || powerRetryCount >= 120) return;
        powerRetryCount += 1;
        powerRetryTimer = root.setTimeout(function () {
            powerRetryTimer = null;
            if (syncFullPower()) {
                powerRetryCount = 0;
            } else {
                queuePowerRetry();
            }
        }, 50);
    }

    function syncFullPower() {
        var manager = getManager();
        var roleModel = manager && manager.RoleModel;
        if (!roleModel || typeof roleModel.calAllPower !== 'function') return false;
        if (!powerModelReady(manager)) {
            queuePowerRetry();
            return false;
        }

        try {
            if (typeof roleModel.changeAllAttr === 'function') {
                roleModel.changeAllAttr();
            }
            if (typeof roleModel.integrationAttrs === 'function') {
                roleModel.integrationAttrs();
            }

            var fullPower = roleModel.calAllPower();
            roleModel._lhsClientPower = fullPower;
            var displayPower = authoritativePower(manager);
            if (displayPower != null) {
                roleModel._oldPower = displayPower;

                var center = getMessageCenter();
                var msgDef = getMessageDef();
                var powerRefreshEvent = msgDef.MAINPANEL_POWER_REFRESH || 'MAINPANEL_POWER_REFRESH';
                var attrUpdateEvent = msgDef.ROLE_ATTR_UPDATE || 'ROLE_ATTR_UPDATE';

                if (center && typeof center.dispatch === 'function') {
                    center.dispatch(powerRefreshEvent, displayPower);
                    center.dispatch(attrUpdateEvent);
                }

                var ViewManagerClass = (manager && manager.ViewManager) || root.ViewManager ||
                    (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('ViewManager'));
                var viewMgr = ViewManagerClass && (typeof ViewManagerClass.ins === 'function' ? ViewManagerClass.ins() : (typeof ViewManagerClass.getView === 'function' ? ViewManagerClass : null));

                ['MainPanel', 'MainPanelNew'].forEach(function (panelName) {
                    var PanelClass = root[panelName] ||
                        (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName(panelName));
                    var view = viewMgr && typeof viewMgr.getView === 'function' && PanelClass ? viewMgr.getView(PanelClass) : null;
                    if (view && view.powerCell) {
                        setPowerCell(view, displayPower);
                    }
                });

                api.fullSyncs += 1;
                powerRetryCount = 0;
                return true;
            }
            // The local calculator remains available for attrs, but never
            // becomes a displayed value before tag500/6198 supplies one.
            roleModel._oldPower = 0;
            return true;
        } catch (err) {
            if (err && err.name === 'TypeError' && /curIndex/.test(String(err.message || ''))) {
                queuePowerRetry();
                return false;
            }
            if (root.console && root.console.warn) {
                root.console.warn('[LHS] syncFullPower error:', err);
            }
        }
        return false;
    }

    function patchRolePowerChange(Type, name) {
        var prototype = getPrototype(Type, name);
        if (!prototype || typeof prototype.onPowerChange !== 'function') return false;
        var original = prototype.onPowerChange;
        if (original.__lhsPowerReloginFix) return true;
        var wrapped = function () {
            var localPower = null;
            try {
                if (typeof this.calAllPower === 'function') {
                    localPower = this.calAllPower();
                    // Keep the native calculator available to combat/gameplay;
                    // this value is deliberately never sent to presentation.
                    this._lhsClientPower = localPower;
                }
            } catch (err) {
                if (root.console && root.console.warn) {
                    root.console.warn('[LHS] local power calculation failed:', err);
                }
            }

            var displayPower = authoritativePower(getManager());
            if (displayPower != null) {
                // Native onPowerChange calls showPowerTip(old, local) and
                // dispatches the local number. Do not call it: that is the
                // source of the transient 900M+ tip after an equipment change.
                this._oldPower = displayPower;
                renderAuthoritative(displayPower);
                dispatchAuthoritativePower(displayPower);
            } else {
                // Unknown is not local. Keep the old display hidden until the
                // server tag500/tag6198 value becomes available.
                this._oldPower = 0;
            }
            return undefined;
        };
        wrapped.__lhsPowerReloginFix = true;
        wrapped.__lhsPowerReloginOriginal = original;
        prototype.onPowerChange = wrapped;
        api.patchedParts.push(name + '.onPowerChange');
        return true;
    }

    function mergePending(values) {
        Object.keys(values || {}).forEach(function (key) {
            pending[key] = true;
        });
    }

    function queueRefreshRetry() {
        if (refreshRetryTimer || refreshRetryCount >= 120) return;
        refreshRetryCount += 1;
        refreshRetryTimer = root.setTimeout(function () {
            refreshRetryTimer = null;
            flushRefresh();
        }, 50);
    }

    function queueInstallRetry() {
        if (installRetryTimer || api.installAttempts >= 80) return;
        installRetryTimer = root.setTimeout(function () {
            installRetryTimer = null;
            install();
        }, 100);
    }

    function dispatchCategory(category) {
        var center = getMessageCenter();
        if (!center || typeof center.dispatch !== 'function') return false;
        var msgDef = getMessageDef();
        var eventName = msgDef.ATTR_CHANGE || 'ATTR_CHANGE';
        center.dispatch(eventName, category);
        api.refreshes += 1;
        return true;
    }

    function flushRefresh() {
        flushTimer = null;
        var work = pending;
        pending = {};
        if (!Object.keys(work).length) return;

        var manager = getManager();
        var roleModel = manager && manager.RoleModel;
        if (!roleModel || typeof roleModel.changeAttr !== 'function') {
            mergePending(work);
            queueRefreshRetry();
            return;
        }

        var failed = false;
        Object.keys(work).sort(function (a, b) {
            return Number(a) - Number(b);
        }).forEach(function (category) {
            if (!dispatchCategory(Number(category))) failed = true;
        });

        syncFullPower();

        if (failed) {
            mergePending(work);
            queueRefreshRetry();
        } else {
            refreshRetryCount = 0;
        }
    }

    function scheduleRefresh(category) {
        if (category != null) pending[String(category)] = true;
        refreshRetryCount = 0;
        if (!flushTimer) {
            flushTimer = root.setTimeout(flushRefresh, 20);
        }
    }

    function getPrototype(Type, instanceName) {
        if (Type && Type.prototype) return Type.prototype;
        if (root.egret && root.egret.getDefinitionByName) {
            var def = root.egret.getDefinitionByName(instanceName);
            if (def && def.prototype) return def.prototype;
        }
        var manager = getManager();
        var instance = manager && manager[instanceName];
        return instance && Object.getPrototypeOf ? Object.getPrototypeOf(instance) : null;
    }

    function wrap(Type, instanceName, methodName, category) {
        var prototype = getPrototype(Type, instanceName);
        if (!prototype || typeof prototype[methodName] !== 'function') return false;
        var original = prototype[methodName];
        if (original.__lhsPowerReloginFix) return true;
        var wrapped = function () {
            var result = original.apply(this, arguments);
            scheduleRefresh(category);
            return result;
        };
        wrapped.__lhsPowerReloginFix = true;
        wrapped.__lhsPowerReloginOriginal = original;
        prototype[methodName] = wrapped;
        api.patchedParts.push(instanceName + '.' + methodName);
        return true;
    }

    function patchMainPanel(Type, name) {
        var prototype = getPrototype(Type, name);
        if (!prototype || prototype.__lhsPowerSyncWrapped) return !!prototype;

        if (typeof prototype.initPower === 'function') {
            var originalInitPower = prototype.initPower;
            prototype.initPower = function () {
                syncFullPower();
                var result = originalInitPower.apply(this, arguments);
                syncFullPower();
                if (this && this.powerCell) {
                    var manager = getManager();
                    var roleModel = manager && manager.RoleModel;
                    setPowerCell(this, authoritativePower(manager));
                }
                return result;
            };
        }

        if (typeof prototype.OnOpen === 'function') {
            var originalOnOpen = prototype.OnOpen;
            prototype.OnOpen = function () {
                var self = this;
                var result = originalOnOpen.apply(this, arguments);
                syncFullPower();
                if (self && self.powerCell) {
                    var manager = getManager();
                    var roleModel = manager && manager.RoleModel;
                    setPowerCell(self, authoritativePower(manager));
                }
                root.setTimeout(function () {
                    syncFullPower();
                    if (self && self.powerCell) {
                        var mgr = getManager();
                        var rm = mgr && mgr.RoleModel;
                        setPowerCell(self, authoritativePower(mgr));
                    }
                }, 250);
                root.setTimeout(function () {
                    syncFullPower();
                    if (self && self.powerCell) {
                        var mgr = getManager();
                        var rm = mgr && mgr.RoleModel;
                        setPowerCell(self, authoritativePower(mgr));
                    }
                }, 800);
                return result;
            };
        }

        prototype.__lhsPowerSyncWrapped = true;
        api.patchedParts.push(name);
        return true;
    }

    function bindLoginEvent() {
        if (loginListenerBound) return true;
        var center = getMessageCenter();
        if (!center || typeof center.addListener !== 'function') return false;
        var msgDef = getMessageDef();
        var loginEvent = msgDef.ON_LOGIN_INFO_UPDATE || 'ON_LOGIN_INFO_UPDATE';
        center.addListener(loginEvent, function () {
            syncFullPower();
            root.setTimeout(syncFullPower, 200);
            root.setTimeout(syncFullPower, 600);
        }, api);
        loginListenerBound = true;
        api.patchedParts.push('ON_LOGIN_INFO_UPDATE');
        return true;
    }

    function install() {
        api.installAttempts += 1;

        var gemPatched = wrap(root.GemModel, 'GemModel', 'initData', 10);
        var petSoulPatched = wrap(root.PetSoulModel, 'PetSoulModel', 'sc_pet_soul_info', 19);
        var valhallaFormPatched = wrap(root.ValhallaFormationModel, 'ValhallaFormationModel', 'onValhallaFormationInfo', 18);
        var homelandPatched = wrap(root.HomelandModel, 'HomelandModel', 'onHomelandInfo', 16);
        var oldTrekPatched = wrap(root.OldTrekModel, 'OldTrekModel', 'onOldTrekInfo', 20);
        var fatePatched = wrap(root.FateModel, 'FateModel', 'initData', 11);
        var rolePowerPatched = patchRolePowerChange(root.RoleModel, 'RoleModel');

        var mainPanelPatched = patchMainPanel(root.MainPanel, 'MainPanel');
        var mainPanelNewPatched = patchMainPanel(root.MainPanelNew, 'MainPanelNew');
        var loginBound = bindLoginEvent();

        api.installed = gemPatched && petSoulPatched && (mainPanelPatched || mainPanelNewPatched);

        if (!api.installed && !warned && api.installAttempts >= 80) {
            warned = true;
            if (root.console && root.console.warn) {
                root.console.warn('[LHS] power relog synchronization partial (attempts: ' + api.installAttempts + ')');
            }
        }
        if (!api.installed || !mainPanelPatched || !mainPanelNewPatched || !rolePowerPatched) {
            queueInstallRetry();
        }
        return api.installed;
    }

    api.syncFullPower = syncFullPower;
    api.scheduleRefresh = scheduleRefresh;
    api.install = install;

    /* Support delayed module instantiation */
    var managerType = root.GlobalManager || root.GameGlobalYDXZ || root.W;
    if (managerType && typeof managerType.initModule === 'function'
        && !managerType.initModule.__lhsPowerReloginFix) {
        var originalInitModule = managerType.initModule;
        var wrappedInitModule = function () {
            var result = originalInitModule.apply(this, arguments);
            install();
            syncFullPower();
            return result;
        };
        wrappedInitModule.__lhsPowerReloginFix = true;
        wrappedInitModule.__lhsPowerReloginOriginal = originalInitModule;
        managerType.initModule = wrappedInitModule;
    }

    install();
}(typeof window !== 'undefined' ? window : globalThis));
