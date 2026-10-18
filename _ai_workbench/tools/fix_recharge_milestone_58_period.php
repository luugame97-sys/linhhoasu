<?php
require '/linhhoasu/webgame/gm/config.php';

$commit = in_array('--commit', $argv, true);
$milestoneId = 58;
$expectedTitle = 'Tháng mốc 50,000đ';
$backupDir = '/linhhoasu/_ai_workbench/backups/recharge_milestone58_period_pre_20260902_2100';

$stmt = $conn_web->prepare('SELECT id, period_type, title, milestone_amount, reward_items, is_active, sort_order FROM recharge_milestones WHERE id=?');
$stmt->execute(array($milestoneId));
$before = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$before) throw new RuntimeException('Không tìm thấy mốc ID 58.');

$stmt = $conn_web->prepare('SELECT id, account_name, server_id, milestone_id, claim_period, created_at FROM recharge_milestone_claims WHERE milestone_id=? ORDER BY id');
$stmt->execute(array($milestoneId));
$claims = $stmt->fetchAll(PDO::FETCH_ASSOC);
$dayClaims = array_values(array_filter($claims, function ($row) {
    return preg_match('/^[0-9]{8}$/', (string)$row['claim_period']);
}));

$preview = array(
    'mode' => $commit ? 'commit' : 'dry-run',
    'before' => $before,
    'claim_count' => count($claims),
    'day_claim_count' => count($dayClaims),
    'target_period_type' => 'month',
    'backup_dir' => $backupDir
);

if (!$commit) {
    echo json_encode($preview, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    exit;
}

if ((int)$before['id'] !== $milestoneId || (string)$before['title'] !== $expectedTitle) {
    throw new RuntimeException('Mốc ID 58 không còn khớp title dự kiến; dừng để tránh sửa nhầm.');
}
if ((string)$before['period_type'] !== 'day') {
    throw new RuntimeException('Mốc ID 58 không còn ở kỳ day; dừng để tránh ghi đè thay đổi mới.');
}
if (count($dayClaims) > 0) {
    throw new RuntimeException('Đã có claim theo ngày cho ID 58; cần đối soát trước khi đổi kỳ.');
}

if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) {
    throw new RuntimeException('Không tạo được thư mục backup.');
}
$backupPayload = json_encode(array('created_at'=>date('c'), 'milestone'=>$before, 'claims'=>$claims), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (file_put_contents($backupDir . '/milestone_58.json', $backupPayload . PHP_EOL, LOCK_EX) === false) {
    throw new RuntimeException('Không ghi được snapshot backup.');
}

$conn_web->beginTransaction();
try {
    $lock = $conn_web->prepare('SELECT id, period_type, title FROM recharge_milestones WHERE id=? FOR UPDATE');
    $lock->execute(array($milestoneId));
    $locked = $lock->fetch(PDO::FETCH_ASSOC);
    if (!$locked || (string)$locked['period_type'] !== 'day' || (string)$locked['title'] !== $expectedTitle) {
        throw new RuntimeException('Dữ liệu thay đổi trong lúc xử lý; đã rollback.');
    }
    $update = $conn_web->prepare("UPDATE recharge_milestones SET period_type='month' WHERE id=? AND period_type='day' AND title=?");
    $update->execute(array($milestoneId, $expectedTitle));
    if ($update->rowCount() !== 1) throw new RuntimeException('Không cập nhật đúng một dòng; đã rollback.');
    $conn_web->commit();
} catch (Exception $e) {
    if ($conn_web->inTransaction()) $conn_web->rollBack();
    throw $e;
}

$stmt = $conn_web->prepare('SELECT id, period_type, title, milestone_amount, reward_items, is_active, sort_order FROM recharge_milestones WHERE id=?');
$stmt->execute(array($milestoneId));
$after = $stmt->fetch(PDO::FETCH_ASSOC);
echo json_encode(array_merge($preview, array('result'=>'updated', 'after'=>$after)), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
