import os
import sys

# 1. Patch lucky-wheel.js
js_path = r'i:\Linhhoasu\server\server\_ai_workbench\temp\lucky-wheel.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Replace itemImageUrl and prizeIcon
old_img_fn = """    function itemImageUrl(prize) {
        if (!prize || prize.prize_type !== 'item') return '';
        return window.location.origin+'/assets/images/lucky-wheel/'+Number(prize.item_id)+'.png';
    }
    function prizeIcon(prize) {
        var image = String(prize.image_url || '') || itemImageUrl(prize);
        if (image && /^(https?:\/\/|\/|assets\/)/i.test(image)) return '<img src="'+html(image)+'" alt="" style="width:22px;height:22px;object-fit:contain">';
        return '<i class="fa-solid '+(prize.prize_type === 'item' ? 'fa-box-open' : (prize.prize_type === 'message' ? 'fa-face-smile-wink' : 'fa-coins'))+'"></i>';
    }"""

new_img_fn = """    function itemImageUrl(prize) {
        if (!prize || prize.prize_type !== 'item' || !prize.item_id) return '';
        var base = (window.luckyWheelConfig && window.luckyWheelConfig.imageBase) || 'assets/images/lucky-wheel/';
        return base + Number(prize.item_id) + '.png';
    }
    function prizeIcon(prize, isCard) {
        var image = String(prize.image_url || '') || itemImageUrl(prize);
        var fallbackIcon = prize.prize_type === 'item' ? 'fa-box-open' : (prize.prize_type === 'message' ? 'fa-face-smile-wink' : 'fa-coins');
        if (image && /^(https?:\/\/|\/|assets\/)/i.test(image)) {
            var iconClass = isCard ? 'lucky-wheel-card-img' : 'lucky-wheel-list-img';
            return '<span class="lucky-wheel-img-wrapper"><img src="'+html(image)+'" alt="'+html(prize.title)+'" class="'+iconClass+'" onerror="this.style.display=\\'none\\';var f=this.nextElementSibling;if(f)f.style.display=\\'inline-flex\\';"><i class="fa-solid '+fallbackIcon+' prize-fallback-icon" style="display:none"></i></span>';
        }
        return '<i class="fa-solid '+fallbackIcon+'"></i>';
    }"""

assert old_img_fn in js, "old_img_fn not found in lucky-wheel.js"
js = js.replace(old_img_fn, new_img_fn, 1)

# In renderPrizes, pass isCard=true to prizeIcon
old_card_append = "card.append(prizeIcon(prize)).append($('<strong></strong>').text(prize.title))"
new_card_append = "card.append(prizeIcon(prize, true)).append($('<strong></strong>').text(prize.title))"
assert old_card_append in js, "old_card_append not found in lucky-wheel.js"
js = js.replace(old_card_append, new_card_append, 1)

# Update style injection in lucky-wheel.js to support img-wrapper and responsive styling
old_slider_style_needle = ".lucky-wheel-slide-card img{width:82px!important;height:82px!important;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.06)}"
new_slider_style_replacement = ".lucky-wheel-slide-card .lucky-wheel-img-wrapper{display:flex;align-items:center;justify-content:center;width:82px;height:82px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(45,212,191,.25);overflow:hidden}.lucky-wheel-slide-card img{width:76px!important;height:76px!important;object-fit:contain;border-radius:8px}.lucky-wheel-slide-card .prize-fallback-icon{font-size:2.4rem;color:#5eead4}.lucky-wheel-prize-icon .lucky-wheel-img-wrapper{display:flex;align-items:center;justify-content:center;width:28px;height:28px;overflow:hidden}.lucky-wheel-prize-icon img{width:24px!important;height:24px!important;object-fit:contain}"

assert old_slider_style_needle in js, "old_slider_style_needle not found in lucky-wheel.js"
js = js.replace(old_slider_style_needle, new_slider_style_replacement, 1)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print("Updated lucky-wheel.js successfully!")


# 2. Patch lucky-wheel.css
css_wheel_path = r'i:\Linhhoasu\server\server\_ai_workbench\temp\lucky-wheel.css'
with open(css_wheel_path, 'r', encoding='utf-8') as f:
    css_wheel = f.read()

