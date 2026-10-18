'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const wb = path.resolve(__dirname,'..');
const evidence = JSON.parse(fs.readFileSync(path.join(wb,'temp/items_deep_audit_final_20260905.json'),'utf8'));
const read = name => fs.readFileSync(path.join(wb,'reports',name),'utf8');
const md = read('items_deep_audit_20260905.md');
const html = read('items_deep_audit_20260905.html');
const txt = read('items_need_fix_deep_20260905.txt');
const session = read('session_report.html');
assert.equal(new Set(evidence.rows.map(r=>r.id)).size,311);
assert.equal(evidence.inventory.length,7951);
assert.equal(txt.trim().split('\n').length,311);
for(const row of evidence.rows){
  assert(md.includes(`| ${row.id} |`));
  assert(html.includes(`<td>${row.id}</td>`));
  assert(txt.split('\n').some(line=>line.startsWith(`${row.id}\t`)));
}
assert(html.includes('charset="utf-8"'));
assert(session.includes('Rà sâu toàn bộ danh mục item'));
assert(!md.includes('\uFFFD'));
assert.equal(evidence.summary.confirmedDirect+evidence.summary.downstreamBlocked+evidence.summary.pending+evidence.summary.basicFixtureOnly,940);
assert.equal((html.match(/<table>/g)||[]).length,(html.match(/<\/table>/g)||[]).length);
console.log('REPORT_VALIDATION_PASS: 311 unique IDs in MD/HTML/TXT; 7951 catalog rows; 940 use-row coverage; session HTML refreshed');
