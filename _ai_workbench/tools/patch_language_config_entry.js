#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'linhhoasu', 'lhs', 'newServer');
const { BinJsonUtil, ByteArray } = require(path.join(serverRoot, 'src', 'protocol', 'BinJsonUtil'));

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ''; }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function decode(buffer) {
  const ba = new ByteArray(buffer); const tables = {};
  while (ba.position < ba.length) {
    const n = ba.readUnsignedByte(); const name = ba.readUTFBytes(n); const length = ba.readUnsignedInt();
    const raw = buffer.subarray(ba.position, ba.position + length); ba.position += length;
    tables[name] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
  }
  return tables;
}
function encodeJson(value) { const ba = new ByteArray(undefined, 1024 * 1024); BinJsonUtil.json2bin(value, ba); return Buffer.from(ba.buffer); }
function encode(tables) {
  const parts = [];
  for (const [name, value] of Object.entries(tables)) {
    const nb = Buffer.from(name, 'utf8'); const data = zlib.deflateSync(encodeJson(value)); const h = Buffer.alloc(1 + nb.length + 4);
    h.writeUInt8(nb.length, 0); nb.copy(h, 1); h.writeUInt32BE(data.length, 1 + nb.length); parts.push(h, data);
  }
  return Buffer.concat(parts);
}

const file = path.resolve(arg('--file'));
const id = String(arg('--id'));
const textFile = path.resolve(arg('--text-file'));
const apply = process.argv.includes('--apply');
if (!file || !id || !textFile || !fs.existsSync(file) || !fs.existsSync(textFile)) throw new Error('Thiếu --file/--id/--text-file');
const before = fs.readFileSync(file); const tables = decode(before); const row = tables.LanguageConfig && tables.LanguageConfig[id];
if (!row || typeof row.cn !== 'string') throw new Error(`Không có LanguageConfig.${id}.cn`);
const translated = fs.readFileSync(textFile, 'utf8').replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\n$/, '');
const old = row.cn; row.cn = translated; const output = encode(tables); const verify = decode(output).LanguageConfig[id].cn;
if (verify !== translated) throw new Error('Verify roundtrip thất bại');
if (apply) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backup = path.join(projectRoot, '_ai_workbench', 'backups', `language_entry_${id}_${stamp}`, path.basename(file));
  fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, before); fs.writeFileSync(file, output);
  console.log(JSON.stringify({ apply, id, old, translated, before_sha256: sha(before), after_sha256: sha(output), backup }, null, 2));
} else {
  console.log(JSON.stringify({ apply, id, old, translated, before_sha256: sha(before), candidate_sha256: sha(output), bytes: output.length }, null, 2));
}
