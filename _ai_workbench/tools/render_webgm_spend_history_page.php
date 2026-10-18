<?php
// Render the authenticated player page to a temporary local HTML file for
// browser visual QA. No purchase/API mutation is performed.
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
$html = str_replace('<body class="player-page">', '<body class="player-page"><script>document.addEventListener("DOMContentLoaded",function(){var b=document.querySelector(\'.menu-btn[data-tab="tab-spend-history"]\');if(b)b.click();});</script>', $html);
file_put_contents('/linhhoasu/_ai_workbench/temp/webgm_spend_history_visual.html', $html);
echo json_encode(array('status' => 'success', 'bytes' => strlen($html)), JSON_UNESCAPED_UNICODE);
