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

    function compact(value) {
        var text = digits(value);
        if (text === null) return value == null ? '' : String(value);
        if (text.length <= 5) return text;
        var power = text.length > 12 ? 12 : text.length > 9 ? 9 : text.length > 6 ? 6 : 3;
        var split = text.length - power;
        var fraction = text.slice(split, split + 2).replace(/0+$/, '');
        return text.slice(0, split) + (fraction ? '.' + fraction : '') + ({3:'K', 6:'M', 9:'B', 12:'T'})[power];
    }

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
        version: '20260907_item_quantity_v2', compact: compact, full: full, normalize: normalize,
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
        if (width > limit && this.size > 12) {
            this.size = Math.max(12, Math.floor(this.size * limit / width));
            Label.prototype.measure.call(this);
        }
    };

    function patchSkins(skins) {
        Object.keys(skins || {}).forEach(function (name) {
            var skin = skins[name];
            if (!skin || typeof skin !== 'object') return;
            Object.keys(skin).forEach(function (part) {
                var node = skin[part];
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
