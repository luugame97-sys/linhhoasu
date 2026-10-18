/* Lifecycle-bound bootstrap: extend config before login models consume it. */
(function (root) {
    'use strict';
    var VERSION = 'cultivation_2000_v2';
    if (root.LhsRoleLevel2000V1 && root.LhsRoleLevel2000V1.version === VERSION) return;
    var api = root.LhsRoleLevel2000V1 = { version: VERSION, installed: false, applied: false, attempts: 0 };
    function manager() { return root.GlobalManager || root.GameGlobalYDXZ; }
    function activate(payload) {
        var meta = payload && payload.cultivation;
        if (!meta) return; // Old servers keep the original 1305 config.
        if (meta.version !== VERSION) throw Error('CULTIVATION_CLIENT_UPDATE_REQUIRED');
        var m = manager(), data = root.LhsCultivationDataV1, c = m && m.Config;
        if (!data || data.VERSION !== VERSION || !c) throw Error('CULTIVATION_CLIENT_DATA_MISSING');
        var extension = data.extend(c);
        // Language tables can be loaded/reset independently from config tables.
        Object.keys(extension.languageRows).forEach(function (id) { c.LanguageConfig[id] = extension.languageRows[id]; });
        api.applied = true;
        if (root.console && root.console.info) root.console.info('[LHS Cultivation] ' + VERSION + ' active maxLevel=2000 maxStage=48; later systems locked');
    }
    function install() {
        api.attempts++;
        var Player = root.PlayerInfoModel, Role = root.RoleModel;
        if (!Player || !Player.prototype || typeof Player.prototype.onPlayerInfo !== 'function'
            || !Role || !Role.prototype || typeof Role.prototype.Rpc !== 'function') {
            if (api.attempts < 600) root.setTimeout(install, 100);
            else if (root.console && root.console.error) root.console.error('[LHS Cultivation] bootstrap unavailable');
            return;
        }
        var onInfo = Player.prototype.onPlayerInfo, rpc = Role.prototype.Rpc;
        Player.prototype.onPlayerInfo = function (payload) {
            activate(payload); // Before task, stage, EXP and panel initialization.
            return onInfo.apply(this, arguments);
        };
        Role.prototype.Rpc = function (tag, params) {
            if (Number(tag) === 3103 && params && Number(params.stage) > 45) {
                var c = manager().Config, ext = c.RoleLevel2000ExtensionConfig;
                if (ext && ext.version === VERSION && api.applied) {
                    var args = Array.prototype.slice.call(arguments);
                    args[1] = Object.assign({}, params, { cultivationVersion: VERSION,
                        requestId: params.requestId || ('realm_v2_' + Date.now() + '_' + Math.random().toString(36).slice(2)) });
                    return rpc.apply(this, args);
                }
            }
            return rpc.apply(this, arguments);
        };
        api.installed = true;
        if (root.console && root.console.info) root.console.info('[LHS Cultivation] ' + VERSION + ' login hook ready');
    }
    install();
})(window);
