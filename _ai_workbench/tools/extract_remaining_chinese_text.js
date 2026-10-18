#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..', '..');
const clientRoot = path.join(projectRoot, 'linhhoasu', 'webgame', 'game');
const serverRoot = path.join(projectRoot, 'linhhoasu', 'lhs', 'newServer');
const outputRoot = resolveOutputRoot();
const simpleNames = process.argv.includes('--simple-names');
const copySourceToDone = process.argv.includes('--copy-source-to-done');
const clientOnly = process.argv.includes('--client-only');
const { BinJsonUtil, ByteArray } = require(path.join(
  serverRoot,
  'src',
  'protocol',
  'BinJsonUtil'
));
const acorn = require(path.join(serverRoot, 'node_modules', 'acorn'));

const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const VI_RE = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu;
const occurrences = [];
const errors = [];
const sourceMetadata = [];

function resolveOutputRoot() {
  const index = process.argv.indexOf('--output');
  if (index !== -1 && process.argv[index + 1]) {
    return path.resolve(process.argv[index + 1]);
  }
  return path.join(
    projectRoot,
    '_ai_workbench',
    'temp',
    'Chinese_Text_To_Translate_20260829'
  );
}

function relativePath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function addSourceMetadata(kind, filePath, details = {}) {
  sourceMetadata.push({
    kind,
    file: relativePath(filePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256(filePath),
    ...details,
  });
}

function addOccurrence({ priority, category, file, key, offset = null, text }) {
  if (typeof text !== 'string' || !HAN_RE.test(text)) return;
  occurrences.push({
    priority,
    category,
    source_file: relativePath(file),
    source_key: String(key || ''),
    offset,
    original_text: text,
  });
}

function findSingleFile(directory, pattern, label) {
  const matches = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  if (matches.length !== 1) {
    throw new Error(`${label}: cần đúng 1 file, tìm thấy ${matches.length}`);
  }
  return matches[0];
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
    const decoded = zlib.inflateSync(raw);
    tables[tableName] = BinJsonUtil.readFullJson(new ByteArray(decoded));
  }
  return tables;
}

function decodeWholeBinJson(filePath) {
  const decoded = zlib.inflateSync(fs.readFileSync(filePath));
  return BinJsonUtil.readFullJson(new ByteArray(decoded));
}

function walkStrings(value, sourcePath, callback, seen = new Set()) {
  if (typeof value === 'string') {
    callback(value, sourcePath);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkStrings(value[index], `${sourcePath}[${index}]`, callback, seen);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    walkStrings(value[key], `${sourcePath}${safeKey}`, callback, seen);
  }
}

function collectLanguageConfig() {
  const directory = path.join(clientRoot, 'update', 'resource', 'assets', 'excel', 'lang_cn');
  const filePath = findSingleFile(directory, /^config_lang_[a-f0-9]+\.bin$/i, 'LanguageConfig');
  const tables = decodeConfigPack(filePath);
  const table = tables.LanguageConfig || {};
  const ids = Object.keys(table).sort((left, right) => Number(left) - Number(right));
  let remaining = 0;
  let mixed = 0;
  let empty = 0;
  for (const id of ids) {
    const text = table[id] && typeof table[id].cn === 'string' ? table[id].cn : '';
    if (!text) empty += 1;
    if (!HAN_RE.test(text)) continue;
    remaining += 1;
    if (VI_RE.test(text)) mixed += 1;
    addOccurrence({
      priority: 'P0',
      category: 'language_config',
      file: filePath,
      key: `LanguageConfig.${id}.cn`,
      text,
    });
  }
  addSourceMetadata('language_config', filePath, {
    total_rows: ids.length,
    remaining_rows: remaining,
    mixed_vi_cn_rows: mixed,
    empty_rows: empty,
  });
}

