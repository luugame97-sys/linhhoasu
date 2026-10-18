import os
import sys

with open(r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.php', 'r', encoding='utf-8') as f:
    php = f.read()

# 1. Add default server computation after line 25
needle_after_session = "if (!empty($_SESSION['logged_in'])) $_SESSION = array();\n?>"
replacement_after_session = """if (!empty($_SESSION['logged_in'])) $_SESSION = array();
$quarr_keys = array_keys($quarr);
$first_server_id = !empty($quarr_keys) ? (string)$quarr_keys[0] : '1001';
$first_server_name = isset($quarr[$first_server_id]['name']) ? $quarr[$first_server_id]['name'] : ('S' . $first_server_id);
?>"""
assert needle_after_session in php, "needle_after_session not found"
php = php.replace(needle_after_session, replacement_after_session, 1)

# 2. Critical style tag replacement
old_style_start = '<style id="login-action-critical">'
old_style_end = '</style>'
start_idx = php.find(old_style_start)
end_idx = php.find(old_style_end, start_idx)
assert start_idx != -1 and end_idx != -1, "critical style not found"

new_critical_style = """<style id="login-action-critical">
    html{overflow-y:scroll!important;overflow-x:hidden!important;scrollbar-gutter:stable!important}
    body{overflow-x:clip!important;max-width:100%!important}
    html::-webkit-scrollbar{width:10px}
    html::-webkit-scrollbar-track{background:rgba(226,232,240,.58)}
    html::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(56,189,248,.9),rgba(37,99,235,.92) 52%,rgba(20,184,166,.9));border:2px solid rgba(248,250,252,.92);border-radius:999px}
    body.modal-open,body.swal2-shown,body.swal2-height-auto{width:100%!important;max-width:100%!important;padding-right:0!important;overflow:hidden!important;overscroll-behavior:contain!important}
    .modal,.modal-open .modal,.swal2-container{padding-left:0!important;padding-right:0!important}
    .modal-open .modal{overflow-x:hidden!important;overflow-y:auto!important}
    .auth-panel{position:relative!important;z-index:30!important}
    .login-shared-actions{display:grid!important;gap:14px!important;margin-top:22px!important;padding-top:18px!important;position:relative!important;z-index:10!important}
    .login-shared-actions:before{content:""!important;position:absolute!important;top:0!important;left:8%!important;right:8%!important;height:1px!important;background:linear-gradient(90deg,transparent,rgba(14,165,233,.28),rgba(20,184,166,.22),transparent)!important}
    .login-action-btn{min-height:62px!important;border-radius:18px!important;padding:10px 12px!important;display:grid!important;grid-template-columns:42px minmax(0,1fr)30px!important;align-items:center!important;gap:11px!important;text-align:left!important;border:1px solid rgba(226,232,240,.92)!important;line-height:1.15!important;transition:border-color .22s cubic-bezier(.16,1,.3,1),box-shadow .22s cubic-bezier(.16,1,.3,1),background .22s cubic-bezier(.16,1,.3,1),color .22s cubic-bezier(.16,1,.3,1),transform .22s cubic-bezier(.16,1,.3,1)!important}
    .login-action-btn .action-icon,.login-action-btn .action-cue{display:inline-flex!important;align-items:center!important;justify-content:center!important;border-radius:14px!important;line-height:1!important}
    .login-action-btn .action-icon{width:42px!important;height:42px!important;font-size:1rem!important}
    .login-action-btn .action-cue{width:30px!important;height:30px!important;font-size:.78rem!important;transition:transform .22s cubic-bezier(.16,1,.3,1)!important}
    .login-action-btn .action-copy{min-width:0!important;display:grid!important;gap:3px!important}
    .login-action-btn .action-title,.login-action-btn .action-subtitle{display:block!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .login-action-btn .action-title{font-size:.96rem!important;font-weight:900!important;letter-spacing:0!important;line-height:1.1!important}
    .login-action-btn .action-subtitle{font-size:.74rem!important;font-weight:800!important;line-height:1.1!important;opacity:.86!important}
    .login-action-download{color:#fff!important;border-color:rgba(125,211,252,.48)!important;background:radial-gradient(circle at 18% 0%,rgba(255,255,255,.36),transparent 34%),linear-gradient(135deg,#0ea5e9,#0284c7 54%,#075985)!important;box-shadow:0 16px 34px rgba(14,165,233,.34),inset 0 1px 0 rgba(255,255,255,.38)!important}
    .login-action-download .action-icon{background:rgba(255,255,255,.2)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.26)!important}
    .login-action-download .action-cue{background:rgba(255,255,255,.16)!important}
    .login-action-recover{color:#334155!important;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(248,250,252,.78))!important;box-shadow:0 10px 24px rgba(15,23,42,.07),inset 0 1px 0 rgba(255,255,255,.82)!important}
    .login-action-recover .action-icon{color:#0369a1!important;background:rgba(224,242,254,.92)!important;box-shadow:inset 0 0 0 1px rgba(125,211,252,.32)!important}
    .login-action-recover .action-cue{color:#64748b!important;background:rgba(241,245,249,.94)!important}
    .login-action-btn:hover{transform:translateY(-2px)!important}
    .login-action-download:hover{color:#fff!important;box-shadow:0 20px 42px rgba(2,132,199,.42),0 0 0 4px rgba(14,165,233,.1),inset 0 1px 0 rgba(255,255,255,.42)!important}
    .login-action-recover:hover{color:#075985!important;border-color:rgba(14,165,233,.34)!important;background:radial-gradient(circle at 14% 0%,rgba(224,242,254,.94),transparent 36%),linear-gradient(180deg,rgba(255,255,255,.98),rgba(240,249,255,.86))!important;box-shadow:0 14px 30px rgba(14,165,233,.13),0 0 0 4px rgba(14,165,233,.07),inset 0 1px 0 rgba(255,255,255,.86)!important}
    .login-action-btn:hover .action-cue{transform:translateX(2px)!important}
    .login-action-btn:active{transform:translateY(0)!important}
    @media(max-width:480px){.login-shared-actions{gap:11px!important;margin-top:18px!important}.login-action-btn{min-height:58px!important;grid-template-columns:38px minmax(0,1fr)28px!important;gap:9px!important}.login-action-btn .action-icon{width:38px!important;height:38px!important}.login-action-btn .action-cue{width:28px!important;height:28px!important}.login-action-btn .action-title{font-size:.91rem!important}.login-action-btn .action-subtitle{font-size:.69rem!important}}

    /* Server Picker & Slider & Modal Critical */
    .server-picker-box{position:relative!important;margin-bottom:1.15rem!important;z-index:5!important}
    .server-active-card{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:11px 15px!important;background:rgba(255,255,255,.96)!important;border:2px solid #e2e8f0!important;border-radius:16px!important;cursor:pointer!important;transition:all .22s cubic-bezier(.16,1,.3,1)!important;box-shadow:0 4px 14px rgba(15,23,42,.04)!important;user-select:none!important}
    .server-active-card:hover{border-color:#38bdf8!important;background:#fff!important;box-shadow:0 8px 22px rgba(14,165,233,.15)!important;transform:translateY(-1px)!important}
    .server-card-main{display:flex!important;align-items:center!important;gap:12px!important;min-width:0!important}
    .server-card-icon{width:40px!important;height:40px!important;flex-shrink:0!important;border-radius:12px!important;background:linear-gradient(135deg,#e0f2fe,#bae6fd)!important;color:#0284c7!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1.15rem!important}
    .server-card-info{min-width:0!important;display:flex!important;flex-direction:column!important}
    .server-card-label{font-size:.68rem!important;font-weight:800!important;color:#64748b!important;letter-spacing:.06em!important;text-transform:uppercase!important;line-height:1.2!important}
    .server-card-name{font-size:.96rem!important;font-weight:900!important;color:#0f172a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;line-height:1.25!important}
    .server-card-meta{display:flex!important;align-items:center!important;gap:8px!important;flex-shrink:0!important}
    .server-status-pill{display:inline-flex!important;align-items:center!important;gap:5px!important;padding:3px 8px!important;border-radius:999px!important;background:#dcfce7!important;color:#15803d!important;font-size:.72rem!important;font-weight:800!important}
    .status-pulse{width:6px!important;height:6px!important;border-radius:50%!important;background:#22c55e!important;display:inline-block!important}
    .server-change-link{font-size:.8rem!important;font-weight:800!important;color:#0ea5e9!important;display:inline-flex!important;align-items:center!important;padding:4px 8px!important;border-radius:8px!important;background:rgba(14,165,233,.08)!important}
    .server-slider-wrap{margin-top:8px!important;display:flex!important;flex-direction:column!important;gap:4px!important}
    .server-slider-label{font-size:.72rem!important;font-weight:800!important;color:#64748b!important;padding-left:2px!important}
    .server-slider-track{display:flex!important;align-items:center!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:3px 2px 7px 2px!important;scroll-snap-type:x mandatory!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain!important;scrollbar-width:thin!important;scrollbar-color:#bae6fd transparent!important}
    .server-slider-track::-webkit-scrollbar{height:4px!important}
    .server-slider-track::-webkit-scrollbar-thumb{background:#bae6fd!important;border-radius:999px!important}
    .server-chip{flex:0 0 auto!important;scroll-snap-align:start!important;min-width:64px!important;height:35px!important;padding:0 11px!important;border-radius:11px!important;border:1.5px solid #e2e8f0!important;background:#fff!important;color:#475569!important;font-size:.84rem!important;font-weight:800!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;cursor:pointer!important;transition:all .18s cubic-bezier(.16,1,.3,1)!important;box-shadow:0 2px 4px rgba(15,23,42,.03)!important}
    .server-chip:hover{border-color:#7dd3fc!important;color:#0284c7!important;background:#f0f9ff!important}
    .server-chip .chip-dot{width:6px!important;height:6px!important;border-radius:50%!important;background:#22c55e!important;display:inline-block!important}
    .server-chip.active{background:linear-gradient(135deg,#0ea5e9,#0284c7)!important;border-color:transparent!important;color:#fff!important;font-weight:900!important;box-shadow:0 4px 14px rgba(14,165,233,.38)!important}
    .server-chip.active .chip-dot{background:#a7f3d0!important}
    .server-modal{z-index:100060!important}
    .server-modal .modal-dialog{max-width:540px!important;margin:1.75rem auto!important}
    .server-modal-content{border:1px solid rgba(226,232,240,.95)!important;border-radius:24px!important;box-shadow:0 25px 50px -12px rgba(15,23,42,.25)!important;background:#fff!important;overflow:hidden!important}
    .server-modal-header{padding:16px 20px 12px!important;border-bottom:1px solid #f1f5f9!important;display:flex!important;flex-direction:column!important;gap:8px!important;background:#f8fafc!important}
    .sheet-handle{width:40px!important;height:4px!important;border-radius:999px!important;background:#cbd5e1!important;margin:0 auto 4px!important}
    .server-modal-icon{width:42px!important;height:42px!important;border-radius:12px!important;background:linear-gradient(135deg,#0ea5e9,#0284c7)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1.15rem!important;flex-shrink:0!important}
    .btn-close-custom{width:34px!important;height:34px!important;border-radius:50%!important;border:1px solid #e2e8f0!important;background:#fff!important;color:#64748b!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1rem!important;cursor:pointer!important}
    .server-modal-body{padding:18px 20px!important;max-height:min(65vh,480px)!important;overflow-y:auto!important;overscroll-behavior:contain!important}
    .server-section-title{font-size:.8rem!important;font-weight:900!important;color:#475569!important;text-transform:uppercase!important;letter-spacing:.05em!important;margin-bottom:10px!important;display:flex!important;align-items:center!important}
    .server-featured-grid{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
    .server-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:10px!important}
    .server-card-item{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:12px 14px!important;border-radius:14px!important;border:2px solid #e2e8f0!important;background:#fff!important;cursor:pointer!important;transition:all .2s cubic-bezier(.16,1,.3,1)!important}
    .server-card-item:hover{border-color:#38bdf8!important;background:#f0f9ff!important;transform:translateY(-2px)!important}
    .server-card-item.featured{background:linear-gradient(135deg,#f0f9ff,#fff)!important;border-color:#7dd3fc!important}
    .server-card-item.active{border-color:#0ea5e9!important;background:#f0f9ff!important;box-shadow:0 0 0 1px #0ea5e9,0 6px 16px rgba(14,165,233,.15)!important}
    .server-card-item.active .server-item-check{color:#0ea5e9!important;opacity:1!important}
    .server-item-left{min-width:0!important;display:flex!important;flex-direction:column!important;gap:2px!important}
    .server-item-badge-featured{display:inline-flex!important;align-items:center!important;gap:4px!important;width:fit-content!important;font-size:.68rem!important;font-weight:900!important;padding:2px 7px!important;border-radius:6px!important;background:linear-gradient(135deg,#f59e0b,#d97706)!important;color:#fff!important;margin-bottom:2px!important}
    .server-item-title-row{display:flex!important;align-items:center!important;gap:6px!important}
    .server-code{font-size:.95rem!important;font-weight:900!important;color:#0f172a!important}
    .server-status-text{font-size:.72rem!important;font-weight:800!important;color:#16a34a!important;display:inline-flex!important;align-items:center!important;gap:4px!important}
    .server-item-name{font-size:.82rem!important;font-weight:800!important;color:#64748b!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .server-item-check{font-size:1.2rem!important;color:#cbd5e1!important;opacity:.35!important;flex-shrink:0!important}
    .server-modal-footer{padding:12px 20px!important;border-top:1px solid #f1f5f9!important;background:#f8fafc!important}
    @media(max-width:576px){
        .server-modal.modal{padding:0!important}
        .server-modal .modal-dialog{margin:0!important;margin-top:auto!important;max-width:100%!important;width:100%!important;display:flex!important;align-items:flex-end!important}
        .server-modal-content{border-bottom-left-radius:0!important;border-bottom-right-radius:0!important;border-top-left-radius:22px!important;border-top-right-radius:22px!important;max-height:82vh!important;width:100%!important}
        .server-grid{grid-template-columns:1fr!important}
    }
</style>"""

php = php[:start_idx] + new_critical_style + php[end_idx + len(old_style_end):]

# 3. Replace login form serverContainer
old_login_server = """                    <div class="form-floating mb-3 position-relative" id="serverContainer">
                        <input type="hidden" name="server_id" id="server_id" required>
                        <div class="form-control custom-dropdown-btn" data-bs-toggle="dropdown" id="serverDisplay">
                            <span id="serverText" class="text-muted">-- Chọn máy chủ --</span>
                            <i class="fa-solid fa-chevron-down text-muted small"></i>
                        </div>
                        <label><i class="fa-solid fa-server me-1 text-primary"></i> Máy chủ</label>
                        <ul class="dropdown-menu w-100 custom-dropdown-menu">
                            <?php foreach ($quarr as $id => $sv): ?>
                                <li><a class="dropdown-item server-option" href="#" data-value="<?php echo htmlspecialchars($id); ?>"><i class="fa-solid fa-gamepad me-2 text-primary"></i>S<?php echo htmlspecialchars($id); ?> - <?php echo htmlspecialchars($sv['name']); ?></a></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>"""

new_login_server = """                    <div class="server-picker-box" id="serverContainer">
                        <input type="hidden" name="server_id" id="server_id" value="<?php echo htmlspecialchars($first_server_id); ?>" required>
                        
                        <!-- Thẻ hiển thị máy chủ đang chọn (Chạm để mở modal) -->
                        <div class="server-active-card" id="serverDisplay" data-bs-toggle="modal" data-bs-target="#serverSelectModal" role="button" tabindex="0" title="Chạm để xem tất cả máy chủ">
                            <div class="server-card-main">
                                <div class="server-card-icon">
                                    <i class="fa-solid fa-server"></i>
                                </div>
                                <div class="server-card-info">
                                    <div class="server-card-label">MÁY CHỦ</div>
                                    <div class="server-card-name" id="serverText"><?php echo 'S' . htmlspecialchars($first_server_id) . ' - ' . htmlspecialchars($first_server_name); ?></div>
                                </div>
                            </div>
                            <div class="server-card-meta">
                                <span class="server-status-pill"><span class="status-pulse"></span>Hoạt động</span>
                                <span class="server-change-link">Đổi <i class="fa-solid fa-chevron-right ms-1"></i></span>
                            </div>
                        </div>

                        <!-- Thanh trượt chọn nhanh máy chủ (Dạng trượt mượt mà, swipeable) -->
                        <div class="server-slider-wrap">
                            <div class="server-slider-label"><i class="fa-solid fa-sliders me-1 text-primary"></i> Chọn nhanh máy chủ:</div>
                            <div class="server-slider-track" id="serverSliderTrack">
                                <?php foreach ($quarr as $id => $sv): ?>
                                    <button type="button" class="server-chip <?php echo (string)$id === (string)$first_server_id ? 'active' : ''; ?>" data-id="<?php echo htmlspecialchars($id); ?>" data-name="S<?php echo htmlspecialchars($id); ?> - <?php echo htmlspecialchars($sv['name']); ?>" title="Chọn S<?php echo htmlspecialchars($id); ?>">
                                        <span class="chip-dot"></span>
                                        <span class="chip-text">S<?php echo htmlspecialchars($id); ?></span>
                                    </button>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>"""

assert old_login_server in php, "old_login_server not found"
php = php.replace(old_login_server, new_login_server, 1)

# 4. Replace register form registerServerContainer
old_reg_server = """                    <div class="form-floating mb-3 position-relative" id="registerServerContainer">
                        <input type="hidden" name="server_id" id="reg_server_id" required>
                        <div class="form-control custom-dropdown-btn" data-bs-toggle="dropdown" id="regServerDisplay">
                            <span id="regServerText" class="text-muted">-- Chọn máy chủ --</span>
                            <i class="fa-solid fa-chevron-down text-muted small"></i>
                        </div>
                        <label><i class="fa-solid fa-server me-1 text-success"></i> Máy chủ</label>
                        <ul class="dropdown-menu w-100 custom-dropdown-menu">
                            <?php foreach ($quarr as $id => $sv): ?>
                                <li><a class="dropdown-item register-server-option" href="#" data-value="<?php echo htmlspecialchars($id); ?>"><i class="fa-solid fa-gamepad me-2 text-success"></i>S<?php echo htmlspecialchars($id); ?> - <?php echo htmlspecialchars($sv['name']); ?></a></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>"""

new_reg_server = """                    <div class="server-picker-box" id="registerServerContainer">
                        <input type="hidden" name="server_id" id="reg_server_id" value="<?php echo htmlspecialchars($first_server_id); ?>" required>
                        
                        <div class="server-active-card" id="regServerDisplay" data-bs-toggle="modal" data-bs-target="#serverSelectModal" role="button" tabindex="0" title="Chạm để xem tất cả máy chủ">
                            <div class="server-card-main">
                                <div class="server-card-icon" style="background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #16a34a;">
                                    <i class="fa-solid fa-server"></i>
                                </div>
                                <div class="server-card-info">
                                    <div class="server-card-label" style="color: #16a34a;">MÁY CHỦ</div>
                                    <div class="server-card-name" id="regServerText"><?php echo 'S' . htmlspecialchars($first_server_id) . ' - ' . htmlspecialchars($first_server_name); ?></div>
                                </div>
                            </div>
                            <div class="server-card-meta">
                                <span class="server-status-pill"><span class="status-pulse"></span>Hoạt động</span>
                                <span class="server-change-link" style="color: #16a34a; background: rgba(22, 163, 74, 0.08);">Đổi <i class="fa-solid fa-chevron-right ms-1"></i></span>
                            </div>
                        </div>

                        <div class="server-slider-wrap">
                            <div class="server-slider-label"><i class="fa-solid fa-sliders me-1 text-success"></i> Chọn nhanh máy chủ:</div>
                            <div class="server-slider-track" id="regServerSliderTrack">
                                <?php foreach ($quarr as $id => $sv): ?>
                                    <button type="button" class="server-chip <?php echo (string)$id === (string)$first_server_id ? 'active' : ''; ?>" data-id="<?php echo htmlspecialchars($id); ?>" data-name="S<?php echo htmlspecialchars($id); ?> - <?php echo htmlspecialchars($sv['name']); ?>" title="Chọn S<?php echo htmlspecialchars($id); ?>">
                                        <span class="chip-dot"></span>
                                        <span class="chip-text">S<?php echo htmlspecialchars($id); ?></span>
                                    </button>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </div>"""

assert old_reg_server in php, "old_reg_server not found"
php = php.replace(old_reg_server, new_reg_server, 1)

# 5. Add serverSelectModal before script tags
needle_scripts = '<script src="<?php echo htmlspecialchars($login_js_url, ENT_QUOTES, \'UTF-8\'); ?>"></script>'
assert needle_scripts in php, "needle_scripts not found"

modal_markup = """<!-- Modal Chọn Máy Chủ Đa Năng -->
<div class="modal fade server-modal" id="serverSelectModal" tabindex="-1" aria-labelledby="serverSelectModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content server-modal-content">
            <div class="server-modal-header">
                <div class="sheet-handle d-md-none" aria-hidden="true"></div>
                <div class="d-flex align-items-center justify-content-between w-100">
                    <div class="d-flex align-items-center gap-3">
                        <div class="server-modal-icon"><i class="fa-solid fa-server"></i></div>
                        <div>
                            <h5 class="modal-title fw-black mb-0" id="serverSelectModalLabel">CHỌN MÁY CHỦ</h5>
                            <div class="small text-muted fw-bold">Chọn máy chủ Linh Họa Sư để tiếp tục</div>
                        </div>
                    </div>
                    <button type="button" class="btn-close-custom" data-bs-dismiss="modal" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="modal-body server-modal-body">
                <!-- Máy chủ đề cử -->
                <div class="server-section-title">
                    <i class="fa-solid fa-fire text-warning me-2"></i> Máy chủ đề cử (Mới nhất)
                </div>
                <div class="server-featured-grid mb-3">
                    <div class="server-card-item featured active" data-id="<?php echo htmlspecialchars($first_server_id); ?>" data-name="S<?php echo htmlspecialchars($first_server_id); ?> - <?php echo htmlspecialchars($first_server_name); ?>" role="button">
                        <div class="server-item-left">
                            <div class="server-item-badge-featured"><i class="fa-solid fa-star"></i> MỚI NHẤT</div>
                            <div class="server-item-name" style="font-size:0.95rem;font-weight:900;color:#0f172a;">S<?php echo htmlspecialchars($first_server_id); ?> - <?php echo htmlspecialchars($first_server_name); ?></div>
                            <div class="server-item-status"><span class="status-pulse"></span> Sôi nổi • Hoạt động ổn định</div>
                        </div>
                        <div class="server-item-check"><i class="fa-solid fa-circle-check"></i></div>
                    </div>
                </div>

                <!-- Tất cả máy chủ -->
                <div class="server-section-title">
                    <i class="fa-solid fa-list-check text-primary me-2"></i> Tất cả máy chủ
                </div>
                <div class="server-grid">
                    <?php foreach ($quarr as $id => $sv): ?>
                        <div class="server-card-item <?php echo (string)$id === (string)$first_server_id ? 'active' : ''; ?>" data-id="<?php echo htmlspecialchars($id); ?>" data-name="S<?php echo htmlspecialchars($id); ?> - <?php echo htmlspecialchars($sv['name']); ?>" role="button">
                            <div class="server-item-left">
                                <div class="server-item-title-row">
                                    <span class="server-code">S<?php echo htmlspecialchars($id); ?></span>
                                    <span class="server-status-text"><span class="status-pulse"></span> Hoạt động</span>
                                </div>
                                <div class="server-item-name"><?php echo htmlspecialchars($sv['name']); ?></div>
                            </div>
                            <div class="server-item-check"><i class="fa-solid fa-circle-check"></i></div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="server-modal-footer">
                <button type="button" class="btn btn-secondary w-100 fw-bold py-2 rounded-3" data-bs-dismiss="modal">Đóng</button>
            </div>
        </div>
    </div>
</div>

"""

php = php.replace(needle_scripts, modal_markup + needle_scripts, 1)

with open(r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.php', 'w', encoding='utf-8') as f:
    f.write(php)

print("Updated login.php successfully!")
