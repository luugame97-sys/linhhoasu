/* Sequential drop-tier expansion: tiers 11..200, max open count equals tier. */
(function (root) {
    'use strict';
    var VERSION = '20261007_box_tier200_original_v1';
    if (root.LhsBoxTier100V1 && root.LhsBoxTier100V1.version === VERSION) return;
    var api = root.LhsBoxTier100V1 = { version: VERSION, installed: false, attempts: 0 };
    function manager() {
        return root.GlobalManager || root.GameGlobalYDXZ || root.W || root.Y || null;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function install() {
        api.attempts += 1;
        var m = manager(), c = m && (m.Config || m.config);
        if (!c || !c.BoxTierConfig || !c.TaskConfig || !c.BoxTierConfig[10]) {
            if (api.attempts < 120) root.setTimeout(install, 100);
            return false;
        }
        var tiers = c.BoxTierConfig, tasks = c.TaskConfig, base = tiers[10], baseTasks = base.task || [];
        var alreadyGenerated = c.DropTierExtensionConfig && c.DropTierExtensionConfig.version === 'drop_tier200_original_v1';
        if (!alreadyGenerated && baseTasks.length !== 3) { console.error('[BoxTier200] base task contract invalid'); return false; }
        var textIds = [20070007, 20070107, 20070207];
        for (var tier = 11; !alreadyGenerated && tier <= 200; tier++) {
            var ids = [970000 + tier, 971000 + tier, 972000 + tier];
            var targets = [
                27 + Math.ceil((tier - 10) * 73 / 90),
                800 + Math.ceil((tier - 10) * 200 / 90),
                36 + Math.ceil((tier - 10) * 64 / 90)
            ];
            for (var i = 0; i < ids.length; i++) {
                var source = tasks[baseTasks[i]] || tasks[String(baseTasks[i])];
                if (!source) { console.error('[BoxTier200] task source', ids[i]); return false; }
                var row = tasks[ids[i]] ? clone(tasks[ids[i]]) : clone(source); row.id = ids[i]; row.textId = textIds[i]; row.taskValue1 = targets[i]; tasks[ids[i]] = row;
            }
            var cost = 450 + (tier - 10) * 50;
            tiers[tier] = Object.assign({}, clone(base), {
                id: tier, tierUpCost: tier < 200 ? Array(5).fill(cost) : [],
                timeCost: tier < 200 ? 7200 + (tier - 10) * 1800 : 0,
                task: ids, count: tier
            });
        }
        if (!alreadyGenerated) c.DropTierExtensionConfig = { version: 'drop_tier200_original_v1', maxTier: 200, maxOpenCount: 200 };
        var BoxModel = m.BoxLayerModel;
        if (BoxModel && BoxModel.prototype && !BoxModel.prototype.__lhsTier100CountCap) {
            var originalGetAutoNum = BoxModel.prototype.getAutoNum;
            BoxModel.prototype.getAutoNum = function () {
                return Math.min(200, originalGetAutoNum ? originalGetAutoNum.apply(this, arguments) : 1);
            };
            BoxModel.prototype.__lhsTier100CountCap = true;
        }
        var Auto = m.OpenBoxAutoSettingModel;
        if (Auto && typeof Auto.UpdateMultipleData === 'function') {
            Auto.UpdateMultipleData();
            if (Array.isArray(Auto.multipleData)) Auto.multipleData = Auto.multipleData.filter(function (count) { return Number(count) <= 200; });
        }
        var Panel = m.BoxStageUpPanel;
        if (Panel && Panel.prototype && !Panel.prototype.__lhsTier100DisplayCap) {
            var originalUpdateUI = Panel.prototype.updateUI;
            Panel.prototype.updateUI = function () {
                var result = originalUpdateUI && originalUpdateUI.apply(this, arguments);
                var info = m.BoxLayerModel && m.BoxLayerModel.getBoxInfo && m.BoxLayerModel.getBoxInfo();
                if (info && Number(info.tier) >= 200) {
                    if (this.labLeftMult) this.labLeftMult.text = String(this.labLeftMult.text || '').replace(/201/g, '200');
                    if (this.labMonthCardExtraDrop) this.labMonthCardExtraDrop.visible = false;
                    if (this.groupLeftExtra) this.groupLeftExtra.visible = false;
                }
                return result;
            };
            Panel.prototype.__lhsTier100DisplayCap = true;
        }
        api.installed = true;
        if (root.console && typeof root.console.info === 'function') root.console.info('[LHS BoxTier100] ' + VERSION + ' ready tiers=' + Object.keys(tiers).length + ' maxCount=' + c.DropTierExtensionConfig.maxOpenCount);
        return true;
    }
    if (!install()) root.setTimeout(install, 250);
})(window);
