"""Patch verified display formatter anchors; keep business logic byte-identical."""
from pathlib import Path
import json
import hashlib
import re

ROOT=Path(__file__).resolve().parents[2]
TASK=ROOT/'_ai_workbench/temp/number_vi_20261017'
BASE=TASK/'baseline'
OUT=TASK/'candidate'
VERSION='20261017_number_kmbt_v1'
sha=lambda b:hashlib.sha256(b).hexdigest()

def main():
 source=(BASE/'js/main.min_drop200.js').read_text(encoding='utf-8')
 original=source
 changes=[]
 replacements={
  'wPt.overLength':"function(t,e){return AppInfo.lang==='en'?wPt.overLengthEn(t,e):window.LhsNumberVi.compact(t,e?0:2)}",
  'wPt.overLengthEn':"function(t,e){return window.LhsNumberVi.english(t,e?0:2)}",
  'wPt.overLengthPower':"function(t,e){return AppInfo.lang==='en'?wPt.overLenghPowerEn(t):window.LhsNumberVi.compact(t,2)}",
  'wPt.overLenghPowerEn':"function(t){return window.LhsNumberVi.english(t)}",
 }
 for name,new in replacements.items():
  start=source.index(name+'=function');end=source.index('},',start)+1
  old=source[start:end];replacement=name+'='+new
  assert old.count('function(')==1 and source.count(old)==1
  source=source[:start]+replacement+source[end:]
  changes.append({'name':name,'before':old,'after':replacement})
 old='1e4<=t&&(i=(t/1e4).toFixed(1)+B.ConvertLanguageToText(30020170))'
 assert source.count(old)==1
 source=source.replace(old,'1e4<=t&&(i=ec.overLength(t))',1)
 changes.append({'name':'CurrencyItem resource128','before':old,'after':'1e4<=t&&(i=ec.overLength(t))'})
 start=source.index('CSe.formatAttrValue1=function');end=source.index('},',start)+1
 old=source[start:end]
 needle='1e9<=e?(e/1e9).toFixed(i)+"Tỷ":1e6<=e?(e/1e6).toFixed(i)+"Tr":e%1==0?e.toString():e.toFixed(i)'
 assert old.count(needle)==1
 new=old.replace(needle,'window.LhsNumberVi.compact(e,i)',1)
 source=source[:start]+new+source[end:];changes.append({'name':'CSe.formatAttrValue1 numeric values only','before':old,'after':new})
 restored=source
 for change in reversed(changes):
  assert restored.count(change['after'])==1
  restored=restored.replace(change['after'],change['before'],1)
 assert restored==original,'UNRELATED_MAIN_CHANGED'
 # No old scale-label lookups remain in the active main bundle.
 assert not any(str(n) in source for n in [30020170,30020171,30020322])
 helper=(OUT/'js/lhs-number-vi-v1.js').read_bytes()+b'\n'
 # Each independently cached consumer can bootstrap the tiny shared formatter.
 # An old cached index/main must not leave a freshly fetched item addon broken.
 files={'js/main.min_drop200.js':helper+source.encode('utf-8')}
 addon=(BASE/'js/lhs-item-quantity-v1.js').read_bytes()
 start=addon.index(b'    function compact(value) {');end=addon.index(b'    function full(value) {',start)
 old=addon[start:end];new=b'    function compact(value) { return root.LhsNumberVi.compact(value); }\n\n'
 addon=addon[:start]+new+addon[end:]
 addon=addon.replace(b'width > limit && this.size > 12',b'width > limit && this.size > 10').replace(b'Math.max(12, Math.floor(this.size * limit / width))',b'Math.max(10, Math.floor(this.size * limit / width))')
 marker=b'    function patchSkins(skins) {'
 currency_label=b'''    function ViCurrencyLabel() {
        var self = Label.call(this) || this;
        self.wordWrap = false; self.multiline = false;
        return self;
    }
    root.__extends(ViCurrencyLabel, Label);
    root.LhsViCurrencyLabel = ViCurrencyLabel;
    root.egret.registerClass(ViCurrencyLabel, 'LhsViCurrencyLabel', ['eui.UIComponent']);
    ViCurrencyLabel.prototype.measure = function () {
        if (this._lhsLastSize == null || this.size !== this._lhsLastSize) this._lhsBaseSize = this.size;
        this.size = this._lhsBaseSize;
        Label.prototype.measure.call(this);
        var limit = this.viNumberWidth || 92;
        if (this.textWidth > limit && this.size > 8) {
            this.size = Math.max(8, Math.floor(this.size * limit / this.textWidth));
            Label.prototype.measure.call(this);
        }
        this._lhsLastSize = this.size;
    };

'''
 assert addon.count(marker)==1;addon=addon.replace(marker,currency_label+marker,1)
 marker=b"                if (!/count|cnt/i.test(part) || !node || node.$t !== '$eBL' || node.font !== 'font_num_prop_fnt') return;"
 currency_patch=b'''                if (/^CurrencyItem[0-9]*Skin$/.test(name) && part === 'countLabel' && node && node.$t === '$eL') {
                    node.$t = 'LhsViCurrencyLabel';
                    node.viNumberWidth = skin._Group2 && skin._Group2.width || 92;
                    api.patchedParts.push(name + '.' + part);
                    return;
                }
'''
 assert addon.count(marker)==1;addon=addon.replace(marker,currency_patch+marker,1)
 addon=addon.replace(b"version: '20260907_item_quantity_v2'",b"version: '20261017_item_quantity_kmbt_v5'")
 files['js/lhs-item-quantity-v1.js']=helper+addon
 idx=(BASE/'index.html').read_bytes()
 marker=re.search(rb'\t\t"js/main\.min_drop200\.js\?v=[^"\r\n]+",',idx)
 assert marker
 replacement=b'\t\t"js/main.min_drop200.js?v='+VERSION.encode()+b'",'
 idx=idx[:marker.start()]+replacement+idx[marker.end():]
 old=b'js/lhs-item-quantity-v1.js?v=20260907_item_quantity_v2';assert idx.count(old)==1
 idx=idx.replace(old,b'js/lhs-item-quantity-v1.js?v=20261017_item_quantity_kmbt_v5')
 files['index.html']=idx
 report={'version':VERSION,'changes':changes,'files':{},'serverRestarts':0,'playerWrites':0}
 for rel,data in files.items():
  p=OUT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 for rel in files:
  data=(OUT/rel).read_bytes();base=BASE/rel
  report['files'][rel]={'before':sha(base.read_bytes()) if base.exists() else None,'after':sha(data),'bytes':len(data)}
 (TASK/'release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'version':VERSION,'changedAnchors':len(changes),'files':report['files']}))

if __name__=='__main__':main()
