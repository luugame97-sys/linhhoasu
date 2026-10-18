const fs = require('fs');
const content = fs.readFileSync('linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');

const idx = content.indexOf('"ArenaLogItem"');
console.log(content.slice(Math.max(0, idx - 1500), idx));
