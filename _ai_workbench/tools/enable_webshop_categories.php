<?php
declare(strict_types=1);

require '/linhhoasu/webgame/gm/config.php';

$catalogPath = '/linhhoasu/webgame/gm/assets/item/webshop_catalog.json';
$doc = json_decode((string)file_get_contents($catalogPath), true);
if (!is_array($doc) || !is_array($doc['items'] ?? null)) {
    fwrite(STDERR, "Invalid catalog\n");
    exit(2);
}
if (($doc['sort_groups']['gem']['enabled'] ?? null) !== true || ($doc['sort_groups']['rare']['enabled'] ?? null) !== true) {
    fwrite(STDERR, "Catalog groups are not enabled\n");
    exit(2);
}

$targets = [];
foreach ($doc['items'] as $row) {
    $category = (string)($row['category'] ?? '');
    $id = (int)($row['item_id'] ?? 0);
    if (($category === 'gem' || $category === 'rare') && $id > 0) $targets[$id] = $category;
}
$gemCount = count(array_filter($targets, static function ($v) { return $v === 'gem'; }));
$rareCount = count(array_filter($targets, static function ($v) { return $v === 'rare'; }));
if (count($targets) !== 32 || $gemCount !== 20 || $rareCount !== 12) {
    fwrite(STDERR, "Unexpected target catalog count\n");
    exit(2);
}

$ids = array_keys($targets);
$marks = implode(',', array_fill(0, count($ids), '?'));
$before = $conn_web->prepare("SELECT id,item_id,is_active FROM webshop_items WHERE item_id IN ($marks) ORDER BY id");
$before->execute($ids);
$rows = $before->fetchAll(PDO::FETCH_ASSOC);
$activeBefore = count(array_filter($rows, static function ($row) { return (int)$row['is_active'] === 1; }));
$backupDir = (string)($argv[1] ?? '');
if ($backupDir !== '') {
    @mkdir($backupDir, 0750, true);
    file_put_contents($backupDir . '/target_rows_before.json', json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

$update = $conn_web->prepare("UPDATE webshop_items SET is_active=1 WHERE item_id IN ($marks)");
$update->execute($ids);
$check = $conn_web->prepare("SELECT COUNT(*) FROM webshop_items WHERE item_id IN ($marks) AND is_active=1");
$check->execute($ids);
$activeAfter = (int)$check->fetchColumn();
if ($activeAfter !== 32) {
    fwrite(STDERR, "Active target readback failed\n");
    exit(3);
}

$policy = [
    'gem' => webshop_item_sale_enabled(25011),
    'rare' => webshop_item_sale_enabled(90014),
    'normal' => webshop_item_sale_enabled(2),
];
if ($policy !== ['gem' => true, 'rare' => true, 'normal' => true]) {
    fwrite(STDERR, "Policy readback failed\n");
    exit(3);
}

echo json_encode([
    'targets' => count($targets),
    'active_before' => $activeBefore,
    'active_after' => $activeAfter,
    'policy' => $policy,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
