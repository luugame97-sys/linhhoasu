import paramiko, re

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/gm/index.php', 'r') as f:
    content = f.read().decode('utf-8')

# 1. Patch top of index.php (session server_id & role_id sync)
pattern_top = r"\$username = \$_SESSION\['username'\];\s*\$account_userid = \$_SESSION\['uin'\];\s*\$server_id = \$_SESSION\['server_id'\];\s*\$server_name = \$_SESSION\['server_name'\];\s*\$is_admin_account = current_session_is_admin\(\);"

replacement_top = """$username = $_SESSION['username'];
$account_userid = $_SESSION['uin'];

// Đồng bộ server_id từ query parameter (nếu có từ game popup hoặc link ngoài)
if (isset($_GET['server_id']) && isset($quarr[(string)$_GET['server_id']])) {
    $req_server_id = (string)$_GET['server_id'];
    if ($req_server_id !== (string)$_SESSION['server_id']) {
        $_SESSION['server_id'] = $req_server_id;
        $_SESSION['server_name'] = isset($quarr[$req_server_id]['name']) ? $quarr[$req_server_id]['name'] : ('S' . $req_server_id);
        unset($_SESSION['role_id']);
    }
}
$server_id = $_SESSION['server_id'];
$server_name = isset($quarr[$server_id]['name']) ? $quarr[$server_id]['name'] : (isset($_SESSION['server_name']) ? $_SESSION['server_name'] : ('S' . $server_id));
$is_admin_account = current_session_is_admin();

if (isset($_GET['role_id']) && !empty($_GET['role_id'])) {
    $req_role_id = trim((string)$_GET['role_id']);
    if ($req_role_id !== '') {
        $chk_role = null;
        if (hk_validate_role_for_session($req_role_id, $chk_role)) {
            $_SESSION['role_id'] = $req_role_id;
        }
    }
}"""

# 2. Patch role loading lines 89-98
pattern_roles = r"\$region_uin = \$account_userid;\s*\$role_id = '';\s*\$role_name = 'Chưa tạo nhân vật';\s*\$role_error = '';\s*\$role = gm_get_role\(\$username, \$server_id, \$role_error, array\(\$account_userid\)\);\s*if \(\$role\) \{\s*\$role_id = gm_role_id\(\$role\);\s*\$role_name = gm_role_name\(\$role, 'Nhân vật'\);\s*\}"

replacement_roles = """$region_uin = $account_userid;
$role_id = '';
$role_name = 'Chưa tạo nhân vật';
$role_level = 1;
$role_error = '';
$all_roles = hk_roles_for_account($account_userid, $username, $server_id);
if (!is_array($all_roles)) $all_roles = array();
$role = gm_get_role($username, $server_id, $role_error, array($account_userid));
if ($role) {
    $role_id = gm_role_id($role);
    $role_name = gm_role_name($role, 'Nhân vật');
    $role_level = isset($role['level']) ? (int)$role['level'] : 1;
}"""

# 3. Patch user badge server (make clickable to open modal)
pattern_badge = r'<div class="user-badge text-primary border-primary bg-primary bg-opacity-10 user-badge-server"><i class="fa-solid fa-server"></i> S<\?php echo htmlspecialchars\(\$server_id\); \?></div>'
replacement_badge = '<div class="user-badge text-primary border-primary bg-primary bg-opacity-10 user-badge-server" style="cursor:pointer;" data-bs-toggle="modal" data-bs-target="#switchServerModal" title="Chạm để đổi máy chủ"><i class="fa-solid fa-server"></i> <span id="active_server_badge">S<?php echo htmlspecialchars($server_id); ?></span> <i class="fa-solid fa-chevron-down ms-1 small opacity-75"></i></div>'

# 4. Patch tab-giftcode
pattern_giftcode = r'<!-- TAB GIFTCODE -->\s*<div class="main-tab-pane" id="tab-giftcode">\s*<div class="tab-title"><i class="fa-solid fa-gift me-2 text-success"></i> Kho báu mã quà tặng</div>\s*<div class="inner-box p-4 mb-4 border-2 border-success bg-success bg-opacity-10">\s*<form class="ajax-form d-flex gap-3 align-items-center">\s*<input type="hidden" name="action" value="submit_giftcode">\s*<input type="text" name="giftcode" id="inputMaQuaTang" class="form-control form-control-lg text-uppercase fw-black shadow-sm" placeholder="Nhập mã quà tặng\.\.\." required>\s*<button type="button" class="btn-custom text-white px-5 shadow-sm" style="background: linear-gradient\(135deg, #10b981, #34d399\); white-space:nowrap" onclick="submitAjax\(this\)">ĐỔI QUÀ <i class="fa-solid fa-box-open ms-1"></i></button>\s*</form>\s*</div>'

