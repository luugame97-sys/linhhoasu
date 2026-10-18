'use strict';
const fs = require('fs');
const content = fs.readFileSync('linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

const p = content.indexOf('t(YV=TNe,"EquipModel")');
console.log('EquipModel class registration at:', p);
if (p !== -1) {
  // Print 5000 characters before p
  fs.writeFileSync('_ai_workbench/temp/equip_model_client.js', content.slice(p - 5000, p + 500));
  console.log('Saved to _ai_workbench/temp/equip_model_client.js');
}
