/* Native OldTrek mini-games: server-selected levels + proof-checked sliding puzzle.
 * Puzzle is the owner-approved local approximation, not the CN triangle game. */
(function (root) {
  'use strict';
  var api = root.LhsOldTrekMinigames = root.LhsOldTrekMinigames || {};
  if (api.version === '20260921_v1') return;
  api.version = '20260921_v1';
  var panel = null;
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W || {}; }
  function type(name) { try { return root[name] || root.egret.getDefinitionByName(name); } catch (_) { return null; } }
  function notice(text) { if (root.UserTips) root.UserTips.ins().showTips(text); }
  function close() { if (panel && panel.parent) panel.parent.removeChild(panel); panel = null; }
  function showPuzzle(event) {
    if (panel || !event || !Array.isArray(event.puzzleBoard)) return;
    var ui = root.eui, egret = root.egret, stage = egret.MainContext.instance.stage;
    var layer = new ui.Group(); layer.width = stage.stageWidth; layer.height = stage.stageHeight;
    layer.touchEnabled = true; panel = layer;
    var bg = new egret.Shape(); bg.graphics.beginFill(0x132133, 0.98); bg.graphics.drawRect(0, 0, layer.width, layer.height); bg.graphics.endFill(); layer.addChild(bg);
    var title = new ui.Label(); title.text = 'Hoang Cổ · Trận đồ cổ'; title.size = 27; title.horizontalCenter = 0; title.y = 90; layer.addChild(title);
    var hint = new ui.Label(); hint.text = 'Xếp 1–8 theo thứ tự, ô trống ở góc dưới phải.\nTiến trình này do máy chủ kiểm tra từng bước.'; hint.size = 20; hint.textAlign = 'center'; hint.horizontalCenter = 0; hint.y = 145; layer.addChild(hint);
    var board = event.puzzleBoard.slice(), moves = [], buttons = [], pending = false;
    var cell = Math.min(140, (stage.stageWidth - 80) / 3), x = (stage.stageWidth - cell * 3) / 2;
    function submit(win) {
      if (pending) return; pending = true;
      var model = manager().OldTrekModel;
      model.Rpc(7002, { eventUid: event.uid, operate: win ? 0 : 1, param: win ? 1 : 0, proof: moves.slice() }, function (reply) {
        pending = false; if (!reply || reply.result !== 0) return;
        close();
      }, function () { pending = false; notice('Chưa nhận được phản hồi. Hãy thử lại.'); });
      root.setTimeout(function () { pending = false; }, 10000);
    }
    function render() { for (var k = 0; k < 9; k++) { buttons[k].label = board[k] ? String(board[k]) : ''; buttons[k].alpha = board[k] ? 1 : 0.2; } }
    for (var i = 0; i < 9; i++) (function (at) {
      var b = new ui.Button(); b.width = cell - 8; b.height = cell - 8; b.x = x + at % 3 * cell; b.y = 240 + Math.floor(at / 3) * cell;
      b.addEventListener(egret.TouchEvent.TOUCH_TAP, function () {
        if (pending || moves.length >= 512) return;
        var blank = board.indexOf(0);
        if (Math.abs(at % 3 - blank % 3) + Math.abs(Math.floor(at / 3) - Math.floor(blank / 3)) !== 1) return;
        board[blank] = board[at]; board[at] = 0; moves.push(at); render();
        if (board.every(function (value, idx) { return value === (idx + 1) % 9; })) submit(true);
      }, layer); buttons.push(b); layer.addChild(b);
    }(i));
    var cancel = new ui.Button(); cancel.label = 'Bỏ lượt'; cancel.width = 180; cancel.height = 60; cancel.horizontalCenter = 0; cancel.y = 260 + cell * 3;
    cancel.addEventListener(egret.TouchEvent.TOUCH_TAP, function () { submit(false); }, layer); layer.addChild(cancel);
    render(); stage.addChild(layer);
  }
  function install() {
    var Model = type('OldTrekModel'), Entrance = type('OldTrekMiniGameEntrance'), m = manager(), cfg = m.Config || root.Config;
    if (!Model || !Entrance || !cfg || !cfg.OldTrekCommonEventConfig) return false;
    if (!cfg.OldTrekCommonEventConfig[4041]) cfg.OldTrekCommonEventConfig[4041] = { id: 4041, eventType: 4, checkValue: [], nextId: [[4001], [4002]], choiceNext: [], baseEffect: [], bannerRes: '' };
    cfg.OldTrekMiniGameConfig[4041] = { id: 4041, type: 4, levelRange: [1] };
    if (!Entrance.prototype.__lhsOldTrekLevel) {
      var open = Entrance.prototype.OnOpen;
      Entrance.prototype.OnOpen = function (event) {
        var result = open.apply(this, arguments);
        if (event && Number(event.miniGameLevel) > 0) this._level = Number(event.miniGameLevel);
        return result;
      }; Entrance.prototype.__lhsOldTrekLevel = true;
    }
    var p = Model.prototype;
    if (!p.__lhsOldTrekPuzzle) {
      var check = p.checkHandleEvent;
      p.checkHandleEvent = function () { var event = this.getCurEvent(); if (event && event.id === 4041) return showPuzzle(event); return check.apply(this, arguments); };
      var update = p.updateEventData;
      p.updateEventData = function (event) { if (!event || event.id !== 4041) close(); return update.apply(this, arguments); };
      p.__lhsOldTrekPuzzle = true;
    }
    api.installed = true; return true;
  }
  api.install = install; api.close = close;
  var tries = 0;
  (function retry() { if (!install() && ++tries < 180) root.setTimeout(retry, 1000); }());
}(window));
