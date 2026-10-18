// Inserted inside the existing native Egret client closure. No ownership writes.
function lhsComponentInfo(id) {
  var cfg = Y.Config, row = cfg.FashionConfig[id], asset = cfg.AssetsConfig[id];
  if (!row || !asset || (asset.type !== 97 && asset.type !== 98)
      || [301, 302, 303, 309].indexOf(row.type) < 0) return null;
  var dress = cfg.FashionDressConfig[row.dressId];
  if (!dress) return null;
  var color = Number(row.colorId) || 0;
  var tableName = ({0:'FashionColorConfig',1:'FashionDressLevelConfig',2:'FashionChangeColorConfig',3:'FashionBathConfig'})[Number(dress.isSuit)];
  if (tableName && (!cfg[tableName][row.dressId] || !cfg[tableName][row.dressId][color])) return null;
  if (Number(dress.isSuit) === 4 && !cfg.FashionEndDressConfig[row.dressId]) return null;
  var parts = Y.FashionModel.GetSuitFashions(row.dressId, color) || [];
  if (parts.indexOf(Number(id)) < 0) return null;
  var owned = parts.filter(function(part) { return Y.FashionModel.IsFashionActive(part); });
  var whole = [1, 2, 4].indexOf(Number(dress.isSuit)) >= 0;
  var label = ({301:'Vũ khí',302:'Mũ',303:'Áo',309:'Quần'})[row.type];
  return { id:Number(id), row:row, asset:asset, dressId:row.dressId, color:color,
    parts:parts, owned:owned, ready:parts.length > 0 && parts.length === owned.length,
    whole:whole, label:label };
}

function lhsComponentIcon(id, original) {
  if (original && RES.hasRes(original)) return original;
  var cfg = Y.Config, row = cfg.FashionConfig[id], asset = cfg.AssetsConfig[id];
  if (!row || !asset || (asset.type !== 97 && asset.type !== 98)) return original;
  var dress = cfg.FashionDressConfig[row.dressId], parent = cfg.AssetsConfig[row.dressId];
  return dress && parent && parent.icon && RES.hasRes(parent.icon) ? parent.icon : original;
}

function lhsComponentBadge(view, id) {
  var row = Y.Config.FashionConfig[id], asset = Y.Config.AssetsConfig[id];
  var replacement = asset && lhsComponentIcon(id, asset.icon);
  var show = !!(row && replacement && replacement !== asset.icon);
  if (!view._lhsComponentBadge && show) {
    var label = new U.Label();
    label.size=15; label.bold=true; label.textColor=0xffffff;
    label.stroke=2; label.strokeColor=0x3b2630; label.touchEnabled=false;
    label.left=8; label.top=7;
    (view.group || view).addChild(label);
    view._lhsComponentBadge=label;
  }
  if (view._lhsComponentBadge) {
    view._lhsComponentBadge.visible=show;
    view._lhsComponentBadge.text=show ? ({301:'Vũ khí',302:'Mũ',303:'Áo',309:'Quần'})[row.type] || 'Phần bộ' : '';
  }
}

function lhsOwnedComponentVisible(row, owned) {
  if (!owned || !row) return false;
  // Keep region restrictions and unrelated/internal catalog rows unchanged.
  if ((Number(row.area) === 2 && AppInfo.inChina) || (Number(row.area) === 1 && !AppInfo.inChina)) return false;
  return !!lhsComponentInfo(row.id);
}

function lhsComponentStatus(info) {
  return info.label + ' thuộc bộ · Đã có ' + info.owned.length + '/' + info.parts.length
    + ' phần. ' + (info.ready ? 'Có thể mặc cả bộ.' : 'Cần đủ bộ để mặc; hình dưới là xem trước bộ.');
}

