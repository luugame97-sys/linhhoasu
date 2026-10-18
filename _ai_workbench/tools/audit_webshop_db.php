<?php
declare(strict_types=1);

require '/linhhoasu/webgame/gm/config.php';

$catalogPath = '/linhhoasu/webgame/gm/assets/item/webshop_catalog.json';
$catalog = json_decode((string)file_get_contents($catalogPath), true);
$itemCategory = array();
$targetIds = array();
foreach (($catalog['items'] ?? array()) as $row) {
    if (!is_array($row)) continue;
    $id = (int)($row['item_id'] ?? 0);
    $category = (string)($row['category'] ?? 'other');
    if ($id <= 0) continue;
    $itemCategory[$id] = $category;
    if ($category === 'gem' || $category === 'rare') $targetIds[$id] = true;
}
$ids = array_keys($targetIds);
sort($ids, SORT_NUMERIC);
$marks = implode(',', array_fill(0, count($ids), '?'));

$columns = array();
foreach ($conn_web->query('SHOW COLUMNS FROM webshop_orders')->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $columns[] = (string)$row['Field'];
}

$stmt = $conn_web->prepare("SELECT * FROM webshop_items WHERE item_id IN ($marks) ORDER BY sort_order,id");
$stmt->execute($ids);
$products = array();
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $id = (int)$row['item_id'];
    $products[] = array(
        'id' => (int)$row['id'],
        'item_id' => $id,
        'category' => $itemCategory[$id] ?? 'other',
        'item_name' => (string)$row['item_name'],
        'item_amount' => (int)($row['item_amount'] ?? 1),
        'price' => (int)$row['price'],
        'sort_order' => (int)$row['sort_order'],
        'is_active' => (int)$row['is_active'],
    );
}

$stmt = $conn_web->prepare("SELECT * FROM webshop_orders WHERE item_id IN ($marks) ORDER BY id ASC");
$stmt->execute($ids);
$orders = array();
foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $id = (int)$row['item_id'];
    $safe = array(
        'id' => (int)$row['id'],
        'item_id' => $id,
        'category' => $itemCategory[$id] ?? 'other',
        'shop_item_id' => (int)($row['shop_item_id'] ?? 0),
        'quantity' => (int)($row['quantity'] ?? 0),
        'unit_price' => (int)($row['unit_price'] ?? 0),
        'total_price' => (int)($row['total_price'] ?? 0),
        'account_ref' => substr(hash('sha256', (string)($row['account_name'] ?? '')), 0, 12),
        'role_ref' => substr(hash('sha256', (string)($row['role_id'] ?? '')), 0, 12),
    );
    foreach (array('created_at','created_time','order_time','updated_at','status') as $key) {
        if (array_key_exists($key, $row)) $safe[$key] = $row[$key];
    }
    $orders[] = $safe;
}

$summary = array(
    'target_catalog_count' => count($ids),
    'target_ids' => $ids,
    'products_count' => count($products),
    'active_products' => count(array_filter($products, function ($row) { return $row['is_active'] === 1; })),
    'gem_products' => count(array_filter($products, function ($row) { return $row['category'] === 'gem'; })),
    'rare_products' => count(array_filter($products, function ($row) { return $row['category'] === 'rare'; })),
    'orders_count' => count($orders),
    'order_columns' => $columns,
    'products' => $products,
    'orders' => $orders,
);
echo json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), PHP_EOL;
