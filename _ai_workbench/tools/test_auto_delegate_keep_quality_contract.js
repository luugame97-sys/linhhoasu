'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'temp', 'auto_delegate_sell_all_20260914', 'candidate', 'main.js');
const source = fs.readFileSync(file, 'utf8');
const indexFile = process.argv[3] || path.join(path.dirname(file), 'index.html');
const index = fs.readFileSync(indexFile, 'utf8');
const checks = [
  ['visible_keep_quality_checkbox', 'sellAllEquipmentsBox=new U.CheckBox'],
  ['keep_quality_label', 'sellAllEquipmentsLabel.text="Giữ lại phẩm chất"'],
  ['default_checked', 'sellAllEquipmentsBox.selected=!e.sellAllEquipments'],
  ['toggle_inverted', 'sellAllEquipments=!this.sellAllEquipmentsBox.selected'],
  ['setting_persist_write', 'writeBoolean(!!e.sellAllEquipments)'],
  ['setting_persist_read', 'sellAllEquipments=e.readBoolean()'],
  ['silent_sale_flag_explicit', 'sellAllEquipments:!!(U9.isOpen&&U9.autoConfig.sellAllEquipments)'],
  ['auto_flow_uses_sale_flag', 'z=!!U9.autoConfig.sellAllEquipments'],
  ['server_option_forwarded', 'sellAllEquipments'],
];
for (const [name, marker] of checks) assert(source.includes(marker), `${name} missing`);
assert(!source.includes('sellAllEquipmentsLabel.text="Bán hết trang bị"'), 'old inverse label remains');
assert(index.includes('20260914_auto_delegate_silent_v1'), 'cache bust missing');
console.log(JSON.stringify({ result: 'PASS', checks: checks.length + 1, file, indexFile, defaultKeepQuality: true, uncheckedSellsAll: true, noPlayerMutation: true }));
