/* Preserve native Demon Boss controls; separate boss sequence from role realm. */
(function (root) {
    'use strict';
    var VERSION = '20261007_demon_boss_drop200_v1';
    if (root.LhsDemonBossDrop200V1 && root.LhsDemonBossDrop200V1.version === VERSION) return;
    var api = root.LhsDemonBossDrop200V1 = { version: VERSION, installed: false, attempts: 0 };
    function manager() { return root.GlobalManager || root.GameGlobalYDXZ; }
    function stage(row) { return Number(row.stageId || row.id || row.roleStageId); }
    function extended(row) { return row && Number(row.stageId) > 48; }
    function install() {
        api.attempts++;
        var m = manager(), View = root.BoxTowerView || (m && m.BoxTowerView);
        var Item = root.BoxTowerItem || (m && m.BoxTowerItem);
        if (!m || !View || !Item || !View.prototype.update || !Item.prototype.dataChanged || !Item.prototype.onClickAutoBtn) {
            if (api.attempts < 600) root.setTimeout(install, 100);
            return;
        }
        var update = View.prototype.update, changed = Item.prototype.dataChanged, sweep = Item.prototype.onClickAutoBtn;
        View.prototype.update = function () {
            var c = m.Config, rows = c.DemonBossConfig;
            if (!c.DemonBossDrop200ExtensionConfig) return update.apply(this, arguments);
            var info = m.RaidInfoModel.getDemonBossInfo(), show = c.DemonBossBaseConfig.show;
            var maxVisible = Math.max(Number(show[0]), Number(info.stage) + Number(show[1]));
            var visible = {};
            Object.keys(rows).forEach(function (key) { if (stage(rows[key]) <= maxVisible) visible[key] = rows[key]; });
            c.DemonBossConfig = visible;
            try { return update.apply(this, arguments); }
            finally { c.DemonBossConfig = rows; }
        };
        Item.prototype.dataChanged = function () {
            var data = this.data, row = data && data.stageData;
            if (!extended(row)) return changed.apply(this, arguments);
            var id = stage(row), cleared = Number(data.nowStage), realm = Number(row.roleStageId);
            // Native renderer compares roleStageId to nowStage. Project only this render's
            // progress, keeping its original realm lock, rewards, costs and button states.
            this.data = Object.assign({}, data, { nowStage: id <= cleared ? realm : id === cleared + 1 ? realm - 1 : realm - 2 });
            var result;
            try { result = changed.apply(this, arguments); }
            finally { this.data = data; }
            var oldName = this.titleLabel.text, name = row.displayName || (oldName + ' · Yêu Vương ' + id);
            this.titleLabel.text = name;
            if (this.currentState === 'lock' && this.lockLabel && String(this.lockLabel.text).indexOf(oldName) === 0) {
                this.lockLabel.text = name + String(this.lockLabel.text).slice(oldName.length);
            }
            return result;
        };
        Item.prototype.onClickAutoBtn = function () {
            var data = this.data, row = data && data.stageData;
            if (!extended(row)) return sweep.apply(this, arguments);
            // Native sweep retains its daily-limit and affordability checks.
            this.data = Object.assign({}, data, { stageData: Object.assign({}, row, { roleStageId: stage(row) }) });
            try { return sweep.apply(this, arguments); }
            finally { this.data = data; }
        };
        api.installed = true;
    }
    install();
})(window);
