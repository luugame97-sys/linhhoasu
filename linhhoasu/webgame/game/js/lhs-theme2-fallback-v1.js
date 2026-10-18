/* Temporary 15502 visual fallback. No model/RPC/ownership/attribute changes. */
(function (root) {
    'use strict';
    var VERSION = '20260922_theme2_fallback_v2';
    if (root.LhsTheme2FallbackV1 && root.LhsTheme2FallbackV1.version === VERSION) return;
    var api = root.LhsTheme2FallbackV1 = { version: VERSION, installed: false, attempts: 0, fallback: false };
    var keys = ['bg', 'bgPole', 'newBg', 'icon', 'iconSp'];
    function install() {
        api.attempts += 1;
        var C = root.Const || (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('Const'));
        var map = C && C.MainThemeDataMap;
        var source = map && map[1];
        if (!source || !keys.every(function (key) { return typeof source[key] === 'string' && source[key].length > 0; })) {
            if (api.attempts < 600) root.setTimeout(install, 100);
            else if (root.console) root.console.warn('[LHS Theme2Fallback] theme1 mapping unavailable');
            return;
        }
        if (map[2] == null) {
            var fallback = {};
            keys.forEach(function (key) { fallback[key] = source[key]; });
            map[2] = fallback;
            api.fallback = true;
        }
        // Leave a future native theme2 untouched. getMainPanelThemeType must
        // still return 2: checkTheme uses that value to check 15502 ownership.
        api.installed = keys.every(function (key) { return typeof map[2][key] === 'string' && map[2][key].length > 0; });
        if (root.console) {
            if (api.installed) root.console.info('[LHS Theme2Fallback] ' + VERSION + ' ready; render=' + (api.fallback ? 'theme1' : 'native-theme2'));
            else root.console.warn('[LHS Theme2Fallback] existing theme2 mapping incomplete');
        }
    }
    install();
})(window);
