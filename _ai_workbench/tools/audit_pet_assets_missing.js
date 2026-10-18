const fs = require('fs');
const code = fs.readFileSync('linhhoasu/webgame/game/js/egretex.min_37b3ee13.js', 'utf8');

console.log(code.substring(99000, 99900));
