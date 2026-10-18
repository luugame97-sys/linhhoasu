import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/gm/api/user_api.php', 'r') as f:
    content = f.read().decode('utf-8')

# 1. Add switch_server and switch_role after get_roles
target_after_get_roles = """    case 'get_roles':
        require_login();
        $roles = hk_roles_for_account($_SESSION['uin'], $_SESSION['username'], $_SESSION['server_id']);
        api_exit('success', '', array('roles' => $roles));
        break;"""

new_switch_handlers = """    case 'get_roles':
        require_login();
        $roles = hk_roles_for_account($_SESSION['uin'], $_SESSION['username'], $_SESSION['server_id']);
        api_exit('success', '', array('roles' => $roles));
        break;

    case 'switch_server':
        require_login();
        $target_server = isset($_POST['server_id']) ? trim((string)$_POST['server_id']) : '';
        if ($target_server === '' || !gm_get_server($target_server)) {
            api_exit('error', 'Máy chủ không hợp lệ.');
        }
        $_SESSION['server_id'] = $target_server;
        $server_info = gm_get_server($target_server);
        $_SESSION['server_name'] = $server_info['name'];
        unset($_SESSION['role_id']);
        api_exit('success', 'Đã chuyển sang máy chủ ' . $server_info['name'], array('server_id' => $target_server, 'server_name' => $server_info['name']));
        break;

    case 'switch_role':
        require_login();
        $target_role_id = isset($_POST['role_id']) ? trim((string)$_POST['role_id']) : '';
        if ($target_role_id === '') {
            api_exit('error', 'Vui lòng chọn nhân vật.');
        }
        $target_role = null;
        if (!hk_validate_role_for_session($target_role_id, $target_role) || !$target_role) {
            api_exit('error', 'Nhân vật không hợp lệ hoặc không thuộc máy chủ này.');
        }
        $_SESSION['role_id'] = $target_role_id;
        api_exit('success', 'Đã chọn nhân vật: ' . gm_role_name($target_role), array('role_id' => $target_role_id, 'role_name' => gm_role_name($target_role)));
        break;"""

# 2. Update submit_giftcode to accept role_id
old_submit_giftcode = """    case 'submit_giftcode':
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
            }"""

new_submit_giftcode = """    case 'submit_giftcode':
        require_login();
        require_api_rate('giftcode', 10, 60);
        $delivery_id = isset($_POST['delivery_id']) ? (int)$_POST['delivery_id'] : 0;
        try {
            if ($delivery_id > 0) {
                $result = lhs_reward_retry($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'giftcode');
                $delivery = lhs_reward_find($conn_web, $delivery_id, $_SESSION['username'], $_SESSION['server_id'], 'giftcode');
            } else {
                $role_id_req = isset($_POST['role_id']) ? trim((string)$_POST['role_id']) : '';
                if ($role_id_req !== '') {
                    $selected_role = null;
                    if (hk_validate_role_for_session($role_id_req, $selected_role) && $selected_role) {
                        $_SESSION['role_id'] = $role_id_req;
                    }
                }
                $role_error = '';
                $role = hk_default_session_role($role_error);
                if (!$role) api_exit('error', $role_error);
                $giftcode = isset($_POST['giftcode']) ? $_POST['giftcode'] : '';
                $delivery = lhs_reward_reserve_gift($conn_web, $_SESSION['username'], $_SESSION['server_id'], $giftcode, $role);
                $result = lhs_reward_dispatch($conn_web, $delivery);
            }"""

assert target_after_get_roles in content, "target_after_get_roles not found"
assert old_submit_giftcode in content, "old_submit_giftcode not found"

content = content.replace(target_after_get_roles, new_switch_handlers, 1)
content = content.replace(old_submit_giftcode, new_submit_giftcode, 1)

with sftp.file('/linhhoasu/webgame/gm/api/user_api.php', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/api/user_api.php')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))
c.close()
