<?php
require_once 'config.php';
require_once 'web_experience.php';
require_once 'web_context.php';
lhs_web_private_headers();
$download_links = game_download_links();
$site_logo_url = site_asset_url(site_logo_image());
$site_bg_url = site_asset_url(site_bg_image());
$site_bg_css_url = site_absolute_asset_url(site_bg_image());
function login_page_asset_url($path) {
    $url = site_asset_url($path);
    $file = __DIR__ . '/' . ltrim($path, '/');
    if (is_file($file)) {
        $url .= (strpos($url, '?') === false ? '?' : '&') . 'v=' . filemtime($file);
    }
    return $url;
}
$ui_css_url = login_page_asset_url('assets/css/ui-refactor.css');
$login_css_url = login_page_asset_url('assets/css/login.css');
$login_js_url = login_page_asset_url('assets/js/login.js');
if (lhs_web_session_valid()) {
    header('Location: index.php');
    exit;
}
if (!empty($_SESSION['logged_in'])) $_SESSION = array();
$quarr_keys = array_keys($quarr);
$first_server_id = !empty($quarr_keys) ? (string)$quarr_keys[0] : '1001';
$first_server_name = isset($quarr[$first_server_id]['name']) ? $quarr[$first_server_id]['name'] : ('S' . $first_server_id);
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#0f172a">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="application-name" content="Linh Họa Sư">

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web quản lý tài khoản Linh Họa Sư - Đăng nhập</title>
    <?php echo csrf_meta_tag(); ?>
    <link rel="icon" type="image/png" href="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>">
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($ui_css_url, ENT_QUOTES, 'UTF-8'); ?>">
    <link rel="stylesheet" href="<?php echo htmlspecialchars($login_css_url, ENT_QUOTES, 'UTF-8'); ?>">
    <style>:root{--site-bg-image:url('<?php echo htmlspecialchars($site_bg_css_url, ENT_QUOTES, 'UTF-8'); ?>');}</style>
    <style id="login-action-critical">
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

    /* Compact Card & Header */
    .card-custom{padding:18px 22px 20px!important;border-radius:22px!important}
    .brand-lockup{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:12px!important;margin-bottom:12px!important;text-align:left!important}
    .logo-img{width:44px!important;height:44px!important;border-radius:12px!important;object-fit:cover!important;background:#fff!important;padding:2px!important;box-shadow:0 4px 12px rgba(14,116,144,.16)!important;flex-shrink:0!important}
    .brand-info{display:flex!important;flex-direction:column!important;gap:2px!important}
    .brand-title{margin:0!important;font-size:1.22rem!important;font-weight:900!important;line-height:1.15!important;letter-spacing:.02em!important;color:#0f172a!important}
    .brand-subtitle{display:inline-flex!important;align-items:center!important;gap:4px!important;padding:2px 8px!important;border-radius:999px!important;background:linear-gradient(135deg,var(--blue-soft),#fff7ed)!important;color:var(--blue-dark)!important;border:1px solid rgba(125,211,252,.7)!important;font-size:.72rem!important;font-weight:800!important;width:fit-content!important}
    .btn-switch-wrap{display:none!important}

    /* Server Picker Compact (Bỏ hẳn thanh trượt nhanh) */
    .server-picker-box{position:relative!important;margin-bottom:.85rem!important;z-index:5!important}
    .server-active-card{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:9px 13px!important;background:rgba(255,255,255,.96)!important;border:2px solid #e2e8f0!important;border-radius:14px!important;cursor:pointer!important;transition:all .2s cubic-bezier(.16,1,.3,1)!important;box-shadow:0 3px 10px rgba(15,23,42,.03)!important;user-select:none!important}
    .server-active-card:hover{border-color:#38bdf8!important;background:#fff!important;box-shadow:0 6px 18px rgba(14,165,233,.12)!important;transform:translateY(-1px)!important}
    .server-card-main{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important}
    .server-card-icon{width:36px!important;height:36px!important;flex-shrink:0!important;border-radius:11px!important;background:linear-gradient(135deg,#e0f2fe,#bae6fd)!important;color:#0284c7!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:1rem!important}
    .server-card-info{min-width:0!important;display:flex!important;flex-direction:column!important}
    .server-card-label{font-size:.65rem!important;font-weight:800!important;color:#64748b!important;letter-spacing:.05em!important;text-transform:uppercase!important;line-height:1.15!important}
    .server-card-name{font-size:.92rem!important;font-weight:900!important;color:#0f172a!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;line-height:1.2!important}
    .server-card-meta{display:flex!important;align-items:center!important;gap:6px!important;flex-shrink:0!important}
    .server-status-pill{display:inline-flex!important;align-items:center!important;gap:4px!important;padding:2px 7px!important;border-radius:999px!important;background:#dcfce7!important;color:#15803d!important;font-size:.68rem!important;font-weight:800!important}
    .status-pulse{width:6px!important;height:6px!important;border-radius:50%!important;background:#22c55e!important;display:inline-block!important}
    .server-change-link{font-size:.78rem!important;font-weight:800!important;color:#0ea5e9!important;display:inline-flex!important;align-items:center!important;padding:3px 7px!important;border-radius:7px!important;background:rgba(14,165,233,.08)!important}
    .form-floating>.form-control{min-height:50px!important;border-radius:14px!important;padding-top:1.3rem!important;padding-bottom:.4rem!important;font-size:.95rem!important}
    .form-floating>label{font-size:.84rem!important;padding:.6rem .8rem!important}
    .btn-gradient{min-height:46px!important;border-radius:14px!important;font-size:.96rem!important;font-weight:900!important}
    .login-shared-actions{gap:8px!important;margin-top:14px!important;padding-top:12px!important}
    .login-action-btn{min-height:48px!important;border-radius:13px!important;padding:7px 11px!important}
    body.is-iframe-popup .game-intro,@media (max-width: 900px){.game-intro{display:none!important}.login-layout{grid-template-columns:1fr!important}.login-wrapper{padding:8px!important;max-width:440px!important}.card-custom{padding:14px 16px 16px!important;border-radius:20px!important}}
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
</style>
</head>
<body>
<div class="login-snow-layer" aria-hidden="true"></div>
<div class="login-wrapper">
    <div class="login-layout">
        <!-- Banner giới thiệu game theo bố cục WebGM tham chiếu -->
        <section class="game-intro" aria-label="Linh Họa Sư">
            <div class="intro-content">
                <div class="intro-badge"><i class="fa-solid fa-shield-heart"></i> Quản lý tài khoản</div>
                <h1 class="intro-title">Linh Họa Sư</h1>
                <p class="intro-text">Đăng nhập và quản lý tài khoản Linh Họa Sư: xem nhân vật, điểm danh, Donate và nhận quà.</p>
            </div>
        </section>

        <!-- Thẻ đăng nhập kính mờ -->
        <div class="card-custom">
            <div class="brand-lockup">
                <img src="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>" class="logo-img" alt="Linh Họa Sư">
                <div class="brand-info">
                    <h2 class="brand-title">LINH HỌA SƯ</h2>
                    <span class="brand-subtitle"><i class="fa-solid fa-wand-magic-sparkles"></i> Web quản lý tài khoản</span>
                </div>
            </div>

            <div id="alert-box" class="alert d-none rounded-4 fw-bold small shadow-sm border-0"></div>
<div class="auth-panel">
            <div id="loginBox">
                <form id="loginForm">
                    <input type="hidden" name="action" value="login">
                    <div class="server-picker-box" id="serverContainer">
                        <input type="hidden" name="server_id" id="server_id" value="<?php echo htmlspecialchars($first_server_id); ?>" required>
                        
                        <!-- Thẻ hiển thị máy chủ đang chọn (Chạm để mở modal) -->
                        <div class="server-active-card" id="serverDisplay" data-bs-toggle="modal" data-bs-target="#serverSelectModal" role="button" tabindex="0" title="Chạm để đổi máy chủ">
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
                    </div>

                    <div class="form-floating mb-2.5 account-field">
                        <input type="text" maxlength="20" class="form-control account-input" id="username" name="username" placeholder="Nhập tài khoản" autocomplete="username" required style="padding-right: 48px;">
                        <label for="username"><i class="fa-solid fa-user me-1 text-primary"></i> Tài khoản</label>
                        <button type="button" class="account-info-btn position-absolute end-0 top-50 translate-middle-y border-0 bg-transparent text-muted p-0 me-3" style="z-index: 5; font-size: 1.15rem; line-height: 1;" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-placement="left" data-bs-content="Tài khoản 4-20 ký tự, bắt đầu bằng chữ cái; chỉ dùng chữ, số và dấu gạch dưới." title="Quy định tài khoản">
                            <i class="fa-solid fa-circle-info text-primary opacity-75"></i>
                        </button>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="password" maxlength="32" class="form-control" id="password" name="password" placeholder="Mật khẩu" autocomplete="current-password" required>
                        <label for="password"><i class="fa-solid fa-lock me-1 text-primary"></i> Mật khẩu</label>
                    </div>

                    <button type="submit" class="btn btn-gradient w-100" id="btnLogin">ĐĂNG NHẬP <i class="fa-solid fa-arrow-right ms-1"></i></button>
                    <div class="text-center mt-2.5 pt-1">
                        <a href="/register.html" class="text-decoration-none small text-muted fw-bold">Chưa có tài khoản? <span class="text-primary fw-bolder">Đăng ký ngay</span></a>
                    </div>
                </form>
            </div>

            <div id="registerBox" class="d-none" hidden aria-hidden="true">
                <form id="registerForm">
                    <input type="hidden" name="action" value="register">

                    <div class="server-picker-box" id="registerServerContainer">
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

                    </div>

                    <div class="form-floating mb-3 account-field">
                        <input type="text" maxlength="20" class="form-control account-input" id="reg_username" name="username" placeholder="Nhập tài khoản" autocomplete="username" required style="padding-right: 48px;">
                        <label for="reg_username"><i class="fa-solid fa-user-plus me-1 text-success"></i> Tài khoản mới</label>
                        <button type="button" class="account-info-btn position-absolute end-0 top-50 translate-middle-y border-0 bg-transparent text-muted p-0 me-3" style="z-index: 5; font-size: 1.15rem; line-height: 1;" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-placement="left" data-bs-content="Tài khoản 4-20 ký tự, bắt đầu bằng chữ cái; chỉ dùng chữ, số và dấu gạch dưới." title="Quy định tài khoản">
                            <i class="fa-solid fa-circle-info text-success opacity-75"></i>
                        </button>
                    </div>

                    <div class="form-floating mb-3">
                        <input type="password" minlength="8" maxlength="32" class="form-control" id="reg_password" name="password" placeholder="Mật khẩu" autocomplete="new-password" required>
                        <label for="reg_password"><i class="fa-solid fa-key me-1 text-success"></i> Mật khẩu</label>
                    </div>
                    <div class="form-floating mb-4">
                        <input type="password" minlength="8" maxlength="32" class="form-control" id="reg_re_password" name="re_password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" required>
                        <label for="reg_re_password"><i class="fa-solid fa-check-double me-1 text-success"></i> Nhập lại mật khẩu</label>
                    </div>

                    <div class="form-floating mb-4">
                        <input type="text" maxlength="6" class="form-control text-uppercase" id="invite_code" name="invite_code" placeholder="Mã giới thiệu" autocomplete="off">
                        <label for="invite_code"><i class="fa-solid fa-ticket me-1 text-success"></i> Mã giới thiệu (nếu server yêu cầu)</label>
                    </div>

                    <button type="submit" class="btn btn-gradient w-100" id="btnRegister" style="background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);">ĐĂNG KÝ NGAY <i class="fa-solid fa-check ms-1"></i></button>
                </form>
            </div>
            </div>

            <div class="login-shared-actions">
                <button type="button" class="btn btn-download w-100 login-action-btn login-action-download" data-bs-toggle="modal" data-bs-target="#downloadModal">
                    <span class="action-icon"><i class="fa-solid fa-cloud-arrow-down"></i></span>
                    <span class="action-copy">
                        <span class="action-title">TẢI GAME</span>
                        <span class="action-subtitle">Android / iOS / PC</span>
                    </span>
                    <span class="action-cue"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
                </button>
                <button type="button" class="btn btn-recover w-100 login-action-btn login-action-recover" data-bs-toggle="modal" data-bs-target="#recoverModal">
                    <span class="action-icon"><i class="fa-solid fa-key"></i></span>
                    <span class="action-copy">
                        <span class="action-title">Quên mật khẩu</span>
                        <span class="action-subtitle">Liên hệ quản trị viên để xác minh</span>
                    </span>
                    <span class="action-cue"><i class="fa-solid fa-chevron-right"></i></span>
                </button>
            </div>

        </div>
    </div>
</div>

<div class="modal fade" id="downloadModal" tabindex="-1" aria-labelledby="downloadModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 450px;">
        <div class="modal-content">
            <div class="download-modal-header">
                <h5 class="download-modal-title" id="downloadModalLabel">
                    <i class="fa-solid fa-circle-down"></i> TẢI GAME LINH HỌA SƯ
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="download-list">
                <!-- Android Platform -->
                <?php if (!empty($download_links['android'])): ?>
                <a href="<?php echo htmlspecialchars($download_links['android'], ENT_QUOTES, 'UTF-8'); ?>" target="_blank" class="download-item-card android">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-android"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">TẢI BẢN ANDROID (APK)</span>
                        <span class="platform-subtitle">Cài đặt trực tiếp file APK an toàn</span>
                    </div>
                    <span class="status-badge available">ĐÃ CÓ</span>
                </a>
                <?php else: ?>
                <div class="download-item-card android disabled-card">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-android"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">TẢI BẢN ANDROID (APK)</span>
                        <span class="platform-subtitle">Cài đặt trực tiếp file APK an toàn</span>
                    </div>
                    <span class="status-badge coming-soon">CHƯA CÓ</span>
                </div>
                <?php endif; ?>

                <!-- iOS Platform -->
                <?php if (!empty($download_links['ios'])): ?>
                <a href="<?php echo htmlspecialchars($download_links['ios'], ENT_QUOTES, 'UTF-8'); ?>" target="_blank" class="download-item-card ios is-available">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-apple"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">TẢI BẢN iOS (IPHONE/IPAD)</span>
                        <span class="platform-subtitle">Phiên bản dành cho hệ điều hành iOS</span>
                    </div>
                    <span class="status-badge available" style="background: rgba(245, 158, 11, 0.1); color: var(--gold);">ĐÃ CÓ</span>
                </a>
                <?php else: ?>
                <div class="download-item-card ios">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-apple"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">TẢI BẢN iOS (IPHONE/IPAD)</span>
                        <span class="platform-subtitle">Phiên bản dành cho hệ điều hành iOS</span>
                    </div>
                    <span class="status-badge coming-soon">CHƯA CÓ</span>
                </div>
                <?php endif; ?>

                <!-- Windows/PC Platform -->
                <?php if (!empty($download_links['pc'])): ?>
                <a href="<?php echo htmlspecialchars($download_links['pc'], ENT_QUOTES, 'UTF-8'); ?>" target="_blank" class="download-item-card windows">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-windows"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">CHƠI TRÊN MÁY TÍNH (PC)</span>
                        <span class="platform-subtitle">Bản App độc lập siêu nhẹ, không cần giả lập</span>
                    </div>
                    <span class="status-badge available">ĐÃ CÓ</span>
                </a>
                <?php else: ?>
                <div class="download-item-card windows disabled-card">
                    <div class="download-icon-box">
                        <i class="fa-brands fa-windows"></i>
                    </div>
                    <div class="download-info">
                        <span class="platform-title">CHƠI TRÊN MÁY TÍNH (PC)</span>
                        <span class="platform-subtitle">Bản App độc lập siêu nhẹ, không cần giả lập</span>
                    </div>
                    <span class="status-badge coming-soon">CHƯA CÓ</span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="recoverModal" tabindex="-1" aria-labelledby="recoverModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 450px;">
        <div class="modal-content">
            <div class="modal-header border-0 pb-0 pt-4 px-4 d-flex align-items-center justify-content-between">
                <h5 class="modal-title fw-black text-danger" id="recoverModalLabel">
                    <i class="fa-solid fa-key me-2"></i>KHÔI PHỤC MẬT KHẨU
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body px-4 pb-4 pt-3">
                <div id="recover-alert-box" class="alert d-none rounded-4 fw-bold small shadow-sm border-0 mb-3"></div>
                <div class="alert alert-warning rounded-4 fw-bold small border-0 mb-0">
                    <i class="fa-solid fa-shield-halved me-2"></i> Vì số điện thoại không phải mã OTP, hệ thống không tự đặt lại mật khẩu. Hãy liên hệ quản trị viên và cung cấp thông tin nhân vật để được xác minh thủ công.
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modal Chọn Máy Chủ Đa Năng -->
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

<script src="<?php echo htmlspecialchars($login_js_url, ENT_QUOTES, 'UTF-8'); ?>"></script>
<?php lhs_web_experience_assets(); ?>

<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}
</script>
</body>
</html>
