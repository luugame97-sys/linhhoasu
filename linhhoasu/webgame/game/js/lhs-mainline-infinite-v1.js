/* Client bootstrap for deterministic infinite mainline stages. */
(function (root) {
    'use strict';
    var VERSION = 'mainline_infinite_v1';
    if (root.LhsInfiniteMainlineV1Bootstrap && root.LhsInfiniteMainlineV1Bootstrap.version === VERSION) return;
    var api = root.LhsInfiniteMainlineV1Bootstrap = { version: VERSION, installed: false, applied: false, attempts: 0, lastHorizon: 0 };
    function manager() { return root.GlobalManager || root.GameGlobalYDXZ; }
    function activate(payload) {
        var m = manager(), data = root.LhsInfiniteMainlineV1, c = m && m.Config;
        if (!data || data.VERSION !== VERSION || !c) throw Error('MAINLINE_INFINITE_CLIENT_DATA_MISSING');
        var raid = payload && payload.raidInfo || {};
        var current = Math.max(1, Number(raid.level) || 1);
        var cleared = Math.max(0, Number(raid.maxClearedLevel) || 0);
        var horizon = Math.max(current, cleared) + 500;
        if (horizon <= api.lastHorizon) return;
        if (!data.ensure(c, horizon)) throw Error('MAINLINE_INFINITE_CONFIG_APPLY_FAILED');
        api.lastHorizon = horizon;
        api.applied = true;
    }
    function install() {
        api.attempts++;
        var Player = root.PlayerInfoModel;
        if (!Player || !Player.prototype || typeof Player.prototype.onPlayerInfo !== 'function') {
            if (api.attempts < 600) root.setTimeout(install, 100);
            else if (root.console && root.console.error) root.console.error('[LHS Mainline] bootstrap unavailable');
            return;
        }
        var onInfo = Player.prototype.onPlayerInfo;
        Player.prototype.onPlayerInfo = function (payload) {
            try { activate(payload); } catch (error) {
                if (root.console && root.console.error) root.console.error('[LHS Mainline] ' + error.message);
            }
            return onInfo.apply(this, arguments);
        };
        api.installed = true;
        if (root.console && root.console.info) root.console.info('[LHS Mainline] infinite generator hook ready');
    }
    install();
}(window));
