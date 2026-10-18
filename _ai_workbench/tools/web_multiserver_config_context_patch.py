"""Strict text-only config transform. Never deploy config.redacted.php.

The caller supplies the current real config in memory on the owning host and
must separately back it up, lint, hash-guard and install the returned text.
No network, file writes, credentials, or command execution in this module.
"""

REPLACEMENTS = (
    (
        "$required = array('web_settings','account','web_admins','auth_codes','api_rate_limits','gm_logs','system_event_logs','recharge_milestones','recharge_milestone_claims','sepay_logs');",
        "$required = array('web_settings','account','web_admins','auth_codes','api_rate_limits','gm_logs','system_event_logs','recharge_milestones','recharge_milestone_claims','sepay_logs','daily_checkins','daily_checkin_account_claims','web_reward_deliveries');",
        1,
    ),
    (
        "'api_base' => vht6ur_env('LHS_SERVER_' . $lhs_i . '_API_BASE', vht6ur_env('LHS_GAME_HTTP_BASE', 'http://127.0.0.1:8080')),",
        "'api_base' => vht6ur_env('LHS_SERVER_' . $lhs_i . '_API_BASE', $lhs_i === 1 ? vht6ur_env('LHS_GAME_HTTP_BASE', 'http://127.0.0.1:8080') : ''),",
        1,
    ),
    (
        """    $server_key = $server_key === null
        ? (isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : (isset($_POST['server_id']) ? (string)$_POST['server_id'] : ''))
        : (string)$server_key;
    $server = $server_key !== '' ? gm_get_server($server_key) : false;
    $configured = $server && !empty($server['api_base'])
        ? (string)$server['api_base']
        : vht6ur_env('LHS_GAME_HTTP_BASE', 'http://127.0.0.1:8080');""",
        """    $explicit_server = $server_key !== null;
    $server_key = $server_key === null
        ? (isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : '')
        : (string)$server_key;
    $server = $server_key !== '' ? gm_get_server($server_key) : false;
    if (($explicit_server || $server_key !== '' || !empty($_SESSION['logged_in']))
        && (!$server || empty($server['api_base']))) {
        throw new RuntimeException('Máy chủ chưa có tuyến API hợp lệ; yêu cầu đã được dừng.');
    }
    $configured = $server ? (string)$server['api_base']
        : vht6ur_env('LHS_GAME_HTTP_BASE', 'http://127.0.0.1:8080');""",
        1,
    ),
    (
        "function hk_roles_for_account($sdk_id, $account_name, $server_id = '1001')",
        "function hk_roles_for_account($sdk_id, $account_name, $server_id = '')",
        1,
    ),
    (
        "$server_id = isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : lhs_first_server_key();",
        "$server_id = isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : '';",
        2,
    ),
    (
        """    if (!hk_validate_role_for_session($role_id, $role)) { $error = 'Nhân vật không thuộc tài khoản đang đăng nhập.'; return false; }
    return vht6ur_sdk_web_send_items""",
        """    if (!hk_validate_role_for_session($role_id, $role)) { $error = 'Nhân vật không thuộc tài khoản đang đăng nhập.'; return false; }
    if (!isset($role['world_id']) || (string)$role['world_id'] !== (string)$server_id) { $error = 'Nhân vật không thuộc máy chủ của yêu cầu.'; return false; }
    return vht6ur_sdk_web_send_items""",
        1,
    ),
    (
        """    foreach ($required as $table) {
        $stmt = $conn_web->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1');
        $stmt->execute(array($table));
        if (!$stmt->fetchColumn()) {
            throw new RuntimeException('Database website chưa được import account_Linhhoasu.sql (thiếu bảng ' . $table . ').');
        }
    }""",
        """    $placeholders = implode(',', array_fill(0, count($required), '?'));
    $stmt = $conn_web->prepare('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (' . $placeholders . ')');
    $stmt->execute($required);
    $found = array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
    foreach ($required as $table) {
        if (!isset($found[$table])) {
            throw new RuntimeException('Database website chưa được import account_Linhhoasu.sql (thiếu bảng ' . $table . ').');
        }
    }""",
        1,
    ),
)


def apply_config_context_hardening(source):
    """Apply known baseline deltas exactly once; fail closed on source drift."""
    normalized = source.replace('\r\n', '\n')
    for index, (old, new, expected) in enumerate(REPLACEMENTS, 1):
        actual = normalized.count(old)
        if actual != expected:
            raise ValueError('Config context patch #%d expected %d matches; found %d' % (index, expected, actual))
        normalized = normalized.replace(old, new)
    return normalized
