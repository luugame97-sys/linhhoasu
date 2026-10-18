import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/gm/config.php', 'r') as f:
    content = f.read().decode('utf-8')

# 1. Update gm_get_role
old_gm_get_role = "function gm_get_role($openid,$server_id,&$error=null,$extra_identifiers=array()) { $roles=hk_roles_for_account(isset($_SESSION['uin'])?$_SESSION['uin']:'',(string)$openid,(string)$server_id);if($roles)return$roles[0];$error='Tài khoản chưa có nhân vật ở khu đã chọn.';return false; }"
new_gm_get_role = """function gm_get_role($openid,$server_id,&$error=null,$extra_identifiers=array()) {
    $roles = hk_roles_for_account(isset($_SESSION['uin'])?$_SESSION['uin']:'',(string)$openid,(string)$server_id);
    if ($roles) {
        if (!empty($_SESSION['role_id'])) {
            foreach ($roles as $r) {
                if ((string)gm_role_id($r) === (string)$_SESSION['role_id']) return $r;
            }
        }
        return $roles[0];
    }
    $error = 'Tài khoản chưa có nhân vật ở khu đã chọn.';
    return false;
}"""

# 2. Update hk_default_session_role
old_hk_default = """function hk_default_session_role(&$error = null) {
    if (empty($_SESSION['username'])) { $error = 'Chưa đăng nhập.'; return false; }
    $server_id = isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : '';
    $roles = hk_roles_for_account(isset($_SESSION['uin']) ? $_SESSION['uin'] : '', $_SESSION['username'], $server_id);
    if (!$roles) { $error = 'Tài khoản chưa có nhân vật ở máy chủ đã chọn.'; return false; }
    return $roles[0];
}"""

new_hk_default = """function hk_default_session_role(&$error = null) {
    if (empty($_SESSION['username'])) { $error = 'Chưa đăng nhập.'; return false; }
    $server_id = isset($_SESSION['server_id']) ? (string)$_SESSION['server_id'] : '';
    $roles = hk_roles_for_account(isset($_SESSION['uin']) ? $_SESSION['uin'] : '', $_SESSION['username'], $server_id);
    if (!$roles) { $error = 'Tài khoản chưa có nhân vật ở máy chủ đã chọn.'; return false; }
    if (!empty($_SESSION['role_id'])) {
        foreach ($roles as $r) {
            if ((string)gm_role_id($r) === (string)$_SESSION['role_id']) return $r;
        }
    }
    return $roles[0];
}"""

assert old_gm_get_role in content, "old_gm_get_role not found"
assert old_hk_default in content, "old_hk_default not found"

content = content.replace(old_gm_get_role, new_gm_get_role, 1)
content = content.replace(old_hk_default, new_hk_default, 1)

with sftp.file('/linhhoasu/webgame/gm/config.php', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/config.php')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))
c.close()
