#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const projectRoot = path.resolve(__dirname, '..', '..');
const adminRoot = path.join(projectRoot, 'linhhoasu', 'lhs', 'LHS-admin');
const acorn = require(path.join(projectRoot, 'linhhoasu', 'lhs', 'newServer', 'node_modules', 'acorn'));
const apply = process.argv.includes('--apply');
const cachePath = path.join(projectRoot, '_ai_workbench', 'temp', 'admin_zh_vi_cache.json');
const reportPath = path.join(projectRoot, '_ai_workbench', 'temp', 'admin_localization_report.json');
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

const exactGlossary = {
  'LHS 统一管理中心': 'Trung tâm quản trị LHS',
  'LHS 管理后台': 'Trang quản trị LHS',
  '游戏用户管理': 'Quản lý người chơi',
  '用户数据管理': 'Quản lý dữ liệu người chơi',
  '游戏后台模块中心': 'Trung tâm mô-đun quản trị game',
  '完整后台': 'Trang quản trị đầy đủ',
  '总控首页': 'Trang tổng quản',
  '独立模块': 'Mô-đun độc lập',
  '代理商管理': 'Quản lý đại lý',
  '充值配置': 'Cấu hình nạp tiền',
  '兑换码管理': 'Quản lý GiftCode',
  '信件管理': 'Quản lý thư',
  '聊天管理': 'Quản lý chat',
  '操作日志': 'Nhật ký thao tác',
  '大区数据管理': 'Quản lý máy chủ',
  '分销管理': 'Quản lý phân phối',
  '分销代理端': 'Cổng đại lý phân phối',
  '退出登录': 'Đăng xuất',
  '登录': 'Đăng nhập',
  '用户名': 'Tên đăng nhập',
  '密码': 'Mật khẩu',
  '搜索': 'Tìm kiếm',
  '清空': 'Xóa bộ lọc',
  '刷新数据': 'Làm mới dữ liệu',
  '新增大区': 'Thêm máy chủ',
  '新增代理商': 'Thêm đại lý',
  '新增配置': 'Thêm cấu hình',
  '新增兑换码': 'Thêm GiftCode',
  '编辑': 'Chỉnh sửa',
  '删除': 'Xóa',
  '任务': 'Nhiệm vụ',
  '发放': 'Phát thưởng',
  '充值': 'Nạp tiền',
  '禁言': 'Cấm chat',
  '解禁言': 'Bỏ cấm chat',
  '封禁账号': 'Khóa tài khoản',
  '解封账号': 'Mở khóa tài khoản',
  '解锁系统': 'Mở khóa tính năng',
  '全部状态': 'Tất cả trạng thái',
  '启用': 'Bật',
  '停用': 'Tắt',
  '成功': 'Thành công',
  '失败': 'Thất bại',
  '拒绝': 'Từ chối',
  '系统': 'Hệ thống',
  '世界': 'Thế giới',
  '无': 'Không có',
  '暂无数据': 'Chưa có dữ liệu',
};

function readCache() {
  if (!fs.existsSync(cachePath)) return {};
  return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

function protectText(text) {
  const values = [];
  const pattern = /\$\{[^}]+\}|\{\d+\}|%[-+0-9.]*[sdif]|<\/?[a-z][^>]*>|\\[nrt]|\b(?:userId|playerId|accountId|roleId|agentId|serverId|batchId|msgUid|activeId)\b/gi;
  const protectedText = text.replace(pattern, (value) => {
    const token = `ZXQPH${values.length}QXZ`;
    values.push(value);
    return token;
  });
  return { protectedText, values };
}

function restoreText(text, values) {
  let output = String(text || '')
    .replace(/Z\s*X\s*Q\s*P\s*H\s*(\d+)\s*Q\s*X\s*Z/gi, 'ZXQPH$1QXZ')
    .replace(/ZXQPH\s*(\d+)\s*QXZ/gi, 'ZXQPH$1QXZ');
  values.forEach((value, index) => {
    const token = `ZXQPH${index}QXZ`;
    output = output.replace(new RegExp(token, 'gi'), value);
  });
  return output;
}

function normalizeTranslation(text) {
  return restoreText(text, [])
    .replace(/\bNgười dùng\b/g, 'Người chơi')
    .replace(/\bngười dùng\b/g, 'người chơi')
    .replace(/\bkhu vực lớn\b/gi, 'máy chủ')
    .replace(/\bmã đổi thưởng\b/gi, 'GiftCode')
    .replace(/\bnhà phân phối\b/gi, 'đại lý')
    .replace(/\bToán tử\b/g, 'Người thao tác')
    .replace(/\bkhối thư\b/g, 'Thư theo máy chủ')
    .replace(/\bgiải phóng mặt bằng\b/gi, 'xóa dữ liệu game');
}