# Replace .daily-reward-choice and related styles in lucky-wheel.css
old_daily_choice_css = """.daily-reward-choice{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px}.daily-reward-option{position:relative;display:inline-flex;align-items:center;cursor:pointer}.daily-reward-option input{position:absolute;opacity:0;pointer-events:none}.daily-reward-option span{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #fed7aa;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:.8rem;font-weight:900;transition:.2s}.daily-reward-option span i{color:#ea580c}.daily-reward-option.is-selected span{border-color:#ea580c;background:#ea580c;color:#fff;box-shadow:0 6px 14px rgba(234,88,12,.2)}.daily-reward-option.is-selected span i{color:#fff}"""

new_daily_choice_css = """.daily-reward-choice{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin:10px 0 14px}.daily-reward-option{position:relative;display:flex;width:100%;cursor:pointer;margin:0;user-select:none;-webkit-tap-highlight-color:transparent}.daily-reward-option input{position:absolute;opacity:0;pointer-events:none}.daily-reward-option span{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:44px;padding:8px 12px;border:2px solid #fed7aa;border-radius:14px;background:#fff;color:#9a3412;font-size:.86rem;font-weight:800;line-height:1.2;transition:all .2s cubic-bezier(.16,1,.3,1);box-shadow:0 2px 6px rgba(249,115,22,.05);text-align:center;white-space:nowrap}.daily-reward-option span i{color:#ea580c;font-size:.95rem;transition:transform .2s ease}.daily-reward-option:hover span{border-color:#f97316;background:#fff7ed;transform:translateY(-1px)}.daily-reward-option.is-selected span{border-color:#ea580c;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-weight:900;box-shadow:0 6px 16px rgba(234,88,12,.28);transform:translateY(-1px)}.daily-reward-option.is-selected span i{color:#fff}"""

assert old_daily_choice_css in css_wheel, "old_daily_choice_css not found in lucky-wheel.css"
css_wheel = css_wheel.replace(old_daily_choice_css, new_daily_choice_css, 1)

with open(css_wheel_path, 'w', encoding='utf-8') as f:
    f.write(css_wheel)

print("Updated lucky-wheel.css successfully!")


# 3. Patch ui-refactor.css
css_ui_path = r'i:\Linhhoasu\server\server\_ai_workbench\temp\ui-refactor.css'
with open(css_ui_path, 'r', encoding='utf-8') as f:
    css_ui = f.read()

old_ui_media = """@media (max-width: 767.98px) {
    .daily-checkin-card { align-items: flex-start; flex-wrap: wrap; padding: 20px; }
    .daily-checkin-icon { flex-basis: 54px; width: 54px; height: 54px; font-size: 1.35rem; }
    .daily-checkin-action { width: 100%; margin-left: 72px; }
    .daily-checkin-button { width: 100%; min-width: 0; }
}"""

new_ui_media = """/* Daily Checkin Balanced Grid Layout for Mobile & Tablet */
@media (max-width: 860px) {
    .daily-checkin-card {
        display: grid !important;
        grid-template-columns: 52px 1fr !important;
        align-items: start !important;
        padding: 20px !important;
        gap: 14px 16px !important;
    }
    .daily-checkin-icon {
        grid-column: 1 !important;
        grid-row: 1 !important;
        width: 52px !important;
        height: 52px !important;
        flex: 0 0 52px !important;
        border-radius: 15px !important;
        font-size: 1.35rem !important;
    }
    .daily-checkin-content {
        grid-column: 2 !important;
        grid-row: 1 !important;
        min-width: 0 !important;
    }
    .daily-checkin-action {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-top: 4px !important;
    }
    .daily-reward-choice {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        width: 100% !important;
        margin: 10px 0 14px !important;
    }
    .daily-reward-option {
        width: 100% !important;
    }
    .daily-reward-option span {
        width: 100% !important;
        min-height: 44px !important;
        font-size: 0.86rem !important;
        padding: 8px 10px !important;
    }
    .daily-checkin-button {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 48px !important;
        border-radius: 14px !important;
        font-size: 0.96rem !important;
    }
}

@media (max-width: 480px) {
    .daily-checkin-card {
        padding: 16px !important;
        gap: 12px !important;
    }
    .daily-checkin-title {
        font-size: 1.15rem !important;
    }
    .daily-reward-choice {
        gap: 8px !important;
    }
    .daily-reward-option span {
        font-size: 0.8rem !important;
        min-height: 42px !important;
        padding: 6px 8px !important;
    }
}"""

assert old_ui_media in css_ui, "old_ui_media not found in ui-refactor.css"
css_ui = css_ui.replace(old_ui_media, new_ui_media, 1)

with open(css_ui_path, 'w', encoding='utf-8') as f:
    f.write(css_ui)

print("Updated ui-refactor.css successfully!")
