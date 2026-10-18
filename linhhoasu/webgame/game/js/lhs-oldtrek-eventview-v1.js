/* Close the native history panel when it has no actionable rows. */
(function (root) {
    'use strict';
    var VERSION = '20261017_eventview_guard_v1';
    if (root.LhsOldTrekEventViewGuard && root.LhsOldTrekEventViewGuard.version === VERSION) return;
    var api = root.LhsOldTrekEventViewGuard = { version: VERSION, installed: false, closedEmpty: 0, attempts: 0 };

    function model() {
        var manager = root.GlobalManager || root.GameGlobalYDXZ || root.W || {};
        return manager.OldTrekModel || root.OldTrekModel || null;
    }
    function type() {
        var Type = root.OldTrekEventView;
        try { Type = Type || (root.egret && root.egret.getDefinitionByName('OldTrekEventView')); } catch (_) {}
        return Type;
    }
    function isCheck(m, id) {
        try { if (m && typeof m.isCheckEvent === 'function') return !!m.isCheckEvent(id); } catch (_) {}
        try {
            var row = root.Config && root.Config.OldTrekCommonEventConfig && root.Config.OldTrekCommonEventConfig[id];
            return !!(row && Array.isArray(row.checkValue) && row.checkValue.length);
        } catch (_) { return false; }
    }
    function hasVisibleHistory(m) {
        var logs = [];
        try { logs = m && typeof m.getTrekEventLogs === 'function' ? (m.getTrekEventLogs() || []) : []; } catch (_) {}
        for (var i = 0; i < logs.length; i++) if (!isCheck(m, logs[i] && logs[i].id)) return true;
        return false;
    }
    function closeIfEmpty(view) {
        var m = model(), current = null;
        try { current = m && typeof m.getCurEvent === 'function' ? m.getCurEvent() : null; } catch (_) {}
        if (!current || !isCheck(m, current.id) || hasVisibleHistory(m)) return;
        var provider = view && view.listEvent && view.listEvent.dataProvider;
        var rows = provider && (provider.source || provider.length);
        if (Array.isArray(rows) ? rows.length !== 0 : Number(rows || 0) !== 0) return;
        if (view && typeof view.CloseSelf === 'function' && !view.__lhsOldTrekEmptyClosed) {
            view.__lhsOldTrekEmptyClosed = true;
            api.closedEmpty += 1;
            view.CloseSelf();
        }
    }
    function install() {
        api.attempts += 1;
        var Type = type(), p = Type && Type.prototype;
        if (!p || typeof p.updateUI !== 'function') {
            if (api.attempts < 600) root.setTimeout(install, 100);
            return false;
        }
        if (p.__lhsOldTrekEventViewGuard) return true;
        var update = p.updateUI;
        p.updateUI = function () {
            var result = update.apply(this, arguments), view = this;
            root.setTimeout(function () { closeIfEmpty(view); }, 0);
            return result;
        };
        p.__lhsOldTrekEventViewGuard = true;
        api.installed = true;
        return true;
    }
    api.install = install;
    install();
}(window));
