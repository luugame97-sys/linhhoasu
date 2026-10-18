/* Yuanbao gem choice offers and durable purchase/use/exchange intents. */
(function (root) {
  'use strict';
  var VERSION = '20261006_gem_choice_shop_v2';
  var policy = {"version":"20261006_gem_choice_shop_v1","offers":[{"level":6,"bagId":90076,"shopId":10000008,"price":9720,"quality":7,"icon":"select_gem_07","gems":[25051,25052,25053,25054]},{"level":7,"bagId":90077,"shopId":10000009,"price":38880,"quality":8,"icon":"select_gem_08","gems":[25061,25062,25063,25064,25065,25066]},{"level":8,"bagId":90078,"shopId":10000010,"price":116640,"quality":9,"icon":"select_gem_09","gems":[25071,25072,25073,25074,25075,25076]},{"level":9,"bagId":90079,"shopId":10000011,"price":349920,"quality":9,"icon":"select_gem_09","gems":[25081,25082,25083,25084,25085,25086]},{"level":10,"bagId":100097,"shopId":10000012,"price":1049760,"quality":9,"icon":"select_gem_09","gems":[25091,25092,25093,25094,25095,25096]},{"level":11,"bagId":100098,"shopId":10000013,"price":3149280,"quality":9,"icon":"select_gem_09","gems":[25101,25102,25103,25104,25105,25106]},{"level":12,"bagId":100099,"shopId":10000014,"price":9447840,"quality":9,"icon":"select_gem_09","gems":[25111,25112,25113,25114,25115,25116]}]};
  if (root.LhsGemChoiceShopV1 && root.LhsGemChoiceShopV1.version === VERSION) return;
  var api = root.LhsGemChoiceShopV1 = { version: VERSION, installed: false, attempts: 0, lastIntentTime: 0 };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function notice(text) { if (root.UserTips && root.UserTips.ins) root.UserTips.ins().showTips(text); }
  function dispatch(name) { if (root.MessageCenter && root.MessageDef) root.MessageCenter.ins().dispatch(root.MessageDef[name]); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function key() {
    var g = manager(), actor = g && g.ActorModel && g.ActorModel.actorID;
    var server = root.UserInfo && root.UserInfo.ServerID;
    return actor && server ? 'lhs:gem-choice:' + server + ':' + actor : null;
  }
  function loginState() {
    var g = manager();
    return g && g.PlayerInfoModel && g.PlayerInfoModel.playerInfo || g && g.ActorModel;
  }
  function offerForShop(id) { return policy.offers.find(function (o) { return o.shopId === id; }); }
  function offerForBag(id) { return policy.offers.find(function (o) { return o.bagId === id; }); }
  function rows(offer) {
    return {
      asset: { id: offer.bagId, type: 1, subType: 0, quality: offer.quality, name: offer.bagId,
        desc: 10000000 + offer.bagId, icon: offer.icon, itemWay: [], ifShow: 1, ifShowNum: 1, useType: 101 },
      use: { id: offer.bagId, type: 101, rewards: offer.gems.map(function (id) { return { id: id, count: 1 }; }), attrs: [], conditions: [] },
      shop: { id: offer.shopId, icon: '', tab: 10, tag: 0, payId: 0,
        cost: [{ id: 1, count: offer.price }], costAgain: [], rewards: [{ id: offer.bagId, count: 1 }],
        extraRewards: [], firstRewards: [], subsequentRewards: [], isDouble: 0, limit: 0, limitType: 0,
        showConds: [], type: 0, conditions: [], preId: -1, nextId: -1, intervalTri: [], duration: 0,
        showMultiple: 0, priority: 7 + offer.level - 6 }
    };
  }
  function apply(config) {
    if (!config || !config.AssetsConfig || !config.AssetsUseConfig || !config.GemLevelConfig || !config.ShopConfig) return false;
    var planned = policy.offers.map(function (offer) {
      if (offer.gems.some(function (id) { return !config.GemLevelConfig[id] || config.GemLevelConfig[id].level !== offer.level
        || !config.AssetsConfig[id] || config.AssetsConfig[id].type !== 18; })) throw Error('GEM_CHOICE_CONFIG_INVALID');
      var built = rows(offer), asset = config.AssetsConfig[offer.bagId], use = config.AssetsUseConfig[offer.bagId], shop = config.ShopConfig[offer.shopId];
      if (asset && (asset.type !== 1 || asset.useType !== 101 || asset.id !== offer.bagId)) throw Error('GEM_CHOICE_ASSET_CONFLICT');
      if (use && JSON.stringify(use) !== JSON.stringify(built.use)) throw Error('GEM_CHOICE_USE_CONFLICT');
      if (shop && JSON.stringify(shop) !== JSON.stringify(built.shop)) throw Error('GEM_CHOICE_SHOP_CONFLICT');
      return { offer: offer, built: built };
    });
    planned.forEach(function (p) {
      var o = p.offer;
      if (!config.AssetsConfig[o.bagId]) config.AssetsConfig[o.bagId] = p.built.asset;
      if (!config.AssetsUseConfig[o.bagId]) config.AssetsUseConfig[o.bagId] = p.built.use;
      config.ShopConfig[o.shopId] = p.built.shop;
      if (config.LanguageConfig) {
        var name = 'Túi tự chọn Hồn ngọc cấp ' + o.level;
        // Shop IDs overlap language keys used by currency descriptions.
        // The native shop title reads the rewarded bag's asset name.
        [o.bagId].forEach(function (id) {
          var lang = config.LanguageConfig[id] || {};
          lang.cn = lang.vi = lang.vn = name; config.LanguageConfig[id] = lang;
        });
        var desc = config.LanguageConfig[10000000 + o.bagId] || {};
        desc.cn = desc.vi = desc.vn = 'Chọn 1 Hồn ngọc cấp ' + o.level + ' trong các loại có sẵn.';
        config.LanguageConfig[10000000 + o.bagId] = desc;
      }
    });
    return true;
  }
  function loadPending() {
    var k = key();
    if (api.context !== k) { api.context = k; api.pending = null; }
    if (!api.pending && k) try { api.pending = JSON.parse(root.sessionStorage.getItem(k)); } catch (_) {}
    return api.pending;
  }
  function savePending(record) {
    var k = key(); api.context = k; api.pending = record;
    try { if (k) { if (record) root.sessionStorage.setItem(k, JSON.stringify(record)); else root.sessionStorage.removeItem(k); } } catch (_) {}
  }
  function absolute(reply) {
    var g = manager();
    if (Array.isArray(reply.changed) && g.ItemModel.onItemChange) {
      g.ItemModel.onItemChange({ items: [], changed: reply.changed });
    }
    if (reply.gemInfo && g.GemModel.initData) g.GemModel.initData(reply.gemInfo);
  }
  function reward(info, special) {
    if (!info || !root.GetRewardView) return;
    root.GetRewardView.Open(info);
    if (root.GetRewardView.CheckOpenSpGetView) root.GetRewardView.CheckOpenSpGetView(info, special);
  }
  function deliver(record, reply, displayReward) {
    var g = manager(), p = record.params;
    absolute(reply);
    if (!reply.replayed) {
      if (record.tag === 1200) {
        if (g.RechargeModel && g.RechargeModel.addRecords) g.RechargeModel.addRecords(p.id, p.count);
        if (g.ShopModel.saveLocalBuyRecord) {
          var clock = root.GameServer || root.GameTime;
          g.ShopModel.saveLocalBuyRecord(p.id, clock && clock.serverTimeMilli || Date.now());
        }
        if (displayReward !== false) reward(reply.rewardInfo, false);
      } else if (record.tag === 1300) {
        var item = g.ItemModel, id = item.checkItemUseId ? item.checkItemUseId(p.index) : p.index;
        if (Array.isArray(reply.useRecords) && item.SetItemUseRecord) item.SetItemUseRecord(reply.useRecords);
        else {
          item._itemUseRecords = item._itemUseRecords || {};
          item._itemUseRecords[id] = (item._itemUseRecords[id] || 0) + p.count;
        }
        reward(reply.rewardInfo, true);
      } else {
        reply.uids.forEach(function (uid) { g.GemModel.deleteGem(uid); });
        reply.gems.forEach(function (gem) { g.GemModel.updateGem(gem); });
        if (g.GemModel._info) g.GemModel._info.exchangeTimes = reply.exchangeTimes;
        reward({ items: [], gems: reply.gems }, false);
      }
    }
    if (record.tag === 1200) dispatch('Shop_Buy_Item');
    if (record.tag === 1300) dispatch('Gem_Info_Update');
    if (record.tag === 3904) dispatch('Gem_Exchange_Gem_Update');
  }
  function validReply(tag, reply) {
    if (!reply || reply.result !== 0) return false;
    function gems(list) {
      return Array.isArray(list) && list.every(function (gem) {
        return gem && Number.isSafeInteger(gem.uid) && gem.uid > 0 && Number.isSafeInteger(gem.id)
          && manager().Config.GemLevelConfig[gem.id] && Number.isSafeInteger(gem.shapeId) && gem.shapeId > 0;
      });
    }
    if (tag === 3904) return Array.isArray(reply.uids) && reply.uids.every(function (uid) { return Number.isSafeInteger(uid) && uid > 0; })
      && gems(reply.gems) && Number.isSafeInteger(reply.exchangeTimes) && reply.exchangeTimes >= 0
      && (!reply.replayed || reply.gemInfo && gems(reply.gemInfo.gems));
    if (tag === 1300) return reply.rewardInfo && Array.isArray(reply.rewardInfo.items) && gems(reply.gems);
    return reply.rewardInfo && Array.isArray(reply.rewardInfo.items) && Array.isArray(reply.changed);
  }
  function send(model, tag, payload, callback, displayReward) {
    var context = key();
    if (!context) { notice('Vui lòng đăng nhập lại để mua hoặc dùng túi.'); return false; }
    if (api.busy) { notice('Đang xác nhận giao dịch Hồn ngọc.'); return false; }
    var record = loadPending(), intent = JSON.stringify({ tag: tag, params: payload });
    if (record && record.intent !== intent) { notice('Giao dịch trước chưa xác nhận. Hãy thử lại đúng giao dịch trước để đồng bộ.'); return false; }
    root.clearTimeout(api.recoveryTimer); api.recoveryTimer = null;
    if (!record) {
      api.lastIntentTime = Math.max(Date.now(), api.lastIntentTime + 1);
      var params = clone(payload);
      params.requestId = String(api.lastIntentTime) + '-' + Math.random().toString(36).slice(2, 14).padEnd(8, '0');
      record = { tag: tag, params: params, intent: intent }; savePending(record);
    }
    var run = { context: context, login: loginState(), record: record, attempts: 0, timer: null, watchdog: null };
    api.busy = run;
    function current() { return key() === context && loginState() === run.login && api.busy === run; }
    function end(clear) {
      root.clearTimeout(run.timer); root.clearTimeout(run.watchdog);
      if (api.busy === run) api.busy = null;
      if (clear && key() === context) savePending(null);
    }
    run.stop = function () { end(false); };
    function attempt() {
      if (!current()) return end(false);
      var complete = false;
      function fail(reply) {
        if (complete) return; complete = true; root.clearTimeout(run.watchdog);
        if (!current()) return end(false);
        if (reply && reply.retryable === false) {
          end(true); notice(reply.msg || 'Giao dịch không hợp lệ hoặc chưa đủ tài nguyên.'); if (callback) callback(reply); return;
        }
        run.attempts++;
        if (run.attempts === 1) notice('Đang chờ xác nhận giao dịch.');
        if (run.attempts >= 4) { end(false); notice('Chưa xác nhận được. Thử lại cùng giao dịch để đồng bộ; không mua lại lần nữa.'); return; }
        run.timer = root.setTimeout(attempt, Math.min(5000, 1000 * Math.pow(2, run.attempts - 1)));
      }
      run.watchdog = root.setTimeout(fail, 15000);
      try { model.Rpc(tag, record.params, function (reply) {
        if (complete) return;
        if (!current()) { complete = true; return end(false); }
        if (!validReply(tag, reply)) {
          if (reply && reply.result !== 0) {
            var uncertain = ['GEM_SAVE_UNCONFIRMED', 'GEM_CHOICE_SESSION_REQUIRED', 'PLAYER_SNAPSHOT_REQUIRED'].indexOf(reply.code) >= 0;
            return fail(Object.assign({}, reply, { retryable: uncertain || reply.retryable === true }));
          }
          return fail(reply);
        }
        complete = true; end(true); deliver(record, reply, displayReward); if (callback) callback(reply);
      }, null, fail); } catch (_) { fail(); }
    }
    attempt(); return true;
  }
  function recoverPending() {
    root.clearTimeout(api.recoveryTimer);
    var context = key(), state = loginState();
    if (api.busy && (api.busy.context !== context || api.busy.login !== state)) api.busy.stop();
    if (!context || api.busy) return;
    var record = loadPending();
    if (!record || !record.params || [1200, 1300, 3904].indexOf(record.tag) < 0) return;
    api.recoveryTimer = root.setTimeout(function () {
      api.recoveryTimer = null;
      if (key() !== context || loginState() !== state || api.busy) return;
      var g = manager(), params = clone(record.params); delete params.requestId;
      var model = record.tag === 1200 ? g.ShopModel : record.tag === 1300 ? g.ItemModel : g.GemModel;
      notice('Đang đồng bộ giao dịch Hồn ngọc trước khi mất kết nối.');
      send(model, record.tag, params, null, false);
    }, 500);
  }
  function patch(g) {
    if (g.ShopModel.__lhsGemChoice) return;
    g.ShopModel.__lhsGemChoice = true;
    var buy = g.ShopModel.sendBuyItem, use = g.ItemModel.sendUseItem;
    g.ShopModel.sendBuyItem = function (id, count, display, callback) {
      if (!offerForShop(id)) return buy.apply(this, arguments);
      count = count == null ? 1 : count;
      if (!Number.isSafeInteger(count) || count < 1 || count > 9999) { notice('Số lượng mua không hợp lệ.'); return false; }
      return send(this, 1200, { id: id, count: count }, callback, display);
    };
    g.ItemModel.sendUseItem = function (id, count, selects) {
      var offer = offerForBag(id);
      if (!offer) return use.apply(this, arguments);
      count = count == null ? 1 : count;
      if (!Number.isSafeInteger(count) || count < 1 || count > 1200) { notice('Mỗi lần dùng tối đa 1.200 túi.'); return false; }
      var total = 0;
      if (!selects || typeof selects !== 'object' || Array.isArray(selects)
        || Object.keys(selects).some(function (index) {
          var amount = selects[index];
          if (!/^(0|[1-9][0-9]*)$/.test(index) || !offer.gems[Number(index)] || !Number.isSafeInteger(amount) || amount < 0) return true;
          total += amount; return false;
        }) || total !== count) { notice('Vui lòng chọn đủ số Hồn ngọc cần mở.'); return false; }
      return send(this, 1300, { index: id, count: count, selects: selects });
    };
    g.GemModel.sendExchangeGem = function (uids, type) { return send(this, 3904, { uids: uids, type: type }); };
  }
  function install() {
    var g = manager(); api.attempts++;
    if (!g || !g.ShopModel || !g.ItemModel || !g.GemModel || !g.Config || !g.Config.LanguageConfig) {
      if (api.attempts < 1200) root.setTimeout(install, 100); return;
    }
    try { if (!apply(g.Config)) { if (api.attempts < 1200) root.setTimeout(install, 100); return; } }
    catch (_) { notice('Cấu hình túi Hồn ngọc chưa khớp. Vui lòng tải lại trang.'); return; }
    // Native getCfgListByTab reads these indexes, not ShopConfig directly.
    if (g.ShopModel.Init) g.ShopModel.Init();
    patch(g); api.installed = true;
    if (root.MessageCenter && root.MessageDef && root.MessageDef.ON_LOGIN_INFO_UPDATE != null) {
      root.MessageCenter.ins().addListener(root.MessageDef.ON_LOGIN_INFO_UPDATE, recoverPending, api);
    }
    recoverPending();
  }
  api.apply = apply; api.policy = policy; api.rows = rows; api.send = send;
  api.recoverPending = recoverPending;
  install();
}(window));
