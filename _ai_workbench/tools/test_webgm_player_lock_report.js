'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.resolve(__dirname, '..', 'temp', 'webgm_player_lock_report_candidate_20260901', 'assets', 'js', 'admin.js');
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('function formatLockDuration');
const end = source.indexOf('function renderDisciplineState', start);
if (start < 0 || end < 0) throw new Error('lock report helper block not found');
const helper = source.slice(start, end);
const context = {
  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  },
  console,
};
vm.createContext(context);
vm.runInContext(helper, context);

const state = {
  banned: true,
  permanent: false,
  remainingSeconds: 259200,
  unlockTime: '19:55:31 04/09/2026',
  reason: 'Lợi dụng bug <Bánh bao>.',
  code: 'FORTUNE_BAOZI_EXPLOIT',
  bannedBy: 'baozi-remediation',
  meta: {title: 'Thiên Đạo Ban Lệnh'},
  adminMessage: 'Lời nhắn nguyên bản của admin',
  message: 'Thông báo hệ thống đầy đủ',
};
const html = context.lockMessageCard('Tài khoản game', state, 'Fallback');
const checks = [
  ['title', html.includes('Thiên Đạo Ban Lệnh')],
  ['reason', html.includes('Lý do nguyên bản') && html.includes('&lt;Bánh bao&gt;')],
  ['admin message', html.includes('Lời nhắn gốc của admin') && html.includes('Lời nhắn nguyên bản của admin')],
  ['system message', html.includes('Thông báo hệ thống đầy đủ')],
  ['duration', html.includes('3 ngày')],
  ['unlock small text', html.includes('Thời gian mở khóa: 19:55:31 04/09/2026')],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`failed checks: ${failed.join(', ')}`);
console.log(JSON.stringify({result:'PASS', checks:checks.length, htmlLength:html.length}));
