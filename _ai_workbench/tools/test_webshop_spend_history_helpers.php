<?php
define('LHS_API_REQUEST', true);
define('LHS_SPEND_HISTORY_HELPERS_ONLY', true);

$source = file_get_contents('/linhhoasu/_ai_workbench/temp/webgm_spend_history_lint/api/user_api.php');
$start = strpos($source, 'function webshop_spend_period_range');
$end = strpos($source, "if (\$_SERVER['REQUEST_METHOD']", $start);
if ($start === false || $end === false) throw new RuntimeException('HELPERS_NOT_FOUND');
eval(substr($source, $start, $end - $start));

$today = webshop_spend_period_range('today');
$week = webshop_spend_period_range('week');
$month = webshop_spend_period_range('month');
$custom = webshop_spend_period_range('custom', '2026-08-01', '2026-08-31');
$all = webshop_spend_period_range('all');

if ($today['period'] !== 'today' || $today['start'] === '' || $today['end'] === '') throw new RuntimeException('TODAY_RANGE_FAILED');
if ($week['period'] !== 'week' || $week['start'] === '' || $week['end'] === '') throw new RuntimeException('WEEK_RANGE_FAILED');
if ($month['period'] !== 'month' || $month['start'] === '' || $month['end'] === '') throw new RuntimeException('MONTH_RANGE_FAILED');
if ($custom['date_from'] !== '2026-08-01' || $custom['date_to'] !== '2026-08-31') throw new RuntimeException('CUSTOM_RANGE_FAILED');
if ($all['start'] !== '' || $all['end'] !== '') throw new RuntimeException('ALL_RANGE_FAILED');
if (webshop_spend_subtract_unsigned('10000000000000000000', '9999999999999999999') !== '1') throw new RuntimeException('BIGINT_SUBTRACT_FAILED');
if (webshop_spend_subtract_unsigned('10', '20') !== '0') throw new RuntimeException('NEGATIVE_CLAMP_FAILED');

$invalid = false;
try { webshop_spend_period_range('custom', '2026-08-31', '2026-08-01'); } catch (InvalidArgumentException $e) { $invalid = true; }
if (!$invalid) throw new RuntimeException('REVERSE_RANGE_NOT_BLOCKED');
$too_long = false;
try { webshop_spend_period_range('custom', '2025-01-01', '2026-08-01'); } catch (InvalidArgumentException $e) { $too_long = true; }
if (!$too_long) throw new RuntimeException('LONG_RANGE_NOT_BLOCKED');

echo json_encode(array(
    'result' => 'PASS',
    'today' => $today,
    'week' => $week,
    'month' => $month,
    'custom' => $custom,
    'all' => $all,
    'reverse_blocked' => $invalid,
    'long_range_blocked' => $too_long,
    'bigint_subtract' => true
), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
