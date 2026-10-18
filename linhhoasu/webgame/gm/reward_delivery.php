<?php
// Durable reward outbox. Including this file never modifies schema or data.
// Identity/recipient/reward snapshots are immutable; retries use the old mail keys.
function lhs_reward_find($pdo, $id, $account, $server, $kind) {
    $stmt = $pdo->prepare('SELECT * FROM web_reward_deliveries WHERE id=? AND account_name=? AND server_id=? AND kind=? LIMIT 1');
    $stmt->execute(array((int)$id, (string)$account, (string)$server, (string)$kind));
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function lhs_reward_find_claim($pdo, $kind, $account, $server, $source, $period) {
    $stmt = $pdo->prepare('SELECT * FROM web_reward_deliveries WHERE kind=? AND account_name=? AND server_id=? AND source_id=? AND claim_period=? LIMIT 1');
    $stmt->execute(array($kind, $account, $server, (int)$source, $period));
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function lhs_reward_identity($account, $server, $role) {
    if ((string)$account === '' || (string)$server === '' || !gm_get_server((string)$server)) {
        throw new InvalidArgumentException('Tài khoản hoặc máy chủ nhận quà không hợp lệ.');
    }
    if (!is_array($role) || gm_role_id($role) === '' || !isset($role['server_id']) || (string)$role['server_id'] !== (string)$server) {
        throw new InvalidArgumentException('Nhân vật không thuộc máy chủ đã chọn.');
    }
    if (!isset($role['account_id']) || (string)$role['account_id'] !== (string)$account) {
        throw new InvalidArgumentException('Nhân vật không thuộc tài khoản đang đăng nhập.');
    }
}

function lhs_reward_json($value) {
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) throw new RuntimeException('Không mã hóa được nội dung quà.');
    return $json;
}

function lhs_reward_insert($pdo, $kind, $account, $server, $source, $period, $role, $label, $snapshot) {
    lhs_reward_identity($account, $server, $role);
    if (!preg_match('/^.{0,255}/us', (string)$label, $label_match)) throw new InvalidArgumentException('Tên quà không đúng UTF-8.');
    $label = $label_match[0];
    $stmt = $pdo->prepare('INSERT INTO web_reward_deliveries(kind,account_name,server_id,source_id,claim_period,role_id,label,reward_snapshot) VALUES(?,?,?,?,?,?,?,?)');
    $stmt->execute(array($kind, $account, $server, (int)$source, $period, gm_role_id($role), $label, lhs_reward_json($snapshot)));
    return lhs_reward_find($pdo, $pdo->lastInsertId(), $account, $server, $kind);
}

function lhs_reward_result($delivery, $delivered, $message = '', $duplicate = false) {
    return array(
        'delivery_id' => (int)$delivery['id'], 'kind' => (string)$delivery['kind'],
        'delivered' => (bool)$delivered, 'pending' => !$delivered, 'duplicate' => (bool)$duplicate,
        'message' => $message !== '' ? $message : ($delivered ? 'Đã xác nhận giao quà. Vui lòng kiểm tra thư trong game.' : 'Quà đang chờ xác nhận giao. Dùng Gửi lại quà để tiếp tục, không tạo yêu cầu mới.')
    );
}

function lhs_reward_pending_for_account($pdo, $account, $server) {
    $stmt = $pdo->prepare("SELECT id,kind,label,server_id,claim_period,created_at FROM web_reward_deliveries WHERE account_name=? AND server_id=? AND status='pending_delivery' ORDER BY id ASC LIMIT 200");
    $stmt->execute(array((string)$account, (string)$server));
    $rows = array();
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $pending_kind = ($row['kind'] === 'recharge' && strpos((string)$row['claim_period'], 'event:') === 0) ? 'recharge_event' : $row['kind'];
        $rows[] = array('delivery_id' => (int)$row['id'], 'kind' => $pending_kind, 'label' => $row['label'],
            'server_id' => $row['server_id'], 'claim_period' => $row['claim_period'], 'created_at' => $row['created_at'],
            'status' => 'pending_delivery', 'message' => 'Chờ xác nhận giao; gửi lại giữ nguyên nhân vật và phần thưởng.');
    }
    return $rows;
}

function lhs_reward_event_key($delivery, $batch_no) {
    if ($delivery['kind'] === 'giftcode') {
        return 'webgm_gift_' . hash('sha256', $delivery['account_name'] . '|' . $delivery['server_id'] . '|' . $delivery['source_id'] . '|' . $batch_no);
    }
    return 'webgm_recharge_' . hash('sha256', $delivery['account_name'] . '|' . $delivery['server_id'] . '|' . $delivery['source_id'] . '|' . $delivery['claim_period']);
}

