<?php
define('LHS_API_REQUEST', true);
require_once '../config.php';
require_once '../web_context.php';
header('Content-Type: application/json; charset=utf-8');
lhs_web_private_headers();

function api_exit($status, $message = '', $extra = array()) {
    if ($message !== '') $message = str_replace('WebGM','Web quản lý tài khoản Linh Họa Sư',web_message_vi($message));
    echo json_encode(array_merge(array('status' => $status, 'message' => $message), $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function api_log_error($scope, Throwable $e) {
    error_log('LHS user_api ' . $scope . ': ' . $e->getMessage());
    system_event_log('user_api', 'error', 'failed', $scope, 'Lỗi API người chơi.', $e->getMessage());
}

function require_login() {
    static $verified = false;
    if ($verified) return;
    if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
        api_exit('error', 'Phiên đăng nhập đã hết hạn.', array('login_required' => 1));
    }
    if (!lhs_web_session_valid()) {
        api_exit('error', 'Máy chủ của phiên không còn hợp lệ. Vui lòng đăng nhập lại.', array('login_required' => 1, 'code' => 'INVALID_SERVER_CONTEXT'));
    }
    if (!lhs_web_context_matches_request()) {
        api_exit('error', 'Tài khoản hoặc máy chủ đã thay đổi. Vui lòng tải lại trang trước khi thao tác.', array('context_changed' => 1, 'reload_required' => 1, 'code' => 'STALE_SESSION_CONTEXT'));
    }
    vht6ur_login_required();
    $verified = true;
}

function require_api_rate($bucket, $limit, $seconds) {
    if (api_rate_limit_exceeded($bucket, $limit, $seconds)) {
        api_exit('error', 'Thao tác quá nhanh, vui lòng thử lại sau.');
    }
}

function lucky_wheel_attempt_item_delivery($spin, $role, &$error = '') {
    global $conn_web;
    $error = '';
    if (!is_array($spin) || (string)$spin['prize_type'] !== 'item') return true;
    $item_id = (int)$spin['item_id'];
    $item_amount = (int)$spin['item_amount'];
    if (!vht6ur_item_allowed($item_id) || !gift_reward_amount_valid($item_id, $item_amount)) {
        $error = 'Phần thưởng vật phẩm không còn hợp lệ.';
        return false;
    }
    $role_id = gm_role_id($role);
    if ($role_id === '') { $error = 'Bạn cần tạo nhân vật trước khi nhận phần thưởng.'; return false; }
    $world_id = (int)(isset($role['world_id']) ? $role['world_id'] : $_SESSION['server_id']);
    $mail_error = '';
    if (!vht6ur_sdk_web_send_items($role_id, gm_role_name($role), $world_id,
        array(array('item_id'=>$item_id,'amount'=>$item_amount,'name'=>vht6ur_item_catalog()[$item_id])),
        $mail_error, 'Quà Vòng Quay May Mắn', 'Phần thưởng vòng quay: ' . $spin['prize_title'],
        (string)$spin['mail_event_key'], 'gift')) {
        $error = $mail_error !== '' ? $mail_error : 'Chưa gửi được thư phần thưởng.';
        $stmt = $conn_web->prepare("UPDATE lucky_wheel_spins SET delivery_status='pending',last_error=? WHERE id=? AND account_name=? AND server_id=?");
        $stmt->execute(array(app_log_text_limit($error,1000),(int)$spin['id'],$_SESSION['username'],$_SESSION['server_id']));
        return false;
    }
    $stmt = $conn_web->prepare("UPDATE lucky_wheel_spins SET delivery_status='delivered',last_error='' WHERE id=? AND account_name=? AND server_id=?");
    $stmt->execute(array((int)$spin['id'],$_SESSION['username'],$_SESSION['server_id']));
    return true;
}

function transaction_action_label($action) {
    $action = (string)$action;
    if ($action === 'topup_xu') return 'Donate Xu';
    if ($action === 'vip') return 'Donate VIP';
    if ($action === 'duplicate') return 'Donate trùng';
    if ($action === 'invalid_amount') return 'Sai số tiền';
    if ($action === 'invalid_server') return 'Sai server';
    if ($action === 'account_not_found') return 'Sai tài khoản';
    if ($action === 'invalid_voucher') return 'Sai mã giảm giá';
    if ($action === 'voucher_unavailable') return 'Mã giảm giá hết hiệu lực';
    if ($action === 'vip_amount_not_enough') return 'Chưa đủ tiền VIP';
    if ($action === 'syntax_not_matched') return 'Sai cú pháp';
    return $action !== '' ? $action : 'Donate';
}

function transaction_status_label($status) {
    if ($status === 'success') return 'Thành công';
    if ($status === 'failed') return 'Thất bại';
    if ($status === 'ignored') return 'Bỏ qua';
    return $status !== '' ? $status : 'Không rõ';
}

function transaction_row_for_user($row) {
    $details = array();
    if (!empty($row['details'])) {
        $decoded = json_decode((string)$row['details'], true);
        if (is_array($decoded)) $details = $decoded;
    }
    $amount = isset($row['amount']) ? floatval($row['amount']) : 0;
    if ($amount <= 0 && isset($details['amount'])) $amount = floatval($details['amount']);
    $content = isset($row['content']) ? trim((string)$row['content']) : '';
    if ($content === '' && isset($details['content'])) $content = trim((string)$details['content']);
    $tran_id = isset($row['tran_id']) ? trim((string)$row['tran_id']) : '';
    if ($tran_id === '' && isset($details['tran_id'])) $tran_id = trim((string)$details['tran_id']);
    return array(
        'id' => isset($row['event_id']) ? (string)$row['event_id'] : '',
        'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : '',
        'status' => isset($row['status']) ? (string)$row['status'] : '',
        'status_label' => transaction_status_label(isset($row['status']) ? (string)$row['status'] : ''),
        'level' => isset($row['level']) ? (string)$row['level'] : 'info',
        'action' => isset($row['action']) ? (string)$row['action'] : '',
        'action_label' => transaction_action_label(isset($row['action']) ? (string)$row['action'] : ''),
        'amount' => $amount,
        'server_id' => isset($row['server_id']) ? (string)$row['server_id'] : '',
        'tran_id' => $tran_id,
        'content' => $content,
        'message' => isset($row['message']) ? (string)$row['message'] : ''
    );
}

function webshop_spend_period_range($period, $date_from = '', $date_to = '') {
    $period = trim((string)$period);
    if (!in_array($period, array('today', 'week', 'month', 'custom', 'all'), true)) {
        $period = 'today';
    }

    $timezone = new DateTimeZone(date_default_timezone_get());
    $now = new DateTimeImmutable('now', $timezone);
    $start = null;
    $end = null;
    $label = '';

    if ($period === 'today') {
        $start = $now->setTime(0, 0, 0);
        $end = $start->modify('+1 day');
        $label = 'Hôm nay';
    } elseif ($period === 'week') {
        $start = $now->modify('monday this week')->setTime(0, 0, 0);
        $end = $start->modify('+1 week');
        $label = 'Tuần này';
    } elseif ($period === 'month') {
        $start = $now->modify('first day of this month')->setTime(0, 0, 0);
        $end = $start->modify('+1 month');
        $label = 'Tháng này';
    } elseif ($period === 'custom') {
        $date_from = trim((string)$date_from);
        $date_to = trim((string)$date_to);
        $from = DateTimeImmutable::createFromFormat('!Y-m-d', $date_from, $timezone);
        $from_errors = DateTimeImmutable::getLastErrors();
        $from_valid = $from && ($from_errors === false || ($from_errors['warning_count'] === 0 && $from_errors['error_count'] === 0));
        $to = DateTimeImmutable::createFromFormat('!Y-m-d', $date_to, $timezone);
        $to_errors = DateTimeImmutable::getLastErrors();
        $to_valid = $to && ($to_errors === false || ($to_errors['warning_count'] === 0 && $to_errors['error_count'] === 0));
        if (!$from_valid || !$to_valid || $from->format('Y-m-d') !== $date_from || $to->format('Y-m-d') !== $date_to) {
            throw new InvalidArgumentException('Khoảng ngày không hợp lệ.');
        }
        if ($from > $to) throw new InvalidArgumentException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        if ($from->diff($to)->days > 366) throw new InvalidArgumentException('Khoảng ngày tối đa là 366 ngày.');
        $start = $from->setTime(0, 0, 0);
        $end = $to->modify('+1 day')->setTime(0, 0, 0);
        $label = 'Từ ' . $start->format('d/m/Y') . ' đến ' . $to->format('d/m/Y');
    } else {
        $label = 'Toàn bộ lịch sử';
    }

    return array(
        'period' => $period,
        'label' => $label,
        'date_from' => $start ? $start->format('Y-m-d') : '',
        'date_to' => $end ? $end->modify('-1 day')->format('Y-m-d') : '',
        'start' => $start ? $start->format('Y-m-d H:i:s') : '',
        'end' => $end ? $end->format('Y-m-d H:i:s') : ''
    );
}

function webshop_spend_status_label($status) {
    if ($status === 'paid') return 'Đã thanh toán';
    if ($status === 'pending_delivery') return 'Đang chờ giao';
    if ($status === 'refunded') return 'Đã hoàn Xu';
    if ($status === 'failed') return 'Thất bại';
    return $status !== '' ? $status : 'Không rõ';
}

function webshop_spend_clean_item_name($name, $item_id) {
    $name = trim((string)$name);
    $clean = preg_replace('/^\s*\d+(?:_\d+)?\s*[-–]?\s*/u', '', $name);
    if (is_string($clean) && trim($clean) !== '') $name = trim($clean);
    return $name !== '' ? $name : ('Vật phẩm ID ' . trim((string)$item_id));
}

function webshop_spend_subtract_unsigned($left, $right) {
    $left = preg_replace('/\D/', '', (string)$left);
    $right = preg_replace('/\D/', '', (string)$right);
    if ($left === '') $left = '0';
    if ($right === '') $right = '0';
    $left = ltrim($left, '0');
    $right = ltrim($right, '0');
    if ($left === '') $left = '0';
    if ($right === '') $right = '0';
    if (strlen($left) < strlen($right) || (strlen($left) === strlen($right) && strcmp($left, $right) < 0)) return '0';
    $i = strlen($left) - 1;
    $j = strlen($right) - 1;
    $borrow = 0;
    $digits = '';
    while ($i >= 0) {
        $a = intval($left[$i]) - $borrow;
        $b = $j >= 0 ? intval($right[$j]) : 0;
        if ($a < $b) { $a += 10; $borrow = 1; } else { $borrow = 0; }
        $digits = (string)($a - $b) . $digits;
        $i--; $j--;
    }
    $digits = ltrim($digits, '0');
    return $digits === '' ? '0' : $digits;
}

function webshop_spend_row_for_user($row) {
    $status = isset($row['status']) ? (string)$row['status'] : '';
    $quantity = isset($row['quantity']) ? (string)$row['quantity'] : '0';
    $item_amount = isset($row['item_amount']) ? (string)$row['item_amount'] : '1';
    $received_amount = '0';
    if (ctype_digit($quantity) && ctype_digit($item_amount)) {
        if (function_exists('bc_mul')) $received_amount = bc_mul($quantity, $item_amount, 0);
        elseif ((float)$quantity * (float)$item_amount <= PHP_INT_MAX) $received_amount = (string)((int)$quantity * (int)$item_amount);
    }
    return array(
        'id' => isset($row['id']) ? (string)$row['id'] : '',
        'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : '',
        'shop_item_id' => isset($row['shop_item_id']) ? (string)$row['shop_item_id'] : '',
        'item_id' => isset($row['item_id']) ? (string)$row['item_id'] : '',
        'item_name' => webshop_spend_clean_item_name(isset($row['item_name']) ? $row['item_name'] : '', isset($row['item_id']) ? $row['item_id'] : ''),
        'image_url' => isset($row['image_url']) ? (string)$row['image_url'] : '',
        'item_amount' => $item_amount,
        'quantity' => $quantity,
        'received_amount' => $received_amount,
        'reward_items' => !empty($row['reward_snapshot']) ? json_decode($row['reward_snapshot'],true) : array(),
        'unit_price' => isset($row['unit_price']) ? (string)$row['unit_price'] : '0',
        'total_price' => isset($row['total_price']) ? (string)$row['total_price'] : '0',
        'status' => $status,
        'status_label' => webshop_spend_status_label($status)
    );
}

/**
 * Trả snapshot mốc Donate cho polling nền của WebGM.
 * Snapshot chỉ đọc; việc nhận quà vẫn đi qua claim_recharge_milestone
 * và tự kiểm tra lại tổng nạp ở server.
 */
function recharge_status_snapshot($account, $server_id) {
    global $conn_web;
    $account = (string)$account;
    $server_id = (string)$server_id;
    $periods = array('total', 'day', 'week', 'month');
    $totals = array();
    foreach ($periods as $period) {
        $totals[$period] = account_total_recharge($account, $period, $server_id);
    }

    $claim_periods = array('total', recharge_period_key('day'), recharge_period_key('week'), recharge_period_key('month'));
    $claimed = array();
    $claim_stmt = $conn_web->prepare('SELECT milestone_id, claim_period FROM recharge_milestone_claims WHERE account_name = ? AND claim_period IN (?,?,?,?)');
    $claim_stmt->execute(array($account, $claim_periods[0], $claim_periods[1], $claim_periods[2], $claim_periods[3]));
    foreach ($claim_stmt->fetchAll(PDO::FETCH_ASSOC) as $claim_row) {
        $claim_period = isset($claim_row['claim_period']) && $claim_row['claim_period'] !== '' ? (string)$claim_row['claim_period'] : 'total';
        $claimed[(int)$claim_row['milestone_id'] . '|' . $claim_period] = true;
    }

    $deliveries = array();
    $delivery_stmt = $conn_web->prepare("SELECT id,source_id,claim_period,status FROM web_reward_deliveries WHERE kind='recharge' AND account_name=? AND server_id=? AND claim_period IN (?,?,?,?)");
    $delivery_stmt->execute(array($account, $server_id, $claim_periods[0], $claim_periods[1], $claim_periods[2], $claim_periods[3]));
    foreach ($delivery_stmt->fetchAll(PDO::FETCH_ASSOC) as $delivery_row) {
        $deliveries[(int)$delivery_row['source_id'] . '|' . $delivery_row['claim_period']] = $delivery_row;
    }

    $milestones = array();
    $stmt = $conn_web->query("SELECT id, period_type, milestone_amount FROM recharge_milestones WHERE is_active = 1 ORDER BY FIELD(period_type, 'total', 'day', 'week', 'month'), milestone_amount ASC, sort_order ASC, id DESC");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $period = normalize_recharge_period(isset($row['period_type']) ? $row['period_type'] : 'total');
        if (!in_array($period, $periods, true)) continue;
        $id = (int)$row['id'];
        $need = max(1, (int)$row['milestone_amount']);
        $total = isset($totals[$period]) ? (int)$totals[$period] : 0;
        $claim_period = recharge_period_key($period);
        $claim_key = $id . '|' . $claim_period;
        $delivery = isset($deliveries[$claim_key]) ? $deliveries[$claim_key] : false;
        $pending = $delivery && $delivery['status'] === 'pending_delivery';
        $percent = min(100, (int)floor(($total / $need) * 100));
        $milestones[] = array(
            'id' => $id,
            'period_type' => $period,
            'claim_period' => $claim_period,
            'need_amount' => $need,
            'total' => $total,
            'percent' => $percent,
            // Legacy claims retain their historical "claimed" state; a new
            // pending outbox row must not be rendered as already delivered.
            'claimed' => $delivery ? $delivery['status'] === 'sent' : isset($claimed[$claim_key]),
            'pending' => (bool)$pending,
            'delivery_id' => $delivery ? (int)$delivery['id'] : 0,
            'ready' => $total >= $need || $pending
        );
    }

    return array(
        'server_id' => $server_id,
        'generated_at' => date('c'),
        'totals' => $totals,
        'milestones' => $milestones
    );
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_exit('error', 'Phương thức yêu cầu không hợp lệ.');
}
if (!csrf_validate_request()) {
    api_exit('error', 'Phiên thao tác đã hết hạn, vui lòng tải lại trang.', array('reload_required' => 1, 'code' => 'STALE_SESSION_CONTEXT'));
}

$action = isset($_POST['action']) ? trim((string)$_POST['action']) : '';
if (!in_array($action, array('login', 'register', 'recover_password_by_phone', 'get_lucky_wheel_public_history'), true)) require_login();

if (maintenance_mode_enabled() && !current_session_is_admin() && !in_array($action, array('login', 'logout'), true)) {
    api_exit('error', 'Website đang bảo trì, vui lòng quay lại sau.');
}

switch ($action) {
    case 'get_lucky_wheel_public_history':
        try { api_exit('success', '', array('history' => lucky_wheel_public_history())); }
        catch (Throwable $e) { api_exit('error', 'Chưa tải được lịch sử quay công khai.'); }
        break;
    case 'login':
        $server_id = isset($_POST['server_id']) ? trim((string)$_POST['server_id']) : '';
        $username = isset($_POST['username']) ? trim((string)$_POST['username']) : '';
        // Chuyển nguyên bản mật khẩu sang API game; không trim vì game không trim.
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
        $ip = app_client_ip();

        if ($server_id === '' || $username === '' || $password === '') api_exit('error', 'Vui lòng nhập đủ thông tin.');
        if (!gm_get_server($server_id)) api_exit('error', 'Server không hợp lệ.');
        if (login_attempt_is_limited($username, $ip)) {
            system_event_log('login', 'warning', 'failed', 'login_limited', 'Sai mật khẩu quá nhiều lần.', '', $username, $server_id);
            api_exit('error', 'Sai mật khẩu quá nhiều lần, thử lại sau 15 phút.');
        }

        try {
            $user = hk_authenticate_account($username, $password, $server_id);
            if (!$user) {
                log_login_attempt($username, $ip, false, $server_id);
                api_exit('error', 'Sai tài khoản hoặc mật khẩu.');
            }
            log_login_attempt($username, $ip, true, $server_id);
            session_regenerate_id(true);
            unset($_SESSION['csrf_token']);
            csrf_token();
            $_SESSION['logged_in'] = true;
            $_SESSION['username'] = $user['account'];
            $_SESSION['uin'] = $user['id'];
            $_SESSION['server_id'] = $server_id;
            $server = gm_get_server($server_id);
            $_SESSION['server_name'] = $server['name'];
            $_SESSION['vip_level'] = 0;
            $_SESSION['role'] = is_admin_account($user['account']) ? 'admin' : 'user';
            api_exit('success', 'Đăng nhập thành công.', array('role' => $_SESSION['role']));
        } catch (Exception $e) {
            api_log_error('login', $e);
            api_exit('error', ($e instanceof RuntimeException) ? $e->getMessage() : 'Không thể đăng nhập lúc này.');
        }
        break;

    case 'register':
        api_exit('error', 'Vui lòng đăng ký tài khoản trong game. WebGM chỉ hỗ trợ đăng nhập tài khoản đã có.');
        /* Legacy registration handler retained below for rollback reference. */
        $server_id = isset($_POST['server_id']) ? trim((string)$_POST['server_id']) : '';
        $username = isset($_POST['username']) ? trim((string)$_POST['username']) : '';
        // Chuyển nguyên bản mật khẩu sang API game; không trim vì game không trim.
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
        $re_password = isset($_POST['re_password']) ? trim((string)$_POST['re_password']) : '';
        $invite_code = isset($_POST['invite_code']) ? strtoupper(trim((string)$_POST['invite_code'])) : '';
        if ($server_id === '' || !gm_get_server($server_id)) api_exit('error', 'Vui lòng chọn máy chủ hợp lệ.');
        if ($username === '' || $password === '') api_exit('error', 'Vui lòng nhập đủ thông tin.');
        if ($re_password !== '' && $password !== $re_password) api_exit('error', 'Mật khẩu nhập lại không khớp.');
        try {
            hk_register_account($username, $password, $invite_code, $server_id);
            api_exit('success', 'Đăng ký thành công. Hãy đăng nhập.');
        } catch (Exception $e) {
            api_log_error('register', $e);
            api_exit('error', ($e instanceof RuntimeException) ? $e->getMessage() : 'Không thể đăng ký lúc này.');
        }
        break;

    case 'logout':
        $_SESSION = array();
        session_destroy();
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        if (!headers_sent()) header('Location: ../login.php');
        exit;

    case 'get_roles':
        require_login();
        $roles = hk_roles_for_account($_SESSION['uin'], $_SESSION['username'], $_SESSION['server_id']);
        api_exit('success', '', array('roles' => $roles));
        break;

    case 'check_vip_status':
        require_login();
        $xu_web = 0;
        $vip_level = 0;
        try {
            $stmt = $conn_web->prepare('SELECT ptb FROM account WHERE account = ? LIMIT 1');
            $stmt->execute(array($_SESSION['username']));
            if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) $xu_web = intval($row['ptb']);
            $vip_level = vht6ur_vip_level($_SESSION['username']);
            $_SESSION['vip_level'] = $vip_level;
        } catch (Exception $e) {}
        api_exit('success', '', array('vip_level' => $vip_level, 'xu_web' => $xu_web));
        break;

    case 'get_recharge_status':
        require_login();
        require_api_rate('get_recharge_status', 10, 60);
        if (!web_setting_enabled('recharge_rewards_enabled')) api_exit('error', 'Tích Donate đang tạm đóng.');
        try {
            $snapshot = recharge_status_snapshot($_SESSION['username'], isset($_SESSION['server_id']) ? $_SESSION['server_id'] : '');
            api_exit('success', '', array('recharge' => $snapshot));
        } catch (Exception $e) {
            api_log_error('get_recharge_status', $e);
            api_exit('error', 'Không đồng bộ được trạng thái Donate lúc này.');
        }
        break;

    case 'get_recharge_event_status':
        require_login();
        require_api_rate('get_recharge_event_status', 10, 60);
        try {
            api_exit('success', '', array('recharge_events' => lhs_event_public($conn_web, $_SESSION['username'], $_SESSION['server_id'])));
        } catch (Throwable $e) {
            api_log_error('get_recharge_event_status', $e);
            api_exit('error', 'Không đồng bộ được trạng thái sự kiện nạp lúc này.');
        }
        break;

    case 'get_my_transactions':
        require_login();
        require_api_rate('get_my_transactions', 30, 60);
        $transaction_server_id = isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : '';
        $page = max(1, intval(isset($_POST['page']) ? $_POST['page'] : 1));
        $limit = 20;
        $offset = ($page - 1) * $limit;
        try {
            $count_stmt = $conn_web->prepare("SELECT (SELECT COUNT(*) FROM sepay_logs WHERE account_name = ? AND server_id = ?) + (SELECT COUNT(*) FROM system_event_logs WHERE source = 'sepay_webhook' AND account_name = ? AND server_id = ? AND status <> 'success')");
            $count_stmt->execute(array($_SESSION['username'], $transaction_server_id, $_SESSION['username'], $transaction_server_id));
            $total = intval($count_stmt->fetchColumn());
            $sql = "
                SELECT * FROM (
                    SELECT CONVERT(CONCAT('sepay-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
                        CONVERT('info' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
                        CONVERT('success' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
                        CONVERT(COALESCE(account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
                        CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
                        CONVERT(COALESCE(action, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
                        amount,
                        CONVERT(COALESCE(content, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS content,
                        CONVERT(COALESCE(tran_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tran_id,
                        CONVERT(CASE WHEN action = 'vip' THEN 'Đã kích VIP qua Donate SePay.' ELSE 'Đã ghi nhận Donate Xu qua SePay.' END USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
                        CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details, created_at
                    FROM sepay_logs
                    WHERE account_name = ? AND server_id = ?
                    UNION ALL
                    SELECT CONVERT(CONCAT('event-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
                        CONVERT(COALESCE(level, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
                        CONVERT(COALESCE(status, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
                        CONVERT(COALESCE(account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
                        CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
                        CONVERT(COALESCE(action, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
                        0 AS amount,
                        CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS content,
                        CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tran_id,
                        CONVERT(COALESCE(message, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
                        CONVERT(COALESCE(details, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details, created_at
                    FROM system_event_logs
                    WHERE source = 'sepay_webhook' AND account_name = ? AND server_id = ? AND status <> 'success'
                ) tx
                ORDER BY created_at DESC
                LIMIT $limit OFFSET $offset";
            $stmt = $conn_web->prepare($sql);
            $stmt->execute(array($_SESSION['username'], $transaction_server_id, $_SESSION['username'], $transaction_server_id));
            $rows = array();
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $rows[] = transaction_row_for_user($row);
            api_exit('success', '', array(
                'data' => $rows,
                'total_pages' => max(1, intval(ceil($total / $limit))),
                'current_page' => $page,
                'total' => $total
            ));
        } catch (Exception $e) {
            api_log_error('get_my_transactions', $e);
            api_exit('error', 'Không đọc được lịch sử Donate lúc này.');
        }
        break;

    case 'get_my_webshop_spend_history':
        require_login();
        require_api_rate('get_my_webshop_spend_history', 60, 60);
        $page = max(1, intval(isset($_POST['page']) ? $_POST['page'] : 1));
        $limit = 20;
        $offset = ($page - 1) * $limit;
        $status_filter = isset($_POST['status_filter']) ? trim((string)$_POST['status_filter']) : 'all';
        if (!in_array($status_filter, array('all', 'paid', 'refunded', 'failed'), true)) $status_filter = 'all';
        try {
            $range = webshop_spend_period_range(
                isset($_POST['period']) ? $_POST['period'] : 'today',
                isset($_POST['date_from']) ? $_POST['date_from'] : '',
                isset($_POST['date_to']) ? $_POST['date_to'] : ''
            );
            $where = 'o.account_name = ? AND o.server_id = ?';
            $params = array($_SESSION['username'], (string)$_SESSION['server_id']);
            if ($range['start'] !== '' && $range['end'] !== '') {
                $where .= ' AND o.created_at >= ? AND o.created_at < ?';
                $params[] = $range['start'];
                $params[] = $range['end'];
            }
            if ($status_filter !== 'all') {
                $where .= ' AND o.status = ?';
                $params[] = $status_filter;
            }

            $summary_sql = "SELECT COUNT(*) AS order_count,
                    COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_price ELSE 0 END),0) AS paid_spend,
                    COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_price ELSE 0 END),0) AS refunded_spend,
                    COALESCE(SUM(CASE WHEN o.status = 'failed' THEN 1 ELSE 0 END),0) AS failed_count,
                    COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.quantity ELSE 0 END),0) AS paid_packages
                FROM webshop_orders o WHERE $where";
            $summary_stmt = $conn_web->prepare($summary_sql);
            $summary_stmt->execute($params);
            $summary = $summary_stmt->fetch(PDO::FETCH_ASSOC) ?: array();
            $total = intval(isset($summary['order_count']) ? $summary['order_count'] : 0);

            $today_start = (new DateTimeImmutable('today', new DateTimeZone(date_default_timezone_get())))->format('Y-m-d H:i:s');
            $today_end = (new DateTimeImmutable('tomorrow', new DateTimeZone(date_default_timezone_get())))->format('Y-m-d H:i:s');
            $today_stmt = $conn_web->prepare("SELECT COUNT(*) AS order_count,
                    COALESCE(SUM(CASE WHEN status = 'paid' THEN total_price ELSE 0 END),0) AS paid_spend,
                    COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_price ELSE 0 END),0) AS refunded_spend
                FROM webshop_orders WHERE account_name = ? AND server_id = ? AND created_at >= ? AND created_at < ?");
            $today_stmt->execute(array($_SESSION['username'], (string)$_SESSION['server_id'], $today_start, $today_end));
            $today = $today_stmt->fetch(PDO::FETCH_ASSOC) ?: array();

            $daily_stmt = $conn_web->prepare("SELECT DATE(o.created_at) AS spend_date,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_price ELSE 0 END),0) AS paid_spend,
                    COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN o.total_price ELSE 0 END),0) AS refunded_spend
                FROM webshop_orders o WHERE $where
                GROUP BY DATE(o.created_at) ORDER BY spend_date DESC LIMIT 62");
            $daily_stmt->execute($params);
            $daily = array();
            foreach ($daily_stmt->fetchAll(PDO::FETCH_ASSOC) as $day_row) {
                $paid = isset($day_row['paid_spend']) ? (string)$day_row['paid_spend'] : '0';
                $refunded = isset($day_row['refunded_spend']) ? (string)$day_row['refunded_spend'] : '0';
                $daily[] = array(
                    'date' => isset($day_row['spend_date']) ? (string)$day_row['spend_date'] : '',
                    'order_count' => intval(isset($day_row['order_count']) ? $day_row['order_count'] : 0),
                    'paid_spend' => $paid,
                    'refunded_spend' => $refunded,
                    'net_spend' => webshop_spend_subtract_unsigned($paid, $refunded)
                );
            }

            $rows_sql = "SELECT o.id, o.created_at, o.shop_item_id, o.item_id,
                    o.quantity, o.unit_price, o.total_price, o.status, o.reward_snapshot,
                    COALESCE(NULLIF(si.item_name, ''), '') AS item_name,
                    COALESCE(si.image_url, '') AS image_url,
                    COALESCE(si.item_amount, 1) AS item_amount
                FROM webshop_orders o
                LEFT JOIN webshop_items si ON si.id = o.shop_item_id
                WHERE $where ORDER BY o.created_at DESC, o.id DESC
                LIMIT $limit OFFSET $offset";
            $rows_stmt = $conn_web->prepare($rows_sql);
            $rows_stmt->execute($params);
            $rows = array();
            foreach ($rows_stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $rows[] = webshop_spend_row_for_user($row);

            $paid_spend = isset($summary['paid_spend']) ? (string)$summary['paid_spend'] : '0';
            $refunded_spend = isset($summary['refunded_spend']) ? (string)$summary['refunded_spend'] : '0';
            $today_paid = isset($today['paid_spend']) ? (string)$today['paid_spend'] : '0';
            $today_refunded = isset($today['refunded_spend']) ? (string)$today['refunded_spend'] : '0';
            api_exit('success', '', array(
                'data' => $rows,
                'summary' => array(
                    'order_count' => $total,
                    'paid_spend' => $paid_spend,
                    'refunded_spend' => $refunded_spend,
                    'net_spend' => webshop_spend_subtract_unsigned($paid_spend, $refunded_spend),
                    'failed_count' => intval(isset($summary['failed_count']) ? $summary['failed_count'] : 0),
                    'paid_packages' => isset($summary['paid_packages']) ? (string)$summary['paid_packages'] : '0'
                ),
                'today' => array(
                    'order_count' => intval(isset($today['order_count']) ? $today['order_count'] : 0),
                    'paid_spend' => $today_paid,
                    'refunded_spend' => $today_refunded,
                    'net_spend' => webshop_spend_subtract_unsigned($today_paid, $today_refunded)
                ),
                'daily' => $daily,
                'range' => $range,
                'status_filter' => $status_filter,
                'total_pages' => max(1, intval(ceil($total / $limit))),
                'current_page' => $page,
                'total' => $total
            ));
        } catch (InvalidArgumentException $e) {
            api_exit('error', $e->getMessage());
        } catch (Exception $e) {
            api_log_error('get_my_webshop_spend_history', $e);
            api_exit('error', 'Không đọc được lịch sử tiêu Xu lúc này.');
        }
        break;

    case 'check_vip_voucher':
        require_login();
        require_api_rate('check_vip_voucher', 20, 60);
        if (!web_setting_enabled('vip_enabled')) api_exit('error', 'Donate VIP đang tạm đóng.');
        $voucher_code = isset($_POST['voucher_code']) ? normalize_vip_voucher_code($_POST['voucher_code']) : '';
        if ($voucher_code === '') {
            api_exit('success', '', array('code' => '', 'base_amount' => vip_base_amount(), 'discount_amount' => 0, 'final_amount' => vip_base_amount()));
        }
        $voucher = vip_voucher_lookup($voucher_code);
        if (!$voucher) api_exit('error', 'Mã giảm giá không hợp lệ, đã hết lượt hoặc đã hết hạn.');
        api_exit('success', 'Áp mã giảm giá thành công.', array(
            'code' => $voucher['code'],
            'base_amount' => vip_base_amount(),
            'discount_amount' => vip_voucher_discount($voucher),
            'final_amount' => vip_amount_after_voucher($voucher)
        ));
        break;

    case 'activate_vip':
        require_login();
        require_api_rate('activate_vip', 5, 60);
        if (!web_setting_enabled('vip_enabled')) api_exit('error', 'Donate VIP đang tạm đóng.');
        $auth_code = isset($_POST['auth_code']) ? trim((string)$_POST['auth_code']) : '';
        if ($auth_code === '') api_exit('error', 'Vui lòng nhập mã kích hoạt.');
        try {
            $conn_web->beginTransaction();
            $stmt = $conn_web->prepare('SELECT id, vip_type FROM auth_codes WHERE code = ? AND is_used = 0 AND is_active = 1 LIMIT 1 FOR UPDATE');
            $stmt->execute(array($auth_code));
            $code_data = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$code_data) {
                $conn_web->rollBack();
                api_exit('error', 'Mã không hợp lệ hoặc đã được dùng.');
            }
            $update_stmt = $conn_web->prepare('UPDATE auth_codes SET is_used = 1, used_by_account = ?, used_server_id = ?, used_at = NOW() WHERE id = ? AND is_used = 0 AND is_active = 1');
            $update_stmt->execute(array($_SESSION['username'], $_SESSION['server_id'], $code_data['id']));
            if ($update_stmt->rowCount() !== 1) {
                $conn_web->rollBack();
                api_exit('error', 'Mã vừa được sử dụng, vui lòng thử mã khác.');
            }
            $new_vip = max(vht6ur_vip_level($_SESSION['username']), intval($code_data['vip_type']));
            $conn_web->prepare('UPDATE account SET vip_level = ? WHERE account = ?')->execute(array($new_vip, $_SESSION['username']));
            $conn_web->commit();
            $_SESSION['vip_level'] = $new_vip;
            $sync_error = '';
            if (!vht6ur_sdk_sync_vip($_SESSION['username'], isset($_SESSION['sdk_user_id']) ? $_SESSION['sdk_user_id'] : '', $new_vip, $sync_error)) {
                system_event_log('vip', 'error', 'partial', 'sync_vip', 'Đã kích hoạt VIP web nhưng chưa đồng bộ entitlement.', $sync_error, $_SESSION['username'], $_SESSION['server_id']);
                api_exit('error', 'Mã đã kích hoạt nhưng quyền tài khoản chưa đồng bộ. Hãy liên hệ quản trị viên.', array('vip_level' => $new_vip));
            }
            api_exit('success', 'Kích hoạt VIP ' . $new_vip . ' thành công.', array('vip_level' => $new_vip));
        } catch (Exception $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            api_log_error('activate_vip', $e);
            api_exit('error', 'Không thể kích hoạt mã lúc này.');
        }
        break;

    case 'buy_shop_item':
        require_login();
        require_api_rate('buy_shop_item',10,60);
        if(!web_setting_enabled('webshop_enabled'))api_exit('error','Webshop đang tạm đóng.');
        $role_error='';$role=hk_default_session_role($role_error);
        if(!$role)api_exit('error',$role_error);
        try {
            $result=lhs_shop_purchase($conn_web,(string)$_SESSION['username'],(string)$_SESSION['server_id'],$role,
                isset($_POST['shop_item_id'])?(int)$_POST['shop_item_id']:0,
                isset($_POST['quantity'])?$_POST['quantity']:1,
                isset($_POST['request_key'])?$_POST['request_key']:'');
            api_exit('success',$result['delivered']?'Đã giao toàn bộ vật phẩm. Vui lòng kiểm tra thư.':'Xu đã được giữ cho đơn này; đang chờ xác nhận giao. Bấm kiểm tra lại đơn, không mua đơn mới.',$result);
        } catch(InvalidArgumentException $e) { api_exit('error',$e->getMessage()); }
        catch(Exception $e) { api_log_error('buy_shop_item',$e);api_exit('error','Chưa xác định kết quả đơn. Giữ nguyên mã giao dịch và bấm lại để đối soát; không tạo đơn mới.'); }
        break;

    case 'retry_webshop_order':
        require_login();require_api_rate('retry_webshop_order',10,60);
        $role_error='';$role=hk_default_session_role($role_error);if(!$role)api_exit('error',$role_error);
        try{
            $stmt=$conn_web->prepare('SELECT * FROM webshop_orders WHERE id=? AND account_name=? AND server_id=? LIMIT 1');
            $stmt->execute(array((int)$_POST['order_id'],$_SESSION['username'],$_SESSION['server_id']));$order=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$order||(string)$order['role_id']!==(string)gm_role_id($role))api_exit('error','Đơn không thuộc nhân vật này.');
            $result=lhs_shop_dispatch($conn_web,$order,$role);
            api_exit('success',$result['delivered']?'Đã giao đủ vật phẩm của đơn.':'Đơn còn chờ giao; không trừ thêm Xu.',$result);
        }catch(Exception $e){api_log_error('retry_webshop_order',$e);api_exit('error','Đơn vẫn được giữ để đối soát, chưa trừ thêm Xu.');}
        break;

    case 'claim_recharge_milestone':
        require_login();
        require_api_rate('claim_recharge_milestone', 8, 60);
        $delivery_id = isset($_POST['delivery_id']) ? (int)$_POST['delivery_id'] : 0;
        try {
            if ($delivery_id > 0) {
                $result = lhs_reward_retry($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'recharge');
            } else {
                if (!web_setting_enabled('recharge_rewards_enabled')) api_exit('error', 'Tích Donate đang tạm đóng.');
                $role_error = '';
                $role = hk_default_session_role($role_error);
                if (!$role) api_exit('error', $role_error);
                $milestone_id = isset($_POST['milestone_id']) ? (int)$_POST['milestone_id'] : 0;
                $delivery = lhs_reward_reserve_recharge($conn_web, $_SESSION['username'], $_SESSION['server_id'], $milestone_id, $role);
                $result = lhs_reward_dispatch($conn_web, $delivery);
            }
            api_exit('success', $result['message'], $result);
        } catch (InvalidArgumentException $e) {
            api_exit('error', $e->getMessage());
        } catch (Exception $e) {
            api_log_error('claim_recharge_milestone', $e);
            api_exit('error', 'Chưa hoàn tất nhận quà Donate. Kiểm tra mục Quà chờ giao để đối soát, không tạo yêu cầu mới.');
        }
        break;

    case 'claim_recharge_event_milestone':
        require_login();
        require_api_rate('claim_recharge_event_milestone', 8, 60);
        $delivery_id = isset($_POST['delivery_id']) ? (int)$_POST['delivery_id'] : 0;
        try {
            if ($delivery_id > 0) {
                $delivery = lhs_reward_find($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'recharge');
                if (!$delivery || strpos((string)$delivery['claim_period'], 'event:') !== 0) api_exit('error', 'Đơn quà sự kiện không hợp lệ.');
                $result = lhs_reward_retry($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'recharge');
            } else {
                $role_error = '';
                $role = hk_default_session_role($role_error);
                if (!$role) api_exit('error', $role_error);
                $event_id = isset($_POST['event_id']) ? (int)$_POST['event_id'] : 0;
                $tier_id = isset($_POST['tier_id']) ? (int)$_POST['tier_id'] : 0;
                $delivery = lhs_event_reserve($conn_web, $_SESSION['username'], $_SESSION['server_id'], $event_id, $tier_id, $role);
                $result = lhs_reward_dispatch($conn_web, $delivery);
            }
            api_exit('success', $result['message'], $result);
        } catch (InvalidArgumentException $e) {
            api_exit('error', $e->getMessage());
        } catch (Throwable $e) {
            api_log_error('claim_recharge_event_milestone', $e);
            api_exit('error', 'Chưa hoàn tất nhận quà sự kiện. Kiểm tra Quà đang chờ giao để đối soát, không tạo yêu cầu mới.');
        }
        break;

    case 'claim_daily_checkin':
        require_login();
        require_api_rate('claim_daily_checkin', 5, 60);
        if (!web_setting_enabled('daily_checkin_enabled')) api_exit('error', 'Điểm danh hôm nay đang tạm đóng.');
        $reward_choice = isset($_POST['reward_choice']) ? trim((string)$_POST['reward_choice']) : 'xu';
        if (!in_array($reward_choice, array('xu','spin'), true)) api_exit('error', 'Lựa chọn quà điểm danh không hợp lệ.');
        if ($reward_choice === 'spin') {
            if (!lucky_wheel_enabled()) api_exit('error', 'Vòng Quay May Mắn hiện đang tạm đóng.');
            if (count(lucky_wheel_active_prizes()) < 1) api_exit('error', 'Vòng Quay May Mắn chưa có phần thưởng hoạt động.');
        }
        try {
            $result = lhs_daily_checkin_claim_choice($conn_web, $_SESSION['username'], $_SESSION['server_id'], $reward_choice, daily_checkin_reward_xu());
            if ($result['duplicate']) api_exit('error', 'Tài khoản đã điểm danh hôm nay. Mỗi ngày chỉ nhận một lần trên tất cả máy chủ.', $result);
            api_exit('success', $reward_choice === 'spin' ? 'Điểm danh thành công. Bạn nhận được 1 lượt Vòng Quay May Mắn tại máy chủ hiện tại.' : ('Điểm danh thành công. Bạn nhận được ' . number_format($result['reward_xu']) . ' Xu Web.'), $result);
        } catch (Throwable $e) {
            api_log_error('claim_daily_checkin', $e);
            api_exit('error', $e instanceof InvalidArgumentException ? $e->getMessage() : 'Lỗi hệ thống khi điểm danh, vui lòng thử lại sau.');
        }
        break;

    case 'spin_lucky_wheel':
        require_login();
        require_api_rate('spin_lucky_wheel', 8, 60);
        $request_key = isset($_POST['request_key']) && is_string($_POST['request_key']) ? $_POST['request_key'] : '';
        if (!preg_match('/^[a-f0-9]{32,64}$/D', $request_key)) api_exit('error','Hãy tải lại trang để dùng mã quay an toàn.');
        $spin_token = hash('sha256', json_encode(array('wheel-v2',(string)$_SESSION['username'],(string)$_SESSION['server_id'],$request_key)));
        $role_error = ''; $role = hk_default_session_role($role_error);
        if (!$role) api_exit('error', $role_error);
        try {
            $conn_web->beginTransaction();
            // All wallet operations lock account before its server-specific spin balance.
            $stmt = $conn_web->prepare('SELECT ptb,status FROM account WHERE account=? FOR UPDATE');
            $stmt->execute(array($_SESSION['username'])); $wallet = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$wallet || $wallet['status'] !== 'active') throw new InvalidArgumentException('Tài khoản không khả dụng.');
            $available_before = lucky_wheel_balance_for_update($_SESSION['username'], $_SESSION['server_id']);
            $stmt = $conn_web->prepare('SELECT * FROM lucky_wheel_spins WHERE spin_token=? AND account_name=? AND server_id=? FOR UPDATE');
            $stmt->execute(array($spin_token,$_SESSION['username'],$_SESSION['server_id'])); $existing = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                $existing['id'] = $existing['prize_id']; $existing['title'] = $existing['prize_title'];
                $conn_web->commit();
                api_exit('success','Đã đối soát lượt quay cũ, không trừ thêm lượt.',array('replayed'=>true,'prize'=>lucky_wheel_prize_snapshot($existing),'spin_token'=>$spin_token,'available_spins'=>$available_before,'delivery_status'=>$existing['delivery_status'],'xu_web'=>(int)$wallet['ptb']));
            }
            if (!lucky_wheel_enabled()) throw new InvalidArgumentException('Vòng Quay May Mắn hiện đang tạm đóng.');
            $prize = lucky_wheel_pick_prize(lucky_wheel_active_prizes());
            if (!$prize) throw new RuntimeException('Chưa có phần thưởng Vòng Quay May Mắn hợp lệ.');
            if ($available_before < 1) throw new RuntimeException('Tài khoản chưa có lượt quay. Điểm danh hoặc Donate để nhận thêm lượt.');
            $snapshot = lucky_wheel_prize_snapshot($prize);
            if ($snapshot['xu_amount'] > PHP_INT_MAX - (int)$wallet['ptb']) throw new RuntimeException('Số dư vượt giới hạn.');
            $mail_event_key = $snapshot['prize_type'] === 'item' ? ('lucky_wheel_spin:' . $spin_token) : null;
            $delivery_status = $snapshot['prize_type'] === 'item' ? 'pending' : 'delivered';
            $stmt = $conn_web->prepare('INSERT INTO lucky_wheel_spins(spin_token,account_name,server_id,prize_id,prize_title,prize_type,xu_amount,item_id,item_amount,delivery_status,mail_event_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute(array($spin_token,$_SESSION['username'],$_SESSION['server_id'],$snapshot['id'],$snapshot['title'],$snapshot['prize_type'],$snapshot['xu_amount'],$snapshot['item_id'],$snapshot['item_amount'],$delivery_status,$mail_event_key));
            $spin_id = (int)$conn_web->lastInsertId();
            $stmt = $conn_web->prepare('UPDATE lucky_wheel_balances SET spins_available=spins_available-1 WHERE account_name=? AND server_id=? AND spins_available>0');
            $stmt->execute(array($_SESSION['username'],lucky_wheel_scope($_SESSION['server_id'])));
            if ($stmt->rowCount() !== 1) throw new RuntimeException('Lượt quay đã thay đổi, vui lòng thử lại.');
            $stmt = $conn_web->prepare("INSERT INTO lucky_wheel_spin_ledger(account_name,server_id,direction,source,spin_change,event_key,details) VALUES(?,?, 'debit','spin',-1,?,?)");
            $stmt->execute(array($_SESSION['username'],lucky_wheel_scope($_SESSION['server_id']),'lucky_wheel_spin:' . $spin_token,$snapshot['title']));
            $new_xu = null;
            if ($snapshot['prize_type'] === 'xu') {
                $stmt = $conn_web->prepare('UPDATE account SET ptb=ptb+? WHERE account=? AND status=\'active\'');
                $stmt->execute(array($snapshot['xu_amount'],$_SESSION['username']));
                if ($stmt->rowCount() !== 1) throw new RuntimeException('Không thể cộng Xu phần thưởng.');
                $stmt = $conn_web->prepare('SELECT ptb FROM account WHERE account=? LIMIT 1'); $stmt->execute(array($_SESSION['username'])); $new_xu=(int)$stmt->fetchColumn();
            }
            gm_audit_log(gm_role_id($role),'lucky_wheel_spin','Spin #' . $spin_id . ' => ' . $snapshot['title']);
            $conn_web->commit();
            $delivery_error = '';
            if ($snapshot['prize_type'] === 'item') {
                $spin = array('id'=>$spin_id,'prize_type'=>'item','item_id'=>$snapshot['item_id'],'item_amount'=>$snapshot['item_amount'],'prize_title'=>$snapshot['title'],'mail_event_key'=>$mail_event_key);
                if (lucky_wheel_attempt_item_delivery($spin,$role,$delivery_error)) $delivery_status='delivered';
            }
            $message = $delivery_status === 'delivered' ? ('Chúc mừng! Bạn nhận được ' . $snapshot['title'] . '.') : ('Bạn đã quay trúng ' . $snapshot['title'] . '. Phần thưởng đang chờ gửi thư, bạn có thể bấm nhận lại an toàn.');
            api_exit('success',$message,array('prize'=>$snapshot,'spin_token'=>$spin_token,'available_spins'=>$available_before-1,'delivery_status'=>$delivery_status,'delivery_error'=>$delivery_status==='pending'?$delivery_error:'','xu_web'=>$new_xu));
        } catch (Throwable $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            api_log_error('spin_lucky_wheel',$e);
            api_exit('error',$e instanceof InvalidArgumentException ? $e->getMessage() : 'Chưa xác nhận được lượt quay. Giữ mã hiện tại và bấm kiểm tra lại; không tạo yêu cầu mới.');
        }
        break;

    case 'get_lucky_wheel_state':
        require_login();
        try {
            $stmt = $conn_web->prepare("SELECT spin_token,prize_title,prize_type,xu_amount,item_id,item_amount,delivery_status,created_at FROM lucky_wheel_spins WHERE account_name=? AND server_id=? ORDER BY (delivery_status='pending') DESC,id DESC LIMIT 50");
            $stmt->execute(array($_SESSION['username'],$_SESSION['server_id']));
            api_exit('success','',array('available_spins'=>lucky_wheel_available_spins($_SESSION['username'],$_SESSION['server_id']),'history'=>$stmt->fetchAll(PDO::FETCH_ASSOC)));
        } catch (Throwable $e) { api_log_error('get_lucky_wheel_state',$e); api_exit('error','Chưa đọc được lịch sử quay.'); }
        break;

    case 'retry_lucky_wheel_prize':
        require_login();
        require_api_rate('retry_lucky_wheel_prize',5,60);
        $spin_token = isset($_POST['spin_token']) ? trim((string)$_POST['spin_token']) : '';
        if (!preg_match('/^[a-f0-9]{40,64}$/',$spin_token)) api_exit('error','Mã phần thưởng không hợp lệ.');
        $stmt = $conn_web->prepare("SELECT * FROM lucky_wheel_spins WHERE spin_token=? AND account_name=? AND server_id=? AND prize_type='item' AND delivery_status='pending' LIMIT 1");
        $stmt->execute(array($spin_token,$_SESSION['username'],$_SESSION['server_id'])); $spin=$stmt->fetch(PDO::FETCH_ASSOC);
        if (!$spin) api_exit('error','Không tìm thấy phần thưởng đang chờ gửi.');
        $role_error = ''; $role = hk_default_session_role($role_error); if (!$role) api_exit('error',$role_error);
        $delivery_error=''; if (!lucky_wheel_attempt_item_delivery($spin,$role,$delivery_error)) api_exit('error',($delivery_error !== '' ? $delivery_error . ' ' : '') . 'Phần thưởng vẫn được giữ, hãy thử lại sau.');
        gm_audit_log(gm_role_id($role),'lucky_wheel_retry_delivery','Đã gửi lại spin #' . (int)$spin['id']);
        api_exit('success','Phần thưởng đã được gửi qua thư trong game.',array('spin_token'=>$spin_token,'delivery_status'=>'delivered'));
        break;

    case 'get_pending_rewards':
        require_login();
        try {
            $pending = lhs_reward_pending_for_account($conn_web, $_SESSION['username'], $_SESSION['server_id']);
            api_exit('success', '', array('data' => $pending, 'count' => count($pending)));
        } catch (Throwable $e) {
            api_log_error('get_pending_rewards', $e);
            api_exit('error', 'Chưa tải được quà đang chờ giao. Vui lòng thử lại sau.');
        }
        break;

    case 'exchange_coins':
        require_login();
        api_exit('error', 'Tính năng Xu Web đã tắt. Vui lòng dùng Webshop.');
        break;

    case 'link_phone':
        require_login();
        require_api_rate('link_phone', 5, 60);
        $phone = isset($_POST['phone']) ? trim((string)$_POST['phone']) : '';
        $password = isset($_POST['password']) ? trim((string)$_POST['password']) : '';
        if (!preg_match('/^[0-9]{9,12}$/', $phone)) api_exit('error', 'Số điện thoại không hợp lệ.');
        $user = hk_find_account_by_id($_SESSION['uin']);
        if (!$user || !hk_verify_password($password, $user)) api_exit('error', 'Mật khẩu hiện tại không đúng.');
        try {
            $stmt = $conn_web->prepare("INSERT INTO account_phones(account_name, phone) VALUES(?, ?) ON DUPLICATE KEY UPDATE phone = VALUES(phone)");
            $stmt->execute(array($_SESSION['username'], $phone));
            $masked_phone = str_repeat('*', max(0, strlen($phone) - 2)) . substr($phone, -2);
            api_exit('success', 'Đã liên kết số điện thoại.', array('phone_masked' => $masked_phone));
        } catch (Exception $e) {
            api_log_error('link_phone', $e);
            api_exit('error', 'Không thể liên kết số điện thoại lúc này.');
        }
        break;

    case 'recover_password_by_phone':
        api_exit('error', 'Khôi phục mật khẩu tự động đang tắt để bảo vệ tài khoản. Vui lòng liên hệ quản trị viên để xác minh thủ công.');
        break;

    case 'change_password':
        require_login();
        require_api_rate('change_password', 5, 60);
        $old_password = isset($_POST['old_password']) ? trim((string)$_POST['old_password']) : '';
        $new_password = isset($_POST['new_password']) ? trim((string)$_POST['new_password']) : '';
        $re_password = isset($_POST['re_password']) ? trim((string)$_POST['re_password']) : '';
        if ($new_password === '' || strlen($new_password) < 8) api_exit('error', 'Mật khẩu mới cần tối thiểu 8 ký tự.');
        if ($new_password !== $re_password) api_exit('error', 'Mật khẩu nhập lại không khớp.');
        $user = hk_find_account_by_id($_SESSION['uin']);
        if (!$user || !hk_verify_password($old_password, $user)) api_exit('error', 'Mật khẩu cũ không đúng.');
        try {
            hk_update_password($_SESSION['uin'], $new_password);
            api_exit('success', 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
        } catch (Exception $e) {
            api_log_error('change_password', $e);
            api_exit('error', $e instanceof RuntimeException ? $e->getMessage() : 'Không thể đổi mật khẩu lúc này.');
        }
        break;

    case 'submit_giftcode':
        require_login();
        require_api_rate('giftcode', 10, 60);
        $delivery_id = isset($_POST['delivery_id']) ? (int)$_POST['delivery_id'] : 0;
        try {
            if ($delivery_id > 0) {
                $result = lhs_reward_retry($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'giftcode');
                $delivery = lhs_reward_find($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'giftcode');
            } else {
                $role_error = '';
                $role = hk_default_session_role($role_error);
                if (!$role) api_exit('error', $role_error);
                $giftcode = isset($_POST['giftcode']) ? $_POST['giftcode'] : '';
                $delivery = lhs_reward_reserve_gift($conn_web, $_SESSION['username'], $_SESSION['server_id'], $giftcode, $role);
                $result = lhs_reward_dispatch($conn_web, $delivery);
            }
            $snapshot = json_decode($delivery['reward_snapshot'], true);
            $result['code_claimed'] = isset($snapshot['code']) ? $snapshot['code'] : '';
            $result['giftcode_id'] = (int)$delivery['source_id'];
            $stmt = $conn_web->prepare('SELECT used_count,max_uses FROM giftcodes WHERE id=? LIMIT 1');
            $stmt->execute(array($delivery['source_id']));
            $gift_status = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($gift_status) { $result['used_count'] = (int)$gift_status['used_count']; $result['max_uses'] = (int)$gift_status['max_uses']; }
            api_exit('success', $result['message'], $result);
        } catch (InvalidArgumentException $e) {
            api_exit('error', $e->getMessage());
        } catch (Exception $e) {
            api_log_error('submit_giftcode', $e);
            api_exit('error', 'Chưa hoàn tất nhận giftcode. Kiểm tra mục Quà chờ giao để đối soát, không tạo yêu cầu mới.');
        }
        break;

    case 'send_gm_action':
        require_login();
        require_api_rate('send_gm_action', 6, 60);
        if (!web_setting_enabled('gm_tools_enabled')) api_exit('error', 'Tiện ích nhân vật đang tạm đóng.');

        $gm_type = isset($_POST['gm_type']) ? trim((string)$_POST['gm_type']) : '';
        $role_error = '';
        $role = hk_default_session_role($role_error);
        if (!$role) api_exit('error', $role_error);
        $role_id = gm_role_id($role);

        $item_id = '';
        $amount = 1;
        $equip_level = 0;
        $required_vip = 0;
        if ($gm_type === 'item') {
            $item_id = isset($_POST['item_id']) ? trim((string)$_POST['item_id']) : '';
            $amount = isset($_POST['amount']) ? intval($_POST['amount']) : 1;
            $equip_level = isset($_POST['equip_level']) ? intval($_POST['equip_level']) : 0;
            if ($item_id === '') api_exit('error', 'Chưa chọn vật phẩm.');
            if (!preg_match('/^item_[0-9]+(?:_[0-9]+)?$/', $item_id)) api_exit('error', 'Dữ liệu vật phẩm GM không hợp lệ.');
            if (!hk_reward_exists($item_id)) api_exit('error', 'Vật phẩm không hợp lệ.');
            if ($amount < 1) $amount = 1;
            $required_vip = 2;
        } elseif ($gm_type === 'clear_mail') {
            $required_vip = 1;
        } elseif ($gm_type === 'clear_bag') {
            $required_vip = 1;
        } else {
            api_exit('error', 'Lệnh không hợp lệ.');
        }

        $vip_level = 0;
        try {
            $vip_level = vht6ur_vip_level($_SESSION['username']);
            $_SESSION['vip_level'] = $vip_level;
        } catch (Exception $e) {}
        if ($vip_level < $required_vip) {
            api_exit('error', 'Chức năng này yêu cầu VIP ' . $required_vip . '.');
        }

        if ($gm_type === 'clear_mail') {
            $clear_error = '';
            if (!vht6ur_sdk_player_clear_mail($role_id, gm_role_name($role), intval(isset($role['world_id']) ? $role['world_id'] : $_SESSION['server_id']), $clear_error)) {
                api_exit('error', $clear_error ? $clear_error : 'Không thể dọn hòm thư lúc này.');
            }
            gm_audit_log($role_id, 'clear_mail', 'Người chơi tự dọn thư đã đọc và đã nhận qua API Linh Họa Sư');
            api_exit('success', 'Dọn hòm thư thành công. Vui lòng kiểm tra lại trong game.');
        } elseif ($gm_type === 'clear_bag') {
            $clear_error = '';
            if (!vht6ur_sdk_player_clear_bag($role_id, gm_role_name($role), (string)(isset($role['world_id']) ? $role['world_id'] : $_SESSION['server_id']), $clear_error)) {
                api_exit('error', $clear_error ? $clear_error : 'Không thể dọn balo lúc này.');
            }
            gm_audit_log($role_id, 'clear_bag', 'Người chơi dọn vật phẩm thường, giữ tiền tệ và vật phẩm hệ thống');
            api_exit('success', 'Dọn balo thành công; tiền tệ và vật phẩm hệ thống được giữ lại.');
        } else {
            $send_error = '';
            $send_ok = gm_send_item_mail_by_role($role_id, $_SESSION['server_id'], $item_id, $amount, $equip_level, $send_error, 'GM Linh Hoa Su');
            if (!$send_ok) api_exit('error', $send_error ? $send_error : 'Gửi đồ thất bại.');

            $details = hk_clean_reward_id($item_id) . ' x ' . $amount;
            gm_audit_log($role_id, 'send_item', $details);
            api_exit('success', 'Gửi thành công. Vui lòng kiểm tra thư trong game.');
        }
        break;

    default:
        api_exit('error', 'Action không hợp lệ.');
}
?>
