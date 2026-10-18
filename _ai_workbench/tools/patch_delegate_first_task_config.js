'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert/strict');
const {BinJsonUtil,ByteArray}=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil'));
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
const input=fs.readFileSync(process.argv[2]),chunks=[];let pos=0,changed=0,tables=0;
while(pos<input.length){const start=pos,n=input[pos++],name=input.toString('utf8',pos,pos+n);pos+=n;const len=input.readUInt32BE(pos);pos+=4;const raw=input.subarray(pos,pos+len);pos+=len;tables++;
 if(name!=='SystemConfig'){chunks.push(input.subarray(start,pos));continue;}
 const value=BinJsonUtil.readFullJson(new ByteArray(ab(zlib.inflateSync(raw))));
 assert.deepEqual(value[107].conditions,[{type:2,value:10028,cond:4}]);
 const expected=JSON.parse(JSON.stringify(value));expected[107].conditions=[{type:2,value:10002,cond:4}];
 const out=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(expected,out);
 const compressed=zlib.deflateSync(Buffer.from(out.buffer));
 assert.deepEqual(BinJsonUtil.readFullJson(new ByteArray(ab(zlib.inflateSync(compressed)))),expected);
 const header=Buffer.from(input.subarray(start,start+1+n+4));header.writeUInt32BE(compressed.length,1+n);chunks.push(header,compressed);changed++;
}
assert.equal(pos,input.length);assert.equal(changed,1);fs.writeFileSync(process.argv[3],Buffer.concat(chunks));
console.log(JSON.stringify({result:'PASS',tables,changedTable:'SystemConfig',system:107,before:10028,after:10002,otherChunksByteIdentical:true}));
