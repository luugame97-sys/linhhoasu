const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'temp', 'admin_log_dashboard_candidate');
const page = fs.readFileSync(path.join(root, 'admin', 'index.php'), 'utf8');
const api = fs.readFileSync(path.join(root, 'admin', 'admin_api.php'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets', 'js', 'admin.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'admin.css'), 'utf8');

[
  'function admin_log_period_range',
  "array('today', '7days', '30days', 'custom', 'all')",
  'Khoảng log tùy chọn tối đa là 366 ngày.',
  "case 'get_audit_logs'",
  "case 'get_monitor_logs'",
  "'summary' => array(",
  "'range' => $range",
  "'refreshed_at' => date('d/m/Y H:i:s')",
].forEach((marker) => assert(api.includes(marker), `API marker missing: ${marker}`));

[
  'id="auditPeriodToolbar"', 'id="monitorPeriodToolbar"',
  'data-log-scope="audit"', 'data-log-scope="monitor"',
  'id="auditCustomRange"', 'id="monitorCustomRange"',
  'id="auditStatTotal"', 'id="monitorStatTotal"',
  'id="monitorSourceSummary"',
  'admin-log-table audit-log-table', 'admin-log-table monitor-log-table',
].forEach((marker) => assert(page.includes(marker), `page marker missing: ${marker}`));

[
  'var adminLogState', 'function setAdminLogPeriod', 'function renderAdminLogStats',
  "adminLogPayload('audit'", "adminLogPayload('monitor'", 'function logDetailHtml',
  "renderAdminLogStats('audit'", "renderAdminLogStats('monitor'",
  "adminLogState.audit.loading = false", "adminLogState.monitor.loading = false",
  "$('.log-period-btn[data-log-scope=",
].forEach((marker) => assert(js.includes(marker), `JS marker missing: ${marker}`));

[
  '.log-dashboard-head', '.log-period-btn', '.log-custom-range', '.log-stat-grid',
  '.log-table-shell', '.admin-log-table thead', '.log-detail-text',
  '@media (max-width: 576px)',
].forEach((marker) => assert(css.includes(marker), `CSS marker missing: ${marker}`));

console.log(JSON.stringify({
  result: 'PASS',
  tabs: ['audit', 'monitor'],
  periods: ['today', '7days', '30days', 'custom', 'all'],
  summaryCards: true,
  compactTable: true,
  expandableDetails: true,
  responsive: true,
}));
