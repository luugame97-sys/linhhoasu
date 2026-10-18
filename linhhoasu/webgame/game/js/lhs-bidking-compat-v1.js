/* BidKing payload compatibility guard. Client-only; no reward or DB mutation. */
(function (root) {
    'use strict';
    var VERSION = '20260921_bidking_compat_v1';
    if (root.LhsBidKingCompatV1 && root.LhsBidKingCompatV1.version === VERSION) return;

    var api = root.LhsBidKingCompatV1 = { version: VERSION, installed: false, attempts: 0 };

    function manager() {
        return root.GameGlobalYDXZ || root.GlobalManager || root.W || null;
    }

    function modelType() {
        var mgr = manager();
        return root.BidKingModel || (mgr && mgr.BidKingModel) ||
            (root.egret && root.egret.getDefinitionByName && root.egret.getDefinitionByName('BidKingModel')) || null;
    }

    function normalize(instance) {
        if (!instance || !instance.info || typeof instance.info !== 'object') return false;
        if (!Array.isArray(instance.info.characterReward)) instance.info.characterReward = [];
        return true;
    }

    function install(Type) {
        var proto = Type && Type.prototype;
        if (!proto || proto.__lhsBidKingCompatV1) return !!proto;
        var canGet = proto.isCanGetIllusReward;
        var onInfo = proto.onBidKingInfo;
        if (typeof canGet !== 'function' && typeof onInfo !== 'function') return false;

        if (typeof onInfo === 'function' && !onInfo.__lhsBidKingCompatV1) {
            var wrappedInfo = function (data) {
                if (data && typeof data === 'object' && !Array.isArray(data)
                    && !Array.isArray(data.characterReward)) data.characterReward = [];
                var result = onInfo.apply(this, arguments);
                normalize(this);
                return result;
            };
            wrappedInfo.__lhsBidKingCompatV1 = true;
            wrappedInfo.__lhsBidKingCompatV1Original = onInfo;
            proto.onBidKingInfo = wrappedInfo;
        }

        if (typeof canGet === 'function' && !canGet.__lhsBidKingCompatV1) {
            var wrappedCanGet = function (id) {
                normalize(this);
                return canGet.apply(this, arguments);
            };
            wrappedCanGet.__lhsBidKingCompatV1 = true;
            wrappedCanGet.__lhsBidKingCompatV1Original = canGet;
            proto.isCanGetIllusReward = wrappedCanGet;
        }

        proto.__lhsBidKingCompatV1 = true;
        return true;
    }

    function retry() {
        api.attempts += 1;
        api.installed = install(modelType());
        if (!api.installed && api.attempts < 120) root.setTimeout(retry, 250);
        if (api.installed && root.console && root.console.info) {
            root.console.info('[LHS][BidKingCompat] installed ' + VERSION);
        }
        return api.installed;
    }

    api.install = retry;
    retry();
}(typeof window !== 'undefined' ? window : globalThis));
