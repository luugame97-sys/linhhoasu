<?php
define('LHS_API_REQUEST', true);
require_once '../config.php';
require_once '../web_context.php';
require_once '../admin_management.php';
header('Content-Type: application/json; charset=utf-8');
lhs_web_private_headers();

/* PHP 5.6 trên VPS chưa có random_bytes(); dùng OpenSSL/entropy fallback
 * để các thao tác tạo giftcode, VIP và upload vẫn hoạt động. */
function admin_random_bytes($length) {
    $length = max(1, (int)$length);
    if (function_exists('random_bytes')) return random_bytes($length);
    if (function_exists('openssl_random_pseudo_bytes')) {
        $strong = false;
        $bytes = openssl_random_pseudo_bytes($length, $strong);
        if ($bytes !== false && strlen($bytes) === $length) return $bytes;
    }
    $bytes = '';
    while (strlen($bytes) < $length) $bytes .= hash('sha256', uniqid(mt_rand(), true), true);
    return substr($bytes, 0, $length);
}

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || !isset($_SESSION['role']) || $_SESSION['role'] !== 'admin' || !current_session_is_admin()) {
    echo json_encode(array('status' => 'error', 'message' => 'Không có quyền truy cập.', 'reload_required' => 1), JSON_UNESCAPED_UNICODE);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') admin_exit('error', 'Phương thức yêu cầu không hợp lệ.');
if (!csrf_validate_request()) admin_exit('error', 'Phiên thao tác đã hết hạn, vui lòng tải lại trang.', array('reload_required' => 1, 'code' => 'STALE_SESSION_CONTEXT'));
if (!lhs_web_session_valid()) admin_exit('error', 'Máy chủ của phiên không còn hợp lệ. Vui lòng đăng nhập lại.', array('login_required' => 1, 'code' => 'INVALID_SERVER_CONTEXT'));
if (!lhs_web_context_matches_request()) admin_exit('error', 'Tài khoản hoặc máy chủ đã thay đổi. Vui lòng tải lại trang trước khi thao tác.', array('context_changed' => 1, 'reload_required' => 1, 'code' => 'STALE_SESSION_CONTEXT'));
vht6ur_login_required();
if (!isset($_SERVER['HTTP_X_LHS_ADMIN_UI']) || $_SERVER['HTTP_X_LHS_ADMIN_UI'] !== '20260907') {
    admin_exit('error','Khu vực quản trị đã được cập nhật. Vui lòng tải lại trang.',array('reload_required'=>1));
}

$current_server_id = (string)$_SESSION['server_id'];

function admin_exit($status, $message = '', $extra = array()) {
    if ($message !== '') $message = web_message_vi($message);
    echo json_encode(array_merge(array('status' => $status, 'message' => $message), $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

function admin_require_rate($bucket, $limit, $seconds) {
    if (api_rate_limit_exceeded('admin_' . $bucket, $limit, $seconds)) {
        admin_exit('error', 'Thao tác quá nhanh, vui lòng thử lại sau.');
    }
}

function admin_log($target_role_id, $action, $details) {
    global $conn_web, $current_server_id;
    try {
        $stmt = $conn_web->prepare("INSERT INTO gm_logs(account_name, server_id, target_role_id, action, details) VALUES(?, ?, ?, ?, ?)");
        $stmt->execute(array($_SESSION['username'], $current_server_id, $target_role_id, $action, $details));
    } catch (Exception $e) {}
}

function admin_parse_reward_json($json, $limit = 20) {
    $json = trim((string)$json);
    if ($json === '') return '';
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) return '';
    $limit = min(250, max(1, (int)$limit));
    $items = new stdClass();
    foreach ($decoded as $key => $value) {
        // Delivery is chunked into batches of 20 later; keep the editor limit
        // aligned with reward_delivery.php (250 distinct items), so editing a
        // large existing code cannot silently drop rewards after save.
        if (count(get_object_vars($items)) >= $limit) break;
        if (is_array($value)) {
            $item = hk_clean_reward_id(isset($value['item_id']) ? $value['item_id'] : (isset($value['id']) ? $value['id'] : ''));
            $amount = intval(isset($value['amount']) ? $value['amount'] : 0);
        } else {
            $item = hk_clean_reward_id($key);
            $amount = intval($value);
        }
        if ($item !== '' && $amount > 0 && $amount <= 999999 && hk_reward_exists($item)) $items->{$item} = $amount;
    }
    return count(get_object_vars($items)) > 0 ? json_encode($items, JSON_UNESCAPED_UNICODE) : '';
}

function admin_server_view($server_id) {
    $server_id = trim((string)$server_id);
    $server = $server_id !== '' ? gm_get_server($server_id) : false;
    return array(
        'server_id' => $server_id,
        'server_name' => $server ? (string)$server['name'] : ($server_id !== '' ? ('Server ' . $server_id) : 'Không gắn server'),
    );
}

function admin_enrich_player_identity($row, &$cache) {
    $server_id = trim((string)(isset($row['server_id']) ? $row['server_id'] : ''));
    $account = trim((string)(isset($row['account_name']) ? $row['account_name'] : ''));
    $role_id = trim((string)(isset($row['role_id']) ? $row['role_id'] : (isset($row['target_role_id']) ? $row['target_role_id'] : '')));
    $view = admin_server_view($server_id);
    $row['server_name'] = $view['server_name'];
    $row['role_id'] = $role_id;
    $row['role_name'] = '';
    $row['player_account'] = '';
    $row['identity_verified'] = 0;
    $row['identity_kind'] = 'unresolved';
    $row['identity_label'] = 'Không đủ dữ liệu để xác định nhân vật';
    if ($role_id === '' && !in_array(isset($row['source']) ? $row['source'] : '', array('sepay', 'login'), true)) return $row;
    if ($role_id === '' && isset($row['status']) && in_array($row['status'], array('failed','ignored'), true)) return $row;
    if ($server_id === '' || !gm_get_server($server_id)) return $row;

    $cache_key = $server_id . '|' . ($role_id !== '' ? ('uid:' . $role_id) : ('account:' . strtolower($account)));
    if (!array_key_exists($cache_key, $cache)) {
        $role = false;
        if ($role_id !== '') $role = lhs_find_role($role_id, $server_id, null, true);
        elseif ($account !== '') {
            $roles = hk_roles_for_account('', $account, $server_id);
            if (count($roles) === 1) $role = $roles[0];
        }
        $cache[$cache_key] = $role ?: false;
    }
    $role = $cache[$cache_key];
    if ($role) {
        $row['role_id'] = gm_role_id($role);
        $row['role_name'] = gm_role_name($role, 'Nhân vật');
        $row['player_account'] = isset($role['account_id']) ? (string)$role['account_id'] : '';
        $row['identity_verified'] = 1;
        $row['identity_kind'] = $role_id !== '' ? 'exact_uid_current_name' : 'account_current_role';
        $row['identity_label'] = $role_id !== '' ? 'Tên hiện tại của UID trong log' : 'Nhân vật hiện tại của tài khoản; log không lưu UID';
    }
    return $row;
}

function admin_game_ban_call($path, $payload, &$error = '') {
    try {
        $result = lhs_internal_account_ban($path, $payload);
        if (!$result['success']) {
            $data = isset($result['data']) && is_array($result['data']) ? $result['data'] : array();
            $error = lhs_message_vi(isset($data['error']) ? $data['error'] : '', isset($data['message']) ? $data['message'] : '', 'Game không phản hồi yêu cầu khóa tài khoản.');
            return false;
        }
        return isset($result['data']) && is_array($result['data']) ? $result['data'] : array();
    } catch (Exception $e) {
        $error = $e->getMessage();
        return false;
    }
}

function admin_game_ban_payload($account, $uin = '') {
    $account = trim((string)$account);
    $uin = trim((string)$uin);
    if ($account !== '') return array('accountId' => $account);
    if ($uin !== '') return array('userId' => $uin);
    return array();
}

function admin_decode_ban_meta($raw) {
    $meta = is_array($raw) ? $raw : json_decode((string)$raw, true);
    return is_array($meta) ? $meta : array();
}

function admin_lock_message_original($reason, $meta) {
    $meta = admin_decode_ban_meta($meta);
    foreach (array('adminMessage', 'originalMessage', 'message', 'notice') as $key) {
        if (isset($meta[$key]) && trim((string)$meta[$key]) !== '') return trim((string)$meta[$key]);
    }
    return trim((string)$reason);
}

function web_discipline_status($account) {
    $account = vht6ur_clean_account($account);
    $row = $account !== '' ? vht6ur_account($account) : false;
    if (!$row) return array('accountId'=>$account,'status'=>'missing','banned'=>false,'permanent'=>false,'until'=>0,'remainingSeconds'=>0,'reason'=>'','code'=>'','message'=>'Không tìm thấy tài khoản WebGM.');
    $state = vht6ur_web_ban_state($account, true);
    $meta = isset($state['meta']) && is_array($state['meta']) ? $state['meta'] : array();
    return array(
        'accountId'=>$account,
        'status'=>isset($row['status'])?(string)$row['status']:'active',
        'banned'=>!empty($state['banned']),
        'permanent'=>!empty($state['permanent']),
        'until'=>isset($state['until'])?(int)$state['until']:0,
        'remainingSeconds'=>isset($state['remainingSeconds'])?(int)$state['remainingSeconds']:0,
        'reason'=>isset($state['reason'])?(string)$state['reason']:'',
        'code'=>isset($state['code'])?(string)$state['code']:'',
        'bannedAt'=>isset($state['bannedAt'])?(string)$state['bannedAt']:'',
        'bannedBy'=>isset($state['bannedBy'])?(string)$state['bannedBy']:'',
        'meta'=>$meta,
        'title'=>isset($meta['title'])?(string)$meta['title']:'',
        'adminMessage'=>admin_lock_message_original(isset($state['reason'])?$state['reason']:'', $meta),
        'message'=>vht6ur_web_ban_message($state),
    );
}

function web_discipline_preview($account, $duration_seconds, $reason, $code, $meta) {
    $now = (int)round(microtime(true) * 1000);
    $duration_seconds = max(0, (int)$duration_seconds);
    $until = $duration_seconds > 0 ? $now + ($duration_seconds * 1000) : 0;
    $reason = trim((string)$reason);
    $code = strtoupper(trim((string)$code));
    $message = 'Tài khoản WebGM sẽ bị khóa ' . ($until > 0 ? $duration_seconds . ' giây' : 'vĩnh viễn') . '. Lý do: ' . ($reason !== '' ? $reason : 'Vi phạm quy định WebGM') . '.';
    if ($until > 0) $message .= ' Thời gian mở khóa: ' . date('d/m/Y H:i:s', (int)floor($until / 1000)) . ' (GMT+7).';
    return array('accountId'=>$account,'banned'=>true,'permanent'=>$until<=0,'until'=>$until,'remainingSeconds'=>$duration_seconds,'reason'=>$reason,'code'=>$code,'meta'=>$meta,'message'=>$message,'preview'=>true);
}

function web_discipline_commit_ban($account, $duration_seconds, $reason, $code, $meta, $operator, &$error = '') {
    global $conn_web;
    $account = vht6ur_clean_account($account);
    $duration_seconds = max(0, (int)$duration_seconds);
    $reason = trim((string)$reason);
    $code = strtoupper(trim((string)$code));
    if ($account === '') { $error = 'Thiếu tài khoản WebGM.'; return false; }
    if ($reason === '' || strlen($reason) < 5) { $error = 'Vui lòng nhập lý do khóa tài khoản.'; return false; }
    if (!preg_match('/^[A-Z0-9_:-]{3,64}$/', $code)) { $error = 'Mã xử lý khóa không hợp lệ.'; return false; }
    if ($duration_seconds <= 0 || $duration_seconds > 315360000) { $error = 'Số giây khóa phải từ 1 đến 315360000.'; return false; }
    $until = (int)round(microtime(true) * 1000) + ($duration_seconds * 1000);
    $meta_json = json_encode(is_array($meta)?$meta:array(), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    try {
        $conn_web->beginTransaction();
        if (!vht6ur_account($account)) { $conn_web->rollBack(); $error = 'Tài khoản WebGM không tồn tại.'; return false; }
        $conn_web->prepare("UPDATE account SET status='locked' WHERE account=?")->execute(array($account));
        $conn_web->prepare('INSERT INTO web_account_bans(account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at) VALUES(?,?,?,?,?,NOW(),?,?,NOW()) ON DUPLICATE KEY UPDATE active=1,ban_until=VALUES(ban_until),reason=VALUES(reason),ban_code=VALUES(ban_code),banned_at=NOW(),banned_by=VALUES(banned_by),metadata_json=VALUES(metadata_json),updated_at=NOW()')->execute(array($account,1,$until,$reason,$code,$operator,$meta_json));
        $conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)')->execute(array($account,'ban',$until,$reason,$code,$operator,$meta_json));
        $conn_web->commit();
        return web_discipline_preview($account, $duration_seconds, $reason, $code, is_array($meta)?$meta:array());
    } catch (Exception $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack();
        $error = 'Không thể khóa WebGM: ' . $e->getMessage();
        return false;
    }
}

function web_discipline_commit_unban($account, $reason, $operator, &$error = '') {
    global $conn_web;
    $account = vht6ur_clean_account($account);
    $reason = trim((string)$reason) ?: 'Quản trị viên mở khóa tài khoản WebGM';
    try {
        $conn_web->beginTransaction();
        if (!vht6ur_account($account)) { $conn_web->rollBack(); $error = 'Tài khoản WebGM không tồn tại.'; return false; }
        $conn_web->prepare("UPDATE account SET status='active' WHERE account=?")->execute(array($account));
        $conn_web->prepare('UPDATE web_account_bans SET active=0,updated_at=NOW() WHERE account_name=?')->execute(array($account));
        $conn_web->prepare('INSERT INTO web_account_ban_history(account_name,action,ban_until,reason,ban_code,operator_name,metadata_json) VALUES(?,?,?,?,?,?,?)')->execute(array($account,'unban',0,$reason,'',$operator,'{}'));
        $conn_web->commit();
        return web_discipline_status($account);
    } catch (Exception $e) {
        if ($conn_web->inTransaction()) $conn_web->rollBack();
        $error = 'Không thể mở khóa WebGM: ' . $e->getMessage();
        return false;
    }
}

function admin_parse_donate_reward_json($json) {
    $json = trim((string)$json);
    if ($json === '') return '';
    $decoded = json_decode($json, true);
    if (!is_array($decoded)) return '';
    $items = new stdClass();
    foreach ($decoded as $key => $value) {
        if (count(get_object_vars($items)) >= 20) break;
        if (is_array($value)) {
            $item = hk_clean_reward_id(isset($value['item_id']) ? $value['item_id'] : (isset($value['id']) ? $value['id'] : ''));
            $amount = intval(isset($value['amount']) ? $value['amount'] : 0);
        } else {
            $item = hk_clean_reward_id($key);
            $amount = intval($value);
        }
        if ($item !== '' && hk_reward_exists($item) && donate_reward_amount_valid($item, $amount)) $items->{$item} = $amount;
    }
    return count(get_object_vars($items)) > 0 ? json_encode($items, JSON_UNESCAPED_UNICODE) : '';
}

function admin_icon_item_key($key) {
    return hk_clean_reward_id($key);
}

function admin_log_error($scope, Exception $e) {
    error_log('LHS admin ' . $scope . ' error: ' . $e->getMessage());
    system_event_log('admin_api', 'error', 'failed', $scope, 'Lỗi API admin.', $e->getMessage());
}

function admin_redis_available() {
    $host = trim((string)vht6ur_env('LHS_REDIS_HOST', '127.0.0.1'));
    $port = (int)vht6ur_env('LHS_REDIS_PORT', '6379');
    if ($host === '' || $port < 1 || $port > 65535) return false;
    $errno = 0; $errstr = '';
    $socket = @fsockopen($host, $port, $errno, $errstr, 0.35);
    if (!$socket) return false;
    fclose($socket);
    return true;
}

function admin_monitor_union_sql() {
    return "
        SELECT CONVERT(CONCAT('sepay-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
            CONVERT('sepay' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source,
            CONVERT('info' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
            CONVERT('success' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
            CONVERT(COALESCE(account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
            CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
            CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS role_id,
            CONVERT(COALESCE(action, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
            CONVERT(CONCAT('SePay ', action, ' ', CAST(amount AS CHAR), ' đ') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
            CONVERT(content USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details, CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS ip, created_at
        FROM sepay_logs
        UNION ALL
        SELECT CONVERT(CONCAT('webshop-', o.id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
            CONVERT('webshop' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source,
            CONVERT(IF(o.status = 'paid', 'info', 'warning') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
            CONVERT(COALESCE(o.status, 'failed') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
            CONVERT(COALESCE(o.account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
            CONVERT(COALESCE(o.server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
            CONVERT(COALESCE(o.role_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS role_id,
            CONVERT('webshop_purchase' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
            CONVERT(CONCAT('Mua WebShop: ', COALESCE(i.item_name, CONCAT('Vật phẩm ', o.item_id)), ' x', CAST(o.quantity AS CHAR), ' · ', CAST(o.total_price AS CHAR), ' Xu') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
            CONVERT(CONCAT('Đơn #', CAST(o.id AS CHAR), ' · UID ', COALESCE(o.role_id, ''), ' · Item ID ', COALESCE(o.item_id, '')) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details,
            CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS ip,
            o.created_at
        FROM webshop_orders o
        LEFT JOIN webshop_items i ON i.id = o.shop_item_id
        UNION ALL
        SELECT CONVERT(CONCAT('gm-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
            CONVERT('gm' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source,
            CONVERT('info' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
            CONVERT('success' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
            CONVERT(COALESCE(account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
            CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
            CONVERT(COALESCE(target_role_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS role_id,
            CONVERT(COALESCE(action, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
            CONVERT(CONCAT('GM gửi thành công tới UID ', target_role_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
            CONVERT(details USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details, CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS ip, created_at
        FROM gm_logs
        UNION ALL
        SELECT CONVERT(CONCAT('login-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
            CONVERT('login' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source,
            CONVERT(IF(success = 1, 'info', 'warning') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
            CONVERT(IF(success = 1, 'success', 'failed') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
            CONVERT(COALESCE(username, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
            CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
            CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS role_id,
            CONVERT(IF(success = 1, 'login_success', 'login_failed') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
            CONVERT(IF(success = 1, 'Đăng nhập thành công.', 'Đăng nhập sai tài khoản hoặc mật khẩu.') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
            CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details, CONVERT(ip USING utf8mb4) COLLATE utf8mb4_unicode_ci AS ip, created_at
        FROM login_attempts
        UNION ALL
        SELECT CONVERT(CONCAT('system-', id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
            CONVERT(CASE
                WHEN source = 'sepay_webhook' THEN 'sepay'
                WHEN source = 'gm' THEN 'gm'
                WHEN source = 'login' THEN 'login'
                ELSE 'system'
            END USING utf8mb4) COLLATE utf8mb4_unicode_ci AS source,
            CONVERT(COALESCE(level, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS level,
            CONVERT(COALESCE(status, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS status,
            CONVERT(COALESCE(account_name, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS account_name,
            CONVERT(COALESCE(server_id, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS server_id,
            CONVERT('' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS role_id,
            CONVERT(COALESCE(action, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS action,
            CONVERT(COALESCE(message, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS message,
            CONVERT(COALESCE(details, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS details,
            CONVERT(COALESCE(ip, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS ip, created_at
        FROM system_event_logs
    ";
}

function admin_monitor_period_range($period, $date_from = '', $date_to = '') {
    $period = trim((string)$period);
    if (!in_array($period, array('today', '7days', '30days', 'custom', 'all'), true)) $period = 'today';
    $timezone = new DateTimeZone(date_default_timezone_get());
    $now = new DateTimeImmutable('now', $timezone);
    $start = null;
    $end = null;
    $label = '';
    if ($period === 'today') {
        $start = $now->setTime(0, 0, 0);
        $end = $start->modify('+1 day');
        $label = 'Hôm nay';
    } elseif ($period === '7days') {
        $end = $now->modify('tomorrow')->setTime(0, 0, 0);
        $start = $end->modify('-7 days');
        $label = '7 ngày gần nhất';
    } elseif ($period === '30days') {
        $end = $now->modify('tomorrow')->setTime(0, 0, 0);
        $start = $end->modify('-30 days');
        $label = '30 ngày gần nhất';
    } elseif ($period === 'custom') {
        $date_from = trim((string)$date_from);
        $date_to = trim((string)$date_to);
        $from = DateTimeImmutable::createFromFormat('!Y-m-d', $date_from, $timezone);
        $from_errors = DateTimeImmutable::getLastErrors();
        $from_valid = $from && ($from_errors === false || ($from_errors['warning_count'] === 0 && $from_errors['error_count'] === 0));
        $to = DateTimeImmutable::createFromFormat('!Y-m-d', $date_to, $timezone);
        $to_errors = DateTimeImmutable::getLastErrors();
        $to_valid = $to && ($to_errors === false || ($to_errors['warning_count'] === 0 && $to_errors['error_count'] === 0));
        if (!$from_valid || !$to_valid || $from->format('Y-m-d') !== $date_from || $to->format('Y-m-d') !== $date_to) throw new InvalidArgumentException('Khoảng ngày log không hợp lệ.');
        if ($from > $to) throw new InvalidArgumentException('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        if ($from->diff($to)->days > 366) throw new InvalidArgumentException('Khoảng log tùy chọn tối đa là 366 ngày.');
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

$action = isset($_POST['action']) ? trim((string)$_POST['action']) : '';

switch ($action) {
    case 'get_overview':
        try {
            $total_accounts = intval($conn_web->query("SELECT COUNT(*) FROM account")->fetchColumn());
            $total_xu = intval($conn_web->query("SELECT COALESCE(SUM(ptb),0) FROM account")->fetchColumn());
            $total_roles = intval($conn_web->query("SELECT COUNT(*) FROM account WHERE sdk_user_id IS NOT NULL AND sdk_user_id <> ''")->fetchColumn());
            $sent_mails = intval($conn_web->query("SELECT COUNT(*) FROM gm_logs")->fetchColumn());
            $paid_orders = intval($conn_web->query("SELECT COUNT(*) FROM sepay_logs")->fetchColumn());
            $webshop_orders = intval($conn_web->query("SELECT COUNT(*) FROM webshop_orders")->fetchColumn());
            $total_recharge = floatval($conn_web->query("SELECT COALESCE(SUM(amount),0) FROM sepay_logs WHERE action IN ('topup_xu','vip')")->fetchColumn());
            $today_recharge = floatval($conn_web->query("SELECT COALESCE(SUM(amount),0) FROM sepay_logs WHERE action IN ('topup_xu','vip') AND DATE(created_at) = CURDATE()")->fetchColumn());
            $vip_total = intval($conn_web->query("SELECT COUNT(*) FROM auth_codes WHERE is_used = 1")->fetchColumn());
            $vip_unused = intval($conn_web->query("SELECT COUNT(*) FROM auth_codes WHERE is_used = 0")->fetchColumn());
            $giftcode_total = intval($conn_web->query("SELECT COUNT(*) FROM giftcodes")->fetchColumn());
            $giftcode_public = intval($conn_web->query("SELECT COUNT(*) FROM giftcodes WHERE hide = 1 AND is_active = 1")->fetchColumn());

            $top_stmt = $conn_web->query("SELECT account_name AS account, server_id, COUNT(*) AS orders, COALESCE(SUM(amount),0) AS total_money FROM sepay_logs WHERE action IN ('topup_xu','vip') GROUP BY account_name, server_id ORDER BY total_money DESC LIMIT 5");
            $top_recharge = $top_stmt->fetchAll(PDO::FETCH_ASSOC);
            $recent_order_stmt = $conn_web->query("SELECT account_name AS account, server_id, amount AS money, action AS pay_type, created_at AS pay_time, content FROM sepay_logs ORDER BY id DESC LIMIT 8");
            $recent_orders = $recent_order_stmt->fetchAll(PDO::FETCH_ASSOC);
            $recent_stmt = $conn_web->query("SELECT id, account_name, server_id, target_role_id, action, details, created_at FROM gm_logs ORDER BY id DESC LIMIT 8");
            $recent_logs = array();
            $recent_identity_cache = array();
            foreach ($recent_stmt->fetchAll(PDO::FETCH_ASSOC) as $recent_row) {
                $recent_row['role_id'] = $recent_row['target_role_id'];
                $recent_logs[] = admin_enrich_player_identity($recent_row, $recent_identity_cache);
            }

            admin_exit('success', '', array(
                'stats' => array(
                    'total_accounts' => $total_accounts,
                    'total_xu' => $total_xu,
                    'paid_orders' => $paid_orders,
                    'pending_orders' => 0,
                    'total_roles' => $total_roles,
                    'sent_mails' => $sent_mails,
                    'webshop_orders' => $webshop_orders,
                    'total_recharge' => $total_recharge,
                    'today_recharge' => $today_recharge,
                    'vip_total' => $vip_total,
                    'vip_unused' => $vip_unused,
                    'giftcode_total' => $giftcode_total,
                    'giftcode_public' => $giftcode_public
                ),
                'top_recharge' => $top_recharge,
                'recent_orders' => $recent_orders,
                'recent_logs' => $recent_logs,
                'health' => array(
                    'images_writable' => is_writable(dirname(__DIR__) . '/assets/images'),
                    'gd_extension' => extension_loaded('gd'),
                    'game_db' => lhs_game_api_available(),
                    'web_db' => true,
                    // WebGM chỉ kiểm tra TCP Redis riêng của Linh Họa Sư; không
                    // dùng Redis của game khác và không thực hiện lệnh ghi.
                    'redis' => admin_redis_available()
                )
            ));
        } catch (Exception $e) {
            error_log('LHS admin get_overview error: ' . $e->getMessage());
            admin_exit('error', 'Không đọc được thống kê lúc này.');
        }
        break;

    case 'switch_admin_server':
        admin_require_rate('switch_admin_server',8,60);
        $next_server=isset($_POST['server_id']) && is_scalar($_POST['server_id'])?(string)$_POST['server_id']:'';
        if(!gm_get_server($next_server))admin_exit('error','Máy chủ không hợp lệ.');
        try{lhs_api_base($next_server);}catch(Exception $e){admin_exit('error','Máy chủ chưa có tuyến API hợp lệ.');}
        $previous_server=$current_server_id;
        session_regenerate_id(true);
        $_SESSION['server_id']=$next_server;
        $_SESSION['server_name']=gm_get_server($next_server)['name'];
        $_SESSION['vip_level']=0;
        unset($_SESSION['csrf_token']);csrf_token();
        gm_audit_log('','switch_admin_server',$previous_server.' → '.$next_server,$_SESSION['username'],$next_server);
        admin_exit('success','Đã đổi phiên quản trị. Trang sẽ tải lại.',array('redirect'=>'index.php'));
        break;

    case 'resolve_player_target':
        admin_require_rate('resolve_player_target',30,60);
        try{
            $roles=lhs_admin_resolve_roles(isset($_POST['query'])?$_POST['query']:'',$current_server_id);
            admin_exit('success','',array('roles'=>$roles,'server_id'=>$current_server_id,'unique'=>count($roles)===1));
        }catch(Exception $e){admin_exit('error','Chưa nhận diện được nhân vật; vui lòng thử lại.');}
        break;

    case 'get_users_list':
        try{admin_exit('success','',lhs_admin_users($conn_web,$current_server_id,$_POST));}
        catch(Exception $e){admin_log_error('get_users_list',$e);admin_exit('error',$e instanceof InvalidArgumentException?$e->getMessage():'Không đọc được danh sách hoặc máy chủ chưa phản hồi.');}
        break;

    case 'send_gm_action':
        admin_require_rate('send_gm_action', 60, 60);
        $role_id = trim((string)(isset($_POST['uid']) ? $_POST['uid'] : (isset($_POST['role_id']) ? $_POST['role_id'] : '')));
        $gm_type = trim((string)(isset($_POST['gm_type']) ? $_POST['gm_type'] : 'item'));
        
        if(isset($_POST['target_query'])){
            try{
                $matches=lhs_admin_resolve_roles($_POST['target_query'],$current_server_id);
                $selected=array_values(array_filter($matches,function($r)use($role_id){return$r['role_id']===$role_id;}));
                if(count($selected)!==1)admin_exit('error','Chưa xác định duy nhất nhân vật nhận. Hãy nhận diện lại và chọn đúng UID.');
                $role_id=$selected[0]['role_id'];
            }catch(Exception $e){admin_exit('error','Không xác minh được mục tiêu trên máy chủ đang quản trị.');}
        }
        if ($role_id === '') admin_exit('error', 'Chưa chọn UID nhân vật.');
        
        if ($gm_type === 'clear_mail') {
            $clear_error = '';
            if (!vht6ur_sdk_admin_clear_mail($role_id, intval($current_server_id), $clear_error)) {
                system_event_log('gm', 'error', 'failed', 'admin_clear_mail', 'Không thể xóa thư.', array('error' => $clear_error, 'role_id' => $role_id), '', $current_server_id);
                admin_exit('error', $clear_error ? $clear_error : 'Không thể xóa thư lúc này.');
            }
            admin_log($role_id, 'admin_clear_mail', 'Đã xóa thư đã đọc và đã nhận qua API Linh Họa Sư');
            admin_exit('success', 'Đã dọn thư đã đọc và đã nhận của nhân vật.');
        } elseif ($gm_type === 'clear_bag') {
            $clear_error = '';
            if (!vht6ur_sdk_admin_clear_bag($role_id, (string)$current_server_id, $clear_error)) {
                system_event_log('gm', 'error', 'failed', 'admin_clear_bag', 'Không thể dọn balo.', array('error'=>$clear_error,'role_id'=>$role_id), '', $current_server_id);
                admin_exit('error', $clear_error ? $clear_error : 'Không thể dọn balo lúc này.');
            }
            admin_log($role_id, 'admin_clear_bag', 'Đã dọn vật phẩm thường, giữ tiền tệ và vật phẩm hệ thống');
            admin_exit('success', 'Dọn balo thành công; tiền tệ và vật phẩm hệ thống được giữ lại.');
        } else {
            $item_id = trim((string)(isset($_POST['item_id']) ? $_POST['item_id'] : ''));
            $amount = intval(isset($_POST['amount']) ? $_POST['amount'] : (isset($_POST['item_num']) ? $_POST['item_num'] : 1));
            $equip_level = intval(isset($_POST['equip_level']) ? $_POST['equip_level'] : 0);
            if ($item_id === '') admin_exit('error', 'Chưa chọn vật phẩm.');
            $err = '';
            if (!gm_send_item_mail_by_role($role_id, $current_server_id, $item_id, max(1, $amount), $equip_level, $err, 'Admin GM')) {
                admin_exit('error', $err ? $err : 'Gửi thất bại.');
            }
            admin_log($role_id, 'admin_send_' . $gm_type, hk_clean_reward_id($item_id) . ' x ' . max(1, $amount));
            admin_exit('success', 'Gửi thành công. Kiểm tra thư trong game.');
        }
        break;

    case 'get_audit_logs':
        $page = max(1, intval(isset($_POST['page']) ? $_POST['page'] : 1));
        $search = trim((string)(isset($_POST['search']) ? $_POST['search'] : ''));
        $action_filter = trim((string)(isset($_POST['action_filter']) ? $_POST['action_filter'] : ''));
        $server_filter = trim((string)(isset($_POST['server_filter']) ? $_POST['server_filter'] : ''));
        $limit = 25;
        $offset = ($page - 1) * $limit;
        $where = array();
        $params = array();
        if ($search !== '') {
            $where[] = "(account_name LIKE ? OR target_role_id LIKE ? OR details LIKE ?)";
            $params[] = '%' . $search . '%';
            $params[] = '%' . $search . '%';
            $params[] = '%' . $search . '%';
        }
        if ($action_filter !== '') {
            $where[] = "action LIKE ?";
            $params[] = '%' . $action_filter . '%';
        }
        if ($server_filter !== '') {
            if (!gm_get_server($server_filter)) admin_exit('error', 'Server lọc không hợp lệ.');
            $where[] = 'server_id = ?';
            $params[] = $server_filter;
        }
        $sql_where = empty($where) ? '' : ('WHERE ' . implode(' AND ', $where));
        $stmt = $conn_web->prepare("SELECT COUNT(*) FROM gm_logs $sql_where");
        $stmt->execute($params);
        $total = intval($stmt->fetchColumn());
        $stmt = $conn_web->prepare("SELECT id, account_name, server_id, target_role_id, action, details, created_at FROM gm_logs $sql_where ORDER BY id DESC LIMIT $limit OFFSET $offset");
        $stmt->execute($params);
        $rows = array();
        $identity_cache = array();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $row['admin_account'] = $row['account_name'];
            $row['target'] = $row['target_role_id'];
            $row['ip'] = '';
            $row['role_id'] = $row['target_role_id'];
            $rows[] = admin_enrich_player_identity($row, $identity_cache);
        }
        admin_exit('success', '', array('data' => $rows, 'logs' => $rows, 'total_pages' => max(1, intval(ceil($total / $limit))), 'current_page' => $page));
        break;

    case 'get_monitor_logs':
        $page = max(1, intval(isset($_POST['page']) ? $_POST['page'] : 1));
        $search = trim((string)(isset($_POST['search']) ? $_POST['search'] : ''));
        $source_filter = trim((string)(isset($_POST['source_filter']) ? $_POST['source_filter'] : ''));
        $status_filter = trim((string)(isset($_POST['status_filter']) ? $_POST['status_filter'] : ''));
        $level_filter = trim((string)(isset($_POST['level_filter']) ? $_POST['level_filter'] : ''));
        $server_filter = trim((string)(isset($_POST['server_filter']) ? $_POST['server_filter'] : ''));
        try {
            $range = admin_monitor_period_range(
                isset($_POST['period']) ? $_POST['period'] : 'today',
                isset($_POST['date_from']) ? $_POST['date_from'] : '',
                isset($_POST['date_to']) ? $_POST['date_to'] : ''
            );
        } catch (InvalidArgumentException $e) {
            admin_exit('error', $e->getMessage());
        }
        $limit = 30;
        $offset = ($page - 1) * $limit;
        $where = array();
        $params = array();
        if (in_array($source_filter, array('sepay', 'webshop', 'gm', 'login', 'system'), true)) {
            $where[] = "source = ?";
            $params[] = $source_filter;
        }
        if (in_array($status_filter, array('success', 'paid', 'failed', 'ignored', 'refunded'), true)) {
            $where[] = "status = ?";
            $params[] = $status_filter;
        }
        if (in_array($level_filter, array('info', 'warning', 'error'), true)) {
            $where[] = "level = ?";
            $params[] = $level_filter;
        }
        if ($server_filter !== '') {
            if (!gm_get_server($server_filter)) admin_exit('error', 'Server lọc không hợp lệ.');
            $where[] = 'server_id = ?';
            $params[] = $server_filter;
        }
        if ($search !== '') {
            $exact_account='';
            if($source_filter==='sepay'){
                $account_stmt=$conn_web->prepare('SELECT account FROM account WHERE account=? OR CAST(account_id AS CHAR)=? OR sdk_user_id=? LIMIT 2');
                $account_stmt->execute(array($search,$search,$search));$names=$account_stmt->fetchAll(PDO::FETCH_COLUMN);
                if(count($names)===1)$exact_account=(string)$names[0];
            }
            if($exact_account!==''){$where[]='account_name = ?';$params[]=$exact_account;}
            else {
                $where[] = "(account_name LIKE ? ESCAPE '!' OR server_id LIKE ? ESCAPE '!' OR role_id LIKE ? ESCAPE '!' OR action LIKE ? ESCAPE '!' OR message LIKE ? ESCAPE '!' OR details LIKE ? ESCAPE '!' OR ip LIKE ? ESCAPE '!')";
                for ($i = 0; $i < 7; $i++) $params[] = lhs_admin_like($search);
            }
        }
        if ($range['start'] !== '' && $range['end'] !== '') {
            $where[] = 'created_at >= ? AND created_at < ?';
            $params[] = $range['start'];
            $params[] = $range['end'];
        }
        $sql_where = empty($where) ? '' : ('WHERE ' . implode(' AND ', $where));
        $quick_status=isset($_POST['quick_status'])?(string)$_POST['quick_status']:'';
        $error_pred="(level='error' OR status IN ('failed','partial','manual_review'))";
        $warning_pred="((level='warning' OR status IN ('ignored','refunded')) AND NOT ".$error_pred.")";
        $success_pred="(status IN ('success','paid') AND NOT ".$error_pred." AND NOT ".$warning_pred.")";
        $quick_pred=$quick_status==='error'?$error_pred:($quick_status==='warning'?$warning_pred:($quick_status==='success'?$success_pred:''));
        $row_where=$sql_where.($quick_pred!==''?($sql_where===''?'WHERE ':' AND ').$quick_pred:'');
        $union_sql = admin_monitor_union_sql();
        try {
            $stmt = $conn_web->prepare("SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN $success_pred THEN 1 ELSE 0 END),0) AS success_count,
                    COALESCE(SUM(CASE WHEN $warning_pred THEN 1 ELSE 0 END),0) AS warning_count,
                    COALESCE(SUM(CASE WHEN $error_pred THEN 1 ELSE 0 END),0) AS error_count,
                    COALESCE(SUM(CASE WHEN source = 'sepay' THEN 1 ELSE 0 END),0) AS sepay_count,
                    COALESCE(SUM(CASE WHEN source = 'webshop' THEN 1 ELSE 0 END),0) AS webshop_count,
                    COALESCE(SUM(CASE WHEN source = 'gm' THEN 1 ELSE 0 END),0) AS gm_count,
                    COALESCE(SUM(CASE WHEN source = 'login' THEN 1 ELSE 0 END),0) AS login_count,
                    COALESCE(SUM(CASE WHEN source = 'system' THEN 1 ELSE 0 END),0) AS system_count
                FROM ($union_sql) monitor_events $sql_where");
            $stmt->execute($params);
            $summary = $stmt->fetch(PDO::FETCH_ASSOC) ?: array();
            $total = intval(isset($summary['total']) ? $summary['total'] : 0);
            if($quick_pred!==''){
                $count_stmt=$conn_web->prepare("SELECT COUNT(*) FROM ($union_sql) monitor_events $row_where");
                $count_stmt->execute($params);$total=(int)$count_stmt->fetchColumn();
            }
            $page=min($page,max(1,(int)ceil($total/$limit)));$offset=($page-1)*$limit;
            $stmt = $conn_web->prepare("SELECT * FROM ($union_sql) monitor_events $row_where ORDER BY created_at DESC,event_id DESC LIMIT $limit OFFSET $offset");
            $stmt->execute($params);
            $monitor_rows = array();
            $identity_cache = array();
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $monitor_row) {
                $monitor_rows[] = admin_enrich_player_identity($monitor_row, $identity_cache);
            }
            admin_exit('success', '', array(
                'data' => $monitor_rows,
                'financial' => $source_filter==='sepay'?lhs_admin_sepay_summary($conn_web,$search,$server_filter,$range):null,
                'quick_status' => $quick_status,
                'summary' => array(
                    'total' => intval(isset($summary['total'])?$summary['total']:0),
                    'success_count' => intval(isset($summary['success_count']) ? $summary['success_count'] : 0),
                    'warning_count' => intval(isset($summary['warning_count']) ? $summary['warning_count'] : 0),
                    'error_count' => intval(isset($summary['error_count']) ? $summary['error_count'] : 0),
                    'sepay_count' => intval(isset($summary['sepay_count']) ? $summary['sepay_count'] : 0),
                    'webshop_count' => intval(isset($summary['webshop_count']) ? $summary['webshop_count'] : 0),
                    'gm_count' => intval(isset($summary['gm_count']) ? $summary['gm_count'] : 0),
                    'login_count' => intval(isset($summary['login_count']) ? $summary['login_count'] : 0),
                    'system_count' => intval(isset($summary['system_count']) ? $summary['system_count'] : 0)
                ),
                'range' => $range,
                'total_pages' => max(1, intval(ceil($total / $limit))),
                'current_page' => $page,
                'total' => $total,
                'refreshed_at' => date('d/m/Y H:i:s')
            ));
        } catch (Exception $e) {
            admin_log_error('get_monitor_logs', $e);
            admin_exit('error', 'Không đọc được log giám sát.');
        }
        break;

    case 'get_webshop_logs':
        $page = max(1, intval(isset($_POST['page']) ? $_POST['page'] : 1));
        $search = trim((string)(isset($_POST['search']) ? $_POST['search'] : ''));
        $status_filter = trim((string)(isset($_POST['status_filter']) ? $_POST['status_filter'] : ''));
        $server_filter = trim((string)(isset($_POST['server_filter']) ? $_POST['server_filter'] : ''));
        $limit = 30;
        $offset = ($page - 1) * $limit;
        $where = array();
        $params = array();
        if (in_array($status_filter, array('paid', 'failed', 'refunded'), true)) {
            $where[] = 'o.status = ?';
            $params[] = $status_filter;
        }
        if ($server_filter !== '') {
            $where[] = 'o.server_id = ?';
            $params[] = substr($server_filter, 0, 32);
        }
        if ($search !== '') {
            $where[] = '(o.account_name LIKE ? OR o.role_id LIKE ? OR o.item_id LIKE ? OR i.item_name LIKE ? OR CAST(o.id AS CHAR) LIKE ?)';
            for ($i = 0; $i < 5; $i++) $params[] = '%' . $search . '%';
        }
        $sql_where = empty($where) ? '' : ('WHERE ' . implode(' AND ', $where));
        try {
            $from_sql = ' FROM webshop_orders o LEFT JOIN webshop_items i ON i.id = o.shop_item_id ' . $sql_where;
            $stmt = $conn_web->prepare('SELECT COUNT(*)' . $from_sql);
            $stmt->execute($params);
            $total = intval($stmt->fetchColumn());
            $stmt = $conn_web->prepare('SELECT o.id, o.account_name, o.server_id, o.role_id, o.shop_item_id, o.item_id, o.quantity, o.unit_price, o.total_price, o.status, o.created_at, COALESCE(i.item_name, \'\') AS item_name' . $from_sql . ' ORDER BY o.id DESC LIMIT ' . $limit . ' OFFSET ' . $offset);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $catalog = vht6ur_item_catalog();
            foreach ($rows as &$row) {
                if (trim((string)$row['item_name']) === '') {
                    $item_key = (int)hk_clean_reward_id($row['item_id']);
                    $row['item_name'] = isset($catalog[$item_key]) ? $catalog[$item_key] : ('Vật phẩm ' . $row['item_id']);
                }
                $row['quantity'] = intval($row['quantity']);
                $row['unit_price'] = intval($row['unit_price']);
                $row['total_price'] = intval($row['total_price']);
            }
            unset($row);
            admin_exit('success', '', array(
                'data' => $rows,
                'total_pages' => max(1, intval(ceil($total / $limit))),
                'current_page' => $page,
                'total' => $total
            ));
        } catch (Exception $e) {
            admin_log_error('get_webshop_logs', $e);
            admin_exit('error', 'Không đọc được log WebShop.');
        }
        break;

    case 'get_settings':
        $settings = array();
        try {
            $stmt = $conn_web->query("SELECT setting_key, setting_value FROM web_settings");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $settings[$row['setting_key']] = $row['setting_value'];
        } catch (Exception $e) {}
        if (sepay_webhook_token() !== '') $settings['sepay_webhook_token'] = '[đã thiết lập - đang bảo mật]';
        admin_exit('success', '', array('settings' => $settings));
        break;

    case 'update_setting':
    case 'update_text_setting':
        $key = trim((string)(isset($_POST['key']) ? $_POST['key'] : ''));
        $value = isset($_POST['value']) ? (string)$_POST['value'] : '';
        if ($key === '') admin_exit('error', 'Thiếu key setting.');
        if ($key === 'sepay_webhook_token' && ($value === '[đã thiết lập - đang bảo mật]' || $value === '[da thiet lap - dang bao mat]')) {
            admin_exit('success', 'Giữ nguyên token SePay hiện tại.');
        }
        if (in_array($key, array('maintenance_mode', 'gm_tools_enabled', 'webshop_enabled', 'daily_checkin_enabled', 'recharge_rewards_enabled', 'vip_enabled', 'lucky_wheel_enabled'), true)) {
            $value = $value === '1' ? '1' : '0';
        } elseif ($key === 'daily_checkin_xu') {
            $value = (string)min(1000000000, max(1, intval($value)));
        } elseif ($key === 'sepay_topup_tag' || $key === 'sepay_vip_tag') {
            $value = normalize_transfer_tag($value, $key === 'sepay_topup_tag' ? 'LHS' : 'LHSVIP');
        } elseif ($key === 'vietqr_bank') {
            $value = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value));
        } elseif ($key === 'vietqr_account') {
            $value = preg_replace('/\s+/', '', trim($value));
        } elseif ($key === 'vietqr_account_name') {
            $value = trim($value);
        }
        if (!web_set_setting($key, $value)) {
            admin_exit('error', 'Không lưu được cấu hình vào bảng web_settings. Kiểm tra database account_linhhoasu và quyền ghi MySQL.');
        }
        admin_exit('success', 'Đã cập nhật cấu hình.', array('key' => $key, 'value' => $value));
        break;

    case 'debug_transfer_tags':
        admin_exit('success', '', array(
            'web_settings' => array(
                'sepay_topup_tag' => web_setting('sepay_topup_tag', 'LHS'),
                'sepay_vip_tag' => web_setting('sepay_vip_tag', 'LHSVIP')
            ),
            'effective' => payment_transfer_tags()
        ));
        break;

    case 'get_webshop_items':
        $stmt = $conn_web->query("SELECT * FROM webshop_items ORDER BY sort_order ASC, id DESC");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($items as &$shop_item) {
            $shop_item['bundle_rewards'] = lhs_shop_public_rewards($shop_item);
            $shop_item['image_url'] = lhs_shop_image_url($shop_item['item_id'], $shop_item['image_url']);
        }
        unset($shop_item);
        admin_exit('success', '', array('data' => $items, 'items' => $items));
        break;

    case 'get_item_icons':
        $icons = array();
        $image_catalog = json_decode((string)file_get_contents(dirname(__DIR__).'/assets/item/item_images.json'),true);
        foreach ((array)$image_catalog['items'] as $key=>$row) {
            $icons[$key]=array('item_id'=>(string)$key,'raw_id'=>(string)$key,'item_name'=>$row['name'],'image_url'=>'api/item_icon.php?id='.$key,'source'=>'catalog','updated_at'=>'');
        }
        try {
            $stmt = $conn_web->query("SELECT item_id, item_name, image_url, created_at AS updated_at FROM webshop_items WHERE image_url IS NOT NULL AND image_url <> '' ORDER BY id DESC");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = trim((string)$row['item_id']);
                if ($key !== '') {
                    $row['source'] = 'webshop';
                    $row['raw_id'] = hk_clean_reward_id($key);
                    $icons[$key] = $row;
                }
            }
            $stmt = $conn_web->query("SELECT item_id, item_name, image_url, updated_at FROM item_icon_images WHERE image_url IS NOT NULL AND image_url <> '' ORDER BY updated_at DESC, item_id ASC");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = trim((string)$row['item_id']);
                if ($key !== '') {
                    $row['source'] = 'icon';
                    $row['raw_id'] = hk_clean_reward_id($key);
                    $icons[$key] = $row;
                }
            }
        } catch (Exception $e) {
            admin_log_error('get_item_icons', $e);
            admin_exit('error', 'Không tải được icon item.');
        }
        admin_exit('success', '', array('data' => array_values($icons)));
        break;

    case 'save_item_icon':
        try {
            $item_id = admin_icon_item_key(isset($_POST['item_id']) ? $_POST['item_id'] : '');
            $item_name = trim((string)(isset($_POST['item_name']) ? $_POST['item_name'] : ''));
            $image_url = trim((string)(isset($_POST['image_url']) ? $_POST['image_url'] : ''));
            if ($item_id === '') admin_exit('error', 'Chưa chọn item.');
            if (!hk_reward_exists($item_id)) admin_exit('error', 'Item không có trong danh sách LHS hợp lệ.');
            if ($image_url === '') admin_exit('error', 'Chưa có ảnh icon.');
            item_icon_upsert($item_id, $item_name, $image_url);
            admin_log('', 'save_item_icon', $item_id . ' => ' . $image_url);
            admin_exit('success', 'Đã lưu icon item.', array('item_id' => $item_id, 'raw_id' => hk_clean_reward_id($item_id), 'image_url' => $image_url));
        } catch (Exception $e) {
            admin_log_error('save_item_icon', $e);
            admin_exit('error', 'Không lưu được icon item.');
        }
        break;

    case 'delete_item_icon':
        try {
            $item_id = admin_icon_item_key(isset($_POST['item_id']) ? $_POST['item_id'] : '');
            if ($item_id === '') admin_exit('error', 'Thiếu item.');
            $stmt = $conn_web->prepare("DELETE FROM item_icon_images WHERE item_id = ?");
            $stmt->execute(array($item_id));
            admin_log('', 'delete_item_icon', $item_id);
            admin_exit('success', 'Đã xóa icon riêng. Nếu item còn ảnh Webshop thì vẫn dùng ảnh Webshop.');
        } catch (Exception $e) {
            admin_log_error('delete_item_icon', $e);
            admin_exit('error', 'Không xóa được icon item.');
        }
        break;

    case 'save_webshop_item':
        try {
            $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
            if ($id>0 && !isset($_POST['product_mode'])) {
                $old=$conn_web->prepare('SELECT reward_items FROM webshop_items WHERE id=?');$old->execute(array($id));
                if(trim((string)$old->fetchColumn())!=='')throw new InvalidArgumentException('Trang admin cũ không hỗ trợ gói này. Vui lòng tải lại trang.');
            }
            $item_id = hk_clean_reward_id(isset($_POST['item_id']) ? $_POST['item_id'] : '');
            $item_name = trim((string)(isset($_POST['item_name']) ? $_POST['item_name'] : ''));
            $price = webshop_positive_int(isset($_POST['price']) ? $_POST['price'] : 0, 0);
            $item_amount = webshop_positive_int(isset($_POST['item_amount']) ? $_POST['item_amount'] : 1, 1);
            $sort_order = intval(isset($_POST['sort_order']) ? $_POST['sort_order'] : 0);
            $image_url = trim((string)(isset($_POST['image_url']) ? $_POST['image_url'] : ''));
            $mode = isset($_POST['product_mode']) ? (string)$_POST['product_mode'] : 'single';
            $bundle = $mode === 'bundle' ? lhs_shop_parse_bundle(isset($_POST['reward_items'])?$_POST['reward_items']:'') : array();
            if ($mode !== 'single' && $mode !== 'bundle') throw new InvalidArgumentException('Loại gói không hợp lệ.');
            if ($bundle) { $item_id=(string)$bundle[0]['id']; $item_amount=1; }
            $reward_json = $bundle ? json_encode($bundle,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) : null;
            $active = isset($_POST['is_active']) && (string)$_POST['is_active']==='1' ? 1 : 0;
            if ($item_id === '') admin_exit('error', 'Chưa chọn vật phẩm.');
            if (!webshop_price_valid($price)) admin_exit('error', 'Giá Webshop phải là số nguyên dương hợp lệ.');
            if (!hk_reward_exists($item_id)) admin_exit('error', 'Item không có trong danh sách LHS hợp lệ.');
            if (!webshop_item_sale_enabled($item_id)) admin_exit('error', 'Category của item đang bị khóa trong catalog.');
            if ($item_name === '') {
                $catalog = vht6ur_item_catalog();
                $item_name = isset($catalog[(int)$item_id]) ? $catalog[(int)$item_id] : ('Vật phẩm ' . $item_id);
            }
            if ($id > 0) {
                $stmt = $conn_web->prepare("UPDATE webshop_items SET item_id=?, item_name=?, image_url=?, price=?, item_amount=?, sort_order=?, is_active=?, reward_items=? WHERE id=?");
                $stmt->execute(array($item_id, $item_name, $image_url, $price, $item_amount, $sort_order, $active, $reward_json, $id));
            } else {
                $stmt = $conn_web->prepare("INSERT INTO webshop_items(item_id, item_name, image_url, price, item_amount, sort_order, is_active, reward_items) VALUES(?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute(array($item_id, $item_name, $image_url, $price, $item_amount, $sort_order, $active, $reward_json));
            }
            if (!$bundle && $image_url !== '' && strpos($image_url,'api/item_icon.php?') !== 0) item_icon_upsert($item_id, $item_name, $image_url);
            admin_exit('success', 'Đã lưu vật phẩm shop.');
        } catch (InvalidArgumentException $e) {
            admin_exit('error', $e->getMessage());
        } catch (Exception $e) {
            error_log('LHS admin save_webshop_item error: ' . $e->getMessage());
            admin_exit('error', 'Không lưu được cơ sở dữ liệu lúc này.');
        }
        break;

    case 'toggle_webshop_item':
        $toggle_id = intval($_POST['id']);
        $toggle_value = intval($_POST['value']);
        if ($toggle_value === 1) {
            $check_stmt = $conn_web->prepare('SELECT * FROM webshop_items WHERE id=? LIMIT 1');
            $check_stmt->execute(array($toggle_id));
            $toggle_product = $check_stmt->fetch(PDO::FETCH_ASSOC);
            try { if ($toggle_product) lhs_shop_rewards($toggle_product); } catch (Exception $e) { admin_exit('error',$e->getMessage()); }
        }
        $stmt = $conn_web->prepare("UPDATE webshop_items SET is_active=? WHERE id=?");
        $stmt->execute(array($toggle_value, $toggle_id));
        admin_exit('success', 'Đã cập nhật trạng thái.');
        break;

    case 'delete_webshop_item':
        $stmt = $conn_web->prepare("DELETE FROM webshop_items WHERE id=?");
        $stmt->execute(array(intval($_POST['id'])));
        admin_exit('success', 'Đã xóa item.');
        break;

    case 'get_giftcodes':
        $stmt = $conn_web->query("SELECT * FROM giftcodes ORDER BY id DESC LIMIT 200");
        $rows = array();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $row['code'] = !empty($row['code']) ? $row['code'] : (isset($row['giftcode']) ? $row['giftcode'] : '');
            $row['giftcode'] = $row['code'];
            if (empty($row['expire_at']) && !empty($row['expires_at'])) $row['expire_at'] = $row['expires_at'];
            $rows[] = $row;
        }
        admin_exit('success', '', array('data' => $rows, 'giftcodes' => $rows));
        break;

    case 'create_giftcode':
        admin_require_rate('create_giftcode', 20, 60);
        $code = strtoupper(trim((string)(isset($_POST['giftcode']) ? $_POST['giftcode'] : (isset($_POST['code']) ? $_POST['code'] : ''))));
        if ($code === '') $code = 'LHS' . strtoupper(substr(bin2hex(admin_random_bytes(4)), 0, 8));
        if (!preg_match('/^[A-Z0-9_-]{2,80}$/', $code)) admin_exit('error', 'Mã chỉ được gồm A-Z, số, gạch ngang hoặc gạch dưới (2–80 ký tự).');
        $reward = admin_parse_reward_json(isset($_POST['items_json']) ? $_POST['items_json'] : '');
        if ($reward === '') admin_exit('error', 'Chưa có vật phẩm giftcode hợp lệ.');
        $max_uses = min(2147483647, max(0, intval(isset($_POST['max_uses']) ? $_POST['max_uses'] : 1)));
        $expire_at = trim((string)(isset($_POST['expire_at']) ? $_POST['expire_at'] : (isset($_POST['expires_at']) ? $_POST['expires_at'] : '')));
        $hide = intval(isset($_POST['hide']) ? $_POST['hide'] : 1);
        try{$expires_sql=lhs_gift_expiry($expire_at);}catch(InvalidArgumentException $e){admin_exit('error',$e->getMessage());}
        try {
            $stmt = $conn_web->prepare("INSERT INTO giftcodes(code, giftcode, reward_items, max_uses, expire_at, expires_at, hide, is_active) VALUES(?, ?, ?, ?, ?, ?, ?, 1)");
            $stmt->execute(array($code, $code, $reward, $max_uses, $expires_sql, $expires_sql, $hide));
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') admin_exit('error', 'Mã giftcode đã tồn tại.');
            throw $e;
        }
        admin_exit('success', 'Đã tạo giftcode.', array('giftcode' => $code, 'code' => $code));
        break;

    case 'update_giftcode':
        admin_require_rate('update_giftcode', 30, 60);
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        if ($id < 1) admin_exit('error', 'ID giftcode không hợp lệ.');
        $stmt = $conn_web->prepare('SELECT id, code, used_count FROM giftcodes WHERE id=? LIMIT 1');
        $stmt->execute(array($id));
        $current = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$current) admin_exit('error', 'Giftcode không tồn tại.');
        $code = strtoupper(trim((string)(isset($_POST['code']) ? $_POST['code'] : '')));
        if ($code === '' || !preg_match('/^[A-Z0-9_-]{2,80}$/', $code)) admin_exit('error', 'Mã chỉ được gồm A-Z, số, gạch ngang hoặc gạch dưới (2-80 ký tự).');
        $max_uses = min(2147483647, max(0, intval(isset($_POST['max_uses']) ? $_POST['max_uses'] : 0)));
        $hide = intval(isset($_POST['hide']) ? $_POST['hide'] : 1) === 1 ? 1 : 0;
        $is_active = intval(isset($_POST['is_active']) ? $_POST['is_active'] : 1) === 1 ? 1 : 0;
        $expire_at = trim((string)(isset($_POST['expire_at']) ? $_POST['expire_at'] : ''));
        try{$expires_sql=lhs_gift_expiry($expire_at);}catch(InvalidArgumentException $e){admin_exit('error',$e->getMessage());}
        $used_count = intval($current['used_count']);
        $has_reward_payload = array_key_exists('items_json', $_POST);
        $reward = admin_parse_reward_json($has_reward_payload ? $_POST['items_json'] : '', 250);
        if ($has_reward_payload && $reward === '') {
            admin_exit('error', 'Danh sách quà phải có ít nhất 1 vật phẩm hợp lệ.');
        }
        if ($reward === '') {
            $stmt = $conn_web->prepare('SELECT reward_items FROM giftcodes WHERE id=?');
            $stmt->execute(array($id));
            $reward = (string)$stmt->fetchColumn();
        }
        try {
            $stmt = $conn_web->prepare('UPDATE giftcodes SET code=?, giftcode=?, reward_items=?, max_uses=?, expire_at=?, expires_at=?, hide=?, is_active=? WHERE id=?');
            $stmt->execute(array($code, $code, $reward, $max_uses, $expires_sql, $expires_sql, $hide, $is_active, $id));
            admin_log('', 'update_giftcode', 'update #' . $id . ' ' . $code . ' (used=' . $used_count . ')');
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') admin_exit('error', 'Mã giftcode đã tồn tại.');
            throw $e;
        }
        admin_exit('success', 'Đã cập nhật giftcode.');
        break;

    case 'delete_giftcode':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        if ($id < 1) admin_exit('error', 'ID mã quà tặng không hợp lệ.');
        $stmt = $conn_web->prepare('UPDATE giftcodes SET is_active=0 WHERE id=?');
        $stmt->execute(array($id));
        admin_log('', 'disable_giftcode', 'disable #' . $id);
        admin_exit('success', 'Đã tắt mã quà tặng; giữ nguyên lịch sử và các đơn quà đang chờ giao.');
        break;

    case 'hard_delete_giftcode':
        admin_require_rate('hard_delete_giftcode', 10, 60);
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        $confirm_code = strtoupper(trim((string)(isset($_POST['confirm_code']) ? $_POST['confirm_code'] : '')));
        if ($id < 1 || $confirm_code === '') admin_exit('error', 'Thiếu ID hoặc mã xác nhận giftcode.');
        try {
            $conn_web->beginTransaction();
            $stmt = $conn_web->prepare('SELECT id, code, giftcode, used_count, is_active FROM giftcodes WHERE id=? LIMIT 1 FOR UPDATE');
            $stmt->execute(array($id));
            $current = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$current) throw new InvalidArgumentException('Giftcode không tồn tại.');
            $current_code = strtoupper(trim((string)($current['code'] !== '' ? $current['code'] : $current['giftcode'])));
            if ($current_code === '' || $current_code !== $confirm_code) throw new InvalidArgumentException('Mã xác nhận không khớp.');
            $stmt = $conn_web->prepare('DELETE FROM giftcodes WHERE id=? AND (code=? OR giftcode=?)');
            $stmt->execute(array($id, $current_code, $current_code));
            if ($stmt->rowCount() !== 1) throw new RuntimeException('Xóa giftcode thất bại do dữ liệu vừa thay đổi.');
            admin_log('', 'hard_delete_giftcode', 'delete #' . $id . ' ' . $current_code . ' (used=' . intval($current['used_count']) . ', active=' . intval($current['is_active']) . ')');
            $conn_web->commit();
            admin_exit('success', 'Đã xóa vĩnh viễn giftcode. Lịch sử nhận và các đơn quà đã ghi nhận vẫn được giữ.');
        } catch (InvalidArgumentException $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            admin_exit('error', $e->getMessage());
        } catch (Exception $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            error_log('LHS admin hard_delete_giftcode error: ' . $e->getMessage());
            admin_exit('error', 'Không thể xóa giftcode lúc này.');
        }
        break;

    case 'get_recharge_milestones':
        $stmt = $conn_web->query("SELECT * FROM recharge_milestones ORDER BY sort_order ASC, id DESC");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        admin_exit('success', '', array('data' => $rows, 'milestones' => $rows));
        break;

    case 'get_recharge_events':
        try {
            $rows = $conn_web->query('SELECT * FROM donate_events ORDER BY starts_at DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$row) { $row['tiers'] = json_decode((string)$row['tiers_json'], true); if (!is_array($row['tiers'])) $row['tiers'] = array(); }
            unset($row);
            admin_exit('success', '', array('data' => $rows, 'events' => $rows));
        } catch (Throwable $e) { admin_log_error('get_recharge_events', $e); admin_exit('error', 'Không tải được danh sách sự kiện.'); }
        break;

    case 'save_recharge_event':
        admin_require_rate('save_recharge_event', 20, 60);
        try {
            $event_id = lhs_event_save($conn_web, $_POST);
            admin_log('', 'save_recharge_event', 'save #' . $event_id . ' ' . trim((string)(isset($_POST['title']) ? $_POST['title'] : '')));
            admin_exit('success', 'Đã lưu sự kiện nạp.', array('id' => $event_id));
        } catch (InvalidArgumentException $e) { admin_exit('error', $e->getMessage()); }
        catch (Throwable $e) { admin_log_error('save_recharge_event', $e); admin_exit('error', 'Không lưu được sự kiện; dữ liệu cũ được giữ nguyên.'); }
        break;

    case 'toggle_recharge_event':
    case 'delete_recharge_event':
        admin_require_rate('toggle_recharge_event', 30, 60);
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0); $value = $action === 'delete_recharge_event' ? 0 : intval(isset($_POST['value']) ? $_POST['value'] : 0);
        try {
            $stmt = $conn_web->prepare('SELECT * FROM donate_events WHERE id=? LIMIT 1'); $stmt->execute(array($id)); $event = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$event) admin_exit('error', 'Sự kiện không tồn tại.');
            if ($value === 1 && trim((string)$event['banner_path']) === '') admin_exit('error', 'Sự kiện cần banner trước khi bật.');
            if ((int)($_POST['edit_version'] ?? 0) !== (int)$event['edit_version']) admin_exit('error', 'Sự kiện vừa thay đổi. Hãy tải lại danh sách.');
            $event['is_active'] = $value === 1 ? '1' : '0';
            lhs_event_save($conn_web, $event);
            admin_log('', 'toggle_recharge_event', '#' . $id . ' => ' . ($value === 1 ? 'on' : 'off')); admin_exit('success', 'Đã cập nhật trạng thái sự kiện.');
        } catch (Throwable $e) { admin_log_error('toggle_recharge_event', $e); admin_exit('error', 'Không cập nhật được trạng thái sự kiện.'); }
        break;

    case 'upload_recharge_event_banner':
        admin_require_rate('upload_recharge_event_banner', 10, 60);
        if (!isset($_FILES['image_file']) || !is_array($_FILES['image_file'])) admin_exit('error', 'Chưa chọn file banner.');
        $file = $_FILES['image_file']; $error = intval(isset($file['error']) ? $file['error'] : -1); $size = intval(isset($file['size']) ? $file['size'] : 0); $tmp = (string)(isset($file['tmp_name']) ? $file['tmp_name'] : '');
        if ($error !== UPLOAD_ERR_OK || $size < 1 || $size > 8 * 1024 * 1024 || $tmp === '' || !is_uploaded_file($tmp)) admin_exit('error', 'File banner không hợp lệ hoặc vượt 8MB.');
        $info = @getimagesize($tmp); $mime = strtolower((string)($info['mime'] ?? '')); $map = array('image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'); if (!$info || !isset($map[$mime])) admin_exit('error', 'Chỉ hỗ trợ banner JPG, PNG hoặc WEBP.');
        $dir = dirname(__DIR__) . '/assets/images'; if (!is_dir($dir) && !mkdir($dir,0755,true)) admin_exit('error','Không tạo được thư mục ảnh.'); if (!is_writable($dir)) admin_exit('error','Thư mục ảnh không có quyền ghi.');
        $name = 'event_' . bin2hex(admin_random_bytes(16)) . '.' . $map[$mime]; $path = $dir . '/' . $name; if (!move_uploaded_file($tmp,$path)) admin_exit('error','Không lưu được banner.'); @chmod($path,0644); $asset = 'assets/images/' . $name; admin_log('', 'upload_recharge_event_banner', $asset); admin_exit('success','Đã upload banner.',array('path'=>$asset,'url'=>'../'.$asset.'?v='.time()));
        break;

    case 'get_lucky_wheel_prizes':
        try { admin_exit('success','',lucky_wheel_admin_list($conn_web)); }
        catch(Throwable $e){admin_log_error('get_lucky_wheel_prizes',$e);admin_exit('error','Chưa tải được danh sách quà.');}
        break;
    case 'save_lucky_wheel_prize':
    case 'bulk_save_lucky_wheel_items':
    case 'toggle_lucky_wheel_prize':
    case 'delete_lucky_wheel_prize':
        admin_require_rate('edit_lucky_wheel',30,60);
        try {
            if ($action==='save_lucky_wheel_prize') $result=lucky_wheel_admin_save($conn_web,$_POST);
            elseif ($action==='bulk_save_lucky_wheel_items') $result=lucky_wheel_admin_bulk_save($conn_web,$_POST['items_json'] ?? '');
            else $result=lucky_wheel_admin_change($conn_web,$_POST,$action==='delete_lucky_wheel_prize');
            $message=$action==='delete_lucky_wheel_prize'?'Đã xóa khỏi vòng quay. Lịch sử và quà đã trúng được giữ nguyên.':($action==='bulk_save_lucky_wheel_items'?'Đã thêm các item vào vòng quay.':'Đã lưu thay đổi.');
            if (!$result['pool_ready']) $message.=' Tổng tỷ lệ đang bật là '.$result['total_percent'].'%; cần đúng 100% để quay.';
            admin_exit('success',$message,$result);
        } catch(InvalidArgumentException $e) {admin_exit('error',$e->getMessage());}
        catch(Throwable $e){admin_log_error('edit_lucky_wheel',$e);admin_exit('error','Chưa lưu được. Nội dung đang sửa được giữ lại.');}
        break;

    case 'get_lucky_wheel_history':
        try {$stmt=$conn_web->query('SELECT id,account_name,server_id,prize_title,prize_type,xu_amount,item_id,item_amount,delivery_status,last_error,created_at FROM lucky_wheel_spins ORDER BY id DESC');$rows=$stmt->fetchAll(PDO::FETCH_ASSOC);admin_exit('success','',array('data'=>$rows,'spins'=>$rows));}
        catch(Throwable $e){admin_log_error('get_lucky_wheel_history',$e);admin_exit('error','Không tải được lịch sử Vòng Quay May Mắn.');}
        break;

    case 'save_recharge_milestone':
        admin_require_rate('save_recharge_milestone', 30, 60);
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        $period_raw = trim((string)(isset($_POST['period_type']) ? $_POST['period_type'] : 'total'));
        if (!in_array($period_raw, array('total','day','week','month'), true)) admin_exit('error', 'Loại kỳ Donate không hợp lệ.');
        $period_type = normalize_recharge_period($period_raw);
        $title = trim((string)(isset($_POST['title']) ? $_POST['title'] : ''));
        $milestone_amount = intval(isset($_POST['milestone_amount']) ? $_POST['milestone_amount'] : (isset($_POST['amount_required']) ? $_POST['amount_required'] : 0));
        $sort_order = intval(isset($_POST['sort_order']) ? $_POST['sort_order'] : 0);
        $is_active = intval(isset($_POST['is_active']) ? $_POST['is_active'] : 1);
        $reward = admin_parse_donate_reward_json(isset($_POST['items_json']) ? $_POST['items_json'] : '');
        if ($title === '' || $milestone_amount < 1) admin_exit('error', 'Vui lòng nhập tên mốc và mức Donate cần đạt.');
        if ($reward === '') admin_exit('error', 'Chưa có vật phẩm thưởng hợp lệ.');
        if ($id > 0) {
            $stmt = $conn_web->prepare('UPDATE recharge_milestones SET period_type=?, title=?, milestone_amount=?, amount_required=?, reward_items=?, is_active=?, sort_order=? WHERE id=?');
            $stmt->execute(array($period_type, $title, $milestone_amount, $milestone_amount, $reward, $is_active, $sort_order, $id));
            admin_log('', 'save_recharge_milestone', 'update #' . $id . ' ' . $title);
        } else {
            $stmt = $conn_web->prepare('INSERT INTO recharge_milestones(period_type, title, milestone_amount, amount_required, reward_items, is_active, sort_order) VALUES(?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute(array($period_type, $title, $milestone_amount, $milestone_amount, $reward, $is_active, $sort_order));
            admin_log('', 'save_recharge_milestone', 'create ' . $title);
        }
        admin_exit('success', 'Đã lưu mốc Donate.');
        break;

    case 'toggle_recharge_milestone':
        $stmt = $conn_web->prepare('UPDATE recharge_milestones SET is_active=? WHERE id=?');
        $stmt->execute(array(intval(isset($_POST['value']) ? $_POST['value'] : 0), intval(isset($_POST['id']) ? $_POST['id'] : 0)));
        admin_exit('success', 'Đã cập nhật trạng thái mốc.');
        break;

    case 'delete_recharge_milestone':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        if ($id < 1) admin_exit('error', 'ID mốc không hợp lệ.');
        $conn_web->prepare('UPDATE recharge_milestones SET is_active=0 WHERE id=?')->execute(array($id));
        admin_log('', 'disable_recharge_milestone', 'disable #' . $id);
        admin_exit('success', 'Đã tắt mốc Donate; lịch sử nhận quà được giữ lại để audit.');
        break;

    case 'get_auth_codes':
        $search = trim((string)(isset($_POST['search']) ? $_POST['search'] : ''));
        $sql = 'SELECT * FROM auth_codes';
        $params = array();
        if ($search !== '') {
            $sql .= ' WHERE code LIKE ? OR used_by_account LIKE ? OR used_server_id LIKE ? OR id = ? OR vip_type = ?';
            $kw = '%' . $search . '%';
            $params = array($kw, $kw, $kw, ctype_digit($search) ? intval($search) : 0, ctype_digit($search) ? intval($search) : 0);
        }
        $sql .= ' ORDER BY is_used ASC, id DESC LIMIT 300';
        $stmt = $conn_web->prepare($sql);
        $stmt->execute($params);
        $rows = array();
        $code_role_cache = array();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $row['char_info'] = array('role_id' => '', 'name' => '');
            $code_server_id = isset($row['used_server_id']) ? (string)$row['used_server_id'] : '';
            if (!empty($row['used_by_account']) && $code_server_id !== '' && gm_get_server($code_server_id)) {
                $code_role_key = $code_server_id . '|' . strtolower((string)$row['used_by_account']);
                if (!isset($code_role_cache[$code_role_key])) {
                    $roles = hk_roles_for_account('', $row['used_by_account'], $code_server_id);
                    $code_role_cache[$code_role_key] = !empty($roles)
                        ? array('role_id' => gm_role_id($roles[0]), 'name' => gm_role_name($roles[0], 'Nhân vật'))
                        : array('role_id' => '', 'name' => '');
                }
                $row['char_info'] = $code_role_cache[$code_role_key];
            }
            $rows[] = $row;
        }
        admin_exit('success', '', array('data' => $rows, 'codes' => $rows));
        break;

    case 'create_auth_code':
        admin_require_rate('create_auth_code', 20, 60);
        $vip_type = min(2, max(1, intval(isset($_POST['vip_type']) ? $_POST['vip_type'] : 1)));
        $quantity = min(100, max(1, intval(isset($_POST['quantity']) ? $_POST['quantity'] : 1)));
        $created = array();
        $stmt = $conn_web->prepare('INSERT INTO auth_codes(code, vip_type, is_used) VALUES(?, ?, 0)');
        for ($i = 0; $i < $quantity; $i++) {
            $code = 'VIP' . $vip_type . '-' . strtoupper(substr(bin2hex(admin_random_bytes(5)), 0, 10));
            $stmt->execute(array($code, $vip_type));
            $created[] = $code;
        }
        admin_exit('success', 'Đã tạo ' . count($created) . ' mã VIP.', array('codes' => $created));
        break;

    case 'update_auth_code_account':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        if ($id < 1) admin_exit('error', 'ID mã không hợp lệ.');
        $old_stmt = $conn_web->prepare('SELECT used_by_account FROM auth_codes WHERE id=? LIMIT 1');
        $old_stmt->execute(array($id));
        $old_account = (string)$old_stmt->fetchColumn();
        if ($account === '') {
            $stmt = $conn_web->prepare('UPDATE auth_codes SET is_used=0, is_active=1, used_by_account=NULL, used_server_id=NULL, used_at=NULL WHERE id=?');
            $stmt->execute(array($id));
            if ($old_account !== '') {
                $sync_error = '';
                if (vht6ur_recalculate_account_vip($old_account, $sync_error) === false) admin_exit('error', 'Đã gỡ mã nhưng chưa đồng bộ VIP SDK: ' . $sync_error);
            }
            admin_exit('success', 'Đã gỡ tài khoản khỏi mã VIP.');
        }
        if (!hk_find_account($account)) admin_exit('error', 'Tài khoản không tồn tại.');
        $stmt = $conn_web->prepare('UPDATE auth_codes SET is_used=1, is_active=1, used_by_account=?, used_server_id=?, used_at=NOW() WHERE id=?');
        $stmt->execute(array($account, $current_server_id, $id));
        foreach (array_unique(array_filter(array($old_account, $account))) as $affected_account) {
            $sync_error = '';
            if (vht6ur_recalculate_account_vip($affected_account, $sync_error) === false) admin_exit('error', 'Đã cập nhật mã nhưng chưa đồng bộ VIP SDK: ' . $sync_error);
        }
        admin_exit('success', 'Đã ủy quyền VIP cho tài khoản.');
        break;

    case 'delete_auth_code':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        if ($id < 1) admin_exit('error', 'ID mã không hợp lệ.');
        $old_stmt = $conn_web->prepare('SELECT used_by_account FROM auth_codes WHERE id=? LIMIT 1');
        $old_stmt->execute(array($id));
        $old_account = (string)$old_stmt->fetchColumn();
        $conn_web->prepare('DELETE FROM auth_codes WHERE id=?')->execute(array($id));
        if ($old_account !== '') {
            $sync_error = '';
            if (vht6ur_recalculate_account_vip($old_account, $sync_error) === false) admin_exit('error', 'Đã xóa mã nhưng chưa đồng bộ VIP SDK: ' . $sync_error);
        }
        admin_exit('success', 'Đã xóa mã VIP.');
        break;

    case 'get_vip_vouchers':
        $stmt = $conn_web->query('SELECT id, code, discount_amount, max_uses, used_count, is_active, expires_at, note, created_at FROM vip_vouchers ORDER BY id DESC LIMIT 300');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        admin_exit('success', '', array('data' => $rows, 'vouchers' => $rows));
        break;

    case 'save_vip_voucher':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        $code = normalize_vip_voucher_code(isset($_POST['code']) ? $_POST['code'] : '');
        $discount_amount = max(0, intval(isset($_POST['discount_amount']) ? $_POST['discount_amount'] : 0));
        $max_uses = max(0, intval(isset($_POST['max_uses']) ? $_POST['max_uses'] : 0));
        $is_active = intval(isset($_POST['is_active']) ? $_POST['is_active'] : 1);
        $expires_at = trim((string)(isset($_POST['expires_at']) ? $_POST['expires_at'] : ''));
        $note = trim((string)(isset($_POST['note']) ? $_POST['note'] : ''));
        if ($code === '' || $discount_amount < 1) admin_exit('error', 'Mã voucher hoặc số tiền giảm không hợp lệ.');
        $expires_sql = $expires_at !== '' ? str_replace('T', ' ', substr($expires_at, 0, 16)) . ':00' : null;
        if ($id > 0) {
            $stmt = $conn_web->prepare('UPDATE vip_vouchers SET code=?, voucher_code=?, discount_amount=?, discount_percent=?, max_uses=?, is_active=?, expires_at=?, note=? WHERE id=?');
            $stmt->execute(array($code, $code, $discount_amount, $discount_amount, $max_uses, $is_active, $expires_sql, $note, $id));
        } else {
            $stmt = $conn_web->prepare('INSERT INTO vip_vouchers(code, voucher_code, discount_amount, discount_percent, max_uses, is_active, expires_at, note) VALUES(?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute(array($code, $code, $discount_amount, $discount_amount, $max_uses, $is_active, $expires_sql, $note));
        }
        admin_exit('success', 'Đã lưu voucher VIP.');
        break;

    case 'toggle_vip_voucher':
        $stmt = $conn_web->prepare('UPDATE vip_vouchers SET is_active=? WHERE id=?');
        $stmt->execute(array(intval(isset($_POST['value']) ? $_POST['value'] : 0), intval(isset($_POST['id']) ? $_POST['id'] : 0)));
        admin_exit('success', 'Đã cập nhật voucher VIP.');
        break;

    case 'delete_vip_voucher':
        $id = intval(isset($_POST['id']) ? $_POST['id'] : 0);
        if ($id < 1) admin_exit('error', 'ID voucher không hợp lệ.');
        $conn_web->prepare('DELETE FROM vip_vouchers WHERE id=?')->execute(array($id));
        admin_exit('success', 'Đã xóa voucher VIP.');
        break;

    case 'set_user_vip':
        admin_require_rate('set_user_vip', 20, 60);
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $vip_type = min(2, max(0, intval(isset($_POST['vip_type']) ? $_POST['vip_type'] : 1)));
        if ($account === '') admin_exit('error', 'Thiếu tài khoản.');
        $user = hk_find_account($account);
        if (!$user) admin_exit('error', 'Tài khoản không tồn tại.');
        try {
            $conn_web->beginTransaction();
            $account_lock = $conn_web->prepare('SELECT account FROM account WHERE account=? FOR UPDATE');
            $account_lock->execute(array($account));
            if (!$account_lock->fetchColumn()) throw new RuntimeException('Tài khoản không tồn tại.');
            $conn_web->prepare("UPDATE auth_codes SET is_active=0 WHERE used_by_account=? AND used_server_id=? AND is_used=1")->execute(array($account, $current_server_id));
            if ($vip_type > 0) {
                $code = 'ADMIN-' . strtoupper(substr(bin2hex(admin_random_bytes(5)), 0, 10));
                $stmt = $conn_web->prepare("INSERT INTO auth_codes(code, vip_type, source, is_used, is_active, used_by_account, used_server_id, used_at) VALUES(?, ?, 'admin', 1, 1, ?, ?, NOW())");
                $stmt->execute(array($code, $vip_type, $account, $current_server_id));
            }
            $recalculate_error = '';
            if (vht6ur_recalculate_account_vip($account, $recalculate_error) === false) throw new RuntimeException($recalculate_error);
            $conn_web->commit();
        } catch (Exception $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            admin_log_error('set_user_vip', $e);
            admin_exit('error', 'Không thể cập nhật VIP lúc này.');
        }
        $sync_error = '';
        if (!vht6ur_sdk_sync_vip($account, isset($user['sdk_user_id']) ? $user['sdk_user_id'] : '', $vip_type, $sync_error)) {
            system_event_log('vip', 'error', 'partial', 'admin_sync_vip', 'MySQL đã cập nhật nhưng entitlement WebGM chưa đồng bộ.', $sync_error, $account, $current_server_id);
            admin_exit('error', 'MySQL đã cập nhật nhưng entitlement WebGM chưa đồng bộ. Kiểm tra SDK trước khi dùng công cụ GM.');
        }
        admin_log('', 'set_user_vip', $account . ' => VIP ' . $vip_type);
        admin_exit('success', $vip_type > 0 ? 'Đã cấp VIP ' . $vip_type . ' cho ' . $account . '.' : 'Đã thu hồi VIP của ' . $account . '.');
        break;

    case 'update_xu':
        admin_require_rate('update_xu', 20, 60);
        $account = trim((string)(isset($_POST['username']) ? $_POST['username'] : (isset($_POST['account']) ? $_POST['account'] : '')));
        $amount_raw = trim((string)(isset($_POST['amount']) ? $_POST['amount'] : ''));
        if ($amount_raw === '' || !preg_match('/^-?[0-9]+$/', $amount_raw)) admin_exit('error', 'Số Xu cập nhật phải là số nguyên.');
        $amount = filter_var($amount_raw, FILTER_VALIDATE_INT);
        if ($amount === false || abs($amount) > 2000000000) admin_exit('error', 'Số Xu cập nhật vượt giới hạn an toàn.');
        $add_recharge = isset($_POST['add_recharge']) && (string)$_POST['add_recharge'] === '1';
        $recharge_amount = 0;
        if ($add_recharge) {
            // Tương thích request cũ: nếu chưa có ô riêng thì dùng cùng số Xu.
            $recharge_raw = trim((string)(isset($_POST['recharge_amount']) ? $_POST['recharge_amount'] : ''));
            if ($recharge_raw === '') $recharge_raw = (string)$amount;
            if (!preg_match('/^[0-9]+$/', $recharge_raw)) admin_exit('error', 'Điểm nạp phải là số nguyên dương.');
            $recharge_amount = filter_var($recharge_raw, FILTER_VALIDATE_INT);
            if ($recharge_amount === false || $recharge_amount < 1 || $recharge_amount > 2000000000) admin_exit('error', 'Điểm nạp vượt giới hạn an toàn.');
        }
        if ($account === '') admin_exit('error', 'Thiếu tài khoản.');
        if ($amount === 0) admin_exit('error', 'Số Xu cập nhật không hợp lệ.');
        try {
            $user = hk_find_account($account);
            if (!$user) admin_exit('error', 'Tài khoản không tồn tại.');
            $conn_web->beginTransaction();
            if ($amount < 0) {
                $stmt = $conn_web->prepare('UPDATE account SET ptb = GREATEST(ptb + ?, 0) WHERE account = ?');
                $stmt->execute(array($amount, $account));
            } else {
                $stmt = $conn_web->prepare('UPDATE account SET ptb = ptb + ? WHERE account = ?');
                $stmt->execute(array($amount, $account));
            }
            $stmt = $conn_web->prepare('SELECT ptb FROM account WHERE account = ? LIMIT 1');
            $stmt->execute(array($account));
            $new_xu = intval($stmt->fetchColumn());
            $recharge_added = 0;
            $spins_awarded = 0;
            if ($recharge_amount > 0) {
                $credit_id = 'ADMIN-XU-' . strtoupper(bin2hex(admin_random_bytes(10)));
                $credit_external_id = 'ADMIN-XU-EXT-' . strtoupper(bin2hex(admin_random_bytes(10)));
                $credit_content = 'Cộng điểm nạp thủ công bởi ' . (string)$_SESSION['username'] . ' cùng thao tác cộng Xu; điểm nạp +' . $recharge_amount . '.';
                $credit_stmt = $conn_web->prepare("INSERT INTO sepay_logs(tran_id, external_id, account_name, server_id, amount, action, content) VALUES(?, ?, ?, ?, ?, 'topup_xu', ?)");
                $credit_stmt->execute(array($credit_id, $credit_external_id, $account, $current_server_id, $recharge_amount, $credit_content));
                $spins_awarded = lucky_wheel_credit_recharge_spins($account, 'account', $recharge_amount, $credit_id, 'admin_topup_xu');
                $recharge_added = $recharge_amount;
            }
            $log_detail = $account . ' ' . ($amount > 0 ? '+' : '') . $amount . ' Xu => ' . $new_xu;
            if ($recharge_added > 0) $log_detail .= '; điểm nạp +' . $recharge_added;
            if ($spins_awarded > 0) $log_detail .= '; lượt quay +' . $spins_awarded . ' tại S' . $current_server_id;
            admin_log('', 'update_xu', $log_detail);
            $conn_web->commit();
            $message = $recharge_added > 0 ? ('Đã cộng Xu và điểm nạp.' . ($spins_awarded > 0 ? (' Đồng thời nhận ' . $spins_awarded . ' lượt quay tại S' . $current_server_id . '.') : '')) : 'Đã cập nhật Xu (chỉ Xu).';
            admin_exit('success', $message, array('xu' => $new_xu, 'recharge_added' => $recharge_added, 'spins_awarded' => $spins_awarded));
        } catch (Exception $e) {
            if ($conn_web->inTransaction()) $conn_web->rollBack();
            error_log('LHS admin update_xu error: ' . $e->getMessage());
            admin_exit('error', 'Cập nhật Xu thất bại, vui lòng thử lại sau.');
        }
        break;

    case 'get_account_discipline_status':
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $payload = admin_game_ban_payload($account, $uin);
        if (empty($payload)) admin_exit('error', 'Thiếu thông tin tài khoản hoặc UID nhân vật.');
        $error = '';
        $game = admin_game_ban_call('/api/internal/account/ban-status', $payload, $error);
        if ($game === false) admin_exit('error', $error);
        $account_id = trim((string)(isset($game['accountId']) ? $game['accountId'] : $account));
        $web = web_discipline_status($account_id);
        admin_exit('success', '', array('game'=>$game, 'web'=>$web));
        break;

    case 'preview_account_discipline':
    case 'commit_account_discipline':
        admin_require_rate('account_discipline', 30, 60);
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $scope = strtolower(trim((string)(isset($_POST['scope']) ? $_POST['scope'] : 'game')));
        $operation = strtolower(trim((string)(isset($_POST['operation']) ? $_POST['operation'] : 'ban')));
        if (!in_array($scope, array('game','web','both'), true)) $scope = 'game';
        if (!in_array($operation, array('ban','unban'), true)) admin_exit('error', 'Thao tác kỷ luật không hợp lệ.');
        $payload = admin_game_ban_payload($account, $uin);
        if (empty($payload)) admin_exit('error', 'Thiếu thông tin tài khoản hoặc UID nhân vật.');
        $duration_seconds = max(0, intval(isset($_POST['duration_seconds']) ? $_POST['duration_seconds'] : 0));
        $reason = trim((string)(isset($_POST['reason']) ? $_POST['reason'] : ''));
        $code = trim((string)(isset($_POST['code']) ? $_POST['code'] : 'ACCOUNT_DISCIPLINE'));
        $meta = array('source'=>'webgm','eventId'=>43001,'shopId'=>11018000,'exploitCount'=>max(0,intval(isset($_POST['exploit_count'])?$_POST['exploit_count']:0)),'exploitBaozi'=>max(0,intval(isset($_POST['exploit_baozi'])?$_POST['exploit_baozi']:0)),'evidenceId'=>trim((string)(isset($_POST['evidence_id'])?$_POST['evidence_id']:'')));
        $is_commit = $_POST['action'] === 'commit_account_discipline';
        if ($operation === 'ban' && !$is_commit && $duration_seconds <= 0) admin_exit('error', 'Nhập số giây khóa để xem trước.');
        if ($operation === 'ban' && $is_commit && ($duration_seconds <= 0 || $reason === '')) admin_exit('error', 'Nhập số giây và lý do trước khi xác nhận khóa.');

        $game = null; $web = null; $statusError = '';
        $preGame = null; $preWeb = null;
        if ($is_commit && $scope === 'both') {
            $preGame = admin_game_ban_call('/api/internal/account/ban-status', $payload, $statusError);
            if ($preGame === false) admin_exit('error', $statusError);
            $resolved_before = $account !== '' ? vht6ur_clean_account($account) : (isset($preGame['accountId']) ? vht6ur_clean_account($preGame['accountId']) : '');
            $preWeb = web_discipline_status($resolved_before);
        }
        if ($scope === 'game' || $scope === 'both') {
            if ($operation === 'ban') {
                $gamePayload = array_merge($payload, array('durationSeconds'=>$duration_seconds,'reason'=>$reason,'code'=>$code,'meta'=>$meta,'dryRun'=>!$is_commit,'confirm'=>$is_commit));
                $game = admin_game_ban_call('/api/internal/account/ban', $gamePayload, $statusError);
            } else {
                $gamePayload = array_merge($payload, array('reason'=>$reason,'dryRun'=>!$is_commit,'confirm'=>$is_commit));
                $game = admin_game_ban_call('/api/internal/account/unban', $gamePayload, $statusError);
            }
            if ($game === false) admin_exit('error', $statusError);
        }
        $resolved_account = $account !== '' ? vht6ur_clean_account($account) : (isset($game['accountId']) ? vht6ur_clean_account($game['accountId']) : '');
        if ($scope === 'web' || $scope === 'both') {
            if ($operation === 'ban') {
                if (!$is_commit) $web = web_discipline_preview($resolved_account, $duration_seconds, $reason, $code, $meta);
                else $web = web_discipline_commit_ban($resolved_account, $duration_seconds, $reason, $code, $meta, isset($_SESSION['username'])?$_SESSION['username']:'admin', $statusError);
            } else {
                if (!$is_commit) $web = web_discipline_status($resolved_account);
                else $web = web_discipline_commit_unban($resolved_account, $reason, isset($_SESSION['username'])?$_SESSION['username']:'admin', $statusError);
            }
            if ($web === false) {
                // If game was already committed in a combined operation, undo
                // it before returning an error. No half-applied "both" state.
                if ($is_commit && $scope === 'both') {
                    if ($operation === 'ban') {
                        $rollbackPayload = array_merge($payload, array('reason'=>'Rollback WebGM failure','dryRun'=>false,'confirm'=>true));
                        admin_game_ban_call('/api/internal/account/unban', $rollbackPayload, $rollbackError);
                    } elseif ($preGame && !empty($preGame['ban']['banned'])) {
                        $previousBan = isset($preGame['ban']) && is_array($preGame['ban']) ? $preGame['ban'] : array();
                        $restorePayload = array_merge($payload, array(
                            'reason' => isset($previousBan['reason']) && $previousBan['reason'] !== '' ? $previousBan['reason'] : 'Khôi phục sau lỗi thao tác kết hợp',
                            'code' => isset($previousBan['code']) && $previousBan['code'] !== '' ? $previousBan['code'] : 'ACCOUNT_DISCIPLINE',
                            'meta' => isset($previousBan['meta']) && is_array($previousBan['meta']) ? $previousBan['meta'] : array(),
                            'durationSeconds' => !empty($previousBan['permanent']) ? 0 : max(1, intval(isset($previousBan['remainingSeconds']) ? $previousBan['remainingSeconds'] : 1)),
                            'permanent' => !empty($previousBan['permanent']),
                            'dryRun' => false,
                            'confirm' => true,
                        ));
                        admin_game_ban_call('/api/internal/account/ban', $restorePayload, $rollbackError);
                    }
                }
                admin_exit('error', $statusError !== '' ? $statusError : 'Không thể cập nhật trạng thái WebGM.');
            }
        }
        if (!$is_commit) admin_exit('success', 'Xem trước kỷ luật tài khoản.', array('operation'=>$operation,'scope'=>$scope,'game'=>$game,'web'=>$web,'preview'=>true));
        admin_log($uin, $operation === 'ban' ? 'discipline_ban_account' : 'discipline_unban_account', ($account !== '' ? $account : $uin) . '; scope=' . $scope . '; seconds=' . $duration_seconds . '; reason=' . $reason);
        admin_exit('success', $operation === 'ban' ? 'Đã áp dụng khóa tài khoản theo phạm vi chọn.' : 'Đã mở khóa tài khoản theo phạm vi chọn.', array('operation'=>$operation,'scope'=>$scope,'game'=>$game,'web'=>$web,'preview'=>false));
        break;

    case 'get_game_ban_status':
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $payload = admin_game_ban_payload($account, $uin);
        if (empty($payload)) admin_exit('error', 'Thiếu thông tin tài khoản hoặc UID nhân vật.');
        $error = '';
        $data = admin_game_ban_call('/api/internal/account/ban-status', $payload, $error);
        if ($data === false) admin_exit('error', $error);
        admin_exit('success', '', array('game' => $data));
        break;

    case 'preview_game_ban':
    case 'commit_game_ban':
        admin_require_rate('game_ban', 30, 60);
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $payload = admin_game_ban_payload($account, $uin);
        if (empty($payload)) admin_exit('error', 'Thiếu thông tin tài khoản hoặc UID nhân vật.');
        $duration_days = max(0, intval(isset($_POST['duration_days']) ? $_POST['duration_days'] : 0));
        $duration_minutes = max(0, intval(isset($_POST['duration_minutes']) ? $_POST['duration_minutes'] : 0));
        $reason = trim((string)(isset($_POST['reason']) ? $_POST['reason'] : ''));
        $code = trim((string)(isset($_POST['code']) ? $_POST['code'] : 'FORTUNE_BAOZI_EXPLOIT'));
        $exploit_count = max(0, intval(isset($_POST['exploit_count']) ? $_POST['exploit_count'] : 0));
        $exploit_baozi = max(0, intval(isset($_POST['exploit_baozi']) ? $_POST['exploit_baozi'] : 0));
        $evidence_id = trim((string)(isset($_POST['evidence_id']) ? $_POST['evidence_id'] : ''));
        $payload['durationDays'] = $duration_days;
        $payload['durationMinutes'] = $duration_minutes;
        $payload['reason'] = $reason;
        $payload['code'] = $code;
        $payload['meta'] = array(
            'source' => 'webgm',
            'eventId' => 43001,
            'shopId' => 11018000,
            'exploitCount' => $exploit_count,
            'exploitBaozi' => $exploit_baozi,
            'evidenceId' => $evidence_id,
        );
        $is_commit = $_POST['action'] === 'commit_game_ban';
        $payload['dryRun'] = !$is_commit;
        $payload['confirm'] = $is_commit;
        $data = admin_game_ban_call('/api/internal/account/ban', $payload, $error);
        if ($data === false) admin_exit('error', $error);
        if ($is_commit) {
            admin_log($uin, 'game_ban_account', $account . ($uin !== '' ? ' (' . $uin . ')' : '') . '; ' . $reason . '; ' . $duration_days . ' days');
            admin_exit('success', 'Đã khóa tài khoản game theo thời hạn.', array('game' => $data));
        }
        admin_exit('success', 'Xem trước khóa tài khoản game.', array('game' => $data));
        break;

    case 'preview_game_unban':
    case 'commit_game_unban':
        admin_require_rate('game_unban', 30, 60);
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $payload = admin_game_ban_payload($account, $uin);
        if (empty($payload)) admin_exit('error', 'Thiếu thông tin tài khoản hoặc UID nhân vật.');
        $reason = trim((string)(isset($_POST['reason']) ? $_POST['reason'] : 'Quản trị viên mở khóa tài khoản game'));
        $is_commit = $_POST['action'] === 'commit_game_unban';
        $payload['reason'] = $reason;
        $payload['dryRun'] = !$is_commit;
        $payload['confirm'] = $is_commit;
        $data = admin_game_ban_call('/api/internal/account/unban', $payload, $error);
        if ($data === false) admin_exit('error', $error);
        if ($is_commit) {
            admin_log($uin, 'game_unban_account', $account . ($uin !== '' ? ' (' . $uin . ')' : '') . '; ' . $reason);
            admin_exit('success', 'Đã mở khóa tài khoản game.', array('game' => $data));
        }
        admin_exit('success', 'Xem trước mở khóa tài khoản game.', array('game' => $data));
        break;

    case 'toggle_user_ban':
        $uin = trim((string)(isset($_POST['uin']) ? $_POST['uin'] : ''));
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : ''));
        $ban = intval(isset($_POST['ban']) ? $_POST['ban'] : 0);
        
        if ($account === '') admin_exit('error', 'Thiếu thông tin tài khoản.');
        try {
            $stmt = $conn_web->prepare("UPDATE account SET status=? WHERE account=?");
            $stmt->execute(array($ban === 1 ? 'locked' : 'active', $account));
            if ($stmt->rowCount() < 1 && !hk_find_account($account)) admin_exit('error', 'Tài khoản không tồn tại.');
            admin_log('', $ban === 1 ? 'ban_user' : 'unban_user', $account . ($uin !== '' ? ' (ID: ' . $uin . ')' : ''));
            admin_exit('success', $ban === 1 ? 'Đã khóa quyền đăng nhập công cụ GM.' : 'Đã mở khóa quyền đăng nhập công cụ GM.');
        } catch (Exception $e) {
            error_log('LHS admin toggle_user_ban error: ' . $e->getMessage());
            admin_exit('error', 'Không thể thao tác khóa tài khoản lúc này.');
        }
        break;

    case 'change_password':
        $account = trim((string)(isset($_POST['account']) ? $_POST['account'] : (isset($_POST['username']) ? $_POST['username'] : '')));
        $password = trim((string)(isset($_POST['new_password']) ? $_POST['new_password'] : (isset($_POST['password']) ? $_POST['password'] : '')));
        if ($account === '' || strlen($password) < 8) admin_exit('error', 'Thiếu tài khoản hoặc mật khẩu mới (tối thiểu 8 ký tự).');
        $user = hk_find_account($account);
        if (!$user) admin_exit('error', 'Tài khoản không tồn tại.');
        try {
            if (!hk_update_password($user['id'], $password)) admin_exit('error', 'Không thể đổi mật khẩu user.');
            admin_log('', 'change_password', $account);
            admin_exit('success', 'Đã đổi mật khẩu user.');
        } catch (Exception $e) {
            admin_log_error('change_password', $e);
            admin_exit('error', $e instanceof RuntimeException ? $e->getMessage() : 'Không thể đổi mật khẩu lúc này.');
        }
        break;

    case 'upload_site_image':
        $image_type = trim((string)(isset($_POST['image_type']) ? $_POST['image_type'] : ''));
        if ($image_type !== 'bg' && $image_type !== 'logo' && $image_type !== 'shop_item') admin_exit('error', 'Loại ảnh không hợp lệ.');
        if (!isset($_FILES['image_file']) || !is_array($_FILES['image_file'])) admin_exit('error', 'Chưa chọn file ảnh.');
        $file = $_FILES['image_file'];
        if (!isset($file['error']) || intval($file['error']) !== UPLOAD_ERR_OK) {
            admin_exit('error', 'Upload ảnh thất bại. Mã lỗi: ' . (isset($file['error']) ? intval($file['error']) : -1));
        }
        $size = isset($file['size']) ? intval($file['size']) : 0;
        if ($size < 1) admin_exit('error', 'File ảnh rỗng.');
        if ($size > 8 * 1024 * 1024) admin_exit('error', 'File ảnh vượt quá 8MB.');
        $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
        if ($tmp === '' || !is_uploaded_file($tmp)) admin_exit('error', 'File upload không hợp lệ.');
        $info = @getimagesize($tmp);
        if (!$info || empty($info['mime'])) admin_exit('error', 'File không phải ảnh hợp lệ.');
        $mime = strtolower((string)$info['mime']);
        $ext_map = array(
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif'
        );
        if (!isset($ext_map[$mime])) admin_exit('error', 'Chỉ hỗ trợ JPG, PNG, WEBP, GIF.');
        $ext = $ext_map[$mime];
        if ($image_type === 'logo' && $ext !== 'png') admin_exit('error', 'Logo phải là PNG. Trình duyệt sẽ tự chuyển PNG nếu hỗ trợ.');
        
        $target_dir = $image_type === 'shop_item' ? (dirname(__DIR__) . '/assets/images/icon_item') : (dirname(__DIR__) . '/assets/images');
        if (!is_dir($target_dir) && !mkdir($target_dir, 0755, true)) admin_exit('error', 'Không tạo được thư mục lưu trữ.');
        if (!is_writable($target_dir)) admin_exit('error', 'Thư mục không có quyền ghi.');
        
        $prefix = $image_type === 'logo' ? 'logo_upload' : ($image_type === 'shop_item' ? 'item' : 'bg_upload');
        $basename = $prefix . '_' . date('Ymd_His') . '_' . bin2hex(admin_random_bytes(3));
        $target_path = $target_dir . '/' . $basename . '.' . $ext;
        if (!move_uploaded_file($tmp, $target_path)) admin_exit('error', 'Không lưu được file ảnh upload.');
        @chmod($target_path, 0644);
        
        $asset_path = $image_type === 'shop_item' ? ('assets/images/icon_item/' . $basename . '.' . $ext) : ('assets/images/' . $basename . '.' . $ext);
        if ($image_type !== 'shop_item') {
            $setting_key = $image_type === 'logo' ? 'site_logo_image' : 'site_bg_image';
            web_set_setting($setting_key, $asset_path);
        } else {
            $upload_item_id = admin_icon_item_key(isset($_POST['item_id']) ? $_POST['item_id'] : '');
            $upload_item_name = trim((string)(isset($_POST['item_name']) ? $_POST['item_name'] : ''));
            if ($upload_item_id !== '' && hk_reward_exists($upload_item_id)) item_icon_upsert($upload_item_id, $upload_item_name, $asset_path);
        }
        admin_log('', 'upload_site_image', $image_type . ' => ' . $asset_path);
        admin_exit('success', 'Đã upload ảnh thành công.', array(
            'path' => $asset_path,
            'url_path' => $asset_path,
            'url' => '../' . $asset_path . '?v=' . time()
        ));
        break;

    default:
        admin_exit('error', 'Action không hợp lệ.');
}
?>