replacement_giftcode = """<!-- TAB GIFTCODE -->
                <div class="main-tab-pane" id="tab-giftcode">
                    <div class="tab-title"><i class="fa-solid fa-gift me-2 text-success"></i> Kho báu mã quà tặng</div>

                    <!-- THẺ ĐÍCH NHẬN QUÀ: MÁY CHỦ & NHÂN VẬT -->
                    <div class="card border-0 shadow-sm mb-3 rounded-4" style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-left: 4px solid #10b981 !important;">
                        <div class="card-body p-3 p-md-4">
                            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                                <div>
                                    <div class="small fw-black text-success text-uppercase mb-1"><i class="fa-solid fa-bullseye me-1"></i> Đích nhận quà hiện tại</div>
                                    <div class="d-flex align-items-center flex-wrap gap-2">
                                        <span class="badge bg-primary px-3 py-2 fs-6 rounded-pill" id="active_server_display_name"><i class="fa-solid fa-server me-1"></i> S<?php echo htmlspecialchars($server_id); ?> - <?php echo htmlspecialchars($server_name); ?></span>
                                        <?php if ($role): ?>
                                            <span class="badge bg-success px-3 py-2 fs-6 rounded-pill" id="active_role_display_name"><i class="fa-solid fa-user-check me-1"></i> <?php echo htmlspecialchars($role_name); ?> (Lv.<?php echo $role_level; ?>)</span>
                                        <?php else: ?>
                                            <span class="badge bg-danger px-3 py-2 fs-6 rounded-pill" id="active_role_display_name"><i class="fa-solid fa-triangle-exclamation me-1"></i> Chưa có nhân vật ở S<?php echo htmlspecialchars($server_id); ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                                <div>
                                    <button type="button" class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 py-2 shadow-sm" data-bs-toggle="modal" data-bs-target="#switchServerModal"><i class="fa-solid fa-repeat me-1"></i> Đổi Máy Chủ</button>
                                </div>
                            </div>

                            <?php if (count($all_roles) > 1): ?>
                            <div class="mt-3 pt-3 border-top border-success border-opacity-25">
                                <label for="giftcode_role_select" class="form-label small fw-bold text-dark mb-1"><i class="fa-solid fa-users me-1 text-primary"></i> Máy chủ S<?php echo htmlspecialchars($server_id); ?> có <?php echo count($all_roles); ?> nhân vật. Chọn nhân vật nhận quà:</label>
                                <select class="form-select fw-bold border-success shadow-sm" id="giftcode_role_select" name="role_id">
                                    <?php foreach ($all_roles as $r_item): 
                                        $r_uid = gm_role_id($r_item);
                                        $r_sel = ($r_uid === (string)$role_id) ? 'selected' : '';
                                    ?>
                                        <option value="<?php echo htmlspecialchars($r_uid); ?>" <?php echo $r_sel; ?>>
                                            <?php echo htmlspecialchars(gm_role_name($r_item)); ?> (Cấp <?php echo (int)(isset($r_item['level'])?$r_item['level']:1); ?>) — ID: <?php echo htmlspecialchars($r_uid); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <?php elseif ($role): ?>
                                <input type="hidden" id="giftcode_role_select" name="role_id" value="<?php echo htmlspecialchars($role_id); ?>">
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- FORM NHẬP MÃ QUÀ TẶNG -->
                    <div class="inner-box p-4 mb-3 border-2 border-success bg-success bg-opacity-10">
                        <form id="giftcodeForm" class="d-flex flex-column flex-sm-row gap-3 align-items-stretch align-items-sm-center">
                            <input type="hidden" name="action" value="submit_giftcode">
                            <input type="hidden" name="role_id" id="hidden_giftcode_role_id" value="<?php echo htmlspecialchars($role_id); ?>">
                            <input type="text" name="giftcode" id="inputMaQuaTang" class="form-control form-control-lg text-uppercase fw-black shadow-sm" placeholder="Nhập mã quà tặng..." required>
                            <button type="button" id="btnSubmitGiftcode" class="btn-custom text-white px-5 shadow-sm" style="background: linear-gradient(135deg, #10b981, #34d399); white-space:nowrap" onclick="submitGiftcodeWithConfirmation(this)" <?php echo !$role ? 'disabled' : ''; ?>>
                                ĐỔI QUÀ <i class="fa-solid fa-box-open ms-1"></i>
                            </button>
                        </form>
                        <?php if (!$role): ?>
                            <div class="text-danger small fw-bold mt-2"><i class="fa-solid fa-circle-exclamation me-1"></i> Bạn chưa có nhân vật ở S<?php echo htmlspecialchars($server_id); ?>. Vui lòng vào game tạo nhân vật hoặc đổi sang máy chủ đang chơi.</div>
                        <?php endif; ?>
                    </div>

                    <!-- THÔNG BÁO QUY ĐỊNH NHẬN QUÀ (CHÍNH XÁC THEO QUY ĐỊNH CHÍNH THỨC) -->
                    <div class="alert alert-warning border-0 bg-warning bg-opacity-10 rounded-3 p-3 mb-4 text-dark small fw-bold">
                        <div class="d-flex align-items-start gap-2">
                            <i class="fa-solid fa-circle-info text-warning fs-5 mt-1"></i>
                            <div>
                                <div class="fw-black text-warning-emphasis mb-1">QUY ĐỊNH NHẬN GIFTCODE:</div>
                                <ul class="mb-0 ps-3">
                                    <li>Mỗi tài khoản nhận <strong>1 lần / mã / server</strong>. Đã nhận ở S1 vẫn được nhận ở S7 nếu mã còn hiệu lực và đủ điều kiện.</li>
                                    <li>Nếu cùng server có nhiều nhân vật, giftcode chỉ được nhận vào <strong>một nhân vật</strong>, không nhận thêm bằng nhân vật khác.</li>
                                </ul>
                            </div>
                        </div>
                    </div>"""

