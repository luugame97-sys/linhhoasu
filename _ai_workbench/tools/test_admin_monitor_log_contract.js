const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'temp', 'admin_monitor_log_candidate');
const page = fs.readFileSync(path.join(root, 'admin', 'index.php'), 'utf8');
const api = fs.readFileSync(path.join(root, 'admin', 'admin_api.php'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets', 'js', 'admin.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'ui-refactor.css'), 'utf8');

const auditStart = page.indexOf('id="tab-audit"');
const monitorStart = page.indexOf('id="tab-monitor"');
assert(auditStart >= 0 && monitorStart > auditStart);
const auditSection = page.slice(auditStart, monitorStart);
assert(!auditSection.includes('log-dashboard-head'), 'audit tab must remain unchanged');
assert(!api.slice(api.indexOf("case 'get_audit_logs'"), api.indexOf("case 'get_monitor_logs'")).includes('admin_monitor_period_range'), 'audit API must remain unchanged');

[
  'function admin_monitor_period_range', "array('today', '7days', '30days', 'custom', 'all')",
  'Khoảng log tùy chọn tối đa là 366 ngày.', "case 'get_monitor_logs'", "'summary' => array(",
  "'range' => $range", "'refreshed_at' => date('d/m/Y H:i:s')",
].forEach((m) => assert(api.includes(m), `API marker missing: ${m}`));
[
  'id="monitorPeriodToolbar"', 'id="monitorCustomRange"', 'id="monitorResetFilters"',
  'id="monitorStatTotal"', 'id="monitorSourceSummary"', 'admin-log-table monitor-log-table',
].forEach((m) => assert(page.includes(m), `page marker missing: ${m}`));
[
  'var monitorLogState', 'function setMonitorLogPeriod', 'function renderMonitorStats',
  'function monitorDetailHtml', 'monitorLogPayload(page)', 'renderMonitorStats(r)',
  'monitorLogState.loading = false', 'data-monitor-toggle',
].forEach((m) => assert(js.includes(m), `JS marker missing: ${m}`));
[
  '#monitorLogTableBody td:nth-child(1)::before', '#monitorLogTableBody td:nth-child(5)::before',
].forEach((m) => assert(css.includes(m), `CSS marker missing: ${m}`));

console.log(JSON.stringify({result:'PASS',scope:'monitor-only',auditUntouched:true,periods:['today','7days','30days','custom','all'],summaryCards:true,compactTable:true,responsive:true}));
