<?php
// No bootstrap, schema writes, wallet mutations or changes to legacy Donate.
function lhs_event_int($value, $min = 1, $max = 2000000000) {
    if ((!is_int($value) && !is_string($value)) || !preg_match('/^[0-9]+$/D', (string)$value)) throw new InvalidArgumentException('Giá trị phải là số nguyên.');
    $number = filter_var($value, FILTER_VALIDATE_INT);
    if ($number === false || $number < $min || $number > $max) throw new InvalidArgumentException('Giá trị vượt giới hạn cho phép.');
    return $number;
}

function lhs_event_now() { return (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))->format('Y-m-d H:i:s'); }

function lhs_event_date($value) {
    if (!is_string($value)) throw new InvalidArgumentException('Thời gian không hợp lệ.');
    $value = str_replace('T', ' ', trim($value));
    if (strlen($value) === 16) $value .= ':00';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, new DateTimeZone('Asia/Ho_Chi_Minh'));
    if (!$date || $date->format('Y-m-d H:i:s') !== $value) throw new InvalidArgumentException('Thời gian không hợp lệ.');
    return $value;
}

function lhs_event_tiers($json, $assign_missing_ids = true) {
    $rows = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($rows) || count($rows) < 1 || array_keys($rows) !== range(0, count($rows)-1)) throw new InvalidArgumentException('Cần ít nhất một mốc quà.');
    $out = array(); $last = 0; $tier_ids = array();
    foreach ($rows as $row) {
        if (!is_array($row)) throw new InvalidArgumentException('Mốc quà không hợp lệ.');
        $need = lhs_event_int($row['amount'] ?? null);
        if ($need <= $last) throw new InvalidArgumentException('Các mốc phải tăng dần, không trùng nhau.');
        $tier_id = lhs_event_int($row['id'] ?? '0', 0);
        if (!$tier_id && $assign_missing_ids) $tier_id = count($out) + 1;
        if ($tier_id && isset($tier_ids[$tier_id])) throw new InvalidArgumentException('ID mốc quà bị trùng.');
        if ($tier_id) $tier_ids[$tier_id] = true;
        $raw = $row['items'] ?? null;
        if (!is_array($raw) || !$raw || count($raw) > 20) throw new InvalidArgumentException('Mỗi mốc cần 1–20 vật phẩm.');
        $items = array(); $ids = array();
        foreach ($raw as $item) {
            if (!is_array($item)) throw new InvalidArgumentException('Vật phẩm không hợp lệ.');
            $id = lhs_event_int($item['item_id'] ?? null);
            $amount = lhs_event_int($item['amount'] ?? null);
            if (isset($ids[$id]) || !hk_reward_exists((string)$id) || !donate_reward_amount_valid((string)$id, $amount)) throw new InvalidArgumentException('ID, số lượng hoặc vật phẩm trùng không hợp lệ: ' . $id);
            $ids[$id] = true; $items[] = array('item_id' => $id, 'amount' => $amount);
        }
        $out[] = array('id' => $tier_id, 'amount' => $need, 'items' => $items); $last = $need;
    }
    return $out;
}

function lhs_event_assign_tier_ids($tiers, $old_tiers = array(), $claimed_max_id = 0) {
    $by_id = array(); $by_amount = array(); $used = array();
    $next_id = (int)$claimed_max_id;
    foreach ($old_tiers as $tier) {
        $by_id[$tier['id']] = $tier;
        $by_amount[$tier['amount']] = $tier['id'];
        $next_id = max($next_id, (int)$tier['id']);
    }
    // Keep existing identities even when a tier moves or changes its amount.
    foreach ($tiers as $tier) {
        if (!$tier['id']) continue;
        if (!isset($by_id[$tier['id']])) throw new InvalidArgumentException('Mốc quà vừa thay đổi. Hãy tải lại sự kiện.');
        $used[$tier['id']] = true;
    }
    foreach ($tiers as &$tier) {
        if ($tier['id']) continue;
        // Older browser tabs did not submit IDs: match their unchanged amounts.
        $matched = $by_amount[$tier['amount']] ?? 0;
        if ($matched && !isset($used[$matched])) $tier['id'] = $matched;
        else $tier['id'] = lhs_event_int((string)(++$next_id));
        $used[$tier['id']] = true;
    }
    unset($tier);
    return $tiers;
}

function lhs_event_active($event, $now) {
    return (int)$event['is_active'] === 1 && $event['starts_at'] <= $now && $now < $event['ends_at'];
}

