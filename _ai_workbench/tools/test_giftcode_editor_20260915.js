'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const candidate = path.join(root, '_ai_workbench', 'temp', 'giftcode_edit_20260915', 'candidate');
const js = fs.readFileSync(path.join(candidate, 'assets', 'js', 'admin.js'), 'utf8');
const php = fs.readFileSync(path.join(candidate, 'admin', 'admin_api.php'), 'utf8');
const editor = js.slice(js.indexOf('function suaMaQuaTang'), js.indexOf('function xoaMaQuaTang'));

assert(editor.includes('id="gc_edit_item"'), 'edit popup must contain an item selector');
assert(editor.includes('id="gc_edit_amount"'), 'edit popup must contain an amount input');
assert(editor.includes('id="gc_edit_add"'), 'edit popup must contain an add button');
assert(editor.includes('data-gc-edit-remove'), 'edit popup must contain per-item remove controls');
assert(editor.includes('rewardCardHtml(itemId, amount)'), 'edit popup must render the same reward cards as create');
assert(editor.includes("$('#builder_item').html()"), 'edit popup must reuse the create-form item catalog');
assert(editor.includes("var itemId = rewardKeyToId(String($select.val()"), 'edit selector must normalize create-form item keys');
assert(editor.includes("editItems[itemId] = Math.min(999999"), 'adding the same item must merge quantity safely');
assert(editor.includes("Object.keys(editItems).length === 0"), 'empty reward sets must be rejected');
assert(!editor.includes('gc_edit_items" class="form-control'), 'raw JSON textarea must be removed');
assert(!editor.includes('codeDisabled'), 'used codes must not disable code editing');
assert(!editor.includes('rewardDisabled'), 'used codes must not disable reward editing');
assert(!editor.includes('không thể đổi mã hoặc danh sách quà'), 'old UI lock message must be removed');
assert(editor.includes('/^\\d+$/'), 'item id validation must accept digits');

assert(php.includes('function admin_parse_reward_json($json, $limit = 20)'), 'create parser default must remain scoped to 20 items');
assert(php.includes('count(get_object_vars($items)) >= $limit'), 'server parser must enforce its explicit item cap');
assert(php.includes("admin_parse_reward_json($has_reward_payload ? $_POST['items_json'] : '', 250)"), 'edit cap must match the 250-item delivery cap');
assert(php.includes("$has_reward_payload = array_key_exists('items_json', $_POST);"), 'server must distinguish omitted rewards from an empty edit');
assert(php.includes('Danh sách quà phải có ít nhất 1 vật phẩm hợp lệ.'), 'server must reject empty edited rewards');
assert(!php.includes('$used_count > 0 &&'), 'used-count mutation lock must be removed');
assert(!php.includes('Mã đã có người nhận nên không thể đổi mã hoặc danh sách quà.'), 'old server lock must be removed');

console.log(JSON.stringify({ result: 'PASS', checks: 22 }));