function lhs_reward_release($pdo, $delivery, $lease, $message) {
    // Do not leak internal API errors to the public pending list.
    $stmt = $pdo->prepare("UPDATE web_reward_deliveries SET lease_token=NULL,lease_until=NULL,last_error=? WHERE id=? AND lease_token=? AND status='pending_delivery'");
    $stmt->execute(array($message, $delivery['id'], $lease));
}

function lhs_reward_finish($pdo, $delivery, $lease) {
    $pdo->beginTransaction();
    try {
        // Same lock order as reservation: source first, delivery second.
        if ($delivery['kind'] === 'giftcode') {
            $stmt = $pdo->prepare('SELECT id FROM giftcodes WHERE id=? FOR UPDATE');
            $stmt->execute(array($delivery['source_id']));
        }
        $stmt = $pdo->prepare('SELECT * FROM web_reward_deliveries WHERE id=? FOR UPDATE');
        $stmt->execute(array($delivery['id']));
        $current = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$current) throw new RuntimeException('Không tìm thấy yêu cầu giao quà.');
        if ($current['status'] === 'sent') { $pdo->commit(); return lhs_reward_result($current, true, '', true); }
        if (!hash_equals((string)$current['lease_token'], (string)$lease)) {
            $pdo->commit(); return lhs_reward_result($current, false);
        }
        if ($current['kind'] === 'giftcode') {
            $stmt = $pdo->prepare('SELECT id FROM giftcode_logs WHERE account_name=? AND server_id=? AND giftcode_id=? LIMIT 1');
            $stmt->execute(array($current['account_name'], $current['server_id'], $current['source_id']));
            if (!$stmt->fetchColumn()) {
                $stmt = $pdo->prepare('INSERT INTO giftcode_logs(account_name,server_id,giftcode_id) VALUES(?,?,?)');
                $stmt->execute(array($current['account_name'], $current['server_id'], $current['source_id']));
                // The slot was already reserved, even if an admin lowers the cap.
                $pdo->prepare('UPDATE giftcodes SET used_count=used_count+1 WHERE id=?')->execute(array($current['source_id']));
            }
        }
        $pdo->prepare("UPDATE web_reward_deliveries SET status='sent',sent_at=NOW(),lease_token=NULL,lease_until=NULL,last_error='' WHERE id=?")->execute(array($current['id']));
            if (!gm_audit_log($current['role_id'], $current['kind'] === 'giftcode' ? 'giftcode' : ($current['claim_period'] !== '' && strpos($current['claim_period'], 'event:') === 0 ? 'recharge_event' : 'recharge_milestone'), $current['label'] . ' · delivery #' . $current['id'], $current['account_name'], $current['server_id'])) {
            throw new RuntimeException('Chưa lưu được nhật ký giao quà.');
        }
        $pdo->commit();
        return lhs_reward_result($current, true);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function lhs_reward_dispatch($pdo, $delivery) {
    if ($delivery['status'] === 'sent') return lhs_reward_result($delivery, true, '', true);
    $snapshot = json_decode($delivery['reward_snapshot'], true);
    if (!is_array($snapshot) || empty($snapshot['batches']) || !is_array($snapshot['batches'])) {
        throw new RuntimeException('Yêu cầu thiếu nội dung thưởng, cần quản trị viên đối soát.');
    }
    $lease = bin2hex(random_bytes(24));
    $stmt = $pdo->prepare("UPDATE web_reward_deliveries SET lease_token=?,lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE),attempts=attempts+1 WHERE id=? AND status='pending_delivery' AND (lease_token IS NULL OR lease_until IS NULL OR lease_until<NOW())");
    $stmt->execute(array($lease, $delivery['id']));
    if ($stmt->rowCount() !== 1) {
        $current = lhs_reward_find($pdo, $delivery['id'], $delivery['account_name'], $delivery['server_id'], $delivery['kind']);
        return lhs_reward_result($current ?: $delivery, $current && $current['status'] === 'sent', 'Yêu cầu đang được đối soát; vui lòng chờ rồi tải lại danh sách.');
    }
    try {
        // Read after acquiring the lease so a concurrent completed batch is not lost.
        $delivery = lhs_reward_find($pdo, $delivery['id'], $delivery['account_name'], $delivery['server_id'], $delivery['kind']);
        $role = lhs_find_role($delivery['role_id'], $delivery['server_id'], $delivery['account_name'], false);
        if (!$role) {
            lhs_reward_release($pdo, $delivery, $lease, 'Chưa xác minh được nhân vật đã lưu.');
            return lhs_reward_result($delivery, false, 'Chưa xác minh được nhân vật nhận đã lưu. Quà vẫn được giữ; vui lòng thử lại sau.');
        }
        for ($batch = (int)$delivery['delivered_batches']; $batch < count($snapshot['batches']); $batch++) {
            $items = $snapshot['batches'][$batch];
            if (!is_array($items) || !$items || count($items) > 20) throw new RuntimeException('Lô quà lưu trữ không hợp lệ.');
            $error = '';
            $title = (string)$snapshot['title'];
            $content = (string)$snapshot['content'];
            if (count($snapshot['batches']) > 1) { $title .= ' ' . ($batch + 1) . '/' . count($snapshot['batches']); $content .= ' · Lô ' . ($batch + 1) . '/' . count($snapshot['batches']); }
            $scope = $delivery['kind'] === 'recharge' ? 'donate' : 'gift';
            $sent = vht6ur_sdk_web_send_items($delivery['role_id'], gm_role_name($role), $delivery['server_id'], $items, $error, $title, $content, lhs_reward_event_key($delivery, $batch + 1), $scope);
            if (!$sent) {
                lhs_reward_release($pdo, $delivery, $lease, 'Bridge chưa xác nhận giao lô ' . ($batch + 1) . '.');
                return lhs_reward_result($delivery, false);
            }
            $stmt = $pdo->prepare("UPDATE web_reward_deliveries SET delivered_batches=GREATEST(delivered_batches,?),lease_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE) WHERE id=? AND lease_token=? AND status='pending_delivery'");
            $stmt->execute(array($batch + 1, $delivery['id'], $lease));
            if ($stmt->rowCount() !== 1) return lhs_reward_result($delivery, false);
        }
        return lhs_reward_finish($pdo, $delivery, $lease);
    } catch (Exception $e) {
        lhs_reward_release($pdo, $delivery, $lease, 'Giao quà chưa hoàn tất; cần gửi lại để đối soát.');
        error_log('LHS reward delivery #' . (int)$delivery['id'] . ' incomplete: ' . get_class($e));
        return lhs_reward_result($delivery, false);
    }
}

function lhs_reward_retry($pdo, $id, $account, $server, $kind) {
    $delivery = lhs_reward_find($pdo, $id, $account, $server, $kind);
    if (!$delivery) throw new InvalidArgumentException('Yêu cầu không thuộc tài khoản hoặc máy chủ đang đăng nhập.');
    return lhs_reward_dispatch($pdo, $delivery);
}

function lhs_reward_legacy_gift_pending($pdo, $source) {
    // New deliveries do not create legacy batches. Keep old incomplete batches as
    // reserved capacity, but never guess their original recipient to re-send them.
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM (SELECT b.account_name,b.server_id FROM giftcode_delivery_batches b LEFT JOIN giftcode_logs l ON l.account_name=b.account_name AND l.server_id=b.server_id AND l.giftcode_id=b.giftcode_id WHERE b.giftcode_id=? AND l.id IS NULL GROUP BY b.account_name,b.server_id) legacy_pending');
    $stmt->execute(array((int)$source));
    return (int)$stmt->fetchColumn();
}

function lhs_reward_reserve_gift($pdo, $account, $server, $code, $role) {
    $code = strtoupper(trim((string)$code));
    if ($code === '') throw new InvalidArgumentException('Vui lòng nhập giftcode.');
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM giftcodes WHERE giftcode=? OR code=? LIMIT 1 FOR UPDATE');
        $stmt->execute(array($code, $code));
        $gift = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$gift) throw new InvalidArgumentException('Giftcode không tồn tại.');
        $existing = lhs_reward_find_claim($pdo, 'giftcode', $account, $server, $gift['id'], 'total');
        if ($existing) { $pdo->commit(); return $existing; }
        $stmt = $pdo->prepare('SELECT id FROM giftcode_logs WHERE account_name=? AND server_id=? AND giftcode_id=? LIMIT 1');
        $stmt->execute(array($account, $server, $gift['id']));
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Bạn đã nhận giftcode này rồi.');
        $stmt = $pdo->prepare('SELECT id FROM giftcode_delivery_batches WHERE account_name=? AND server_id=? AND giftcode_id=? LIMIT 1');
        $stmt->execute(array($account, $server, $gift['id']));
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Giftcode có lô giao cũ chưa đối soát và thiếu nhân vật gốc. Vui lòng liên hệ quản trị viên; hệ thống không tự gửi lại để tránh cấp trùng hoặc sai nhân vật.');
        if (!(int)$gift['is_active']) throw new InvalidArgumentException('Giftcode đang tạm đóng.');
        $expires = !empty($gift['expire_at']) ? $gift['expire_at'] : (isset($gift['expires_at']) ? $gift['expires_at'] : '');
        if ($expires !== '' && $expires !== null && strtotime($expires) < time()) throw new InvalidArgumentException('Giftcode đã hết hạn.');
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM web_reward_deliveries WHERE kind='giftcode' AND source_id=? AND status='pending_delivery'");
        $stmt->execute(array($gift['id']));
        $reserved = (int)$stmt->fetchColumn() + lhs_reward_legacy_gift_pending($pdo, $gift['id']);
        if ((int)$gift['max_uses'] > 0 && (int)$gift['used_count'] + $reserved >= (int)$gift['max_uses']) {
            throw new InvalidArgumentException('Giftcode đã hết lượt hoặc các lượt còn lại đang được giao.');
        }
        $items = parse_reward_items($gift['reward_items'], 250);
        if (!$items) throw new InvalidArgumentException('Dữ liệu quà giftcode không hợp lệ.');
        $gift_code = !empty($gift['code']) ? strtoupper($gift['code']) : strtoupper($gift['giftcode']);
        $snapshot = array('code' => $gift_code, 'title' => 'Giftcode ' . $gift_code, 'content' => 'Mã giftcode: ' . $gift_code, 'batches' => array_chunk($items, 20));
        $delivery = lhs_reward_insert($pdo, 'giftcode', $account, $server, $gift['id'], 'total', $role, 'Giftcode ' . $gift_code, $snapshot);
        $pdo->commit();
        return $delivery;
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function lhs_reward_reserve_recharge($pdo, $account, $server, $source, $role) {
    if ((int)$source < 1) throw new InvalidArgumentException('Mốc Donate không hợp lệ.');
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM recharge_milestones WHERE id=? LIMIT 1 FOR UPDATE');
        $stmt->execute(array((int)$source));
        $milestone = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$milestone) throw new InvalidArgumentException('Mốc Donate không tồn tại.');
        $period = (string)$milestone['period_type'];
        if (!in_array($period, array('total','day','week','month'), true)) throw new InvalidArgumentException('Cấu hình kỳ Donate không hợp lệ.');
        $claim_period = recharge_period_key($period);
        $existing = lhs_reward_find_claim($pdo, 'recharge', $account, $server, $source, $claim_period);
        if ($existing) { $pdo->commit(); return $existing; }
        $stmt = $pdo->prepare('SELECT id FROM recharge_milestone_claims WHERE account_name=? AND milestone_id=? AND claim_period=? LIMIT 1');
        $stmt->execute(array($account, (int)$source, $claim_period));
        if ($stmt->fetchColumn()) throw new InvalidArgumentException('Mốc Donate này đã có lịch sử nhận từ trước. Nếu thiếu quà, vui lòng liên hệ quản trị viên để đối soát; hệ thống không tự cấp lại.');
        if (!(int)$milestone['is_active']) throw new InvalidArgumentException('Mốc Donate đang tạm đóng.');
        $need = (int)$milestone['milestone_amount'];
        if ($need < 1 || account_total_recharge($account, $period, $server) < $need) throw new InvalidArgumentException('Bạn chưa đủ mốc Donate này trên máy chủ đã chọn.');
        $items = parse_donate_reward_items($milestone['reward_items']);
        if (!$items) throw new InvalidArgumentException('Dữ liệu quà Donate không hợp lệ.');
        $snapshot = array('title' => 'Quà ' . recharge_period_label($period) . ' ' . $milestone['title'], 'content' => 'Mốc ' . $need . 'đ · kỳ ' . $claim_period . ' · ID ' . $source, 'batches' => array($items));
        $delivery = lhs_reward_insert($pdo, 'recharge', $account, $server, $source, $claim_period, $role, 'Donate ' . $milestone['title'] . ' · ' . $claim_period, $snapshot);
        $stmt = $pdo->prepare('INSERT INTO recharge_milestone_claims(account_name,server_id,milestone_id,claim_period) VALUES(?,?,?,?)');
        $stmt->execute(array($account, $server, (int)$source, $claim_period));
        $pdo->commit();
        return $delivery;
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
