from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
src = ROOT / '_ai_workbench/temp/giftcode_item_audit_20261008/live_source'
out = ROOT / '_ai_workbench/temp/giftcode_amount_fix_20261008/candidate'
out.mkdir(parents=True, exist_ok=True)
api = (src / 'admin/admin_api.php').read_bytes()
old = b"if ($item !== '' && $amount > 0 && $amount <= 999999 && hk_reward_exists($item)) $items->{$item} = $amount;"
new = b"if ($item !== '' && gift_reward_amount_valid($item, $amount) && hk_reward_exists($item)) $items->{$item} = $amount;"
if api.count(old) != 1:
    raise SystemExit(f'parser target count={api.count(old)}')
(out / 'admin').mkdir(parents=True, exist_ok=True)
(out / 'admin/admin_api.php').write_bytes(api.replace(old, new, 1))
js = (src / 'assets/js/admin.js').read_bytes()
repls = [
    (b'max="999999"', b'max="1000000000"'),
    (b'amount > 999999', b'amount > 1000000000'),
    (b'Math.min(999999, Number(editItems[itemId] || 0) + amount)', b'Math.min(1000000000, Number(editItems[itemId] || 0) + amount)'),
]
for old, new in repls:
    if js.count(old) != 1:
        raise SystemExit(f'js target {old!r} count={js.count(old)}')
    js = js.replace(old, new, 1)
(out / 'assets/js').mkdir(parents=True, exist_ok=True)
(out / 'assets/js/admin.js').write_bytes(js)
print('candidate prepared')
