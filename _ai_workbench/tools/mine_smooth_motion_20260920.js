// Injected inside the native client closure; presentation only, after 2801 ACK.
function lhsMineCancelMotion(panel) {
  panel._lhsMotionSeq = (panel._lhsMotionSeq || 0) + 1;
  panel._lhsMotionBusy = false;
  if (panel._player) {
    F.removeTweens(panel._player);
    if (panel._lhsMotionSpeed != null && panel._player.player) {
      panel._player.player.setTimeScale(panel._lhsMotionSpeed);
    }
  }
  F.removeTweens(panel.showGr);
  panel._lhsMotionSpeed = null;
  panel.setGlobalMaskState(false);
}

function lhsMineSmoothMove(panel, response, changed, added, request) {
  try {
    return lhsMineSmoothMoveRun(panel, response, changed, added, request);
  } catch (error) {
    lhsMineRpcFailure(Y.MineModel);
    console.error('[MineMotion] presentation failed', error);
  }
}

function lhsMineSmoothMoveRun(panel, response, changed, added, request) {
  var model = Y.MineModel, actor = panel._player;
  if (!actor || model.getPanel() !== panel) {
    panel.setGlobalMaskState(false);
    return;
  }
  lhsMineCancelMotion(panel);
  var sequence = panel._lhsMotionSeq;
  panel._lhsMotionBusy = true;
  panel.setGlobalMaskState(true);
  var started = Date.now();
  var alive = function () {
    return panel._lhsMotionSeq === sequence && model.getPanel() === panel && panel._player === actor;
  };
  var role = actor.player;
  var speed = role && Number(role._speed) > 0 ? Number(role._speed) : 1;
  panel._lhsMotionSpeed = speed;
  var show = Y.FashionModel.GetShowServerData();
  var suit = Y.FashionModel.getShowInfoSuit(show);
  var dress = Y.Config.FashionDressConfig[suit.suitId];
  var special = dress && dress.mineAction > 0;
  var idle = (special ? yht[102] : yht[103])[0];
  var item = request.itemId;
  var oldMap = model.getPreTestDataMap();
  var uid = oldMap[request.col] && oldMap[request.col][request.meter];
  var selected = uid > 0 ? panel.getBlockItemByUid(uid) : panel.getBlockItem(request.meter, request.col);
  var position = model.getPlayerPos();
  var path = Array.isArray(request.path) ? request.path : [];
  // Include new authoritative rows before computing tween destinations.
  panel.createBlocks(added);
  var point = function (row) {
    return {
      x: row.col * model.Base_Block_Size + model.Base_Block_Size / 2,
      y: panel.blockGr.height + (panel._baseMeter - row.meter - 1) * model.Base_Block_Size
        + model.Base_Block_Size / 2 + 32
    };
  };
  var points = [], last = {x:actor.x, y:actor.y}, distance = 0;
  for (var j = 1; j < path.length; j++) {
    var p = point(path[j]);
    var segment = Math.sqrt(Math.pow(p.x-last.x,2)+Math.pow(p.y-last.y,2));
    if (segment > 0) { points.push({point:p, distance:segment}); distance += segment; last=p; }
  }
  var destination = point(position);
  var rest = Math.sqrt(Math.pow(destination.x-last.x,2)+Math.pow(destination.y-last.y,2));
  if (rest > 0) { points.push({point:destination,distance:rest}); distance += rest; }
  var moveMs = distance > 0 ? Math.min(220, Math.max(70, distance / model.Base_Block_Size * 25)) : 0;
  var cameraDelta = Math.max(0, model.getMeter() - model.getPreMeter()) * model.Base_Block_Size;
  var cameraMs = cameraDelta > 0 ? Math.min(320, Math.max(120, moveMs)) : 0;
  var totalMoveMs = Math.max(moveMs, cameraMs);
  panel.refreshPlayerDir(destination.x - actor.x);
  panel.refreshDesc();
  panel.changeSelectIdx(model.checkItemSelectIdx());

  function complete() {
    if (!alive()) return;
    try {
      if (role) role.setTimeScale(speed);
      panel._lhsMotionSpeed = null;
      actor.setEntityAnimtion(idle, true);
      panel._lhsMotionBusy = false;
      model.showCacheEventResults();
      panel.afterDigBlock();
    } catch (error) { lhsMineRpcFailure(model); console.error('[MineMotion] completion failed',error); }
    if ((panel._lhsMotionSamples || 0) < 6) {
      panel._lhsMotionSamples = (panel._lhsMotionSamples || 0) + 1;
      console.debug('[MineMotion] complete animationMs=' + (Date.now()-started) + ' moveMs=' + moveMs);
    }
  }
  function impact() {
    if (!alive()) return;
    try {
    if (item !== 0) {
      var targets = item === -1 ? changed : selected ? [selected.data] : [];
      for (var i=0; i<targets.length; i++) {
        var block = panel.getBlockItem(targets[i].meter,targets[i].col);
        if (block) block.playEff();
      }
    }
    panel.updateBlocks(changed);
    panel.recycleBlocks();
    panel.refreshFinishState();
    } catch (error) { lhsMineRpcFailure(model); console.error('[MineMotion] impact failed',error); }
  }
  function arrived() {
    if (!alive()) return;
    if (item === 0) { impact(); complete(); return; }
    try {
    var animation = special ? 'm_attack_3_a' : item === -1 ? actor.getQuickAniName() : actor.getAniName();
    var data = role && role.tuiModel && role.tuiModel.skeletonData;
    var clip = data && data.findAnimation(animation);
    var nativeMs = clip && clip.duration > 0 ? clip.duration * 1000 / speed : 400;
    var attackMs = Math.min(180, Math.max(120, nativeMs / 2.5));
    if (role) role.setTimeScale(speed * nativeMs / attackMs);
    actor.setEntityAnimtion(animation,false);
    F.get(actor).wait(attackMs * .45).call(impact).wait(attackMs * .55).call(complete);
    } catch (error) { lhsMineRpcFailure(model); console.error('[MineMotion] arrival failed',error); }
  }
  if (distance > 0) {
    // Dash and position run together, rather than wait for dash and teleport.
    actor.setEntityAnimtion(yht[105][0],false);
    var tween = F.get(actor);
    for (var k=0;k<points.length;k++) tween.to(points[k].point, moveMs * points[k].distance / distance);
    if (totalMoveMs > moveMs) tween.wait(totalMoveMs-moveMs);
    tween.call(arrived);
  } else {
    F.get(actor).wait(totalMoveMs).call(arrived);
  }
  if (cameraDelta > 0) F.get(panel.showGr).to({verticalCenter:panel.showGr.verticalCenter+cameraDelta},cameraMs);
}

function lhsMineRpcFailure(model) {
  var panel = model.getPanel();
  if (!panel) { model._lhsMineRpcPending = false; return; }
  model.setAutoDig(false);
  if (panel) {
    lhsMineCancelMotion(panel);
    panel.setGlobalMaskState(false);
    panel.hideAllEff();
  }
  S.ins().showTips('Thao tác chưa hoàn tất. Vui lòng thử lại.');
}
