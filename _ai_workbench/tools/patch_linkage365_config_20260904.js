'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..','..'),{BinJsonUtil,ByteArray}=require(path.join(root,'linhhoasu','lhs','newServer','src','protocol','BinJsonUtil'));
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),start=Number(process.argv[4]),end=Number(process.argv[5]);
if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==365*86400000)throw new Error('invalid 365-day window');
function ab(buffer){return buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)}
function decode(buffer){const rows=[];let offset=0;while(offset<buffer.length){const nl=buffer.readUInt8(offset++),name=buffer.toString('utf8',offset,offset+nl);offset+=nl;const len=buffer.readUInt32BE(offset);offset+=4;const raw=buffer.subarray(offset,offset+len);offset+=len;rows.push({name,value:BinJsonUtil.readFullJson(new ByteArray(ab(zlib.inflateSync(raw))))})}assert.equal(offset,buffer.length);return rows}
function encodeValue(value){const ba=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(value,ba);return Buffer.from(ba.buffer)}
function encode(rows){const chunks=[];for(const row of rows){const name=Buffer.from(row.name,'utf8'),body=zlib.deflateSync(encodeValue(row.value),{level:6}),header=Buffer.allocUnsafe(1+name.length+4);header.writeUInt8(name.length,0);name.copy(header,1);header.writeUInt32BE(body.length,1+name.length);chunks.push(header,body)}return Buffer.concat(chunks)}
const original=decode(fs.readFileSync(input)),before=new Map(original.map(x=>[x.name,JSON.parse(JSON.stringify(x.value))])),target=original.find(x=>x.name==='ActivityBaseConfig');
assert.ok(target,'ActivityBaseConfig missing');const previous={start:Number(target.value.linkageStartTime),end:Number(target.value.linkageEndTime)};target.value.linkageStartTime=start;target.value.linkageEndTime=end;
const out=encode(original);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,out);const after=decode(out);assert.equal(after.length,original.length);const byName=new Map(after.map(x=>[x.name,x.value]));
for(const [name,value] of before){const actual=byName.get(name);if(name!=='ActivityBaseConfig')assert.deepEqual(actual,value,name+' changed');else{const expected=JSON.parse(JSON.stringify(value));expected.linkageStartTime=start;expected.linkageEndTime=end;assert.deepEqual(actual,expected,'ActivityBaseConfig changed outside linkage window')}}
console.log(JSON.stringify({result:'PASS',tables:after.length,input,output,previous,start,end,durationMs:end-start,bytes:out.length}));
