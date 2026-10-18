import paramiko, re

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

# 1. Patch login.php
with sftp.file('/linhhoasu/webgame/gm/login.php', 'r') as f:
    login_php = f.read().decode('utf-8')

pattern_srv = r"(\$quarr_keys = array_keys\(\$quarr\);\s*\$first_server_id = !empty\(\$quarr_keys\) \? \(string\)\$quarr_keys\[0\] : '1001';)"
replacement_srv = r"""$quarr_keys = array_keys($quarr);
$first_server_id = !empty($quarr_keys) ? (string)$quarr_keys[0] : '1001';
if (isset($_GET['server_id']) && isset($quarr[(string)$_GET['server_id']])) {
    $first_server_id = (string)$_GET['server_id'];
}"""

assert re.search(pattern_srv, login_php), "pattern_srv not found in login.php"
login_php = re.sub(pattern_srv, replacement_srv, login_php, count=1)

with sftp.file('/linhhoasu/webgame/gm/login.php', 'w') as f:
    f.write(login_php.encode('utf-8'))

# 2. Patch login.js
with sftp.file('/linhhoasu/webgame/gm/assets/js/login.js', 'r') as f:
    login_js = f.read().decode('utf-8')

pattern_js_init = r"// Tự động khôi phục server đã lưu khi mở trang & phát hiện iframe popup\s*\$\(function\(\) \{[\s\S]*?localStorage\.getItem\('lhs_selected_server_name'\);[\s\S]*?\}\s*\}\s*catch \(e\) \{\}\s*\}\);"

replacement_js_init = """// Tự động khôi phục server từ URL hoặc localStorage khi mở trang & phát hiện iframe popup
$(function() {
    if (window.self !== window.top) {
        $('body').addClass('is-iframe-popup');
    }
    try {
        var urlParams = new URLSearchParams(window.location.search || '');
        var urlServerId = urlParams.get('server_id');
        if (urlServerId && $('.server-card-item[data-id="' + urlServerId + '"]').length) {
            selectServer(urlServerId, $('.server-card-item[data-id="' + urlServerId + '"]').first().data('name'));
        } else {
            var savedId = localStorage.getItem('lhs_selected_server_id');
            var savedName = localStorage.getItem('lhs_selected_server_name');
            if (savedId && $('.server-card-item[data-id="' + savedId + '"]').length) {
                selectServer(savedId, savedName || $('.server-card-item[data-id="' + savedId + '"]').first().data('name'));
            }
        }
    } catch (e) {}
});"""

pattern_redirect = r"setTimeout\(function\(\) \{\s*location\.href = r\.role === 'admin' \? 'admin/index\.php' : 'index\.php';\s*\}, 500\);"
replacement_redirect = """var targetRedirect = (r.role === 'admin' ? 'admin/index.php' : 'index.php') + (window.location.search ? window.location.search : '');
            setTimeout(function() { location.href = targetRedirect; }, 500);"""

assert re.search(pattern_js_init, login_js), "pattern_js_init not found in login.js"
assert re.search(pattern_redirect, login_js), "pattern_redirect not found in login.js"

login_js = re.sub(pattern_js_init, replacement_js_init, login_js, count=1)
login_js = re.sub(pattern_redirect, replacement_redirect, login_js, count=1)

with sftp.file('/linhhoasu/webgame/gm/assets/js/login.js', 'w') as f:
    f.write(login_js.encode('utf-8'))

sftp.close()

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/login.php')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))
c.close()
