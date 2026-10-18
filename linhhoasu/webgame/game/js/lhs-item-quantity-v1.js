/* Shared K/M/B/T number presentation. Never parses labels back into game values. */
(function(root){
  'use strict';
  if(root.LhsNumberVi)return;
  function parts(value){
    if(value==null)return null;
    if(typeof value==='number'&&!isFinite(value))return null;
    var text=String(value).trim(),m=/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if(!m)return null;
    var sign=m[1]==='-'?'-':'',whole=m[2],fraction=m[3]||'',exp=Number(m[4]||0),digits=whole+fraction,point=whole.length+exp;
    if(Math.abs(exp)>1000)return null;
    if(point<=0){fraction=new Array(1-point).join('0')+digits;whole='0';}
    else if(point>=digits.length){whole=digits+new Array(point-digits.length+1).join('0');fraction='';}
    else{whole=digits.slice(0,point);fraction=digits.slice(point);}
    whole=whole.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
    if(whole==='0'&&!fraction)sign='';
    return{sign:sign,whole:whole,fraction:fraction};
  }
  function grouped(s){return s.replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
  function format(value,decimals,english){
    var p=parts(value);if(!p)return value==null?'':typeof value==='number'?'--':String(value);
    decimals=decimals==null?2:Math.max(0,Math.min(6,Math.floor(Number(decimals)||0)));
    var power=p.whole.length>12?12:p.whole.length>9?9:p.whole.length>6?6:p.whole.length>3?3:0;
    var split=p.whole.length-power,whole=power?p.whole.slice(0,split):p.whole;
    var fraction=power?(p.whole.slice(split)+p.fraction).slice(0,decimals).replace(/0+$/,''):p.fraction;
    var unit=english?({3:'K',6:'M',9:'B',12:'T'})[power]:({3:'nghìn',6:'tr',9:'tỷ',12:'nghìn tỷ'})[power];
    return p.sign+(english?whole:grouped(whole))+(fraction?(english?'.':',')+fraction:'')+(unit?(english?'':' ')+unit:'');
  }
  function full(value){var p=parts(value);return p?p.sign+grouped(p.whole)+(p.fraction?','+p.fraction:''):value==null?'':String(value);}
  root.LhsNumberVi={version:'20261017_number_kmbt_v1',compact:function(n,d){return format(n,d,true);},english:function(n,d){return format(n,d,true);},full:full};
}(window));

/* Native item quantity presentation. No inventory, reward or network mutations. */
(function (root) {
    'use strict';
    if (root.LhsItemQuantity) return;

    function digits(value) {
        if (typeof value === 'number') {
            if (!isFinite(value) || value < 0 || Math.floor(value) !== value || value > 9007199254740991) return null;
            value = String(value);
        }
        if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
        return value.replace(/^0+(?=\d)/, '');
    }

    function compact(value) { return root.LhsNumberVi.compact(value); }

    function full(value) {
        var text = digits(value);
        return text === null ? '' : text.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Legacy overLength uses Chinese scales even when its unit text is translated.
    // Normalize only complete quantity tokens; do not rewrite arbitrary callback text.
    function normalize(value) {
        var text = value == null ? '' : String(value);
        var numeric = digits(text);
        if (numeric !== null) return compact(numeric);
        var match = /^(\d+)(?:\.(\d+))?(Vạn|万|Tỷ|亿|Triệu)$/.exec(text);
        if (!match) return text;
        var power = {Vạn:4, '万':4, Tỷ:8, '亿':8, Triệu:12}[match[3]];
        var fraction = (match[2] || '').slice(0, power);
        return compact(match[1] + fraction + new Array(power - fraction.length + 1).join('0'));
    }

    var api = root.LhsItemQuantity = {
        version: '20261017_item_quantity_kmbt_v5', compact: compact, full: full, normalize: normalize,
        patchedParts: [], installed: false
    };
    if (!root.eui || !root.egret || !root.JSONParseClass || !root.ItemIcon || !root.ItemTipsView) {
        throw new Error('LHS_ITEM_QUANTITY_LOAD_ORDER');
    }
    var Label = root.eui.Label;
    function QuantityLabel() {
        var self = Label.call(this) || this;
        self.quantityWidth = 118;
        self.quantityBaseSize = 30;
        self.fontFamily = 'Arial';
        self.bold = true;
        self.size = 30;
        self.stroke = 2;
        self.strokeColor = 0x352218;
        self.textColor = 0xffffff;
        self.textAlign = 'right';
        self.wordWrap = false;
        self.multiline = false;
        self.touchEnabled = false;
        // Keep DisplayObject's native tint: it also applies to vector text and
        // preserves callbacks without coloring the glyph twice.
        return self;
    }
    root.__extends(QuantityLabel, Label);
    root.LhsQuantityLabel = QuantityLabel;
    root.egret.registerClass(QuantityLabel, 'LhsQuantityLabel', ['eui.UIComponent']);
    QuantityLabel.prototype.$setText = function (value) {
        if (this.quantityBaseSize) this.size = this.quantityBaseSize;
        return Label.prototype.$setText.call(this, normalize(value));
    };
    QuantityLabel.prototype.measure = function () {
        Label.prototype.measure.call(this);
        var width = this.textWidth;
        var limit = this.quantityWidth || 118;
        if (width > limit && this.size > 10) {
            this.size = Math.max(10, Math.floor(this.size * limit / width));
            Label.prototype.measure.call(this);
        }
    };

    function ViCurrencyLabel() {
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

    function patchSkins(skins) {
        Object.keys(skins || {}).forEach(function (name) {
            var skin = skins[name];
            if (!skin || typeof skin !== 'object') return;
            Object.keys(skin).forEach(function (part) {
                var node = skin[part];
                if (/^CurrencyItem[0-9]*Skin$/.test(name) && part === 'countLabel' && node && node.$t === '$eL') {
                    node.$t = 'LhsViCurrencyLabel';
                    node.viNumberWidth = skin._Group2 && skin._Group2.width || 92;
                    api.patchedParts.push(name + '.' + part);
                    return;
                }
                if (!/count|cnt/i.test(part) || !node || node.$t !== '$eBL' || node.font !== 'font_num_prop_fnt') return;
                node.$t = 'LhsQuantityLabel';
                delete node.font;
                delete node.letterSpacing;
                api.patchedParts.push(name + '.' + part);
            });
        });
        return skins;
    }
    api.patchSkins = patchSkins;
    var parser = root.JSONParseClass;
    var setData = parser.setData;
    parser.setData = function (data) { return setData.call(this, patchSkins(data)); };
    if (parser.json) patchSkins(parser.json);

    var icon = root.ItemIcon.prototype;
    var labelShow = icon.labelShow;
    icon.labelShow = function (value) {
        if (this.countLab instanceof QuantityLabel) {
            this.countLab.tint = 0xffffff;
            this.countLab.textColor = 0xffffff;
        }
        // Custom callbacks (ratios, discounts, masks) retain their original contract.
        if (this.data && this.data.labelShow) return labelShow.call(this, value);
        return compact(value);
    };

    var tip = root.ItemTipsView.prototype;
    var open = tip.OnOpen;
    tip.OnOpen = function () {
        var result = open.apply(this, arguments);
        var data = this._itemData;
        if (!data) return result;
        var model = root.GlobalManager && root.GlobalManager.ItemModel;
        if (this.countLabel && this.countLabel.visible && model) {
            this.countLabel.text = 'Đang có: ' + full(model.GetItemCount(data.id));
            this.countLabel.size = 18;
            this.countLabel.width = 325;
        }
        if (this.descLabel && digits(data.count) !== null && digits(data.count) !== '0') {
            // hideExtraCount hides the owned-total field, not this stack/reward.
            // Source count is the clicked reward/stack, not the account's owned balance.
            var existing = this.descLabel.textFlow;
            var body = existing && existing.length ? existing.slice() : [{text:this.descLabel.text || ''}];
            this.descLabel.textFlow = [{text:'Số lượng: ' + full(data.count) + '\n', style:{bold:true, textColor:0xffe6a5}}].concat(body);
        }
        this.validateNow();
        // The added line changes panel height; reuse the game's native positioning.
        if (root.UIHelper && root.UIHelper.setPopupTipsPos) root.UIHelper.setPopupTipsPos(arguments[1], this.mainGroup);
        return result;
    };
    api.installed = true;
}(typeof window !== 'undefined' ? window : globalThis));
