<?php
// Owner-scoped Donate milestone update + same-day compensation.
// Modes: preview (read-only), apply (backup + catalog transaction + outbox dispatch), verify (read-only).
if (PHP_SAPI !== 'cli') exit(1);
$mode = isset($argv[1]) ? $argv[1] : '';
if (!in_array($mode, array('preview', 'apply', 'verify'), true)) throw new RuntimeException('INVALID_MODE');

require_once '/linhhoasu/webgame/gm/config.php';
require_once '/linhhoasu/webgame/gm/web_context.php';
require_once '/linhhoasu/webgame/gm/reward_delivery.php';

// config.php supplies credentials/connection helpers for web requests; CLI
// execution also needs a PDO handle for the migration itself.
if (!isset($pdo) || !($pdo instanceof PDO)) {
    if (!isset($dbHost, $dbPort, $dbName, $dbUser, $dbPass)) throw new RuntimeException('DB_CONFIG_MISSING');
    $pdo = new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass,
        array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC));
}

$BACKUP = '/linhhoasu/_ai_workbench/backups/donate_item_milestones_20260912';
$COMP_PERIOD = 'comp-20260912-v1';
$TARGET_IDS = array(7, 8, 20, 60, 61);

function dim_int($v) { $n = filter_var($v, FILTER_VALIDATE_INT); return $n === false ? 0 : (int)$n; }
function read_items($json) {
    $v = json_decode((string)$json, true);
    return is_array($v) ? $v : array();
}
function item_count($items, $id) {
    $id = (string)$id; $sum = 0;
    foreach ((array)$items as $k => $v) {
        if (is_array($v)) { $item = isset($v['item_id']) ? $v['item_id'] : (isset($v['id']) ? $v['id'] : ''); $qty = isset($v['amount']) ? $v['amount'] : (isset($v['count']) ? $v['count'] : 0); }
        else { $item = $k; $qty = $v; }
        if ((string)$item === $id) $sum += max(0, dim_int($qty));
    }
    return $sum;
}
function desired_items($amount) {
    $a = max(0, dim_int($amount));
    return array('7' => $a, '8' => intdiv($a, 10), '20' => $a, '60' => $a, '61' => intdiv($a, 10));
}
function normalize_object_rewards($json, $amount) {
    $old = read_items($json); $next = array();
    foreach ($old as $id => $qty) {
        if (is_array($qty)) continue;
        $n = dim_int($qty); if ($n > 0) $next[(string)$id] = $n;
    }
    foreach (desired_items($amount) as $id => $qty) $next[$id] = $qty;
    ksort($next, SORT_NUMERIC);
    return array($next, json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
function comp_source_id($account, $server, $role) {
    $hex = substr(hash('sha256', $account . '|' . $server . '|' . $role . '|' . $GLOBALS['COMP_PERIOD']), 0, 12);
    return 800000000 + (int)(hexdec($hex) % 180000000);
}
function comp_snapshot($deltas) {
    $items = array();
    foreach ($deltas as $id => $qty) if ($qty > 0) $items[] = array('item_id' => (string)$id, 'amount' => (int)$qty);
    return array('title' => 'Bù quà Tích Donate ngày 12/09/2026', 'content' => 'Bù các vật phẩm Tích Donate còn thiếu của các mốc đã nhận trong ngày 12/09/2026. Các ngày trước chưa xử lý trong đợt này.', 'batches' => array($items));
}

$pdo->exec("SET time_zone = '+07:00'");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$rows = $pdo->query("SELECT * FROM recharge_milestones WHERE is_active=1 AND period_type IN ('day','week','month') ORDER BY id FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
$changes = array();
foreach ($rows as $row) {
    $amount = dim_int($row['milestone_amount']);
    if ($amount < 1) throw new RuntimeException('INVALID_MILESTONE_AMOUNT');
    list($next, $encoded) = normalize_object_rewards($row['reward_items'], $amount);
    $changes[] = array('id' => (int)$row['id'], 'period' => $row['period_type'], 'amount' => $amount, 'before' => $row['reward_items'], 'after' => $encoded, 'expected' => desired_items($amount));
}
if (count($changes) !== 50) throw new RuntimeException('EXPECTED_50_ACTIVE_MILESTONES');

// Only already-sent Donate deliveries created today are eligible for compensation.
$today = $pdo->query("SELECT id,account_name,server_id,source_id,claim_period,role_id,reward_snapshot FROM web_reward_deliveries WHERE kind='recharge' AND status='sent' AND created_at >= CURDATE() ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$milestoneById = array(); foreach ($rows as $r) $milestoneById[(int)$r['id']] = $r;
$groups = array();
foreach ($today as $delivery) {
    $source = (int)$delivery['source_id']; if (!isset($milestoneById[$source])) continue;
    $amount = dim_int($milestoneById[$source]['milestone_amount']);
    $old = read_items($delivery['reward_snapshot']); $oldItems = isset($old['batches'][0]) ? $old['batches'][0] : array();
    $desired = desired_items($amount); $delta = array();
    foreach ($desired as $id => $qty) { $missing = max(0, $qty - item_count($oldItems, $id)); if ($missing > 0) $delta[$id] = $missing; }
    if (!$delta) continue;
    $key = $delivery['account_name'] . '|' . $delivery['server_id'] . '|' . $delivery['role_id'];
    if (!isset($groups[$key])) $groups[$key] = array('account' => $delivery['account_name'], 'server' => $delivery['server_id'], 'role' => $delivery['role_id'], 'deliveries' => array(), 'deltas' => array());
    $groups[$key]['deliveries'][] = (int)$delivery['id'];
    foreach ($delta as $id => $qty) $groups[$key]['deltas'][$id] = ($groups[$key]['deltas'][$id] ?? 0) + $qty;
}

$out = array('mode' => $mode, 'activeRows' => count($rows), 'changedRows' => count($changes), 'todaySentDeliveries' => count($today), 'compensationGroups' => array());
foreach ($groups as $g) {
    $source = comp_source_id($g['account'], $g['server'], $g['role']);
    $out['compensationGroups'][] = array('account' => $g['account'], 'server' => $g['server'], 'role' => $g['role'], 'source' => $source, 'deliveryIds' => $g['deliveries'], 'items' => $g['deltas']);
}
if ($mode === 'preview') { echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT); exit; }

if ($mode === 'apply') {
    if (!is_dir($BACKUP) && !mkdir($BACKUP, 0700, true)) throw new RuntimeException('BACKUP_CREATE_FAILED');
    $marker = $BACKUP . '/catalog-before.json';
    if (is_file($marker)) throw new RuntimeException('ALREADY_APPLIED_OR_BACKUP_EXISTS');
    file_put_contents($marker, json_encode(array('at' => date('c'), 'rows' => $rows, 'today' => $today, 'changes' => $changes), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    chmod($marker, 0600);
    $pdo->beginTransaction();
    try {
        $u = $pdo->prepare('UPDATE recharge_milestones SET reward_items=? WHERE id=? AND reward_items=?');
        foreach ($changes as $c) { $u->execute(array($c['after'], $c['id'], $c['before'])); if ($u->rowCount() !== 1) throw new RuntimeException('CATALOG_DRIFT'); }
        $pdo->commit();
    } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    // Create/dispatch one deterministic outbox delivery per role. Existing rows are idempotently reused.
    foreach ($groups as $g) {
        $source = comp_source_id($g['account'], $g['server'], $g['role']);
        $existing = lhs_reward_find_claim($pdo, 'recharge', $g['account'], $g['server'], $source, $COMP_PERIOD);
        if (!$existing) {
            $pdo->beginTransaction();
            try {
                $role = lhs_find_role($g['role'], $g['server'], $g['account'], false);
                if (!$role) throw new RuntimeException('COMP_ROLE_NOT_FOUND');
                $snapshot = comp_snapshot($g['deltas']);
                $stmt = $pdo->prepare('INSERT INTO web_reward_deliveries(kind,account_name,server_id,source_id,claim_period,role_id,label,reward_snapshot) VALUES(?,?,?,?,?,?,?,?)');
                $stmt->execute(array('recharge', $g['account'], $g['server'], $source, $COMP_PERIOD, $g['role'], 'Bù quà Tích Donate 12/09/2026', json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
                $existing = lhs_reward_find_claim($pdo, 'recharge', $g['account'], $g['server'], $source, $COMP_PERIOD);
                $pdo->commit();
            } catch (Exception $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
        }
        $_SESSION['username'] = $g['account'];
        $_SESSION['server_id'] = $g['server'];
        $result = lhs_reward_dispatch($pdo, $existing);
        $out['compensationGroups'][] = array('account' => $g['account'], 'server' => $g['server'], 'source' => $source, 'items' => $g['deltas'], 'delivery' => $result);
    }
    $out['committed'] = true;
} else {
    $check = $pdo->query("SELECT id,milestone_amount,reward_items FROM recharge_milestones WHERE is_active=1 AND period_type IN ('day','week','month') ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($check as $r) { list($expected,) = normalize_object_rewards($r['reward_items'], $r['milestone_amount']); $actual = read_items($r['reward_items']); foreach ($expected as $id => $qty) if ((int)($actual[$id] ?? 0) !== (int)$qty) throw new RuntimeException('VERIFY_REWARD_MISMATCH'); }
    $out['verified'] = true;
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