function collectBaseConfig() {
  const directory = path.join(clientRoot, 'update', 'resource', 'assets', 'excel');
  const filePath = findSingleFile(directory, /^config_[a-f0-9]+\.bin$/i, 'BaseConfig');
  const tables = decodeConfigPack(filePath);
  walkStrings(tables, 'tables', (text, sourcePath) => {
    addOccurrence({
      priority: 'P0',
      category: 'base_config',
      file: filePath,
      key: sourcePath,
      text,
    });
  });
  addSourceMetadata('base_config', filePath, { tables: Object.keys(tables).length });
}

function collectEui() {
  const directory = path.join(clientRoot, 'update', 'resource', 'assets', 'cfg');
  const filePath = findSingleFile(directory, /^gameEui_[a-f0-9]+\.bin$/i, 'GameEUI');
  const eui = decodeWholeBinJson(filePath);
  walkStrings(eui, 'eui', (text, sourcePath) => {
    addOccurrence({
      priority: 'P0',
      category: 'game_eui',
      file: filePath,
      key: sourcePath,
      text,
    });
  });
  addSourceMetadata('game_eui', filePath, { skins: Object.keys(eui).length });
}

function collectCodeBin() {
  const directory = path.join(clientRoot, 'update', 'resource', 'assets', 'code');
  if (!fs.existsSync(directory)) return;
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^code_[a-f0-9]+\.bin$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
  for (const filePath of files) {
    const ast = decodeWholeBinJson(filePath);
    const seen = new Set();
    const walk = (value, sourcePath) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (value.type === 'Literal' && typeof value.value === 'string') {
        addOccurrence({
          priority: 'P1',
          category: 'runtime_code_bin',
          file: filePath,
          key: sourcePath,
          offset: Number.isInteger(value.start) ? value.start : null,
          text: value.value,
        });
      }
      if (Array.isArray(value)) {
        value.forEach((child, index) => walk(child, `${sourcePath}[${index}]`));
      } else {
        for (const key of Object.keys(value)) {
          if (key === 'value' && value.type === 'Literal') continue;
          walk(value[key], `${sourcePath}.${key}`);
        }
      }
    };
    walk(ast, 'ast');
    addSourceMetadata('runtime_code_bin', filePath);
  }
}

function collectJavaScriptFile(filePath, priority, category) {
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    const tokenizer = acorn.tokenizer(source, {
      ecmaVersion: 'latest',
      allowHashBang: true,
      locations: true,
      sourceType: 'script',
    });
    for (const token of tokenizer) {
      if (
        (token.type.label === 'string' || token.type.label === 'template') &&
        typeof token.value === 'string'
      ) {
        addOccurrence({
          priority,
          category,
          file: filePath,
          key: `line:${token.loc.start.line}:column:${token.loc.start.column + 1}`,
          offset: token.start,
          text: token.value,
        });
      }
    }
  } catch (error) {
    errors.push(`${relativePath(filePath)}: tokenizer lỗi: ${error.message}`);
  }
  addSourceMetadata(category, filePath);
}

function collectClientJavaScript() {
  const directory = path.join(clientRoot, 'js');
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^(main|start)\.min_[a-f0-9]+\.js$/i.test(entry.name)
    )
    .map((entry) => path.join(directory, entry.name))
    .sort();
  for (const filePath of files) {
    collectJavaScriptFile(filePath, 'P1', 'client_javascript');
  }
}

function lineNumberAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function collectHtmlFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const visiblePattern = />([^<>]*[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff][^<>]*)</gu;
  const attributePattern = /(?:title|placeholder|alt|value)\s*=\s*(["'])([^"']*[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff][^"']*)\1/giu;
  for (const match of source.matchAll(visiblePattern)) {
    const text = match[1].replace(/\s+/g, ' ').trim();
    addOccurrence({
      priority: 'P1',
      category: 'client_html',
      file: filePath,
      key: `line:${lineNumberAt(source, match.index)}`,
      offset: match.index,
      text,
    });
  }
  for (const match of source.matchAll(attributePattern)) {
    addOccurrence({
      priority: 'P1',
      category: 'client_html',
      file: filePath,
      key: `line:${lineNumberAt(source, match.index)}:attribute`,
      offset: match.index,
      text: match[2],
    });
  }
  addSourceMetadata('client_html', filePath);
}

