<?php
require '/linhhoasu/webgame/gm/config.php';
$account = 'toantran912';
$q = function ($sql, $params = array()) {
    global $conn_web;
    $st = $conn_web->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
};
$out = array();
$out['account'] = $q('SELECT account, sdk_user_id, status, created_at, last_login_at FROM account WHERE account=?', array($account));
$out['milestones_50000'] = $q('SELECT id, period_type, title, milestone_amount, is_active, reward_items FROM recharge_milestones WHERE milestone_amount=50000 ORDER BY id');
$out['claims'] = $q('SELECT id, account_name, server_id, milestone_id, claim_period, created_at FROM recharge_milestone_claims WHERE account_name=? ORDER BY id DESC', array($account));
$out['donate_logs'] = $q("SELECT id, account_name, server_id, amount, action, tran_id, content, created_at FROM sepay_logs WHERE account_name=? AND action IN ('topup_xu','vip') ORDER BY id DESC", array($account));
$out['donate_total'] = $q("SELECT server_id, COALESCE(SUM(amount),0) AS total_amount, COUNT(*) AS row_count FROM sepay_logs WHERE account_name=? AND action IN ('topup_xu','vip') GROUP BY server_id ORDER BY server_id", array($account));
$out['milestone_gm_logs'] = $q("SELECT id, account_name, server_id, target_role_id, action, details, created_at FROM gm_logs WHERE account_name=? AND action='recharge_milestone' ORDER BY id DESC", array($account));
$tz = new DateTimeZone('Asia/Ho_Chi_Minh');
$now = new DateTimeImmutable('now', $tz);
$start = $now->setTime(0, 0, 0);
$end = $start->modify('+1 day');
$dayStmt = $conn_web->prepare("SELECT COALESCE(SUM(amount),0) FROM sepay_logs WHERE account_name=? AND server_id=? AND action IN ('topup_xu','vip') AND created_at>=? AND created_at<?");
$dayStmt->execute(array($account, '1001', $start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')));
$out['day_window'] = array('now'=>$now->format(DateTimeInterface::ATOM), 'start'=>$start->format('Y-m-d H:i:s'), 'end'=>$end->format('Y-m-d H:i:s'), 'total'=>(int)$dayStmt->fetchColumn(), 'claim_period'=>$now->format('Ymd'));
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
