<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { fwrite(STDERR, "CLI only\n"); exit(2); }
$project = '/linhhoasu/webgame/gm';
$catalogFile = $project . '/assets/item/webshop_catalog.json';
$backupDir = isset($argv[1]) ? rtrim((string)$argv[1], '/\\') : '';
if ($backupDir === '' || strpos($backupDir, '/linhhoasu/_ai_workbench/backups/webshop_disable_categories_') !== 0) {
    fwrite(STDERR, "Invalid backup directory\n"); exit(2);
}
if (!is_readable($catalogFile)) { fwrite(STDERR, "Catalog missing\n"); exit(2); }
$doc = json_decode((string)file_get_contents($catalogFile), true);
if (!is_array($doc)) { fwrite(STDERR, "Catalog invalid\n"); exit(2); }
$targets = array();
foreach ((array)($doc['items'] ?? array()) as $row) {
    if (!is_array($row)) continue;
    $category = (string)($row['category'] ?? '');
    $id = (int)($row['item_id'] ?? 0);
    if (($category === 'gem' || $category === 'rare') && $id > 0) $targets[$id] = $category;
}
if (count($targets) !== 32) { fwrite(STDERR, 'Expected 32 targets, got ' . count($targets) . "\n"); exit(2); }
if (($doc['sort_groups']['gem']['enabled'] ?? null) !== false || ($doc['sort_groups']['rare']['enabled'] ?? null) !== false) {
    fwrite(STDERR, "Catalog target groups are not disabled\n"); exit(2);
}

require $project . '/config.php';
if (!isset($conn_web) || !($conn_web instanceof PDO)) { fwrite(STDERR, "PDO unavailable\n"); exit(2); }
if (!is_dir($backupDir) && !mkdir($backupDir, 0750, true)) { fwrite(STDERR, "Cannot create backup dir\n"); exit(2); }

$ids = array_keys($targets);
sort($ids, SORT_NUMERIC);
$marks = implode(',', array_fill(0, count($ids), '?'));
$stmt = $conn_web->prepare("SELECT * FROM webshop_items WHERE item_id IN ($marks) ORDER BY id");
$stmt->execute($ids);
$before = $stmt->fetchAll(PDO::FETCH_ASSOC);
if (count($before) !== 32) { fwrite(STDERR, 'Expected 32 product rows, got ' . count($before) . "\n"); exit(2); }
file_put_contents($backupDir . '/webshop_items_targets_before.json', json_encode($before, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
$allBefore = $conn_web->query('SELECT id,item_id,item_name,image_url,price,item_amount,sort_order,is_active,created_at FROM webshop_items ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
file_put_contents($backupDir . '/webshop_items_all_before.json', json_encode($allBefore, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

$activeBefore = 0;
foreach ($before as $row) if ((int)$row['is_active'] === 1) $activeBefore++;
$conn_web->beginTransaction();
try {
    $update = $conn_web->prepare("UPDATE webshop_items SET is_active=0 WHERE item_id IN ($marks)");
    $update->execute($ids);
    $stmt = $conn_web->prepare("SELECT COUNT(*) FROM webshop_items WHERE item_id IN ($marks) AND is_active=1");
    $stmt->execute($ids);
    $activeAfter = (int)$stmt->fetchColumn();
    if ($activeAfter !== 0) throw new RuntimeException('TARGETS_STILL_ACTIVE');
    $conn_web->commit();
} catch (Throwable $e) {
    if ($conn_web->inTransaction()) $conn_web->rollBack();
    fwrite(STDERR, 'Disable failed: ' . $e->getMessage() . "\n"); exit(1);
}

echo json_encode(array(
    'result'=>'ok',
    'targets'=>count($ids),
    'gem'=>count(array_filter($targets, function ($v) { return $v === 'gem'; })),
    'rare'=>count(array_filter($targets, function ($v) { return $v === 'rare'; })),
    'active_before'=>$activeBefore,
    'active_after'=>0,
    'backup'=>$backupDir,
), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), PHP_EOL;
