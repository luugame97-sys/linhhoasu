const fs=require('fs');
const p=require('path').resolve(__dirname,'..','temp','ui_freeze_20261013','lhs-artifact-forge-v3.js');
const s=fs.readFileSync(p,'utf8');
if(!s.includes("return true;")) throw new Error('eligibility fallback missing');
if(s.includes('getArtifactFitSkillGroupIdByData(row))')) throw new Error('skill group filter remains');
console.log(JSON.stringify({pass:true,bytes:Buffer.byteLength(s),initialSkillGroupZeroAllowed:true}));