function collectClientHtml() {
  for (const fileName of ['index.html', 'jump.html', 'register.html']) {
    const filePath = path.join(clientRoot, fileName);
    if (fs.existsSync(filePath)) collectHtmlFile(filePath);
  }
}

function walkFiles(directory, predicate, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, result);
    } else if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

function collectServerJavaScript() {
  const sourceRoot = path.join(serverRoot, 'src');
  const files = walkFiles(sourceRoot, (filePath) => filePath.endsWith('.js')).sort();
  for (const filePath of files) {
    collectJavaScriptFile(filePath, 'P2', 'server_javascript_review');
  }
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

function extractPlaceholders(text) {
  const patterns = [
    /\{\d+\}/g,
    /%[-+0-9.]*[sdif]/gi,
    /<\/?[a-z][^>]*>/gi,
    /\\[nrt]/g,
    /\$\{[^}]+\}/g,
  ];
  const values = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) values.add(match[0]);
  }
  return [...values];
}

function groupOccurrences() {
  const groupsByText = new Map();
  for (const occurrence of occurrences) {
    let group = groupsByText.get(occurrence.original_text);
    if (!group) {
      group = {
        original_text: occurrence.original_text,
        occurrences: [],
        priorities: new Set(),
        categories: new Set(),
      };
      groupsByText.set(occurrence.original_text, group);
    }
    group.occurrences.push(occurrence);
    group.priorities.add(occurrence.priority);
    group.categories.add(occurrence.category);
  }
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const groups = [...groupsByText.values()];
  for (const group of groups) {
    group.priority = [...group.priorities].sort(
      (left, right) => priorityOrder[left] - priorityOrder[right]
    )[0];
    group.mixed_vi_cn = VI_RE.test(group.original_text);
    group.placeholders = extractPlaceholders(group.original_text);
  }
  groups.sort((left, right) => {
    const priorityDiff = priorityOrder[left.priority] - priorityOrder[right.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const categoryDiff = [...left.categories].sort()[0].localeCompare([...right.categories].sort()[0]);
    if (categoryDiff !== 0) return categoryDiff;
    return left.original_text.localeCompare(right.original_text, 'zh-CN');
  });
  groups.forEach((group, index) => {
    group.text_id = `CN${String(index + 1).padStart(5, '0')}`;
  });
  return groups;
}

function buildPureChineseText(groups) {
  // Line N in this file maps to line N in
  // ALL_CHINESE_TEXT_TO_TRANSLATE_done.txt. Keep every source string on one
  // physical line so a plain translated output can be imported by position.
  return groups.map((group) => escapeSingleLine(group.original_text)).join('\r\n');
}

function countByPriority(groups) {
  const result = {};
  for (const group of groups) result[group.priority] = (result[group.priority] || 0) + 1;
  return result;
}

function countByCategory(items) {
  const result = {};
  for (const item of items) result[item.category] = (result[item.category] || 0) + 1;
  return result;
}

function buildLanguageByIdText() {
  const items = occurrences
    .filter((item) => item.category === 'language_config')
    .sort((left, right) => {
      const leftId = Number(left.source_key.match(/\.(\d+)\.cn$/)?.[1] || 0);
      const rightId = Number(right.source_key.match(/\.(\d+)\.cn$/)?.[1] || 0);
      return leftId - rightId;
    });
  const lines = [
    'LANGUAGECONFIG - CÁC ID CÒN CHỨA CHỮ TRUNG',
    'Chỉ điền sau "VIỆT:" và giữ nguyên ID/biến định dạng.',
    '',
  ];
  for (const item of items) {
    const id = item.source_key.match(/\.(\d+)\.cn$/)?.[1] || item.source_key;
    lines.push(`[LANG_ID:${id}]`);
    lines.push(`TRUNG: ${escapeSingleLine(item.original_text)}`);
    lines.push('VIỆT:');
    lines.push('');
  }
  return lines.join('\r\n');
}

function buildMapping(groups) {
  const idByText = new Map(groups.map((group) => [group.original_text, group.text_id]));
  const lineByText = new Map(groups.map((group, index) => [group.original_text, index + 1]));
  return occurrences
    .map((item) => ({
      translation_line: lineByText.get(item.original_text),
      text_id: idByText.get(item.original_text),
      ...item,
      vietnamese_text: '',
    }))
    .sort((left, right) => {
      const idDiff = left.text_id.localeCompare(right.text_id);
      if (idDiff !== 0) return idDiff;
      const fileDiff = left.source_file.localeCompare(right.source_file);
      if (fileDiff !== 0) return fileDiff;
      return left.source_key.localeCompare(right.source_key);
    });
}

function buildSummary(groups, mapping, masterFileName, doneFileName, copiedDone) {
  const occurrenceCounts = countByCategory(occurrences);
  const uniqueCounts = {};
  for (const group of groups) {
    for (const category of group.categories) {
      uniqueCounts[category] = (uniqueCounts[category] || 0) + 1;
    }
  }
  const screenshotGroup = groups.find((group) => group.original_text.includes('还需完成{0}个任务后'));
  const lines = [
    'TÓM TẮT QUÉT TEXT TRUNG - LINH HỌA SƯ',
    '',
    `Tổng vị trí chứa chữ Hán: ${occurrences.length}`,
    `Tổng text duy nhất cần dịch: ${groups.length}`,
    `Dòng Việt-Trung bị trộn: ${groups.filter((group) => group.mixed_vi_cn).length}`,
    '',
    'ĐỊNH DẠNG DỊCH THEO DÒNG:',
    `- ${masterFileName}: ${groups.length} dòng text nguồn, không header/ID.`,
    `- ${doneFileName}: phải có đúng ${groups.length} dòng tiếng Việt.`,
    '- Dòng N của file _done là bản dịch của dòng N trong file nguồn.',
    '- Không thêm/xóa dòng; giữ nguyên placeholder, thẻ định dạng và ký hiệu escape.',
    copiedDone
      ? '- Cả hai file dùng UTF-8 BOM. File bản dịch được khởi tạo cùng số dòng để bạn dịch đè từng dòng.'
      : '- Cả hai file dùng UTF-8 BOM. File bản dịch được tạo rỗng một lần và không bị tool ghi đè.',
    '',
    'THEO NGUỒN:',
  ];
  for (const category of Object.keys(occurrenceCounts).sort()) {
    lines.push(
      `- ${category}: ${occurrenceCounts[category]} vị trí, ${uniqueCounts[category] || 0} text duy nhất`
    );
  }
  lines.push('', 'FILE NGUỒN:');
  for (const metadata of sourceMetadata) {
    lines.push(`- ${metadata.kind}: ${metadata.file}`);
    lines.push(`  SHA-256: ${metadata.sha256}`);
    const detailPairs = Object.entries(metadata).filter(
      ([key]) => !['kind', 'file', 'bytes', 'sha256'].includes(key)
    );
    if (detailPairs.length) {
      lines.push(`  ${detailPairs.map(([key, value]) => `${key}=${value}`).join(', ')}`);
    }
  }
  if (screenshotGroup) {
    lines.push(
      '',
      'ĐỐI CHIẾU ẢNH NGƯỜI DÙNG:',
      `- Mã bản dịch: ${screenshotGroup.text_id}`,
      '- LanguageConfig ID: 30032619',
      '- Text: 还需完成{0}个任务后'
    );
  }
  if (errors.length) {
    lines.push('', 'CẢNH BÁO:');
    errors.forEach((error) => lines.push(`- ${error}`));
  } else {
    lines.push('', 'Lỗi quét: 0');
  }
  lines.push('', `Số dòng mapping: ${mapping.length}`);
  return lines.join('\r\n');
}

function buildTsv(mapping) {
  const columns = [
    'translation_line',
    'text_id',
    'priority',
    'category',
    'source_file',
    'source_key',
    'offset',
    'original_text',
    'vietnamese_text',
  ];
  const lines = [columns.join('\t')];
  for (const item of mapping) {
    lines.push(
      columns
        .map((column) => {
          const value = item[column] == null ? '' : String(item[column]);
          return escapeSingleLine(value);
        })
        .join('\t')
    );
  }
  return lines.join('\r\n');
}

function writeUtf8Bom(filePath, content) {
  fs.writeFileSync(filePath, `\ufeff${content}`, 'utf8');
}

function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  collectLanguageConfig();
  collectBaseConfig();
  collectEui();
  collectCodeBin();
  collectClientJavaScript();
  collectClientHtml();
  if (!clientOnly) collectServerJavaScript();

  const groups = groupOccurrences();
  const mapping = buildMapping(groups);
  const masterFileName = simpleNames
    ? (clientOnly ? '01_CLIENT_TEXT_TRUNG_CON_SOT.txt' : '01_TEXT_TRUNG_CAN_DICH.txt')
    : 'ALL_CHINESE_TEXT_TO_TRANSLATE.txt';
  const doneFileName = simpleNames
    ? (clientOnly ? '02_CLIENT_TEXT_VIET_DE_DICH.txt' : '02_TEXT_VIET_BAN_DICH.txt')
    : 'ALL_CHINESE_TEXT_TO_TRANSLATE_done.txt';
  const masterPath = path.join(outputRoot, masterFileName);
  const donePath = path.join(outputRoot, doneFileName);
  const languagePath = path.join(outputRoot, 'LANGUAGE_CONFIG_REMAINING_BY_ID.txt');
  const summaryPath = path.join(outputRoot, 'SUMMARY.txt');
  const tsvPath = path.join(outputRoot, 'mapping.tsv');
  const jsonPath = path.join(outputRoot, 'mapping.json');

  writeUtf8Bom(masterPath, buildPureChineseText(groups));
  const doneTemplateCreated = !fs.existsSync(donePath);
  if (doneTemplateCreated) {
    writeUtf8Bom(donePath, copySourceToDone ? buildPureChineseText(groups) : '');
  }
  writeUtf8Bom(languagePath, buildLanguageByIdText());
  writeUtf8Bom(summaryPath, buildSummary(groups, mapping, masterFileName, doneFileName, copySourceToDone));
  writeUtf8Bom(tsvPath, buildTsv(mapping));
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        project_root: projectRoot,
        sources: sourceMetadata,
        errors,
        translation_format: {
          source_file: path.basename(masterPath),
          done_file: path.basename(donePath),
          line_count: groups.length,
          encoding: 'UTF-8 BOM',
          source_line_format: 'escaped single line',
          output_line_format: 'Vietnamese text only',
        },
        groups: groups.map((group, index) => ({
          translation_line: index + 1,
          text_id: group.text_id,
          priority: group.priority,
          original_text: group.original_text,
          vietnamese_text: '',
          placeholders: group.placeholders,
          mixed_vi_cn: group.mixed_vi_cn,
          occurrence_count: group.occurrences.length,
        })),
        mapping,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        output: outputRoot,
        sourceFile: masterPath,
        doneFile: donePath,
        doneTemplateCreated,
        occurrences: occurrences.length,
        uniqueTexts: groups.length,
        mixedViCn: groups.filter((group) => group.mixed_vi_cn).length,
        byCategory: countByCategory(occurrences),
        screenshot: groups.find((group) => group.original_text.includes('还需完成{0}个任务后'))
          ?.text_id,
        errors,
      },
      null,
      2
    )
  );
}

main();
