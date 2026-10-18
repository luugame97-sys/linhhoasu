<?php
// Public, read-only metadata used by the game WEB shortcut notification.
// It deliberately returns no code, reward, account, or usage-log details.
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

try {
    $stmt = $conn_web->query("SELECT id, used_count, max_uses, COALESCE(expire_at, expires_at) AS expires_at FROM giftcodes WHERE hide = 1 AND is_active = 1 ORDER BY id DESC");
    $revision = 0;
    $available = false;
    $now = time();
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $revision = max($revision, (int)($row['id'] ?? 0));
        $expiresAt = !empty($row['expires_at']) ? strtotime((string)$row['expires_at']) : 0;
        $expired = $expiresAt > 0 && $expiresAt < $now;
        $maxUses = (int)($row['max_uses'] ?? 0);
        $outOfUses = $maxUses > 0 && (int)($row['used_count'] ?? 0) >= $maxUses;
        if (!$expired && !$outOfUses) $available = true;
    }
    echo json_encode(array('ok' => true, 'revision' => $revision, 'available' => $available), JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode(array('ok' => false), JSON_UNESCAPED_UNICODE);
}
