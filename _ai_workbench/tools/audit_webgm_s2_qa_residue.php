<?php
declare(strict_types=1);
require_once $argv[1];
$queries = array(
    'giftcodes' => "SELECT COUNT(*) FROM giftcodes WHERE code LIKE 'QA_S2_%'",
    'milestones' => "SELECT COUNT(*) FROM recharge_milestones WHERE preset_code LIKE 'qa_s2_%'",
    'sepay' => "SELECT COUNT(*) FROM sepay_logs WHERE tran_id LIKE 'qa_s2_%'",
    'webshop_items' => "SELECT COUNT(*) FROM webshop_items WHERE item_name LIKE 'QA S2 qa_s2_shop_%'",
);
$out = array();
foreach ($queries as $key => $sql) $out[$key] = (int)$conn_web->query($sql)->fetchColumn();
echo 'WEBGM_S2_QA_RESIDUE=' . json_encode($out) . PHP_EOL;
