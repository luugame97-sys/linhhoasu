<?php
declare(strict_types=1);

if ($argc !== 4) exit(2);
require_once $argv[1];
$account = (string)$argv[2];
$expectedUserId = (string)$argv[3];
$s1 = lhs_roles_for_account($account, '1001');
$s2 = lhs_roles_for_account($account, '1002');
$s1Ids = array_map(function ($row) { return (string)$row['role_id']; }, $s1);
$s2Ids = array_map(function ($row) { return (string)$row['role_id']; }, $s2);
$result = array(
    's2_contains_expected' => in_array($expectedUserId, $s2Ids, true),
    's1_contains_s2_role' => in_array($expectedUserId, $s1Ids, true),
    's2_all_server_1002' => count(array_filter($s2, function ($row) { return (int)$row['game_server_id'] !== 1002; })) === 0,
    's1_count' => count($s1),
    's2_count' => count($s2),
    'account_hash' => hash('sha256', $account),
    'role_hash' => hash('sha256', $expectedUserId),
);
if (!$result['s2_contains_expected'] || $result['s1_contains_s2_role'] || !$result['s2_all_server_1002']) {
    throw new RuntimeException('S2_ROLE_ROUTING_FAILED');
}
echo 'WEBGM_S2_ROLE_QA=' . json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
