'use strict';
// Exact, reversible text substitutions in the native minified bundle.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve(__dirname,'../temp/pet_safety_20261017');
let s=fs.readFileSync(path.join(dir,'baseline/main.js'),'utf8');
const old='B.ConvertLanguageToText(30032333)',next='"Thú đã đạt cấp tối đa. Cho ăn sẽ tiêu hao pet EXP và bỏ toàn bộ EXP dư. Tiếp tục?"';
assert.equal(s.split(old).length-1,2);
s=s.split(old).join(next);
assert.equal(s.split(next).join(old),fs.readFileSync(path.join(dir,'baseline/main.js'),'utf8'));
fs.writeFileSync(path.join(dir,'candidate/main.js'),s,'utf8');
console.log('Two overflow notices updated; all other bundle bytes preserved.');
