(function(root){
  'use strict';
  var VERSION='20260927_fashion_content_v3';
  if(root.LhsFashionContentV1&&root.LhsFashionContentV1.version===VERSION)return;
  var api=root.LhsFashionContentV1={version:VERSION,installed:false,attempts:0};
  var names={"11291":"Họa Trung Tiên Cảnh","11837":"Ảnh đại diện Viêm Đế Tiêu Viêm","11838":"Ảnh đại diện Võ Tổ Lâm Động","12078":"Linh Họa Hà Sơn","23046":"Côn Khiếu Thương Khung · Bích Lan","23047":"Côn Khiếu Thương Khung · Sương Diệu","23048":"Côn Khiếu Thương Khung · Huyền Huyền","28310":"Trần Diệu Thương Khung","28370":"Viêm Đế Tiêu Viêm","28371":"Vũ khí Viêm Đế Tiêu Viêm","28372":"Mũ Viêm Đế Tiêu Viêm","28373":"Áo Viêm Đế Tiêu Viêm","28379":"Quần Viêm Đế Tiêu Viêm","28380":"Võ Tổ Lâm Động","28381":"Vũ khí Võ Tổ Lâm Động","28382":"Mũ Võ Tổ Lâm Động","28383":"Áo Võ Tổ Lâm Động","28389":"Quần Võ Tổ Lâm Động","28410":"Tinh La Trùng Ảnh","28411":"Vũ khí Tinh La Trùng Ảnh","28412":"Mũ Tinh La Trùng Ảnh","28413":"Áo Tinh La Trùng Ảnh","28416":"Hiệu ứng vào trận Tinh La Trùng Ảnh","28419":"Quần Tinh La Trùng Ảnh","28441":"Vũ khí Bộ 28340","28442":"Mũ Bộ 28340","28443":"Áo Bộ 28340","28449":"Quần Bộ 28340","29280":"Phi Tuyết Yên Mặc","29820":"Thương Lan Vân Mộng"};
  ["I","II","III","IV"].forEach(function(color,index){var base=801+index;[28371,28372,28373,28379,28381,28382,28383,28389,28441,28442,28443,28449].forEach(function(id){var key=String(base)+String(id);names[key]=(names[id]||('Ngoại quan '+id))+' · Màu '+color;});});
  function manager(){return root.GlobalManager||root.GameGlobalYDXZ||root.W;}
  function apply(){
    var m=manager(),c=m&&m.Config,lang=c&&c.LanguageConfig;
    // Config is lazy-loaded; do not mark installed until LanguageConfig and
    // Fashion tables are available, otherwise the one-shot v1 lost all names.
    if(!m||!c||!lang||!c.FashionConfig||!c.FashionDressConfig)return false;
    Object.keys(names).forEach(function(id){var row=lang[id]||lang[String(id)]||{};row.cn=names[id];row.vi=names[id];row.vn=names[id];lang[id]=row;});
    var f=m.FashionModel&&m.FashionModel.prototype;
    if(f&&!f._lhsCnFashionWrapped){var old=f.GetSuitFashions;f.GetSuitFashions=function(id,color,role,job,special){var d=c.FashionDressConfig[id],v=d&&Number(d.isSuit)===2&&Number(color)>=100&&c.FashionChangeColorConfig[id]&&c.FashionChangeColorConfig[id][Number(color)-100];if(v&&v.spFashionIds)return v.spFashionIds.slice();return old?old.apply(this,arguments):[];};f._lhsCnFashionWrapped=true;}
    api.installed=true;if(root.console&&root.console.info)root.console.info('[LHS FashionContent] '+VERSION+' ready names='+Object.keys(names).length);return true;
  }
  function install(){api.attempts++;if(apply())return;if(api.attempts<600&&root.setTimeout)root.setTimeout(install,100);}
  install();
}(window));