function lhs_event_total($pdo, $account, $event, $now) {
    // Exactly the Donate sources, shared across servers. No wallet balance/spend.
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM sepay_logs WHERE account_name=? AND action IN ('topup_xu','vip') AND created_at>=? AND created_at<? AND created_at<=?");
    $stmt->execute(array($account, $event['starts_at'], $event['ends_at'], $now));
    return (int)$stmt->fetchColumn(); // Database failure must propagate, not become 0.
}

function lhs_event_banner($path) {
    if (!is_string($path) || ($path !== '' && !preg_match('~^assets/images/event_[a-f0-9]{32}\.(png|jpg|webp)$~D', $path))) throw new InvalidArgumentException('Hãy tải banner bằng nút chọn ảnh.');
    return $path;
}

function lhs_event_save($pdo, $input, $now = null) {
    $now = $now ?? lhs_event_now();
    $id = lhs_event_int(($input['id'] ?? '') === '' ? '0' : $input['id'], 0);
    $title = $input['title'] ?? '';
    if (!is_string($title) || !preg_match('/^.{1,120}$/uD', trim($title))) throw new InvalidArgumentException('Tên sự kiện cần 1–120 ký tự.');
    $title = trim($title);
    $start = lhs_event_date($input['starts_at'] ?? null); $end = lhs_event_date($input['ends_at'] ?? null);
    if ($end <= $start) throw new InvalidArgumentException('Kết thúc phải sau thời gian bắt đầu.');
    $active = lhs_event_int($input['is_active'] ?? '0', 0, 1);
    $banner = lhs_event_banner($input['banner_path'] ?? '');
    $tiers = lhs_event_tiers($input['tiers_json'] ?? '', false);
    $pdo->beginTransaction();
    try {
        $published = null;
        if ($id) {
            $s = $pdo->prepare('SELECT * FROM donate_events WHERE id=? FOR UPDATE'); $s->execute(array($id)); $old = $s->fetch(PDO::FETCH_ASSOC);
            if (!$old) throw new InvalidArgumentException('Không tìm thấy sự kiện.');
            if (lhs_event_int($input['edit_version'] ?? '0', 0) !== (int)$old['edit_version']) throw new InvalidArgumentException('Sự kiện vừa được sửa ở nơi khác. Hãy tải lại trước khi lưu.');
            $published = $old['published_at'];
            $s = $pdo->prepare('SELECT COALESCE(MAX(tier_id),0) FROM donate_event_claims WHERE event_id=?');
            $s->execute(array($id));
            $tiers = lhs_event_assign_tier_ids($tiers, lhs_event_tiers($old['tiers_json']), (int)$s->fetchColumn());
        } else $tiers = lhs_event_assign_tier_ids($tiers);
        // Admin may edit running/ended events and choose an earlier start.
        // Reserved deliveries retain their original immutable reward snapshot.
        $json = lhs_reward_json($tiers);
        if ($active && (!$banner || !is_file(__DIR__ . '/' . $banner))) throw new InvalidArgumentException('Cần banner đã tải lên trước khi bật sự kiện.');
        if ($active && $published === null) $published = $now;
        if ($id) {
            $s = $pdo->prepare('UPDATE donate_events SET title=?,banner_path=?,starts_at=?,ends_at=?,tiers_json=?,is_active=?,published_at=?,edit_version=edit_version+1 WHERE id=?');
            $s->execute(array($title,$banner,$start,$end,$json,$active,$published,$id));
        } else {
            $s = $pdo->prepare('INSERT INTO donate_events(title,banner_path,starts_at,ends_at,tiers_json,is_active,published_at) VALUES(?,?,?,?,?,?,?)');
            $s->execute(array($title,$banner,$start,$end,$json,$active,$published)); $id = (int)$pdo->lastInsertId();
        }
        $pdo->commit(); return $id;
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function lhs_event_reserve($pdo, $account, $server, $event_id, $tier_id, $role, $now = null) {
    $event_id = lhs_event_int($event_id); $tier_id = lhs_event_int($tier_id);
    lhs_reward_identity($account, $server, $role);
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT * FROM donate_events WHERE id=? FOR UPDATE'); $s->execute(array($event_id)); $event = $s->fetch(PDO::FETCH_ASSOC);
        if (!$event) throw new InvalidArgumentException('Sự kiện không tồn tại.');
        // Sample time after acquiring the lock: waiting cannot cross the deadline.
        $now = $now ?? lhs_event_now();
        $s = $pdo->prepare('SELECT * FROM donate_event_claims WHERE event_id=? AND tier_id=? AND account_name=? FOR UPDATE');
        $s->execute(array($event_id,$tier_id,$account)); $claim = $s->fetch(PDO::FETCH_ASSOC);
        if ($claim) {
            if ((string)$claim['server_id'] !== (string)$server) throw new InvalidArgumentException('Mốc này đã được ghi nhận tại S'.$claim['server_id'].'. Không nhận lại khi đổi server.');
            $delivery = lhs_reward_find($pdo,$claim['delivery_id'],$account,$server,'recharge');
            if (!$delivery) throw new RuntimeException('Thiếu đơn quà đã ghi nhận.');
            $pdo->commit(); return $delivery;
        }
        if (!lhs_event_active($event,$now)) throw new InvalidArgumentException('Sự kiện chưa bắt đầu, đã kết thúc hoặc đang tắt.');
        $tiers = lhs_event_tiers($event['tiers_json']); $tier = null;
        foreach ($tiers as $candidate) if ($candidate['id'] === $tier_id) { $tier = $candidate; break; }
        if (!$tier) throw new InvalidArgumentException('Mốc sự kiện không tồn tại.');
        $total = lhs_event_total($pdo,$account,$event,$now);
        if ($total < $tier['amount']) throw new InvalidArgumentException('Chưa đủ Donate trong thời gian sự kiện.');
        $items = parse_donate_reward_items(lhs_reward_json($tier['items']));
        if (!$items) throw new RuntimeException('Quà không còn hợp lệ.');
        // Reuse the durable Donate delivery and bridge; namespace distinct from
        // total/day/week/month. Legacy claims/catalogs remain completely untouched.
        $period = 'event:'.$event_id;
        $snapshot = array('title'=>'Quà sự kiện '.$event['title'], 'content'=>'Mốc '.number_format($tier['amount']).'đ · '.$event['starts_at'].' — '.$event['ends_at'].' (GMT+7)', 'batches'=>array($items));
        $delivery = lhs_reward_insert($pdo,'recharge',$account,$server,$tier_id,$period,$role,'Sự kiện '.$event['title'].' · '.number_format($tier['amount']).'đ',$snapshot);
        $s = $pdo->prepare('INSERT INTO donate_event_claims(event_id,tier_id,account_name,server_id,delivery_id,qualified_amount) VALUES(?,?,?,?,?,?)');
        $s->execute(array($event_id,$tier_id,$account,$server,$delivery['id'],$total));
        $pdo->commit(); return $delivery;
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function lhs_event_public($pdo, $account, $server, $now = null) {
    $now = $now ?? lhs_event_now();
    $s = $pdo->prepare('SELECT * FROM donate_events WHERE (is_active=1 AND ends_at>?) OR id IN (SELECT event_id FROM donate_event_claims WHERE account_name=?) ORDER BY starts_at DESC,id DESC LIMIT 100');
    $s->execute(array($now,$account)); $events = $s->fetchAll(PDO::FETCH_ASSOC);
    $s = $pdo->prepare('SELECT c.*,d.status FROM donate_event_claims c JOIN web_reward_deliveries d ON d.id=c.delivery_id WHERE c.account_name=?');
    $s->execute(array($account)); $claims = array();
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $row) $claims[$row['event_id'].'|'.$row['tier_id']] = $row;
    $catalog = vht6ur_item_catalog(); $images = item_icon_image_map(true); $out = array();
    foreach ($events as $event) {
        $active = lhs_event_active($event,$now); $total = lhs_event_total($pdo,$account,$event,$now);
        $tiers = json_decode($event['tiers_json'],true);
        foreach ($tiers as &$tier) {
            $claim = $claims[$event['id'].'|'.$tier['id']] ?? null;
            $tier['claimed'] = $claim && $claim['status']==='sent';
            $tier['pending'] = $claim && $claim['status']==='pending_delivery';
            $tier['server_id'] = $claim ? (string)$claim['server_id'] : (string)$server;
            $tier['delivery_id'] = $claim ? (int)$claim['delivery_id'] : 0;
            $tier['ready'] = !$claim && $active && $total >= $tier['amount'];
            foreach ($tier['items'] as &$item) {
                $id = (string)$item['item_id']; $item['name'] = $catalog[$id] ?? ('Vật phẩm #'.$id);
                $item['image'] = site_asset_url($images['item_'.$id] ?? $images[$id] ?? site_logo_image());
            } unset($item);
        } unset($tier);
        $out[] = array('id'=>(int)$event['id'],'title'=>$event['title'],'banner'=>site_asset_url($event['banner_path']), 'starts_at'=>$event['starts_at'], 'ends_at'=>$event['ends_at'], 'active'=>$active, 'enabled'=>(bool)$event['is_active'], 'total'=>$total,'tiers'=>$tiers);
    }
    return array('events'=>$out,'now'=>$now,'server_id'=>(string)$server);
}
