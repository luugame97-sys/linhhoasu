<?php
require '/linhhoasu/webgame/gm/config.php';
$milestoneId = 58;
$query = function ($sql, $params = array()) use ($conn_web) {
    $stmt = $conn_web->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$out = array(
    'milestone' => $query('SELECT id, period_type, title, milestone_amount, reward_items, is_active, sort_order FROM recharge_milestones WHERE id=?', array($milestoneId)),
    'claims' => $query('SELECT id, account_name, server_id, milestone_id, claim_period, created_at FROM recharge_milestone_claims WHERE milestone_id=? ORDER BY id', array($milestoneId)),
    'claim_summary' => $query('SELECT claim_period, COUNT(*) AS claim_count FROM recharge_milestone_claims WHERE milestone_id=? GROUP BY claim_period ORDER BY claim_period', array($milestoneId))
);
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