# 5. Add switchServerModal before </body>
modal_html = """
<!-- Modal Chọn/Đổi Máy Chủ -->
<div class="modal fade" id="switchServerModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold"><i class="fa-solid fa-server text-primary me-2"></i>Chọn Máy Chủ</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small fw-bold mb-3">Chọn máy chủ bạn muốn quản lý hoặc đổi quà:</p>
                <div class="d-grid gap-2">
                    <?php foreach ($quarr as $s_id => $s_data): 
                        $is_curr = ((string)$s_id === (string)$server_id);
                    ?>
                        <button type="button" class="btn text-start p-3 rounded-3 d-flex align-items-center justify-content-between <?php echo $is_curr ? 'btn-primary text-white' : 'btn-outline-secondary'; ?> switch-server-btn" data-server-id="<?php echo htmlspecialchars($s_id); ?>">
                            <div>
                                <div class="fw-bold fs-6">S<?php echo htmlspecialchars($s_id); ?> - <?php echo htmlspecialchars($s_data['name']); ?></div>
                                <small class="<?php echo $is_curr ? 'text-white-50' : 'text-muted'; ?>">Máy chủ hoạt động</small>
                            </div>
                            <?php if ($is_curr): ?>
                                <span class="badge bg-light text-primary fw-bold">Hiện tại</span>
                            <?php else: ?>
                                <i class="fa-solid fa-chevron-right text-muted"></i>
                            <?php endif; ?>
                        </button>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>
"""

assert re.search(pattern_top, content), "pattern_top not found"
assert re.search(pattern_roles, content), "pattern_roles not found"
assert re.search(pattern_badge, content), "pattern_badge not found"
assert re.search(pattern_giftcode, content), "pattern_giftcode not found"

content = re.sub(pattern_top, replacement_top, content, count=1)
content = re.sub(pattern_roles, replacement_roles, content, count=1)
content = re.sub(pattern_badge, replacement_badge, content, count=1)
content = re.sub(pattern_giftcode, replacement_giftcode, content, count=1)

content = content.replace('</body>', modal_html + '\n</body>', 1)

with sftp.file('/linhhoasu/webgame/gm/index.php', 'w') as f:
    f.write(content.encode('utf-8'))

sftp.close()

_, out, err = c.exec_command('php -l /linhhoasu/webgame/gm/index.php')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))
c.close()