function lhsRefreshComponentPanel(view) {
  var info=lhsComponentInfo(view.selectId);
  if (!view.btnSelect) return;
  if (view._lhsOriginalSelectLabel == null) view._lhsOriginalSelectLabel=view.btnSelect.label;
  if (!view._lhsComponentLayout && view.labDesc) view._lhsComponentLayout={
    descCenter:view.labDesc.verticalCenter, descWidth:view.labDesc.maxWidth,
    descSize:view.labDesc.size, buttonCenter:view.btnSelect.verticalCenter,
    parentHeight:view.labDesc.parent && view.labDesc.parent.height
  };
  view.btnSelect.enabled=true;
  view.btnSelect.label=view._lhsOriginalSelectLabel;
  if (view._lhsComponentLayout && view.labDesc) {
    var saved=view._lhsComponentLayout;
    view.labDesc.verticalCenter=saved.descCenter; view.labDesc.maxWidth=saved.descWidth;
    view.labDesc.size=saved.descSize; view.btnSelect.verticalCenter=saved.buttonCenter;
    if (view.labDesc.parent) view.labDesc.parent.height=saved.parentHeight;
  }
  if (!info) return;
  if (view.groupTitle) { view.groupTitle.visible=true; view.groupTitle.includeInLayout=true; }
  if (view.labTitle) {
    view.labTitle.visible=true;
    view.labTitle.text=B.ConvertLanguageToText(info.asset.name);
  }
  if (info.whole && !view.isInHotSpring) {
    if (view.labDesc) {
      view.labDesc.visible=true; view.labDesc.includeInLayout=true; view.labDesc.text=lhsComponentStatus(info);
      view.labDesc.verticalCenter=-48; view.labDesc.maxWidth=520; view.labDesc.size=18;
      if (view.labDesc.parent) view.labDesc.parent.height=160;
    }
    view.btnSelect.visible=true; view.btnSelect.includeInLayout=true; view.btnSelect.verticalCenter=30;
    if (view.imgUse) view.imgUse.visible=false;
    view.btnSelect.label=info.ready ? 'Mặc bộ' : 'Thiếu phần bộ';
    view.btnSelect.enabled=info.ready;
  }
}

function lhsComponentPreviewInfo(view, original) {
  var info=lhsComponentInfo(view.selectId);
  if (!info || !info.whole || view.isInHotSpring) return original;
  // Preview only: never change the player's real fashionMap or ownership.
  var preview=Y.FashionModel.CreateEmptyShowInfo(Y.RoleModel.kungfuId,Y.RoleModel.subJob);
  preview.fashionMap=Y.FashionModel.CreateSuitFashionData(info.dressId,info.color);
  return preview;
}

function lhsSelectComponent(view) {
  var info=lhsComponentInfo(view.selectId);
  if (!info || !info.whole || view.isInHotSpring) return false;
  if (!info.ready) { S.ins().showTips(lhsComponentStatus(info)); return true; }
  Y.FashionModel.sendChangeSuit(info.dressId,info.color);
  return true;
}

function lhsUpdateComponentDetail(view, original, args) {
  var info=lhsComponentInfo(view.itemId);
  if (view.labEmptyAttr && view._lhsOriginalEmptyAttr != null) view.labEmptyAttr.text=view._lhsOriginalEmptyAttr;
  if (!info || !info.whole) return original.apply(view,args);
  if (view.labEmptyAttr && view._lhsOriginalEmptyAttr == null) view._lhsOriginalEmptyAttr=view.labEmptyAttr.text;
  var itemId=view.itemId, dyeing=view.dyeing;
  view.itemId=info.dressId; view.dyeing=info.color;
  try { original.apply(view,args); } finally { view.itemId=itemId; view.dyeing=dyeing; }
  view.labName.text=B.ConvertLanguageToText(info.asset.name);
  view.labDesc.text=lhsComponentStatus(info);
  view.labDesc.maxWidth=520;
  if (view.groupSkill) view.groupSkill.visible=false;
  if (view.btnBattleSkillShow) view.btnBattleSkillShow.visible=false;
  if (view.groupDyeingList) view.groupDyeingList.visible=false;
  if (view.listAttr) view.listAttr.dataProvider=new U.ArrayCollection([]);
  if (view.labEmptyAttr) { view.labEmptyAttr.visible=true; view.labEmptyAttr.text='Phần của bộ — không tự mở các phần còn thiếu'; }
}
