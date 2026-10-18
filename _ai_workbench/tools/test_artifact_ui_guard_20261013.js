const fs = require('fs');
const p = require('path').resolve(__dirname, '..', 'temp', 'ui_freeze_20261013', 'main.candidate.js');
const s = fs.readFileSync(p, 'utf8');
const old = 'Y.Config.ArtifactSkillConfig[this.data.id][this.data.lv||1]';
const guard = 'Y.Config&&Y.Config.ArtifactSkillConfig&&Y.Config.ArtifactSkillConfig[e.id]';
if (!s.includes(guard)) throw new Error('guard missing');
if (s.includes(old)) throw new Error('unguarded access remains');
if (!s.includes('if(!t){this.visible=!1;return}')) throw new Error('invalid-data guard missing');
console.log(JSON.stringify({pass:true, candidateBytes:Buffer.byteLength(s), oldAccessAbsent:true, guardPresent:true}));
