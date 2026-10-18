#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverRoot = path.join(projectRoot, 'linhhoasu', 'lhs', 'newServer');
function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : '';
}

const translationRoot = argumentValue('--root')
  ? path.resolve(argumentValue('--root'))
  : path.join(projectRoot, '_ai_workbench', 'temp', 'Chinese_Text_To_Translate_20260829');
const mappingPath = path.join(translationRoot, 'mapping.json');
const requestedDonePath = argumentValue('--done');
const simpleDonePath = path.join(translationRoot, '02_TEXT_VIET_BAN_DICH.txt');
const donePath = requestedDonePath
  ? path.resolve(requestedDonePath)
  : (fs.existsSync(simpleDonePath)
    ? simpleDonePath
    : path.join(translationRoot, 'ALL_CHINESE_TEXT_TO_TRANSLATE_done.txt'));
const apply = process.argv.includes('--apply');
const allowedCategoriesArg = argumentValue('--categories');
const allowedCategories = allowedCategoriesArg
  ? new Set(allowedCategoriesArg.split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const allowSourceMismatch = process.argv.includes('--allow-source-mismatch');

const { BinJsonUtil, ByteArray } = require(path.join(
  serverRoot,
  'src',
  'protocol',
  'BinJsonUtil'
));
const acorn = require(path.join(serverRoot, 'node_modules', 'acorn'));

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function escapeSingleLine(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function decodeSingleLine(text) {
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '\\' || index + 1 >= text.length) {
      output += char;
      continue;
    }
    const next = text[index + 1];
    if (next === '\\') {
      output += '\\';
      index += 1;
    } else if (next === 'n') {
      output += '\n';
      index += 1;
    } else if (next === 'r') {
      output += '\r';
      index += 1;
    } else if (next === 't') {
      output += '\t';
      index += 1;
    } else if (text.startsWith('\\u2028', index)) {
      output += '\u2028';
      index += 5;
    } else if (text.startsWith('\\u2029', index)) {
      output += '\u2029';
      index += 5;
    } else {
      output += `\\${next}`;
      index += 1;
    }
  }
  return output;
}

function readTranslationLines(expected) {
  let raw = fs.readFileSync(donePath, 'utf8').replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
  if (raw.endsWith('\n')) raw = raw.slice(0, -1);
  const lines = raw.split('\n');
  if (lines.length !== expected) {
    throw new Error(`File dịch có ${lines.length} dòng, cần đúng ${expected}`);
  }
  return lines;
}

function decodeConfigPack(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ba = new ByteArray(buffer);
  const tables = {};
  while (ba.position < ba.length) {
    const nameLength = ba.readUnsignedByte();
    const tableName = ba.readUTFBytes(nameLength);
    const dataLength = ba.readUnsignedInt();
    if (dataLength < 0 || ba.position + dataLength > ba.length) {
      throw new Error(`Độ dài bảng ${tableName} không hợp lệ`);
    }
    const raw = buffer.subarray(ba.position, ba.position + dataLength);
    ba.position += dataLength;
    tables[tableName] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
  }
  return tables;
}

function encodeBinJson(value) {
  const ba = new ByteArray(undefined, 1024 * 1024);
  BinJsonUtil.json2bin(value, ba);
  return Buffer.from(ba.buffer);
}

function encodeConfigPack(tables) {
  const parts = [];
  for (const [name, value] of Object.entries(tables)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    if (nameBuffer.length > 255) throw new Error(`Tên bảng quá dài: ${name}`);
    const compressed = zlib.deflateSync(encodeBinJson(value));
    const header = Buffer.alloc(1 + nameBuffer.length + 4);
    header.writeUInt8(nameBuffer.length, 0);
    nameBuffer.copy(header, 1);
    header.writeUInt32BE(compressed.length, 1 + nameBuffer.length);
    parts.push(header, compressed);
  }
  return Buffer.concat(parts);
}

function decodeWholeBinJson(filePath) {
  return BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(fs.readFileSync(filePath))));
}