function requestTranslation(text) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    https.get(url, { timeout: 20000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try {
          const data = JSON.parse(body);
          resolve((data[0] || []).map((row) => row[0] || '').join(''));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function translateOne(source, cache) {
  if (exactGlossary[source]) return exactGlossary[source];
  if (cache[source]) {
    const cachedProtected = protectText(source);
    cache[source] = normalizeTranslation(restoreText(cache[source], cachedProtected.values));
    return cache[source];
  }
  const { protectedText, values } = protectText(source);
  let translated;
  const chunks = protectedText.length > 900
    ? protectedText.split(/(?<=\n|。|！|？)/u).filter(Boolean)
    : [protectedText];
  const translatedChunks = [];
  for (const chunk of chunks) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        translatedChunks.push(await requestTranslation(chunk));
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;
  }
  translated = translatedChunks.join('');
  translated = normalizeTranslation(restoreText(translated, values));
  cache[source] = translated;
  return translated;
}

function collectScriptTokens(source, offset, file, entries) {
  try {
    for (const token of acorn.tokenizer(source, {
      ecmaVersion: 'latest',
      allowHashBang: true,
      sourceType: 'script',
    })) {
      if (
        (token.type.label === 'string' || token.type.label === 'template')
        && typeof token.value === 'string'
        && HAN_RE.test(token.value)
      ) {
        entries.push({
          file,
          kind: token.type.label === 'template' ? 'template' : 'string',
          start: offset + token.start,
          end: offset + token.end,
          source: token.value,
        });
      }
    }
  } catch (error) {
    throw new Error(`${path.basename(file)} inline JS lỗi: ${error.message}`);
  }
}

function collectHtml(file) {
  const source = fs.readFileSync(file, 'utf8');
  const entries = [];
  const excluded = [];
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of source.matchAll(scriptRe)) {
    const content = match[1];
    const start = match.index + match[0].indexOf(content);
    excluded.push([match.index, match.index + match[0].length]);
    if (content.trim()) collectScriptTokens(content, start, file, entries);
  }
  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  for (const match of source.matchAll(styleRe)) excluded.push([match.index, match.index + match[0].length]);
  const isExcluded = (index) => excluded.some(([start, end]) => index >= start && index < end);

  const textRe = />([^<>]+)</g;
  for (const match of source.matchAll(textRe)) {
    const start = match.index + 1;
    const value = match[1];
    if (isExcluded(start) || !HAN_RE.test(value)) continue;
    entries.push({ file, kind: 'html_text', start, end: start + value.length, source: value });
  }
  const attrRe = /\b(title|placeholder|alt|value)\s*=\s*(["'])([\s\S]*?)\2/gi;
  for (const match of source.matchAll(attrRe)) {
    const value = match[3];
    const start = match.index + match[0].indexOf(value);
    if (isExcluded(start) || !HAN_RE.test(value)) continue;
    entries.push({ file, kind: 'attribute', start, end: start + value.length, source: value });
  }
  return { source, entries };
}

function collectJs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const entries = [];
  collectScriptTokens(source, 0, file, entries);
  return { source, entries };
}

function buildReplacement(entry, translated) {
  if (entry.kind === 'string') return JSON.stringify(translated);
  if (entry.kind === 'template') {
    return translated.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }
  const leading = entry.source.match(/^\s*/)?.[0] || '';
  const trailing = entry.source.match(/\s*$/)?.[0] || '';
  return leading + translated.trim() + trailing;
}

async function runPool(items, worker, concurrency = 8) {
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
}

async function main() {
  const files = fs.readdirSync(adminRoot)
    .filter((name) => /\.(html|js)$/i.test(name) && name !== 'server.js')
    .map((name) => path.join(adminRoot, name));
  const documents = files.map((file) => file.endsWith('.html') ? collectHtml(file) : collectJs(file));
  const allEntries = documents.flatMap((document) => document.entries);
  const sources = [...new Set(allEntries.map((entry) => entry.source.trim()).filter(Boolean))];
  const cache = readCache();
  const translations = { ...exactGlossary };
  const failures = [];
  await runPool(sources, async (source, index) => {
    try {
      translations[source] = await translateOne(source, cache);
    } catch (error) {
      failures.push({ source, error: error.message });
    }
    if (index % 50 === 0) fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  }, 4);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  if (failures.length) throw new Error(`Dịch lỗi ${failures.length} chuỗi: ${failures[0].error}`);

  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupRoot = path.join(projectRoot, '_ai_workbench', 'backups', `admin_vi_${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const changedFiles = [];
  for (let docIndex = 0; docIndex < documents.length; docIndex += 1) {
    const document = documents[docIndex];
    const file = files[docIndex];
    let output = document.source;
    const replacements = document.entries.map((entry) => ({
      ...entry,
      text: buildReplacement(entry, translations[entry.source.trim()]),
    })).sort((left, right) => right.start - left.start);
    for (const replacement of replacements) {
      output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
    }
    if (output !== document.source) {
      fs.copyFileSync(file, path.join(backupRoot, path.basename(file)));
      if (apply) fs.writeFileSync(file, output, 'utf8');
      changedFiles.push({ file: path.basename(file), replacements: replacements.length });
    }
  }
  const report = {
    apply,
    files_scanned: files.length,
    occurrences: allEntries.length,
    unique_strings: sources.length,
    changed_files: changedFiles,
    backup: path.relative(projectRoot, backupRoot).replace(/\\/g, '/'),
    failures,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
