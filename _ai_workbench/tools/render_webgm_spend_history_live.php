<?php
// Read-only render smoke: select a real account/server with WebShop orders,
// seed a temporary PHP session, and render the player page without login or
// purchase actions.
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';
$fixture = $conn_web->query("SELECT account_name,server_id FROM webshop_orders GROUP BY account_name,server_id ORDER BY COUNT(*) DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$fixture) throw new RuntimeException('FIXTURE_NOT_FOUND');
$_SESSION['logged_in'] = true;
$_SESSION['username'] = (string)$fixture['account_name'];
$_SESSION['uin'] = '';
$_SESSION['server_id'] = (string)$fixture['server_id'];
$_SESSION['server_name'] = 'S' . (string)$fixture['server_id'];
$_SESSION['role'] = 'user';
ob_start();
include '/linhhoasu/webgame/gm/index.php';
$html = ob_get_clean();
$markers = array(
    'tab-spend-history',
    'Lịch sử tiêu Xu Web',
    'spend-period-btn',
    'spendDateFrom',
    'spendSummaryNet',
    'spendDailyChart',
    'spendHistoryBody',
    'spend-summary-grid'
);
$found = array();
foreach ($markers as $marker) $found[$marker] = strpos($html, $marker) !== false;
$sidebar_start = strpos($html, 'id="playerSidebarMenu"');
$sidebar_end = $sidebar_start === false ? false : strpos($html, 'gm-content-col', $sidebar_start);
$sidebar_html = ($sidebar_start !== false && $sidebar_end !== false) ? substr($html, $sidebar_start, $sidebar_end - $sidebar_start) : '';
$menu_order = array();
if ($sidebar_html !== '' && preg_match_all('/data-tab="([^"]+)"/', $sidebar_html, $menu_matches)) $menu_order = $menu_matches[1];
echo json_encode(array(
    'status' => 'success',
    'html_bytes' => strlen($html),
    'markers' => $found,
    'all_markers_present' => !in_array(false, $found, true),
    'menu_order' => $menu_order,
), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
