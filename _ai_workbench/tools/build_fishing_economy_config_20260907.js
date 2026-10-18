'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict');
const {BinJsonUtil,ByteArray}=require(path.resolve('linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const base=path.resolve('_ai_workbench/temp/fishing_audit_20260906T212212Z'),root=path.resolve('_ai_workbench/temp/fishing_economy_20260907');
function decode(b){let p=0,rows=[];while(p<b.length){const start=p,n=b[p++],name=b.toString('utf8',p,p+n);p+=n;const len=b.readUInt32BE(p);p+=4;const zipped=b.subarray(p,p+len);p+=len;const x=zlib.inflateSync(zipped);rows.push({name,value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength))),raw:b.subarray(start,p)});}assert.equal(p,b.length);return rows;}
function encodeRow(name,value){const a=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(value,a);const b=zlib.deflateSync(Buffer.from(a.buffer)),n=Buffer.from(name),head=Buffer.alloc(1+n.length+4);head[0]=n.length;n.copy(head,1);head.writeUInt32BE(b.length,n.length+1);return Buffer.concat([head,b]);}
const changes=[];
for(const file of ['server.bin','client.bin']){
 const rows=decode(fs.readFileSync(path.join(base,file))),allowed=new Set(['ShopConfig','Activity6RankConfig','AssetsConfig','AssetsUseConfig']);
 const original=Object.fromEntries(rows.map(r=>[r.name,JSON.parse(JSON.stringify(r.value))]));
 for(const r of rows){
  if(r.name==='ShopConfig')for(const id of[11001401,11001402,11001403,11001404,11001405]){const row=r.value[id];assert(row);for(const reward of row.rewards){if(reward.id===1)reward.count*=1000;if(reward.id===6)reward.count*=10000;}}
  if(r.name==='Activity6RankConfig')for(const row of Object.values(r.value[6006]))for(const reward of row.rewards){if(reward.id===1)reward.count*=1000;if(reward.id===6)reward.count*=10000;}
  if(r.name==='AssetsConfig'){assert.equal(r.value[94501].param,94501);r.value[94501].type=1;r.value[94501].useType=102;}
  if(r.name==='AssetsUseConfig'){assert(!r.value[94501]);r.value[94501]={id:94501,type:102,attrs:[],conditions:[]};}
 }
 const output=Buffer.concat(rows.map(r=>allowed.has(r.name)?encodeRow(r.name,r.value):r.raw));const decoded=decode(output);
 for(const r of decoded){const expected=rows.find(v=>v.name===r.name).value;assert.deepEqual(r.value,expected,r.name);if(!allowed.has(r.name))assert.deepEqual(r.value,original[r.name]);}
 fs.writeFileSync(path.join(root,file),output);changes.push({file,tables:rows.length,changedTables:[...allowed],bytes:output.length});
}
const langRows=decode(fs.readFileSync(path.join(base,'lang.bin'))),lr=langRows.find(r=>r.name==='LanguageConfig');
lr.value[10000119].cn='Tiền đồng sự kiện: bán cá câu mới trong ngư trường sự kiện có 20% cơ hội nhận 1–3. Thẻ Huyền Vũ tăng 25% số lượng (lưu phần lẻ). Hết kỳ đổi số dư sang Bạc theo tỷ lệ 1:1.000. Không tính cá câu trước bản cập nhật.';
lr.value[10094501].cn='Quà Cá chép tự mở khi nhận mới; túi đã có dùng trong túi đồ (tối đa100/lần). Mỗi túi: 50% Tiền cá100–300; 25% Ngọc cá1–3; 15% Ngọc tẩy1–3; 8% Bí quyển câu cá1–3; 1,9% Đùi Gà5; 0,1% bộ thời trang29040. Bảng tỷ lệ riêng của máy chủ.';
fs.writeFileSync(path.join(root,'lang.bin'),Buffer.concat(langRows.map(r=>r.name==='LanguageConfig'?encodeRow(r.name,r.value):r.raw)));
assert.equal(decode(fs.readFileSync(path.join(root,'lang.bin')))[0].value[10000119].cn,lr.value[10000119].cn);
fs.writeFileSync(path.join(root,'config-build.json'),JSON.stringify({result:'PASS',changes,scope:'five contest packs + rank6006 only; price/limits/other items preserved',carp:94501},null,2));console.log(JSON.stringify(changes));