function updateAstLiteral(root, item) {
  let found = null;
  let translatedFound = false;
  const seen = new Set();
  function walk(value) {
    if (found || !value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (
      value.type === 'Literal'
      && Number(value.start) === Number(item.offset)
    ) {
      if (value.value === item.original_text) found = value;
      else if (value.value === item.translated_text) translatedFound = true;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else {
      Object.keys(value).forEach((key) => walk(value[key]));
    }
  }
  walk(root);
  if (!found) return { status: translatedFound ? 'already_applied' : 'source_mismatch' };
  if (found.value === item.translated_text) return { status: 'already_applied' };
  found.value = item.translated_text;
  return { status: 'updated' };
}

function encodeWholeBinJson(value) {
  return zlib.deflateSync(encodeBinJson(value));
}

function parseObjectPath(sourcePath) {
  const tokens = [];
  let index = 0;
  const identifier = /^[A-Za-z_$][\w$]*/;
  const first = sourcePath.slice(index).match(identifier);
  if (!first) throw new Error(`Path không hợp lệ: ${sourcePath}`);
  tokens.push(first[0]);
  index += first[0].length;
  while (index < sourcePath.length) {
    if (sourcePath[index] === '.') {
      index += 1;
      const match = sourcePath.slice(index).match(identifier);
      if (match) {
        tokens.push(match[0]);
        index += match[0].length;
      } else {
        const numeric = sourcePath.slice(index).match(/^\d+/);
        if (!numeric) throw new Error(`Path dot không hợp lệ: ${sourcePath}`);
        tokens.push(numeric[0]);
        index += numeric[0].length;
      }
      continue;
    }
    if (sourcePath[index] === '[') {
      const close = sourcePath.indexOf(']', index);
      if (close === -1) throw new Error(`Path bracket không đóng: ${sourcePath}`);
      const raw = sourcePath.slice(index + 1, close);
      let key;
      if (/^\d+$/.test(raw)) key = Number(raw);
      else key = JSON.parse(raw);
      tokens.push(key);
      index = close + 1;
      continue;
    }
    throw new Error(`Ký tự path không hỗ trợ tại ${index}: ${sourcePath}`);
  }
  return tokens;
}

function setObjectPath(root, sourcePath, originalText, translatedText) {
  const tokens = parseObjectPath(sourcePath);
  const first = tokens[0];
  if (['tables', 'eui', 'ast'].includes(first)) tokens.shift();
  let current = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (current == null || typeof current !== 'object' || !(tokens[index] in current)) {
      return { status: 'missing_path' };
    }
    current = current[tokens[index]];
  }
  const last = tokens[tokens.length - 1];
  if (current == null || typeof current !== 'object' || !(last in current)) {
    return { status: 'missing_path' };
  }
  if (current[last] === translatedText) return { status: 'already_applied' };
  if (current[last] !== originalText) return { status: 'source_mismatch', actual: current[last] };
  current[last] = translatedText;
  return { status: 'updated' };
}

function buildJsReplacement(token, source, translatedText) {
  if (token.type.label === 'string') return JSON.stringify(translatedText);
  if (token.type.label === 'template') {
    return translatedText
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }
  throw new Error(`Token JS không hỗ trợ: ${token.type.label}`);
}

function updateJavaScript(filePath, items) {
  const source = fs.readFileSync(filePath, 'utf8');
  const tokens = [];
  for (const token of acorn.tokenizer(source, {
    ecmaVersion: 'latest',
    allowHashBang: true,
    locations: true,
    sourceType: 'script',
  })) {
    if (token.type.label === 'string' || token.type.label === 'template') tokens.push(token);
  }
  const tokenByStart = new Map(tokens.map((token, index) => [token.start, index]));
  const tokenIndexesByValue = new Map();
  tokens.forEach((token, index) => {
    if (!tokenIndexesByValue.has(token.value)) tokenIndexesByValue.set(token.value, []);
    tokenIndexesByValue.get(token.value).push(index);
  });
  const used = new Set();
  const replacements = [];
  const results = [];
  for (const item of items) {
    const candidateIndexes = tokenIndexesByValue.get(item.original_text) || [];
    let matchIndex = tokenByStart.get(Number(item.offset));
    if (matchIndex != null && (used.has(matchIndex) || tokens[matchIndex].value !== item.original_text)) {
      matchIndex = -1;
    }
    if (matchIndex === -1) {
      const loc = item.source_key.match(/line:(\d+):column:(\d+)/);
      if (loc) {
        matchIndex = candidateIndexes.find((tokenIndex) => {
          const token = tokens[tokenIndex];
          return !used.has(tokenIndex)
            && token.loc.start.line === Number(loc[1])
            && token.loc.start.column + 1 === Number(loc[2]);
        });
        if (matchIndex == null) matchIndex = -1;
      }
    }
    if (matchIndex === -1 && candidateIndexes.length > 0) {
      matchIndex = candidateIndexes.find((tokenIndex) => !used.has(tokenIndex));
      if (matchIndex == null) matchIndex = -1;
    }
    if (matchIndex == null) matchIndex = -1;
    if (matchIndex === -1) {
      const alreadyApplied = tokens.some((token) => token.value === item.translated_text);
      results.push({ item, status: alreadyApplied ? 'already_applied' : 'source_mismatch' });
      continue;
    }
    const token = tokens[matchIndex];
    used.add(matchIndex);
    replacements.push({
      start: token.start,
      end: token.end,
      text: buildJsReplacement(token, source, item.translated_text),
    });
    results.push({ item, status: 'updated' });
  }
  let output = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
  }
  return { output, results };
}

function updateHtml(filePath, items) {
  let output = fs.readFileSync(filePath, 'utf8');
  const results = [];
  for (const item of items) {
    const at = output.indexOf(item.original_text);
    if (at === -1) {
      if (output.includes(item.translated_text)) results.push({ item, status: 'already_applied' });
      else results.push({ item, status: 'source_mismatch' });
      continue;
    }
    output = output.slice(0, at) + item.translated_text + output.slice(at + item.original_text.length);
    results.push({ item, status: 'updated' });
  }
  return { output, results };
}

