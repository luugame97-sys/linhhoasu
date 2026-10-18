const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'temp', 'webgm_spend_history_candidate');
const api = fs.readFileSync(path.join(root, 'api', 'user_api.php'), 'utf8');
const page = fs.readFileSync(path.join(root, 'index.php'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets', 'js', 'index.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'index.css'), 'utf8');

const requiredApi = [
  "case 'get_my_webshop_spend_history'",
  'require_login();',
  "require_api_rate('get_my_webshop_spend_history'",
  'o.account_name = ? AND o.server_id = ?',
  "array('today', 'week', 'month', 'custom', 'all')",
  'Khoảng ngày tối đa là 366 ngày.',
  "array('all', 'paid', 'refunded', 'failed')",
  'GROUP BY DATE(o.created_at)',
  'LEFT JOIN webshop_items si ON si.id = o.shop_item_id',
  'LIMIT $limit OFFSET $offset',
  "'net_spend' => webshop_spend_subtract_unsigned",
];
requiredApi.forEach((marker) => assert(api.includes(marker), `API marker missing: ${marker}`));
const spendCaseStart = api.indexOf("case 'get_my_webshop_spend_history'");
const spendCaseEnd = api.indexOf("case '", spendCaseStart + 8);
const spendCase = api.slice(spendCaseStart, spendCaseEnd > spendCaseStart ? spendCaseEnd : api.length);
assert(!spendCase.includes('$_POST[\'account_name\']'), 'API must not trust client account');
assert(!spendCase.includes('$_POST[\'server_id\']'), 'history must stay session-server scoped');
assert(spendCase.includes("$_SESSION['username']") && spendCase.includes("$_SESSION['server_id']"), 'history must use session identity');

[
  'data-tab="tab-spend-history"',
  'id="tab-spend-history"',
  'data-period="today"',
  'data-period="week"',
  'data-period="month"',
  'data-period="all"',
  'data-period="custom"',
  'id="spendDateFrom"',
  'id="spendDateTo"',
  'id="spendSummaryNet"',
  'id="spendSummaryToday"',
  'id="spendDailyChart"',
  'id="spendHistoryBody"',
].forEach((marker) => assert(page.includes(marker), `page marker missing: ${marker}`));

[
  'function loadWebshopSpendHistory(page)',
  "action: 'get_my_webshop_spend_history'",
  'function renderSpendSummary(response)',
  'function renderSpendDailyChart(rows)',
  'function webshopSpendStatusBadge(status, label)',
  "tab === 'tab-spend-history'",
].forEach((marker) => assert(js.includes(marker), `JS marker missing: ${marker}`));

[
  '.spend-summary-grid',
  '.spend-period-btn',
  '.spend-daily-chart',
  '.spend-history-table-wrap',
  '@media (max-width: 768px)',
].forEach((marker) => assert(css.includes(marker), `CSS marker missing: ${marker}`));

console.log(JSON.stringify({
  result: 'PASS',
  sessionScoped: true,
  periods: ['today', 'week', 'month', 'custom', 'all'],
  statusFilters: ['all', 'paid', 'refunded', 'failed'],
  summaries: ['range', 'today', 'refund', 'orders', 'packages'],
  dailyAggregation: true,
  pagination: true,
  responsiveUi: true,
}));