function main() {
  const mappingRaw = fs.readFileSync(mappingPath, 'utf8').replace(/^\ufeff/, '');
  const data = JSON.parse(mappingRaw);
  const lines = readTranslationLines(data.groups.length);
  const translations = new Map();
  let changedLines = 0;
  for (let index = 0; index < data.groups.length; index += 1) {
    const group = data.groups[index];
    if (lines[index] === escapeSingleLine(group.original_text)) continue;
    translations.set(index + 1, decodeSingleLine(lines[index]));
    changedLines += 1;
  }

  const byFile = new Map();
  for (const occurrence of data.mapping) {
    if (allowedCategories && !allowedCategories.has(occurrence.category)) continue;
    if (!translations.has(occurrence.translation_line)) continue;
    const filePath = path.join(projectRoot, occurrence.source_file);
    if (!byFile.has(filePath)) byFile.set(filePath, []);
    byFile.get(filePath).push({
      ...occurrence,
      translated_text: translations.get(occurrence.translation_line),
    });
  }

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(projectRoot, '_ai_workbench', 'backups', `text_import_${stamp}`);
  const report = {
    apply,
    changed_translation_lines: changedLines,
    mapped_occurrences: [...byFile.values()].reduce((sum, items) => sum + items.length, 0),
    files: [],
    counts: {},
    backup_root: path.relative(projectRoot, backupRoot).replace(/\\/g, '/'),
  };

  for (const [filePath, items] of [...byFile.entries()].sort()) {
    if (!fs.existsSync(filePath)) {
      items.forEach((item) => addResult(report, filePath, item, 'missing_file'));
      continue;
    }
    const category = items[0].category;
    const before = fs.readFileSync(filePath);
    let output = null;
    let results = [];
    if (category === 'language_config' || category === 'base_config') {
      const tables = decodeConfigPack(filePath);
      results = items.map((item) => ({
        item,
        ...setObjectPath(tables, item.source_key, item.original_text, item.translated_text),
      }));
      output = apply ? encodeConfigPack(tables) : null;
    } else if (category === 'game_eui' || category === 'runtime_code_bin') {
      const value = decodeWholeBinJson(filePath);
      results = category === 'runtime_code_bin'
        ? items.map((item) => ({ item, ...updateAstLiteral(value, item) }))
        : items.map((item) => ({
            item,
            ...setObjectPath(value, item.source_key, item.original_text, item.translated_text),
          }));
      output = apply ? encodeWholeBinJson(value) : null;
    } else if (category === 'client_javascript' || category === 'server_javascript_review') {
      const updated = updateJavaScript(filePath, items);
      output = apply ? Buffer.from(updated.output, 'utf8') : null;
      results = updated.results;
    } else if (category === 'client_html') {
      // The extractor can capture an entire inline <script> as one HTML text
      // node. Never replace that giant node from a line-oriented translation
      // file; only safe short visible/attribute strings are imported.
      const safeItems = items.filter((item) => item.original_text.length <= 1000);
      const skippedItems = items
        .filter((item) => item.original_text.length > 1000)
        .map((item) => ({ item, status: 'skipped_large_inline' }));
      const updated = updateHtml(filePath, safeItems);
      output = apply ? Buffer.from(updated.output, 'utf8') : null;
      results = [...updated.results, ...skippedItems];
    } else {
      results = items.map((item) => ({ item, status: 'unsupported_category' }));
    }

    const updatedCount = results.filter((result) => result.status === 'updated').length;
    if (apply && output && updatedCount > 0) {
      const relative = path.relative(projectRoot, filePath);
      const backupPath = path.join(backupRoot, relative);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, before);
      fs.writeFileSync(filePath, output);
    }
    const afterBuffer = apply && output && updatedCount > 0 ? fs.readFileSync(filePath) : before;
    report.files.push({
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      category,
      before_sha256: sha256Buffer(before),
      after_sha256: sha256Buffer(afterBuffer),
      updated: updatedCount,
      results: summarizeResults(results),
    });
    results.forEach((result) => increment(report.counts, result.status));
  }

  const reportPath = path.join(
    projectRoot,
    '_ai_workbench',
    'temp',
    `translation_import_${stamp}${apply ? '_apply' : '_dryrun'}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
  if (!allowSourceMismatch && ((report.counts.source_mismatch || 0) > 0 || (report.counts.missing_path || 0) > 0)) {
    process.exitCode = 2;
  }
}

function summarizeResults(results) {
  const summary = {};
  for (const result of results) increment(summary, result.status);
  return summary;
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function addResult(report, filePath, item, status) {
  increment(report.counts, status);
  report.files.push({
    file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
    category: item.category,
    updated: 0,
    results: { [status]: 1 },
  });
}

main();
