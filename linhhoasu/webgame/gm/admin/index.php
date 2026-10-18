<?php
require_once '../config.php';
require_once '../web_experience.php';
require_once '../web_context.php';
if(session_status() == PHP_SESSION_NONE) session_start();
lhs_web_private_headers();
if (!lhs_web_session_valid() || !isset($_SESSION['role']) || $_SESSION['role'] !== 'admin' || !current_session_is_admin()) { header("Location: ../login.php"); exit; }

$current_server_name = $_SESSION['server_name'];
$site_logo_url = site_asset_url(site_logo_image(), '../');
$site_bg_url = site_asset_url(site_bg_image(), '../');
$site_bg_css_url = site_absolute_asset_url(site_bg_image());

function getItemCatalogAdmin($filename = 'gmitem.txt') {
    return hk_item_catalog_map($filename);
}

$admin_item_catalog = getItemCatalogAdmin('gmitem.txt');
$admin_item_images = array();
try {
    $stmt = $conn_web->query("SELECT item_id, image_url FROM webshop_items WHERE image_url IS NOT NULL AND image_url <> ''");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $admin_item_images[trim($row['item_id'])] = trim($row['image_url']);
    }
} catch (Exception $e) {}
$admin_item_images = item_icon_image_map(true);

function getTxtOptionsAdmin($filename, $prefix = '') {
    $html = '';
    foreach (hk_item_catalog_entries($filename) as $entry) {
        $id = $entry['id'];
        $name = $entry['name'];
        $html .= '<option value="'.htmlspecialchars($prefix.$id, ENT_QUOTES, 'UTF-8').'">'.htmlspecialchars($id . ' - ' . $name, ENT_QUOTES, 'UTF-8').'</option>';
    }
    return $html;
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quản trị - Linh Họa Sư</title>
    <?php echo csrf_meta_tag(); ?>
    <?php echo lhs_web_context_meta_tag(); ?>
    <link rel="icon" type="image/png" href="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>">
    
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/select2-bootstrap-5-theme@1.3.0/dist/select2-bootstrap-5-theme.min.css" />
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>

    <link rel="stylesheet" href="<?php echo site_asset_url('assets/css/admin.css', '../'); ?>?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="<?php echo site_asset_url('assets/css/ui-refactor.css', '../') . '?v=' . time(); ?>">
    <style>
        #milestoneTableBody .donate-reward-compact{width:280px;max-width:100%;margin:0 auto}
        #milestoneTableBody .donate-reward-icons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
        #milestoneTableBody .donate-reward-icon{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 3px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;min-width:0}
        #milestoneTableBody .donate-reward-icon img{width:32px;height:32px;object-fit:contain}
        #milestoneTableBody .donate-reward-icon b{font-size:11px;line-height:1.3;color:#334155;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
        #milestoneTableBody .donate-reward-view{display:block;margin:6px auto 0;padding:3px 6px;border:0;background:transparent;color:#2563eb;font-size:12px;font-weight:800;cursor:pointer}
        #milestoneTableBody .donate-reward-view:hover{text-decoration:underline}
        #milestoneTableBody .donate-reward-view:focus-visible{outline:2px solid #2563eb;outline-offset:2px;border-radius:4px}
        @media(max-width:576px){#milestoneTableBody .donate-reward-compact{width:240px}}
        .player-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.player-action-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:108px;padding:15px 10px;border:1px solid #dbe4f0;border-radius:14px;background:#fff;font-weight:900;transition:.18s;cursor:pointer}.player-action-card:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(15,23,42,.10);border-color:#93c5fd}.player-action-card i{font-size:24px}.player-action-card span{font-size:.9rem}.player-action-card small{color:#64748b;font-size:.7rem}.xu-help-button{display:inline-grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:#f59e0b;color:#fff;font-size:.85rem;font-weight:900;line-height:1;cursor:pointer;vertical-align:middle}.xu-help-button:hover{background:#d97706;transform:translateY(-1px)}#xuRechargeFields[hidden]{display:none!important}.xu-recharge-check{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}.xu-recharge-check .form-check-input{position:static;float:none;margin:0!important;transform:none;flex:0 0 auto}.xu-recharge-check .form-check-label{margin:0!important;line-height:1.4}.xu-recharge-check #xuRechargeFields{flex:0 0 100%;width:100%}@media(max-width:520px){.player-action-grid{grid-template-columns:1fr}}
        #gameBanCurrent{display:grid;gap:10px}.lock-report-card{border:1px solid #dbe4f0;border-radius:14px;padding:13px 14px;background:#f8fafc;color:#334155}.lock-report-card.is-locked{border-color:#fecaca;background:#fff7f7}.lock-report-card.is-active{border-color:#bbf7d0;background:#f0fdf4}.lock-report-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(148,163,184,.25)}.lock-report-head strong{font-size:.92rem;color:#0f172a}.lock-report-head span{font-size:.75rem;font-weight:900;color:#15803d}.lock-report-card.is-locked .lock-report-head span{color:#dc2626}.lock-report-title{margin:10px 0 8px;color:#b42318;font-size:1rem;font-weight:900}.lock-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;margin:0}.lock-report-grid>div{min-width:0}.lock-report-grid .lock-report-wide{grid-column:1/-1}.lock-report-grid dt{color:#64748b;font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.03em}.lock-report-grid dd{margin:2px 0 0;color:#1e293b;font-size:.84rem;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}.lock-report-grid .lock-report-message{padding:9px 10px;border-radius:9px;background:#fff;border:1px solid #fecaca;color:#991b1b}.lock-report-unlock{margin-top:9px;color:#64748b;font-size:.7rem;text-align:right}@media(max-width:520px){.lock-report-grid{grid-template-columns:1fr}.lock-report-grid .lock-report-wide{grid-column:auto}}
        :root{--site-bg-image:url('<?php echo htmlspecialchars($site_bg_css_url, ENT_QUOTES, 'UTF-8'); ?>');}
        .user-sortable-header{cursor:pointer;user-select:none;white-space:nowrap;vertical-align:middle!important;transition:color .15s ease,background-color .15s ease}
        .user-sortable-header:hover,.user-sortable-header:focus{color:#0369a1;background-color:rgba(224,242,254,.7);outline:none}
        .user-sortable-header .sort-label{display:inline-flex;align-items:center;justify-content:center;gap:.3rem;white-space:nowrap;line-height:1;height:1rem}
        .user-sortable-header .sort-icon{display:inline-flex;align-items:center;justify-content:center;width:.7rem;height:1rem;font-size:.55rem;line-height:1;opacity:.55;flex:0 0 .7rem}
        .user-sortable-header.sort-active .sort-icon{opacity:1;color:#0369a1}
        /* Giám sát log: dashboard gọn, chỉ áp dụng cho tab monitor. */
        #tab-monitor .log-dashboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
        #tab-monitor .log-dashboard-head>div:first-child{min-width:0;flex:1}
        #tab-monitor .log-dashboard-head .tab-title{border:0;padding:0;margin-bottom:4px;overflow-wrap:anywhere}
        #tab-monitor .log-dashboard-subtitle{margin:0;color:#64748b;font-size:.9rem;font-weight:700}
        #tab-monitor .log-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex:0 0 auto}
        #tab-monitor .log-refresh-time{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;font-size:.78rem;font-weight:800;white-space:nowrap}
        #tab-monitor .log-icon-button{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:11px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 8px 18px rgba(239,68,68,.22);transition:.2s}
        #tab-monitor .log-icon-button:hover{transform:translateY(-2px);filter:brightness(1.05)}
        #tab-monitor .log-period-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        #tab-monitor .log-period-buttons{display:flex;gap:7px;flex-wrap:wrap}
        #tab-monitor .log-period-btn{border:1px solid #cbd5e1;border-radius:999px;padding:7px 12px;background:#fff;color:#475569;font-size:.78rem;font-weight:900;cursor:pointer;transition:.2s}
        #tab-monitor .log-period-btn:hover,#tab-monitor .log-period-btn.active{border-color:#2563eb;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;box-shadow:0 7px 16px rgba(37,99,235,.18)}
        #tab-monitor .log-range-label{padding:7px 11px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:.78rem;font-weight:900}
        #tab-monitor .log-custom-range{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:12px;border:1px dashed #93c5fd;border-radius:12px;background:#f8fbff}
        #tab-monitor .log-custom-range[hidden]{display:none!important}
        #tab-monitor .log-custom-range label{min-width:170px;flex:1;color:#475569;font-size:.78rem;font-weight:900}
        #tab-monitor .log-custom-range .form-control{margin-top:5px;padding:9px 12px;border-width:1px;border-radius:9px}
        #tab-monitor .log-filter-panel{padding:14px!important;border-radius:14px!important;box-shadow:0 8px 22px rgba(15,23,42,.05)!important}
        #tab-monitor .log-filter-panel .form-control,#tab-monitor .log-filter-panel .form-select{min-height:42px;padding:9px 11px;border-width:1px;border-radius:9px;font-size:.88rem}
        #tab-monitor .log-filter-actions{display:flex!important;align-items:stretch;gap:6px}
        #tab-monitor .log-filter-actions .btn,#tab-monitor .log-filter-actions .btn-custom{flex:1;min-height:42px;padding:8px 10px;border-radius:9px}
        #tab-monitor .log-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
        #tab-monitor .log-stat-card{min-width:0;padding:13px 14px;border:1px solid #e2e8f0;border-radius:13px;background:linear-gradient(150deg,#fff,#f8fafc);box-shadow:0 7px 18px rgba(15,23,42,.045)}
        #tab-monitor .log-stat-card span{display:block;color:#64748b;font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.035em}
        #tab-monitor .log-stat-card strong{display:block;margin:3px 0 1px;color:#0f172a;font-size:1.35rem;line-height:1.1}
        #tab-monitor .log-stat-card small{color:#94a3b8;font-size:.72rem;font-weight:800}
        #tab-monitor .log-stat-card.is-success{border-color:#bbf7d0;background:linear-gradient(150deg,#f0fdf4,#fff)}
        #tab-monitor .log-stat-card.is-success strong{color:#059669}
        #tab-monitor .log-stat-card.is-warning{border-color:#fde68a;background:linear-gradient(150deg,#fffbeb,#fff)}
        #tab-monitor .log-stat-card.is-warning strong{color:#d97706}
        #tab-monitor .log-stat-card.is-error{border-color:#fecaca;background:linear-gradient(150deg,#fff1f2,#fff)}
        #tab-monitor .log-stat-card.is-error strong{color:#dc2626}
        #tab-monitor .log-source-strip{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px}
        #tab-monitor .log-source-chip{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#64748b;font-size:.76rem;font-weight:800}
        #tab-monitor .log-source-chip strong{color:#0f172a}
        #tab-monitor .log-table-shell{max-height:520px;overflow:auto;border:1px solid #e2e8f0;border-radius:14px;background:#fff}
        #tab-monitor .admin-log-table{min-width:900px;font-size:.82rem}
        #tab-monitor .admin-log-table thead{position:sticky;top:0;z-index:3;box-shadow:0 1px 0 #e2e8f0}
        #tab-monitor .admin-log-table thead th{padding:10px 11px!important;white-space:nowrap;background:#f8fafc!important}
        #tab-monitor .admin-log-table td{padding:10px 11px!important}
        #tab-monitor .admin-log-table tbody tr:hover{background:#f8fbff!important}
        #tab-monitor .log-time-cell{min-width:145px;white-space:nowrap}
        #tab-monitor .log-badge-stack{display:flex;gap:4px;flex-wrap:wrap;min-width:160px}
        #tab-monitor .log-badge-stack .badge{padding:5px 8px!important;font-size:.67rem}
        #tab-monitor .log-account-name{max-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-weight:900}
        #tab-monitor .log-account-meta{color:#94a3b8;font-size:.72rem;font-weight:800}
        #tab-monitor .log-action-code{display:inline-block;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 7px;border-radius:7px;color:#4338ca;background:#eef2ff;font-size:.75rem}
        #tab-monitor .log-message-title{max-width:260px;margin-top:5px;color:#334155;font-weight:800;line-height:1.3}
        #tab-monitor .log-detail-wrap{min-width:210px;max-width:340px}
        #tab-monitor .log-detail-text{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;color:#64748b;line-height:1.35;overflow-wrap:anywhere}
        #tab-monitor .log-detail-text.is-expanded{display:block;overflow:visible}
        #tab-monitor .log-detail-toggle{margin-top:4px;padding:0;border:0;background:transparent;color:#0284c7;font-size:.72rem;font-weight:900}
        @media (max-width:992px){#tab-monitor .log-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:576px){
            #tab-monitor .log-dashboard-head{align-items:stretch;flex-direction:column}
            #tab-monitor .log-head-actions{width:100%;justify-content:space-between;flex-direction:row}
            #tab-monitor .log-refresh-time{flex:1;justify-content:center}
            #tab-monitor .log-period-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
            #tab-monitor .log-period-btn:last-child{grid-column:1/-1}
            #tab-monitor .log-custom-range{align-items:stretch}
            #tab-monitor .log-custom-range label,#tab-monitor .log-custom-range .btn{width:100%;min-width:0}
            #tab-monitor .admin-log-table td{display:grid!important;grid-template-columns:minmax(108px,36%) minmax(0,1fr);align-items:start;column-gap:10px;min-height:40px;padding:10px 8px!important;text-align:left!important}
            #tab-monitor .admin-log-table td::before{position:static!important;width:auto!important;min-width:0;color:#64748b;font-size:.7rem;line-height:1.35;text-align:left!important}
            #tab-monitor .admin-log-table td>*{min-width:0;max-width:100%}
            #tab-monitor .admin-log-table .log-detail-wrap,#tab-monitor .admin-log-table .log-message-title{max-width:100%}
            #tab-monitor .admin-log-table .log-badge-stack{justify-content:flex-start;min-width:0}
        }
    </style>
</head>
<body class="admin-page">

    <div class="top-navbar">
        <div class="container d-flex justify-content-between align-items-center">
            <a href="#" class="brand"><img src="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>" alt="Logo"> <span>QUẢN TRỊ VIÊN</span></a>
            <div class="d-flex align-items-center gap-2">
                <label class="user-badge text-warning border-warning admin-server-switch" title="Đổi máy chủ cho toàn bộ phiên quản trị"><i class="fa-solid fa-server"></i><select id="adminServerSwitch" aria-label="Máy chủ quản trị" data-current="<?php echo htmlspecialchars($_SESSION['server_id'],ENT_QUOTES,'UTF-8'); ?>"><?php foreach($quarr as $key=>$server): ?><option value="<?php echo htmlspecialchars($key,ENT_QUOTES,'UTF-8'); ?>" <?php echo (string)$key===(string)$_SESSION['server_id']?'selected':''; ?>><?php echo htmlspecialchars($server['name']); ?> (<?php echo htmlspecialchars($key); ?>)</option><?php endforeach; ?></select></label>
                <div class="user-badge"><i class="fa-solid fa-user-shield"></i> <span class="d-none d-md-inline ms-1"><?php echo htmlspecialchars($_SESSION['username']); ?></span></div>
                <a href="../index.php" class="btn-logout-top btn-player-home" title="Về trang người chơi"><i class="fa-solid fa-house"></i></a>
                <form method="post" action="../api/user_api.php" class="m-0">
                    <input type="hidden" name="action" value="logout">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="web_context_token" value="<?php echo htmlspecialchars(lhs_web_context_token(), ENT_QUOTES, 'UTF-8'); ?>">
                    <button type="submit" class="btn-logout-top" title="Đăng xuất"><i class="fa-solid fa-power-off"></i></button>
                </form>
            </div>
        </div>
    </div>

    <button type="button" class="admin-mobile-menu-toggle" id="adminMobileMenuToggle" aria-controls="adminSidebarMenu" aria-expanded="false">
        <i class="fa-solid fa-bars-staggered"></i>
        <span>Menu</span>
    </button>
    <div class="admin-mobile-menu-backdrop" id="adminMobileMenuBackdrop"></div>

    <div class="container mb-5">
        <div class="row g-4">
            <div class="col-md-4 col-lg-3 gm-menu-col">
                <div class="inner-box sidebar-menu" id="adminSidebarMenu">
                    <div class="menu-btn active" data-tab="tab-overview"><i class="fa-solid fa-chart-pie text-primary"></i> Tổng quan</div>
                    <div class="menu-btn" data-tab="tab-config"><i class="fa-solid fa-sliders text-info"></i> Cấu hình</div>
                    <div class="menu-btn" data-tab="tab-audit" onclick="loadAuditLogs(1)"><i class="fa-solid fa-shield-halved text-success"></i> Nhật ký admin</div>
                    <div class="menu-btn" data-tab="tab-monitor" onclick="loadMonitorLogs(1)"><i class="fa-solid fa-satellite-dish text-danger"></i> Giám sát log</div>
                    <div class="menu-btn" data-tab="tab-user"><i class="fa-solid fa-users"></i> Quản lý người chơi</div>
                    <div class="menu-btn" data-tab="tab-webshop-admin"><i class="fa-solid fa-store text-primary"></i> Webshop</div>
                    <div class="menu-btn" data-tab="tab-item-icons"><i class="fa-solid fa-icons text-info"></i> Icon item</div>
                    <div class="menu-btn" data-tab="tab-recharge-admin"><i class="fa-solid fa-medal text-warning"></i> Tích Donate</div>
                    <div class="menu-btn" data-tab="tab-gm"><i class="fa-solid fa-paper-plane text-danger"></i> Trạm GM bơm đồ</div>
                    <div class="menu-btn" data-tab="tab-vip" onclick="loadAuthCodes(); loadVipVouchers();"><i class="fa-solid fa-ticket text-warning"></i> Mã ủy quyền VIP</div>
                    <div class="menu-btn" data-tab="tab-giftcode" onclick="taiMaQuaTang()"><i class="fa-solid fa-gift text-success"></i> Tạo mã quà tặng</div>
                    <div class="menu-btn" data-tab="tab-lucky-wheel-admin"><i class="fa-solid fa-dharmachakra text-danger"></i> Vòng Quay May Mắn <span class="badge rounded-pill bg-danger ms-1">NEW</span></div>
                </div>
            </div>

            <div class="col-md-8 col-lg-9 gm-content-col">
                <div class="main-card">
                    
                    <div class="main-tab-pane active" id="tab-overview">
                        <div class="tab-title"><i class="fa-solid fa-chart-pie me-2 text-primary"></i> TỔNG QUAN HỆ THỐNG</div>

                        <div class="overview-grid">
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-primary bg-opacity-10 text-primary"><i class="fa-solid fa-users"></i></div>
                                    <div class="stat-label">Tài khoản</div>
                                </div>
                                <div class="stat-value" id="statTotalAccounts">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-success bg-opacity-10 text-success"><i class="fa-solid fa-sack-dollar"></i></div>
                                    <div class="stat-label">Tổng Donate</div>
                                </div>
                                <div class="stat-value" id="statTotalRecharge">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-warning bg-opacity-10 text-warning"><i class="fa-solid fa-calendar-day"></i></div>
                                    <div class="stat-label">Donate hôm nay</div>
                                </div>
                                <div class="stat-value" id="statTodayRecharge">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-info bg-opacity-10 text-info"><i class="fa-solid fa-receipt"></i></div>
                                    <div class="stat-label">Donate đã xác nhận</div>
                                </div>
                                <div class="stat-value" id="statPaidOrders">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-danger bg-opacity-10 text-danger"><i class="fa-solid fa-clock"></i></div>
                                    <div class="stat-label">Donate chờ xác nhận</div>
                                </div>
                                <div class="stat-value" id="statPendingOrders">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-warning bg-opacity-10 text-warning"><i class="fa-solid fa-coins"></i></div>
                                    <div class="stat-label">Xu Web còn lại</div>
                                </div>
                                <div class="stat-value" id="statTotalXu">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-success bg-opacity-10 text-success"><i class="fa-solid fa-crown"></i></div>
                                    <div class="stat-label">VIP đã cấp</div>
                                </div>
                                <div class="stat-value" id="statVipTotal">...</div>
                            </div>
                            <div class="stat-card">
                                <div>
                                    <div class="stat-icon bg-primary bg-opacity-10 text-primary"><i class="fa-solid fa-gift"></i></div>
                                    <div class="stat-label">Mã quà tặng</div>
                                </div>
                                <div class="stat-value" id="statGiftcodeTotal">...</div>
                            </div>
                        </div>

                        <!-- Health Check Panel -->
                        <div class="overview-panel mb-4 p-3 rounded-4 bg-white border shadow-sm">
                            <div class="overview-panel-title border-0 pb-0 mb-3"><i class="fa-solid fa-heart-pulse text-danger"></i> Trạng thái sức khỏe hệ thống (System Health)</div>
                            <div class="row g-2 text-center" id="systemHealthPanel">
                                <div class="col-6 col-md-3">
                                    <div class="p-2 border rounded-3 bg-light">
                                        <div class="small fw-bold text-muted mb-1">CSDL Game</div>
                                        <div id="healthGameDb" class="fw-black fs-6 text-secondary"><i class="fa-solid fa-spinner fa-spin"></i></div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="p-2 border rounded-3 bg-light">
                                        <div class="small fw-bold text-muted mb-1">CSDL Web</div>
                                        <div id="healthWebDb" class="fw-black fs-6 text-secondary"><i class="fa-solid fa-spinner fa-spin"></i></div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="p-2 border rounded-3 bg-light">
                                        <div class="small fw-bold text-muted mb-1">Thư viện GD</div>
                                        <div id="healthGd" class="fw-black fs-6 text-secondary"><i class="fa-solid fa-spinner fa-spin"></i></div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="p-2 border rounded-3 bg-light">
                                        <div class="small fw-bold text-muted mb-1">Kết nối Redis</div>
                                        <div id="healthRedis" class="fw-black fs-6 text-secondary"><i class="fa-solid fa-spinner fa-spin"></i></div>
                                    </div>
                                </div>
                                <div class="col-12 mt-2 text-start small fw-bold text-muted">
                                    <span class="me-1"><i class="fa-solid fa-folder-open me-1"></i>Thư mục tải lên (assets/images/):</span> 
                                    <span id="healthUploads" class="badge rounded-pill bg-secondary px-2 py-1"><i class="fa-solid fa-spinner fa-spin"></i></span>
                                </div>
                            </div>
                        </div>

                        <div class="row g-4">
                            <div class="col-lg-4">
                                <div class="overview-panel">
                                    <div class="overview-panel-title"><i class="fa-solid fa-ranking-star text-warning"></i> Tài khoản Donate nhiều</div>
                                    <div class="overview-list" id="topRechargeList"><div class="text-muted fw-bold py-3">Đang tải...</div></div>
                                </div>
                            </div>
                            <div class="col-lg-4">
                                <div class="overview-panel">
                                    <div class="overview-panel-title"><i class="fa-solid fa-receipt text-success"></i> Donate gần đây</div>
                                    <div class="overview-list" id="recentOrderList"><div class="text-muted fw-bold py-3">Đang tải...</div></div>
                                </div>
                            </div>
                            <div class="col-lg-4">
                                <div class="overview-panel">
                                    <div class="overview-panel-title"><i class="fa-solid fa-clock-rotate-left text-primary"></i> Hoạt động GM gần đây</div>
                                    <div class="overview-list" id="recentGmLogList"><div class="text-muted fw-bold py-3">Đang tải...</div></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="main-tab-pane" id="tab-config">
                        <div class="tab-title"><i class="fa-solid fa-sliders me-2 text-info"></i> Cấu hình tính năng</div>
                        <div class="config-row">
                            <div><strong>Webshop</strong><small>Bật/tắt tab nhận vật phẩm bằng Xu Web.</small></div>
                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="webshop_enabled" id="setWebshop"></div>

                        </div>

                        <div class="config-row">

                            <div><strong>Điểm danh mỗi ngày</strong><small>Bật/tắt điểm danh nhận Xu Web trong Hồ sơ người chơi.</small></div>

                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="daily_checkin_enabled" id="setDailyCheckin"></div>
                        </div>
                        <div class="config-row">
                            <div><strong>Tích Donate</strong><small>Bật/tắt tab nhận quà theo mốc Donate.</small></div>
                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="recharge_rewards_enabled" id="setRechargeRewards"></div>
                        </div>
                        <div class="config-row">
                            <div><strong>Vòng Quay May Mắn</strong><small>Bật/tắt vòng quay, phần thưởng và lượt từ điểm danh/Donate.</small></div>
                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="lucky_wheel_enabled" id="setLuckyWheel"></div>
                        </div>
                        <div class="config-row">
                            <div><strong>Donate VIP</strong><small>Bật/tắt tab quét QR và nhập mã VIP ở trang người chơi.</small></div>
                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="vip_enabled" id="setVip"></div>
                        </div>
                        <div class="config-row">
                            <div><strong>Công cụ GM</strong><small>Bật/tắt tab gửi vật phẩm/tiền bằng thư chuẩn LHS ở trang người chơi.</small></div>
                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="gm_tools_enabled" id="setGmTools"></div>
                        </div>
                        <div class="config-row border-danger border-opacity-25">

                            <div><strong class="text-danger">Bảo trì website</strong><small>Khi bật, chỉ admin truy cập được trang người chơi; user thường thấy trang bảo trì.</small></div>

                            <div class="form-check form-switch fs-4"><input class="form-check-input setting-toggle" type="checkbox" data-key="maintenance_mode" data-default="0" id="setMaintenanceMode"></div>

                        </div>

                        <form id="textSettingsForm" class="admin-section-box mt-4">
                            <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4 border-bottom pb-3">
                                <div>
                                    <h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-screwdriver-wrench text-primary me-2"></i>Cài đặt hệ thống & Tải game</h5>
                                    <div class="small text-muted fw-bold">Thay đổi điểm danh, Donate, bảo mật và các cổng tải game hiển thị.</div>
                                </div>
                                <button type="submit" class="btn-custom text-white px-4 py-2 rounded-3 shadow-sm" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)">
                                    <i class="fa-solid fa-floppy-disk me-1"></i> Lưu cấu hình
                                </button>
                            </div>
                            <div class="row g-4">
                                <!-- Nhóm 1: Cấu hình Donate -->
                                <div class="col-lg-6">
                                    <h6 class="fw-black text-primary mb-3"><i class="fa-solid fa-credit-card me-2"></i>Cấu hình Donate & Điểm danh</h6>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark">Mức Donate VIP (VNĐ)</label>
                                        <input type="number" class="form-control text-setting-input form-control-lg fw-black text-primary" data-key="vip_base_amount" id="settingVipBaseAmount" min="1000" step="1000" placeholder="399000">

                                    </div>

                                    <div class="mb-3">

                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-calendar-check text-success me-1"></i>Xu thưởng điểm danh mỗi ngày</label>
                                        <input type="number" class="form-control text-setting-input form-control-lg fw-black text-success" data-key="daily_checkin_xu" id="settingDailyCheckinXu" min="1" max="1000000000" step="100" placeholder="1000">
                                        <div class="small text-muted mt-2">Mỗi tài khoản chỉ nhận một lần/ngày, không nhân lượt khi đổi server.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-building-columns text-success me-1"></i>Ngân hàng VietQR</label>
                                        <input type="text" class="form-control text-setting-input text-uppercase" data-key="vietqr_bank" id="settingVietqrBank" placeholder="VD: MB, VCB, ACB, BIDV">
                                        <div class="small text-muted mt-2">Nhập mã ngân hàng VietQR, ví dụ <code>MB</code>, <code>VCB</code>, <code>ACB</code>.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-credit-card text-success me-1"></i>Số tài khoản ngân hàng</label>
                                        <input type="text" class="form-control text-setting-input" data-key="vietqr_account" id="settingVietqrAccount" placeholder="Nhập số tài khoản nhận tiền">
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-user-shield text-success me-1"></i>Tên tài khoản ngân hàng</label>
                                        <input type="text" class="form-control text-setting-input text-uppercase" data-key="vietqr_account_name" id="settingVietqrAccountName" placeholder="Tên chủ tài khoản không dấu hoặc có dấu đều được">
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-receipt text-info me-1"></i>Từ khóa Donate Xu</label>
                                        <input type="text" class="form-control text-setting-input text-uppercase" data-key="sepay_topup_tag" id="settingSepayTopupTag" placeholder="LHS">
                                        <div class="small text-muted mt-2">Nội dung mẫu: <code>DONATE LHS S1 taikhoan 50000</code>. Chỉ nên dùng A-Z, 0-9, dấu gạch ngang hoặc gạch dưới.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-crown text-warning me-1"></i>Từ khóa Donate VIP</label>
                                        <input type="text" class="form-control text-setting-input text-uppercase" data-key="sepay_vip_tag" id="settingSepayVipTag" placeholder="LHSVIP">
                                        <div class="small text-muted mt-2">Nội dung mẫu: <code>DONATE LHSVIP S1 taikhoan</code>. Có thể đổi để phân biệt game/website.</div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-key text-warning me-1"></i>Khóa bí mật SePay Webhook Token</label>
                                        <input type="text" class="form-control text-setting-input" data-key="sepay_webhook_token" id="settingSepayWebhookToken" placeholder="Nhập mã token hoặc khóa bí mật SePay...">
                                        <div class="small text-muted mt-2">Mã cấu hình này sẽ tự động ẩn bảo mật khi hiển thị. Để trống nếu muốn dùng mặc định từ file cấu hình <code>.env</code>.</div>
                                    </div>
                                </div>
                                <!-- Nhóm 2: Link tải game -->
                                <div class="col-lg-6 border-start-lg">
                                    <h6 class="fw-black text-success mb-3"><i class="fa-solid fa-cloud-arrow-down me-2"></i>Cổng tải game & Ứng dụng</h6>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-brands fa-android text-success me-1"></i>Link tải Android</label>
                                        <input type="text" class="form-control text-setting-input" data-key="download_android_url" id="settingDownloadAndroid" placeholder="/hkgh3d.apk">
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-brands fa-apple text-dark me-1"></i>Link tải iOS</label>
                                        <input type="text" class="form-control text-setting-input" data-key="download_ios_url" id="settingDownloadIos" placeholder="Để trống nếu chưa có">
                                    </div>
                                    <div class="mb-3">
                                        <label class="fw-bold mb-2 text-dark"><i class="fa-brands fa-windows text-primary me-1"></i>Link chơi PC (Giả lập)</label>
                                        <input type="text" class="form-control text-setting-input" data-key="download_pc_url" id="settingDownloadPc" placeholder="https://...">
                                    </div>
                                </div>
                            </div>
                            <div class="alert alert-info mt-3 mb-0 small">
                                <i class="fa-solid fa-circle-info me-1"></i> Các đường dẫn tải game để trống sẽ tự động ẩn nút tương ứng trên màn hình người chơi.
                            </div>
                        </form>
                        <div class="admin-section-box mt-4">
                            <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
                                <div>
                                    <h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-images text-primary me-2"></i>Ảnh giao diện</h5>
                                    <div class="small text-muted fw-bold">Upload hình nền và logo dùng chung cho favicon. Hỗ trợ JPG, PNG, WEBP, GIF. Tối đa 8MB.</div>
                                </div>
                            </div>
                            <div class="row g-3">
                                <div class="col-lg-6">
                                    <form class="site-image-upload-form site-image-card" enctype="multipart/form-data">
                                        <input type="hidden" name="action" value="upload_site_image">
                                        <input type="hidden" name="image_type" value="bg">
                                        <div class="site-image-preview site-image-preview-bg">
                                            <img id="siteBgPreview" src="<?php echo htmlspecialchars($site_bg_url, ENT_QUOTES, 'UTF-8'); ?>" alt="Background">
                                        </div>
                                        <label class="fw-bold mb-2 text-dark">Hình nền website</label>
                                        <input type="file" name="image_file" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif" required>
                                        <button type="submit" class="btn-custom text-white w-100 mt-3" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)">
                                            <i class="fa-solid fa-cloud-arrow-up me-1"></i> Upload hình nền
                                        </button>
                                    </form>
                                </div>
                                <div class="col-lg-6">
                                    <form class="site-image-upload-form site-image-card" enctype="multipart/form-data">
                                        <input type="hidden" name="action" value="upload_site_image">
                                        <input type="hidden" name="image_type" value="logo">
                                        <div class="site-image-preview site-image-preview-logo">
                                            <img id="siteLogoPreview" src="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>" alt="Logo">
                                        </div>
                                        <label class="fw-bold mb-2 text-dark">Logo và favicon PNG</label>
                                        <input type="file" name="image_file" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif" required>
                                        <button type="submit" class="btn-custom text-white w-100 mt-3" style="background:linear-gradient(135deg,#10b981,#059669)">
                                            <i class="fa-solid fa-cloud-arrow-up me-1"></i> Upload logo
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="main-tab-pane" id="tab-audit">
                        <div class="tab-title"><i class="fa-solid fa-shield-halved me-2 text-success"></i> Nhật ký thao tác admin</div>
                        <div class="admin-section-box mb-3">
                            <label class="fw-bold mb-2 text-dark">Máy chủ cần xem</label>
                            <select id="auditLogServerFilter" class="form-select">
                                <option value="">Tất cả server</option>
                                <?php foreach ($quarr as $server_key => $server_row): ?>
                                    <option value="<?php echo htmlspecialchars($server_key); ?>">S<?php echo htmlspecialchars($server_key); ?> · <?php echo htmlspecialchars($server_row['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <form id="auditLogSearchForm" class="admin-section-box mb-4">
                            <div class="row g-3 align-items-end">
                                <div class="col-lg-6">
                                    <label class="fw-bold mb-2 text-dark">Tìm kiếm</label>
                                    <input type="text" id="auditLogSearchInput" class="form-control" placeholder="Tài khoản, UID, hành động, chi tiết...">
                                </div>
                                <div class="col-lg-4">
                                    <label class="fw-bold mb-2 text-dark">Loại hành động</label>
                                    <input type="text" id="auditLogActionInput" class="form-control" placeholder="VD: update_xu, change_password">
                                </div>
                                <div class="col-lg-2 d-grid">
                                    <button type="submit" class="btn-custom text-white" style="background:linear-gradient(135deg,#10b981,#059669)">
                                        <i class="fa-solid fa-magnifying-glass me-1"></i> Lọc
                                    </button>
                                </div>
                            </div>
                        </form>
                        <div class="table-responsive">
                            <table class="table table-custom text-center align-middle">
                                <thead>
                                    <tr>
                                        <th>Thời gian</th>
                                        <th>Tài khoản thao tác</th>
                                        <th>Hành động</th>
                                        <th>Mục tiêu</th>
                                        <th>Chi tiết</th>
                                        <th>IP</th>
                                    </tr>
                                </thead>
                                <tbody id="auditLogTableBody">
                                    <tr><td colspan="6" class="py-4 text-muted fw-bold">Chưa tải nhật ký.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="auditLogPagination" class="pagination-box"></div>
                    </div>

                    <div class="main-tab-pane" id="tab-monitor">
                        <div class="log-dashboard-head">
                            <div><div class="tab-title mb-1"><i class="fa-solid fa-satellite-dish me-2 text-danger"></i> Giám sát Donate, WebShop & lỗi</div><p class="log-dashboard-subtitle">Tập trung các giao dịch, thao tác và cảnh báo hệ thống trong một màn hình dễ quét.</p></div>
                            <div class="log-head-actions"><span class="log-refresh-time" id="monitorLogRefreshedAt"><i class="fa-regular fa-clock"></i> Chưa tải</span><button type="button" class="log-icon-button is-danger" onclick="loadMonitorLogs(1)" title="Làm mới log"><i class="fa-solid fa-rotate"></i></button></div>
                        </div>
                        <div class="log-period-toolbar" id="monitorPeriodToolbar">
                            <div class="log-period-buttons" role="group" aria-label="Khoảng thời gian giám sát log"><button type="button" class="log-period-btn active" data-log-scope="monitor" data-period="today">Hôm nay</button><button type="button" class="log-period-btn" data-log-scope="monitor" data-period="7days">7 ngày</button><button type="button" class="log-period-btn" data-log-scope="monitor" data-period="30days">30 ngày</button><button type="button" class="log-period-btn" data-log-scope="monitor" data-period="all">Toàn bộ</button><button type="button" class="log-period-btn" data-log-scope="monitor" data-period="custom"><i class="fa-regular fa-calendar me-1"></i>Tùy chọn</button></div>
                            <span class="log-range-label" id="monitorRangeLabel">Hôm nay</span>
                        </div>
                        <div class="log-custom-range" id="monitorCustomRange" hidden><label>Từ ngày<input type="date" id="monitorDateFrom" class="form-control"></label><label>Đến ngày<input type="date" id="monitorDateTo" class="form-control"></label><button type="button" class="btn btn-danger fw-bold" id="monitorApplyCustom"><i class="fa-solid fa-filter me-1"></i>Áp dụng</button></div>
                        <form id="monitorLogSearchForm" class="admin-section-box log-filter-panel mb-3">
                            <div class="row g-3 align-items-end">
                                <div class="col-lg-2">
                                    <label class="fw-bold mb-2 text-dark">Nguồn</label>
                                    <select id="monitorSourceFilter" class="form-select">
                                        <option value="">Tất cả</option>
                                        <option value="sepay">SePay</option>
                                        <option value="webshop">WebShop</option>
                                        <option value="gm">GM</option>
                                        <option value="login">Login</option>
                                        <option value="system">Hệ thống/API</option>
                                    </select>
                                </div>

                                <div class="col-lg-2">

                                    <label class="fw-bold mb-2 text-dark">Máy chủ</label>

                                    <select id="monitorServerFilter" class="form-select">
                                        <option value="">Tất cả server</option>
                                        <?php foreach ($quarr as $server_key => $server_row): ?>
                                            <option value="<?php echo htmlspecialchars($server_key); ?>">S<?php echo htmlspecialchars($server_key); ?> · <?php echo htmlspecialchars($server_row['name']); ?></option>
                                        <?php endforeach; ?>
                                    </select>

                                </div>
                                <div class="col-lg-2">
                                    <label class="fw-bold mb-2 text-dark">Trạng thái</label>
                                    <select id="monitorStatusFilter" class="form-select">
                                        <option value="">Tất cả</option>
                                        <option value="success">Thành công</option>
                                        <option value="paid">Đã thanh toán (WebShop)</option>
                                        <option value="failed">Thất bại</option>
                                        <option value="ignored">Bỏ qua</option>
                                        <option value="refunded">Đã hoàn Xu (WebShop)</option>
                                    </select>
                                </div>
                                <div class="col-lg-2">
                                    <label class="fw-bold mb-2 text-dark">Mức</label>
                                    <select id="monitorLevelFilter" class="form-select">
                                        <option value="">Tất cả</option>
                                        <option value="info">Info</option>
                                        <option value="warning">Warning</option>
                                        <option value="error">Error</option>
                                    </select>
                                </div>
                                <div class="col-lg-3">
                                    <label class="fw-bold mb-2 text-dark">Tìm kiếm</label>
                                    <input type="text" id="monitorSearchInput" class="form-control" placeholder="Tài khoản, UID, IP, nội dung...">
                                </div>
                                <div class="col-lg-1 log-filter-actions">
                                    <button type="submit" class="btn-custom text-white" style="background:linear-gradient(135deg,#ef4444,#dc2626)" title="Lọc log">
                                        <i class="fa-solid fa-magnifying-glass"></i>
                                    </button><button type="button" class="btn btn-light border fw-bold" id="monitorResetFilters" title="Đặt lại bộ lọc"><i class="fa-solid fa-rotate-left"></i></button>
                                </div>
                            </div>
                        </form>
                        <div class="log-stat-grid">
                            <button type="button" class="log-stat-card is-total monitor-status-tab" data-log-status="" aria-pressed="true"><span>Kết quả</span><strong id="monitorStatTotal">0</strong><small>log phù hợp</small></button>
                            <button type="button" class="log-stat-card is-success monitor-status-tab" data-log-status="success" aria-pressed="false"><span>Thành công</span><strong id="monitorStatSuccess">0</strong><small>giao dịch/sự kiện</small></button>
                            <button type="button" class="log-stat-card is-warning monitor-status-tab" data-log-status="warning" aria-pressed="false"><span>Cảnh báo</span><strong id="monitorStatWarning">0</strong><small>cần theo dõi</small></button>
                            <button type="button" class="log-stat-card is-error monitor-status-tab" data-log-status="error" aria-pressed="false"><span>Lỗi / thất bại</span><strong id="monitorStatError">0</strong><small>cần xử lý</small></button>
                        </div>
                        <div id="sepayFinancialSummary" class="mb-3" hidden></div>
                        <div class="log-source-strip" id="monitorSourceSummary"><span class="log-source-chip">Chưa tải thống kê nguồn.</span></div>
                        <div class="table-responsive log-table-shell">
                            <table class="table table-custom text-center align-middle admin-log-table monitor-log-table">
                                <thead>
                                    <tr>
                                        <th>Thời gian</th>
                                        <th>Nguồn & trạng thái</th>
                                        <th>Tài khoản</th>
                                        <th>Sự kiện</th>
                                        <th>Ngữ cảnh</th>
                                    </tr>
                                </thead>
                                <tbody id="monitorLogTableBody">
                                    <tr><td colspan="5" class="py-4 text-muted fw-bold">Chưa tải log.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="monitorLogPagination" class="pagination-box"></div>
                    </div>

                    <div class="main-tab-pane" id="tab-item-icons">
                        <div class="tab-title"><i class="fa-solid fa-icons me-2 text-info"></i> Đồng bộ icon item</div>

                        <div class="admin-section-box mb-4">
                            <form id="itemIconForm">
                                <input type="hidden" name="action" value="save_item_icon">
                                <div class="row g-3 align-items-end">
                                    <div class="col-lg-5">
                                        <label class="fw-bold mb-2 text-dark">Chọn item cần gán icon</label>
                                        <select name="item_id" id="icon_item_select" class="form-select select2-custom" required data-placeholder="-- Gõ ID hoặc tên vật phẩm --" style="width:100%">
                                            <option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?>
                                        </select>
                                    </div>
                                    <div class="col-lg-7">
                                        <label class="fw-bold mb-2 text-dark">Tên hiển thị</label>
                                        <input type="text" name="item_name" id="icon_item_name" class="form-control" placeholder="Tự lấy theo item, có thể sửa">
                                    </div>
                                    <div class="col-12">
                                        <label class="fw-bold mb-2 text-dark">Ảnh icon dùng chung</label>
                                        <div class="admin-image-picker">
                                            <div class="admin-image-preview" id="iconImagePreview">
                                                <i class="fa-solid fa-image text-info"></i>
                                            </div>
                                            <div class="flex-grow-1">
                                                <div class="input-group">
                                                    <input type="text" name="image_url" id="icon_image_url" class="form-control" placeholder="Dán URL hoặc upload ảnh icon">
                                                    <input type="file" id="icon_image_file" class="d-none" accept="image/*" onchange="uploadItemIconImage(this)">
                                                    <button type="button" class="btn btn-info text-white px-4 fw-bold" onclick="$('#icon_image_file').trigger('click')"><i class="fa-solid fa-cloud-arrow-up me-1"></i> Upload icon</button>
                                                </div>
                                                <div class="form-text fw-bold">Icon này dùng chung cho Webshop, tích Donate và mã quà tặng khi cùng ID item.</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="d-flex gap-2 mt-4">
                                    <button type="submit" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#06b6d4,#2563eb)"><i class="fa-solid fa-link me-1"></i> Lưu icon chung</button>
                                    <button type="button" class="btn btn-light border fw-bold px-4 rounded-4" onclick="resetItemIconForm()">Làm mới</button>
                                </div>
                            </form>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div class="fw-bold text-dark"><i class="fa-solid fa-images me-1 text-info"></i> Danh sách icon item đã đồng bộ</div>
                            <div style="width: 250px;">
                                <input type="text" class="form-control form-control-sm" id="itemIconSearchFilter" placeholder="Tìm item, ID, nguồn...">
                            </div>
                        </div>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-custom text-center mb-0 align-middle">
                                <thead><tr><th>Icon</th><th>Item</th><th>Nguồn</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
                                <tbody id="itemIconTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="main-tab-pane" id="tab-webshop-admin">
                        <div class="tab-title"><i class="fa-solid fa-store me-2 text-primary"></i> Quản lý Webshop</div>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <button type="button" class="btn btn-primary fw-bold" onclick="openNewWebshopItem()"><i class="fa-solid fa-plus me-1"></i>Thêm item / gói</button>
                            <a class="btn btn-outline-secondary" href="item_catalog.php" target="_blank" rel="noopener">Tra ảnh &amp; bộ thời trang ẩn</a>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div class="fw-bold text-dark"><i class="fa-solid fa-list me-1 text-primary"></i> Danh sách vật phẩm Webshop</div>
                            <div style="width: 250px;">
                                <input type="text" class="form-control form-control-sm" id="webshopSearchFilter" placeholder="Tìm vật phẩm (tên, ID)...">
                            </div>
                        </div>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-custom text-center mb-0 align-middle">
                                <thead><tr><th>Ảnh</th><th>Vật phẩm</th><th>Giá</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                                <tbody id="webshopTableBody"><tr><td colspan="6" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="main-tab-pane" id="tab-recharge-admin">
                        <div class="tab-title"><i class="fa-solid fa-medal me-2 text-warning"></i> Quản lý mốc Donate</div>
                        <div class="nav nav-pills gap-2 mb-4" role="tablist" aria-label="Loại quà Donate">
                            <button type="button" class="nav-link active" role="tab" aria-selected="true" data-donate-period="day">Quà ngày</button>
                            <button type="button" class="nav-link" role="tab" aria-selected="false" data-donate-period="week">Quà tuần</button>
                            <button type="button" class="nav-link" role="tab" aria-selected="false" data-donate-period="month">Quà tháng</button>
                            <button type="button" class="nav-link" role="tab" aria-selected="false" data-donate-period="total">Tổng Donate</button>
                            <button type="button" class="nav-link" role="tab" aria-selected="false" data-donate-period="event">Sự kiện có hạn</button>
                        </div>
                        <section id="donateMilestonePanel" role="tabpanel" aria-label="Mốc Donate">
                        <button type="button" class="btn btn-primary fw-bold mb-3" onclick="openNewDonateMilestone()">Thêm mốc</button>
                        <div class="modal fade" id="donateMilestoneModal" tabindex="-1" aria-labelledby="donateMilestoneTitle" aria-hidden="true">
                        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title" id="donateMilestoneTitle">Sửa mốc Donate</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
                        <div class="modal-body">
                            <form id="milestoneForm">
                                <input type="hidden" name="action" value="save_recharge_milestone">
                                <input type="hidden" name="id" id="milestone_id">
                                <input type="hidden" name="items_json" id="milestone_json_input">
                                <div class="row g-3 mb-4">
                                    <div class="col-md-2">
                                        <label class="fw-bold mb-2 text-dark">Loại mốc</label>
                                        <select name="period_type" id="milestone_period_type" class="form-select">
                                            <option value="total">Tổng Donate</option>
                                            <option value="day">Donate ngày</option>
                                            <option value="week">Donate tuần</option>
                                            <option value="month">Donate tháng</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Tên mốc</label>
                                        <input type="text" name="title" id="milestone_title" class="form-control" required placeholder="VD: Mốc 500K">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Cần Donate đủ</label>
                                        <input type="number" name="milestone_amount" id="milestone_amount" class="form-control" min="1" required>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="fw-bold mb-2 text-dark">Thứ tự</label>
                                        <input type="number" name="sort_order" id="milestone_sort_order" class="form-control" value="0">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="fw-bold mb-2 text-dark">Bật</label>
                                        <input type="hidden" name="is_active" id="milestone_is_active_value" value="1">
                                        <div class="border bg-light d-flex align-items-center justify-content-center" style="border: 2px solid #e2e8f0 !important; background-color: #f8fafc !important; border-radius: 14px; height: 56px;">
                                            <div class="form-check form-switch m-0 p-0 d-flex align-items-center">
                                                <input class="form-check-input m-0" type="checkbox" id="milestone_is_active" checked style="float: none; cursor: pointer;">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="row g-3 align-items-end mb-3">
                                    <div class="col-md-7">
                                        <label class="fw-bold mb-2 text-dark">Thêm quà theo ID vật phẩm</label>
                                        <select id="milestone_builder_item" class="form-select select2-custom" data-placeholder="-- Gõ ID hoặc tên vật phẩm --" style="width:100%">
                                            <option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Số lượng</label>
                                        <input type="number" id="milestone_builder_amount" class="form-control" value="1" min="1">
                                    </div>
                                    <div class="col-md-2">
                                        <button type="button" class="btn-custom w-100 text-white" style="background:#10b981" id="btnAddMilestoneItem"><i class="fa-solid fa-plus"></i> Thêm</button>
                                    </div>
                                </div>
                                <div class="item-list-builder mb-3" id="milestonePreviewBox"><span class="text-muted fw-bold">Chưa thêm quà...</span></div>
                                <div class="small fw-bold text-muted mb-4">JSON gửi máy chủ: <code id="milestoneJsonPreview" class="text-danger bg-danger bg-opacity-10 px-2 py-1 rounded">{}</code></div>
                                <div class="d-flex gap-2">
                                    <button type="submit" class="btn-custom text-dark px-4" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)"><i class="fa-solid fa-save me-1"></i> Lưu mốc</button>
                                    <button type="button" class="btn btn-light border fw-bold px-4 rounded-4" onclick="resetMilestoneForm()">Làm mới</button>
                                </div>
                            </form>
                        </div></div></div></div>
                        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                            <div class="fw-bold text-dark" id="donateListTitle">Quà ngày</div>
                            <div style="width: 250px;">
                                <input type="text" class="form-control form-control-sm" id="milestonesSearchFilter" placeholder="Tìm mốc (tên, ID)...">
                            </div>
                        </div>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-custom text-center mb-0 align-middle">
                                <thead><tr><th>Mốc</th><th>Quà</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                                <tbody id="milestoneTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>
                        </section>

                    <section id="tab-recharge-events-admin" role="tabpanel" aria-label="Sự kiện có hạn" hidden>
                        <div class="tab-title"><i class="fa-solid fa-bolt me-2 text-danger"></i> Quản lý Sự kiện nạp</div>
                        <div class="alert alert-info border-0 bg-info bg-opacity-10 rounded-4 fw-bold"><i class="fa-solid fa-circle-info me-2"></i>Sự kiện cộng chung giao dịch Donate Xu/VIP trong khoảng thời gian cấu hình và phát thêm quà riêng. Không thay đổi mốc Tích Donate.</div>
                        <button type="button" class="btn btn-primary fw-bold mb-3" onclick="openNewDonateEvent()">Thêm sự kiện</button>
                        <div class="modal fade" id="donateEventModal" tabindex="-1" aria-labelledby="donateEventTitle" aria-hidden="true">
                        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">
                        <div class="modal-header"><h5 class="modal-title" id="donateEventTitle">Sửa sự kiện nạp</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
                        <div class="modal-body">
                            <form id="rechargeEventForm">
                                <input type="hidden" name="action" value="save_recharge_event"><input type="hidden" name="id" id="recharge_event_id"><input type="hidden" name="edit_version" id="recharge_event_edit_version" value="0"><input type="hidden" name="banner_path" id="recharge_event_banner_path"><input type="hidden" name="tiers_json" id="recharge_event_tiers_json">
                                <div class="row g-3 mb-3">
                                    <div class="col-md-5"><label class="fw-bold mb-2 text-dark">Tên sự kiện</label><input type="text" name="title" id="recharge_event_title" class="form-control" maxlength="120" required placeholder="VD: Nạp hè nhận quà thêm"></div>
                                    <div class="col-md-3"><label class="fw-bold mb-2 text-dark">Bắt đầu (GMT+7)</label><input type="datetime-local" name="starts_at" id="recharge_event_starts_at" class="form-control" required></div>
                                    <div class="col-md-3"><label class="fw-bold mb-2 text-dark">Kết thúc (GMT+7)</label><input type="datetime-local" name="ends_at" id="recharge_event_ends_at" class="form-control" required></div>
                                    <div class="col-md-1"><label class="fw-bold mb-2 text-dark">Bật</label><div class="border bg-light d-flex align-items-center justify-content-center" style="border:2px solid #e2e8f0!important;border-radius:14px;height:38px"><input class="form-check-input m-0" type="checkbox" id="recharge_event_is_active" checked></div><input type="hidden" name="is_active" id="recharge_event_is_active_value" value="1"></div>
                                </div>
                                <div class="row g-3 align-items-end mb-3">
                                    <div class="col-md-8"><label class="fw-bold mb-2 text-dark">Banner sự kiện</label><div class="d-flex gap-2"><input type="file" id="recharge_event_banner_file" class="form-control" accept="image/png,image/jpeg,image/webp"><button type="button" class="btn btn-outline-primary fw-bold" id="uploadRechargeEventBanner"><i class="fa-solid fa-upload me-1"></i>Upload</button></div><div class="small text-muted mt-2">JPG/PNG/WEBP, tối đa 8MB. Banner sẽ được hiển thị trong popup khi người chơi vào web.</div></div>
                                    <div class="col-md-4"><img id="recharge_event_banner_preview" src="" alt="Banner xem trước" class="img-fluid rounded-3 border d-none" style="max-height:100px;object-fit:cover"></div>
                                </div>
                                <hr class="my-4"><div class="fw-black text-dark mb-3"><i class="fa-solid fa-layer-group text-danger me-1"></i> Các mốc nạp và quà thêm</div>
                                <div class="row g-3 align-items-end mb-3"><div class="col-md-3"><label class="fw-bold mb-2 text-dark">Nạp đủ (VNĐ)</label><input type="number" id="recharge_event_tier_amount" class="form-control" min="1" max="2000000000" placeholder="500000"></div><div class="col-md-5"><label class="fw-bold mb-2 text-dark">Chọn item quà</label><select id="recharge_event_item" class="form-select select2-custom" data-placeholder="-- Gõ ID hoặc tên item --" style="width:100%"><option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?></select></div><div class="col-md-2"><label class="fw-bold mb-2 text-dark">Số lượng</label><input type="number" id="recharge_event_item_amount" class="form-control" min="1" max="999999" value="1"></div><div class="col-md-2"><button type="button" class="btn-custom w-100 text-white" style="background:#10b981" id="addRechargeEventTier"><i class="fa-solid fa-plus"></i> Thêm mốc</button></div></div>
                                <div id="rechargeEventTierPreview" class="item-list-builder mb-3"><span class="text-muted fw-bold">Chưa thêm mốc...</span></div><div class="small fw-bold text-muted mb-4">JSON gửi máy chủ: <code id="rechargeEventTiersPreview" class="text-danger bg-danger bg-opacity-10 px-2 py-1 rounded">[]</code></div>
                                <div class="d-flex gap-2"><button type="submit" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#ef4444,#b91c1c)"><i class="fa-solid fa-save me-1"></i>Lưu sự kiện</button><button type="button" class="btn btn-light border fw-bold px-4 rounded-4" id="resetRechargeEventForm">Làm mới</button></div>
                            </form>
                        </div></div></div></div>
                        <div class="table-responsive border rounded-4 shadow-sm"><table class="table table-custom text-center mb-0 align-middle"><thead><tr><th>Sự kiện</th><th>Thời gian</th><th>Mốc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="rechargeEventTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody></table></div>
                    </section>
                    </div>

                    <div class="main-tab-pane" id="tab-lucky-wheel-admin">
                        <div class="tab-title"><i class="fa-solid fa-dharmachakra me-2 text-danger"></i> Vòng Quay May Mắn</div>
                        <div class="admin-section-box mb-4 d-flex align-items-center justify-content-between gap-3 flex-wrap border-danger border-opacity-25"><div><div class="fw-black text-dark"><i class="fa-solid fa-eye-slash text-danger me-2"></i>Hiển thị với người chơi</div><div class="small text-muted fw-bold">Tắt để ẩn cả tab và chặn lượt quay mới; quà, lượt và lịch sử vẫn được giữ nguyên.</div></div><div class="form-check form-switch fs-4 m-0"><input class="form-check-input setting-toggle" type="checkbox" data-key="lucky_wheel_enabled" id="luckyWheelVisibilityToggle"></div></div>
                        <div class="alert alert-info border-0 rounded-4 mb-4"><strong>Tỷ lệ trúng riêng cho từng quà</strong><div class="small mt-2">Bạn có thể thêm và lưu nháp nhiều item, không cần tự cộng đủ 100% ở từng bước. Vòng quay chỉ mở khi tổng các quà đang bật đúng <b>100%</b>. Quà hiếm có thể đặt <b>0,01%</b>, <b>0,1%</b> hoặc <b>1%</b>; phần còn lại dành cho quà thường. Tỷ lệ đã nhập không tự đổi khi thêm item.</div></div>
                        <div class="admin-section-box mb-4 lucky-wheel-bulk-box"><div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3 border-bottom pb-3"><div><h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-layer-group text-primary me-2"></i>Thêm nhanh nhiều item</h5><div class="small text-muted fw-bold">Mỗi dòng: <code>ID ; số lượng ; tỷ lệ %</code>. Tên sẽ tự lấy theo item đã chọn, không nhập tay.</div></div><button type="button" class="btn btn-outline-primary fw-bold" id="wheelBulkExample">Nạp mẫu 10 dòng</button></div><textarea id="wheelBulkRows" class="form-control font-monospace" rows="6" placeholder="836 ; 100 ; 0,01&#10;837 ; 100 ; 0,1&#10;838 ; 100 ; 1"></textarea><div class="small text-muted mt-2">Ví dụ quà hiếm: 0,01%–1%. Các item thường có thể chia phần còn lại. Bấm kiểm tra để xem tên và tổng tỷ lệ trước khi lưu.</div><div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mt-3"><button type="button" class="btn btn-light border fw-bold" id="wheelBulkPreview"><i class="fa-solid fa-magnifying-glass me-1"></i>Kiểm tra danh sách</button><span id="wheelBulkSummary" class="small fw-bold text-muted">Chưa có dòng item.</span><button type="button" class="btn btn-primary fw-bold" id="wheelBulkSave" disabled><i class="fa-solid fa-plus me-1"></i>Thêm tất cả item</button></div><div id="wheelBulkPreviewBox" class="table-responsive mt-3 d-none"><table class="table table-sm table-custom align-middle mb-0"><thead><tr><th>Item</th><th>Tên tự động</th><th>Số lượng</th><th>Tỷ lệ</th></tr></thead><tbody id="wheelBulkPreviewBody"></tbody></table></div><div id="wheelBulkStatus" class="small mt-2" role="status" aria-live="polite"></div></div>
                        <div class="admin-section-box mb-4"><div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-4 border-bottom pb-3"><div><h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-gift text-danger me-2"></i>Thêm / sửa quà và tỷ lệ trúng</h5><div class="small text-muted fw-bold">Tên item được khóa theo danh mục. Với Xu, tên cũng tự theo số lượng; bạn chỉ cần chọn quà và đặt tỷ lệ.</div></div><button type="button" class="btn btn-light border fw-bold" id="resetLuckyWheelPrize"><i class="fa-solid fa-rotate-left me-1"></i> Tạo quà mới</button></div><form id="luckyWheelPrizeForm"><input type="hidden" name="action" value="save_lucky_wheel_prize"><input type="hidden" name="id" id="lucky_wheel_prize_id"><input type="hidden" name="is_active" id="lucky_wheel_is_active_value" value="1"><div class="row g-3"><div class="col-md-3"><label class="fw-bold mb-2 text-dark">Loại quà</label><select name="prize_type" id="lucky_wheel_prize_type" class="form-select"><option value="xu">Xu Web</option><option value="item">Vật phẩm game (gửi thư)</option></select></div><div class="col-md-5"><label class="fw-bold mb-2 text-dark">Tên item (tự động)</label><input type="text" name="title" id="lucky_wheel_title" class="form-control" maxlength="120" placeholder="Chọn item để tự lấy tên" readonly></div><div class="col-md-2 lucky-wheel-xu-field"><label class="fw-bold mb-2 text-dark">Xu thưởng</label><input type="number" name="xu_amount" id="lucky_wheel_xu_amount" class="form-control" min="1" max="1000000000" value="5000"></div><div class="col-md-2"><label class="fw-bold mb-2 text-dark">Tỷ lệ trúng (%)</label><input type="text" inputmode="decimal" name="chance_percent" id="lucky_wheel_chance_percent" class="form-control" min="0" max="100" step="0.0001" value="1" required><div class="form-text">Có thể lưu nháp, chưa cần đủ 100%.</div></div><div class="col-md-8 lucky-wheel-item-field d-none"><label class="fw-bold mb-2 text-dark">Vật phẩm gửi thư</label><select name="item_id" id="lucky_wheel_item_id" class="form-select select2-custom" data-placeholder="-- Gõ ID hoặc tên vật phẩm --" style="width:100%"><option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?></select></div><div class="col-md-2 lucky-wheel-item-field d-none"><label class="fw-bold mb-2 text-dark">Số lượng</label><input type="number" name="item_amount" id="lucky_wheel_item_amount" class="form-control" min="1" max="999999" value="1"></div><div class="col-md-2"><label class="fw-bold mb-2 text-dark">Thứ tự</label><input type="number" name="sort_order" id="lucky_wheel_sort_order" class="form-control" value="0"></div><div class="col-md-2"><label class="fw-bold mb-2 text-dark">Trạng thái</label><div class="border bg-light d-flex align-items-center justify-content-center" style="border:2px solid #e2e8f0!important;border-radius:14px;height:38px"><div class="form-check form-switch m-0 p-0"><input class="form-check-input m-0" type="checkbox" id="lucky_wheel_is_active" checked></div></div></div><div class="col-12 d-flex justify-content-end"><button type="submit" class="btn-custom text-white px-4 py-2 rounded-3" style="background:linear-gradient(135deg,#e11d48,#be123c)"><i class="fa-solid fa-floppy-disk me-1"></i> Lưu quà vòng quay</button></div></div></form></div>
                        <div class="admin-section-box mb-4"><div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3"><div><h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-chart-pie text-warning me-2"></i>Danh sách quà & tỷ lệ hiện tại</h5><div class="small text-muted fw-bold" id="luckyWheelWeightSummary">Đang tải...</div></div><button type="button" class="btn btn-light border fw-bold" id="refreshLuckyWheelPrizes"><i class="fa-solid fa-arrows-rotate me-1"></i> Làm mới</button></div><div class="table-responsive"><table class="table table-custom text-center align-middle"><thead><tr><th>Quà</th><th>Loại</th><th>Giá trị</th><th>Tỷ lệ trúng (%)</th><th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="luckyWheelPrizeTableBody"><tr><td colspan="7" class="py-4 text-muted fw-bold">Chưa tải phần thưởng.</td></tr></tbody></table></div></div>
                        <div class="admin-section-box"><div class="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3"><div><h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-clock-rotate-left text-primary me-2"></i>100 lượt quay mới nhất</h5><div class="small text-muted fw-bold">Đối soát quà Xu đã cộng và thư vật phẩm đang chờ gửi.</div></div><button type="button" class="btn btn-light border fw-bold" id="refreshLuckyWheelHistory"><i class="fa-solid fa-arrows-rotate me-1"></i> Làm mới</button></div><div class="table-responsive"><table class="table table-custom text-center align-middle"><thead><tr><th>Thời gian</th><th>Tài khoản / Server</th><th>Phần thưởng</th><th>Trạng thái phát</th></tr></thead><tbody id="luckyWheelHistoryTableBody"><tr><td colspan="4" class="py-4 text-muted fw-bold">Chưa tải lịch sử.</td></tr></tbody></table></div></div>
                    </div>

                    <div class="main-tab-pane" id="tab-user">
                        <div class="tab-title"><i class="fa-solid fa-users me-2 text-primary"></i> QUẢN LÝ NGƯỜI CHƠI</div>
                        <div class="alert alert-primary border-primary bg-primary bg-opacity-10 fw-bold mb-3"><i class="fa-solid fa-server me-2"></i>Phiên quản trị tại <strong>S<?php echo htmlspecialchars($_SESSION['server_id']); ?> · <?php echo htmlspecialchars($current_server_name); ?></strong>. Đổi máy chủ ở menu trên đầu trang để chuyển toàn bộ phiên quản trị.</div>
                        <p class="small text-muted">Ví Xu và khóa tài khoản dùng chung; VIP, điểm nạp và nhân vật theo máy chủ đang quản trị.</p>
                        <div class="d-flex gap-2 mb-3 align-items-center"><label for="accountFilter" class="fw-bold">Lọc tài khoản</label><select id="accountFilter" class="form-select" style="max-width:240px" onchange="loadUsers(1)"><option value="all">Tất cả tài khoản</option><option value="locked">Đang bị khóa</option><option value="active">Đang hoạt động</option><option value="vip">Có VIP</option><option value="vip1">VIP 1</option><option value="vip2">VIP 2</option><option value="nonvip">Chưa có VIP</option></select></div>
<div class="input-group mb-4 shadow-sm rounded-4 overflow-hidden" style="max-width: 500px;">
                            <span class="input-group-text bg-white border-end-0 text-muted"><i class="fa-solid fa-search"></i></span>
                            <input type="text" id="searchInput" class="form-control border-start-0 border-end-0 ps-0" placeholder="Tài khoản, ID WebGM, UID hoặc tên nhân vật..." onkeypress="if(event.key==='Enter') loadUsers(1)">
                            <button class="btn btn-custom text-white rounded-0 px-4" style="background: linear-gradient(135deg, #0ea5e9, #0284c7);" onclick="loadUsers(1)">TÌM KIẾM</button>
                        </div>
                        <div class="table-responsive rounded-4 border shadow-sm">
                            <table class="table table-custom text-center mb-0 align-middle">
                                <thead><tr>
                                    <th>TÀI KHOẢN & SERVER</th>
                                    <th class="user-sortable-header" id="userSortBalanceHeader" role="button" tabindex="0" onclick="toggleUserSort('balance')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleUserSort('balance');}" title="Bấm để sắp xếp Xu"><span class="sort-label">SỐ DƯ XU <span id="userSortBalanceIcon" class="sort-icon" aria-hidden="true">↕</span></span></th>
                                    <th>NHÂN VẬT & UID</th>
                                    <th class="user-sortable-header" id="userSortVipHeader" role="button" tabindex="0" onclick="toggleUserSort('vip')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleUserSort('vip');}" title="Bấm để sắp xếp VIP"><span class="sort-label">VIP <span id="userSortVipIcon" class="sort-icon" aria-hidden="true">↕</span></span></th>
                                    <th>CHỌN CHỨC NĂNG</th>
                                </tr></thead>
                                <tbody id="userTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i><br>Đang tải dữ liệu...</td></tr></tbody>
                            </table>
                        </div>
                        <div class="small text-muted fw-bold mt-2"><i class="fa-solid fa-circle-info me-1"></i>Bấm <b>Chọn chức năng</b> để mở các thao tác Xu, VIP, mật khẩu hoặc kỷ luật tài khoản.</div><div class="pagination-box" id="userPagination"></div>
                    </div>

                    <div class="main-tab-pane" id="tab-gm">
                        <div class="tab-title"><i class="fa-solid fa-paper-plane me-2 text-danger"></i> TRẠM QUẢN TRỊ VIÊN</div>
                        
                        <div class="inner-box border-2 border-primary bg-primary bg-opacity-10 p-4 mb-4">
                            <label class="fw-black mb-2 text-primary"><i class="fa-solid fa-crosshairs me-1"></i> Mục tiêu (Tài khoản / UID / tên nhân vật)</label>
                            <input type="text" id="gm_target_uid" class="form-control form-control-lg text-danger fw-black shadow-sm" placeholder="Nhập tài khoản, UID hoặc tên nhân vật..." autocomplete="off">
                            <div id="gmResolvedTarget" class="small mt-2" aria-live="polite">Nhập mục tiêu để tự nhận diện. Có nhiều kết quả phải chọn đúng nhân vật.</div>
                            <select id="gmResolvedSelect" class="form-select mt-2" hidden aria-label="Chọn nhân vật nhận"></select>
                        </div>

                        <ul class="nav nav-pills-custom" role="tablist">
                            <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sub-item" type="button"><i class="fa-solid fa-box me-1"></i> Bơm Đồ / Tiền</button></li>
                            <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sub-clear-mail" type="button"><i class="fa-solid fa-envelope-open-text me-1"></i> Dọn Hòm Thư</button></li>
                            <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sub-clear-bag" type="button"><i class="fa-solid fa-briefcase me-1"></i> Dọn Balo</button></li>
                        </ul>

                        <div class="tab-content mb-4 border-bottom pb-4">
                            <div class="tab-pane fade show active p-0" id="sub-item">
                                <form class="ajax-form form-no-reset">
                                    <input type="hidden" name="action" value="send_gm_action"><input type="hidden" name="gm_type" value="item"><input type="hidden" name="role_id" class="hidden_uid">
                                    <div class="row g-3 mb-4">
                                        <div class="col-md-8">
                                            <label class="fw-bold mb-2 text-dark">Chọn đồ hoặc tiền</label>
                                            <select name="item_id" class="form-select select2-custom" required data-placeholder="-- Gõ tên để tìm --" style="width: 100%;">
                                                <option value=""></option>
                                                <optgroup label="Vật phẩm"><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?></optgroup>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="fw-bold mb-2 text-dark">Số lượng</label>
                                            <input type="number" name="amount" id="gm_item_amount" class="form-control" value="1" min="1" max="1000000000" step="1" required>
                                        </div>
                                    </div>
                                    <button type="button" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #0ea5e9, #0284c7);" onclick="submitGmForm(this)"><i class="fa-solid fa-paper-plane me-2"></i> PHÓNG VÀO THƯ</button>
                                </form>
                            </div>
                            
                            <!-- Tab Dọn Hòm Thư -->
                            <div class="tab-pane fade p-0" id="sub-clear-mail">
                                <form class="ajax-form form-no-reset">
                                    <input type="hidden" name="action" value="send_gm_action"><input type="hidden" name="gm_type" value="clear_mail"><input type="hidden" name="role_id" class="hidden_uid">
                                    <div class="alert alert-warning border rounded-4 small fw-bold mb-4">
                                        <i class="fa-solid fa-circle-info me-1"></i> Thao tác này sẽ xóa toàn bộ thư đang có trong hòm thư của nhân vật này.
                                    </div>
                                    <button type="button" class="btn btn-danger w-100 py-2.5 fw-bold rounded-3" onclick="submitGmForm(this, 'Xác nhận xóa toàn bộ thư của nhân vật này?')"><i class="fa-solid fa-trash-can me-2"></i> XÓA TOÀN BỘ THƯ</button>
                                </form>
                            </div>

                            <!-- Tab Dọn Balo -->
                            <div class="tab-pane fade p-0" id="sub-clear-bag">
                                <form class="ajax-form form-no-reset">
                                    <input type="hidden" name="action" value="send_gm_action"><input type="hidden" name="gm_type" value="clear_bag"><input type="hidden" name="role_id" class="hidden_uid">
                                    <div class="alert alert-danger border rounded-4 small fw-bold mb-4">
                                        <i class="fa-solid fa-triangle-exclamation me-1"></i> Thao tác này sẽ xóa sạch (làm trống) toàn bộ balo của nhân vật này. Nhân vật <strong>PHẢI OFFLINE</strong> trước khi thực hiện để có hiệu lực.
                                    </div>
                                    <button type="button" class="btn btn-danger w-100 py-2.5 fw-bold rounded-3" onclick="submitGmForm(this, 'Xác nhận làm trống toàn bộ balo của nhân vật này? Vật phẩm đã mất không thể khôi phục!')"><i class="fa-solid fa-briefcase me-2"></i> XÓA SẠCH BALO</button>
                                </form>
                            </div>
                        </div>

                    </div>

                    <div class="main-tab-pane" id="tab-vip">
                        <div class="tab-title text-warning"><i class="fa-solid fa-ticket me-2"></i> DANH SÁCH MÃ ỦY QUYỀN</div>
                        <form class="ajax-form mb-4 inner-box p-4 border-2 border-warning bg-warning bg-opacity-10">
                            <input type="hidden" name="action" value="create_auth_code">
                            <div class="row g-3 align-items-end">
                                <div class="col-md-4"><label class="fw-bold mb-2 text-dark">Loại VIP</label><select name="vip_type" class="form-select"><option value="1">VIP 1</option><option value="2" selected>VIP 2 (Đầy đủ)</option></select></div>
                                <div class="col-md-4"><label class="fw-bold mb-2 text-dark">Số lượng tạo</label><input type="number" name="quantity" class="form-control" value="5" min="1" max="100"></div>
                                <div class="col-md-4"><button type="submit" class="btn-custom w-100 text-dark shadow-sm" style="background: linear-gradient(135deg, #f59e0b, #fbbf24);"><i class="fa-solid fa-plus me-1"></i> TẠO MÃ NGAY</button></div>
                            </div>
                        </form>
                        <form id="authCodeSearchForm" class="inner-box p-3 mb-3 border-2 border-info bg-info bg-opacity-10" autocomplete="off">
                            <div class="row g-2 align-items-end">
                                <div class="col-md-10">
                                    <label class="fw-bold mb-2 text-dark"><i class="fa-solid fa-magnifying-glass me-1 text-info"></i> Tìm mã ủy quyền</label>
                                    <input type="text" id="authCodeSearchInput" class="form-control" placeholder="Nhập mã, tài khoản, tên nhân vật, UID, ID tài khoản...">
                                </div>
                                <div class="col-md-2">
                                    <button type="button" id="btnClearAuthCodeSearch" class="btn-custom w-100 text-primary bg-white border shadow-sm"><i class="fa-solid fa-rotate-left me-1"></i> Xóa lọc</button>
                                </div>
                                <div class="col-12">
                                    <div id="authCodeSearchStatus" class="small text-info fw-bold mt-1">Gõ để lọc realtime, không cần bấm tìm.</div>
                                </div>
                            </div>
                        </form>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-hover table-custom text-center mb-0 align-middle">
                                <thead><tr><th>MÃ CODE (BẤM COPY)</th><th>LOẠI</th><th>TRẠNG THÁI</th><th>USER SỬ DỤNG</th><th>THAO TÁC</th></tr></thead>
                                <tbody id="authCodeTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>

                        <div class="tab-title text-success mt-5"><i class="fa-solid fa-tags me-2"></i> VOUCHER GIẢM GIÁ NÂNG VIP</div>
                        <form id="vipVoucherForm" class="ajax-form mb-4 inner-box p-4 border-2 border-success bg-success bg-opacity-10">
                            <input type="hidden" name="action" value="save_vip_voucher">
                            <input type="hidden" name="id" id="vip_voucher_id">
                            <div class="row g-3 align-items-end">
                                <div class="col-md-3">
                                    <label class="fw-bold mb-2 text-dark">Mã voucher</label>
                                    <input type="text" name="code" id="vip_voucher_code" class="form-control text-uppercase fw-black text-success" placeholder="KHACHQUEN666" required>
                                </div>
                                <div class="col-md-2">
                                    <label class="fw-bold mb-2 text-dark">Giảm</label>
                                    <input type="number" name="discount_amount" id="vip_voucher_discount" class="form-control" value="100000" min="1000" required>
                                </div>
                                <div class="col-md-2">
                                    <label class="fw-bold mb-2 text-dark">Lượt dùng</label>
                                    <input type="number" name="max_uses" id="vip_voucher_max_uses" class="form-control" value="0" min="0">
                                </div>
                                <div class="col-md-2">
                                    <label class="fw-bold mb-2 text-dark">Hạn dùng</label>
                                    <input type="datetime-local" name="expires_at" id="vip_voucher_expires" class="form-control">
                                </div>
                                <div class="col-md-1">
                                    <label class="fw-bold mb-2 text-dark">Bật</label>
                                    <select name="is_active" id="vip_voucher_active" class="form-select"><option value="1">Bật</option><option value="0">Tắt</option></select>
                                </div>
                                <div class="col-md-2">
                                    <button type="submit" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #10b981, #059669);"><i class="fa-solid fa-save me-1"></i> Lưu voucher</button>
                                </div>
                                <div class="col-12">
                                    <input type="text" name="note" id="vip_voucher_note" class="form-control" placeholder="Ghi chú nội bộ, ví dụ: khách quen giảm 100k">
                                </div>
                            </div>
                        </form>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-hover table-custom text-center mb-0 align-middle">
                                <thead><tr><th>Mã voucher</th><th>Giảm giá</th><th>Lượt dùng</th><th>Hạn dùng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                                <tbody id="vipVoucherTableBody"><tr><td colspan="6" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="main-tab-pane" id="tab-giftcode">
                        <div class="tab-title text-success"><i class="fa-solid fa-gift me-2"></i> BỘ TẠO MÃ QUÀ TẶNG</div>
                        <div class="row g-3 align-items-end mb-4 inner-box p-4 border-2 border-success bg-success bg-opacity-10">
                            <div class="col-md-7">
                                <label class="fw-bold mb-2 text-dark">Tìm vật phẩm / tiền</label>
                                <select id="builder_item" class="form-select select2-custom" data-placeholder="-- Gõ để tìm --" style="width: 100%;"><option value=""></option>
                                    <optgroup label="Vật phẩm"><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?></optgroup>
                                </select>
                            </div>
                            <div class="col-md-3"><label class="fw-bold mb-2 text-dark">Số lượng</label><input type="number" id="builder_amount" class="form-control" value="1" min="1"></div>
                            <div class="col-md-2"><button type="button" class="btn-custom w-100 text-white shadow-sm" style="background:#10b981;" id="btnAddItem"><i class="fa-solid fa-plus"></i> THÊM</button></div>
                        </div>
                        
                        <form class="ajax-form mb-4 border-bottom pb-4">
                            <input type="hidden" name="action" value="create_giftcode"><input type="hidden" name="items_json" id="final_json_input" required>
                            <div class="mb-4">
                                <label class="fw-black mb-2 text-success">Danh sách quà trong mã này:</label>
                                <div class="item-list-builder mb-2 shadow-sm" id="itemPreviewBox"><span class="text-muted small">Chưa thêm...</span></div>
                                <div class="small fw-bold text-muted mt-2">Định dạng JSON gửi máy chủ: <code id="jsonPreview" class="text-danger bg-danger bg-opacity-10 px-2 py-1 rounded">{}</code></div>
                            </div>
                            <div class="row g-3 mb-4">
                                <div class="col-md-4"><label class="fw-bold mb-2 text-dark">Mã tùy chỉnh</label><input type="text" name="code" class="form-control text-uppercase shadow-sm fw-black text-primary" required placeholder="VD: VIP999"></div>
                                <div class="col-md-4"><label class="fw-bold mb-2 text-dark">Giới hạn lượt nhập</label><input type="number" name="max_uses" class="form-control shadow-sm" value="1000" required></div>
                                <div class="col-md-4"><label class="fw-bold mb-2 text-dark">Trạng thái hiển thị</label><select name="hide" class="form-select shadow-sm"><option value="1">Hiển thị công khai</option><option value="0">Ẩn (Mã chìm)</option></select></div>
                            </div>
                            <div class="row g-3 mb-4"><div class="col-md-6"><label class="fw-bold mb-2" for="giftCreateExpiry">Hết hạn lúc (GMT+7)</label><input type="datetime-local" name="expire_at" id="giftCreateExpiry" class="form-control"><div class="form-text">Để trống: không hết hạn. Ngày giờ được kiểm tra tại máy chủ.</div></div></div>
                            <button type="submit" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #10b981, #059669);"><i class="fa-solid fa-bullhorn me-2"></i> PHÁT HÀNH GIFTCODE MỚI</button>
                        </form>
                        
                        <h6 class="fw-black mb-3 text-dark"><i class="fa-solid fa-list me-2 text-success"></i> Danh sách mã quà tặng đã tạo</h6>
                        <div class="table-responsive border rounded-4 shadow-sm">
                            <table class="table table-hover table-custom text-center mb-0 align-middle">
                                <thead class="table-light"><tr><th>MÃ CODE</th><th>LƯỢT DÙNG</th><th>TRẠNG THÁI</th><th>DANH SÁCH QUÀ</th><th>THAO TÁC</th></tr></thead>
                                <tbody id="giftcodeTableBody"><tr><td colspan="5" class="py-5 text-muted"><i class="fa-solid fa-spinner fa-spin fs-4"></i></td></tr></tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>

<div class="modal fade" id="webshopEditModal" tabindex="-1" aria-labelledby="webshopEditTitle" aria-hidden="true">
 <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">
 <div class="modal-header"><h5 class="modal-title" id="webshopEditTitle">Sửa Webshop</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
 <div class="modal-body"><form id="webshopForm">
                                <input type="hidden" name="action" value="save_webshop_item">
                                <input type="hidden" name="id" id="shop_id">
                                <div class="row g-3">
                                    <div class="col-12"><label class="fw-bold" for="shop_product_mode">Loại mặt hàng</label><select id="shop_product_mode" name="product_mode" class="form-select"><option value="single">Một item</option><option value="bundle">Gói nhiều item — nhận tất cả</option></select></div>
                                    <div class="col-12" id="shopBundleEditor" hidden>
                                      <input type="hidden" name="reward_items" id="shop_reward_items">
                                      <div class="input-group mb-2"><select id="shop_fashion_template" class="form-select"><option value="">Chọn nhanh bộ thời trang ẩn…</option></select><button type="button" class="btn btn-outline-primary" onclick="applyFashionBundle()">Thêm đủ bộ</button></div>
                                      <div class="row g-2 mb-2"><div class="col-md-7"><select id="shop_bundle_item" class="form-select select2-custom" style="width:100%"><option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt','item_'); ?></select></div><div class="col-md-2"><input id="shop_bundle_amount" type="number" min="1" value="1" class="form-control" aria-label="Số lượng item trong gói"></div><div class="col-md-3"><button type="button" class="btn btn-primary w-100" onclick="addShopBundleItem()">Thêm vào gói</button></div></div>
                                      <div id="shopBundleRows" class="border rounded p-2"></div><div class="form-text">Tối đa 20 ID khác nhau. Giá Xu là giá cả gói; mua N gói nhận N lần toàn bộ danh sách.</div>
                                    </div>
                                    <div class="col-lg-5" id="shopSingleItemField">
                                        <label class="fw-bold mb-2 text-dark">Tìm vật phẩm theo ID hoặc tên</label>
                                        <select name="item_id" id="shop_item_select" class="form-select select2-custom" required data-placeholder="-- Gõ ID hoặc tên vật phẩm --" style="width:100%">
                                            <option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt', 'item_'); ?>
                                        </select>
                                    </div>
                                    <div class="col-lg-7">
                                        <label class="fw-bold mb-2 text-dark">Tên hiển thị</label>
                                        <input type="text" name="item_name" id="shop_item_name" class="form-control" required data-auto-name="1" placeholder="Tên vật phẩm trong Webshop">
                                        <div class="form-text fw-bold">Tự lấy theo vật phẩm đã chọn, vẫn sửa tay được.</div>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Giá Xu</label>
                                                <input type="number" name="price" id="shop_price" class="form-control" min="1" step="1" inputmode="numeric" required>
                                                <div class="form-text">Tự đặt giá Xu Web theo nhu cầu (số nguyên dương).</div>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Số lượng mỗi gói</label>
                                        <input type="number" name="item_amount" id="shop_item_amount" class="form-control" value="1" min="1" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Thứ tự</label>
                                        <input type="number" name="sort_order" id="shop_sort_order" class="form-control" value="0">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="fw-bold mb-2 text-dark">Trạng thái</label>
                                        <input type="hidden" name="is_active" id="shop_is_active_value" value="1">
                                        <div class="form-check form-switch border rounded-4 px-5 py-3 bg-light">
                                            <input class="form-check-input" type="checkbox" id="shop_is_active" checked>
                                            <label class="form-check-label fw-bold" for="shop_is_active">Đang mở</label>
                                        </div>
                                    </div>
                                    <div class="col-12">
                                        <label class="fw-bold mb-2 text-dark">Ảnh vật phẩm</label>
                                        <div class="admin-image-picker">
                                            <div class="admin-image-preview" id="shopImagePreview">
                                                <i class="fa-solid fa-image text-primary"></i>
                                            </div>
                                            <div class="flex-grow-1">
                                                <div class="input-group">
                                            <input type="text" name="image_url" id="shop_image_url" class="form-control" placeholder="Tự điền URL hoặc chọn tải ảnh lên ở bên phải ->">
                                            <input type="file" id="shop_image_file" class="d-none" accept="image/*" onchange="uploadShopItemImage(this)">
                                            <button type="button" class="btn btn-primary px-4 fw-bold" onclick="$('#shop_image_file').trigger('click')"><i class="fa-solid fa-cloud-arrow-up me-1"></i> Tải ảnh lên</button>
                                        </div>
                                    </div>
                                </div>
                                    </div>

                                </div>

                                <div class="d-flex gap-2 mt-4">
                                    <button type="submit" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)"><i class="fa-solid fa-save me-1"></i> Lưu vật phẩm</button>
                                    <button type="button" class="btn btn-light border fw-bold px-4 rounded-4" onclick="resetWebshopForm()">Làm mới</button>
                                </div>
                            </form></div></div></div></div>
    <div class="modal fade" id="playerActionModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4">
                <div class="modal-header border-0"><h5 class="modal-title fw-black text-primary"><i class="fa-solid fa-list-check me-2"></i>Chọn chức năng tài khoản</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
                <div class="modal-body pt-0"><div id="playerActionTarget" class="small text-muted fw-bold mb-3">Chưa chọn người chơi</div><div class="player-action-grid"><button type="button" class="player-action-card text-warning" onclick="choosePlayerAction('xu')"><i class="fa-solid fa-coins"></i><span>Quản lý Xu</span></button><button type="button" class="player-action-card text-success" onclick="choosePlayerAction('vip')"><i class="fa-solid fa-bolt"></i><span>Quản lý VIP</span></button><button type="button" class="player-action-card text-primary" onclick="choosePlayerAction('password')"><i class="fa-solid fa-key"></i><span>Đổi mật khẩu</span></button><button type="button" class="player-action-card text-danger" onclick="choosePlayerAction('discipline')"><i class="fa-solid fa-user-lock"></i><span>Kỷ luật tài khoản</span><small>Game / WebGM / Cả hai</small></button></div></div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="gameBanModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4">
                <div class="modal-header bg-danger text-white rounded-top-4">
                    <h5 class="modal-title"><i class="fa-solid fa-user-lock me-2"></i>Kỷ luật tài khoản game</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Đóng"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-warning small mb-3"><i class="fa-solid fa-triangle-exclamation me-1"></i>Chọn rõ thao tác và phạm vi. Xem trước không thay đổi dữ liệu; chỉ xác nhận cuối cùng mới áp dụng.</div>
                    <div id="gameBanTarget" class="fw-bold text-dark mb-3">Chưa chọn tài khoản</div>
                    <div id="gameBanCurrent" class="small text-muted mb-3">Đang tải trạng thái...</div>
                    <div class="row g-3">
                        <div class="col-md-6"><label class="form-label fw-bold">Thao tác</label><select id="disciplineOperation" class="form-select"><option value="ban">Khóa tài khoản</option><option value="unban">Mở khóa tài khoản</option></select></div>
                        <div class="col-md-6"><label class="form-label fw-bold">Phạm vi</label><select id="disciplineScope" class="form-select"><option value="game">Chỉ game</option><option value="web">Chỉ WebGM</option><option value="both">Cả game và WebGM</option></select></div>
                        <div class="col-md-6" id="disciplineDurationWrap"><label class="form-label fw-bold">Thời hạn (giây)</label><input type="number" min="1" max="315360000" value="" id="disciplineSeconds" class="form-control" placeholder="Nhập số giây"></div>
                        <div class="col-md-6"><label class="form-label fw-bold">Mã xử lý</label><input type="text" value="ACCOUNT_DISCIPLINE" id="disciplineCode" class="form-control" maxlength="64"></div>
                        <div class="col-12"><label class="form-label fw-bold">Lý do <span class="text-muted fw-normal">(để trống nếu chưa xác nhận)</span></label><textarea id="disciplineReason" class="form-control" rows="3" maxlength="240" placeholder="Tự nhập lý do khi xác nhận"></textarea></div>
                    </div>
                    <div id="disciplinePreview" class="alert alert-secondary small mt-3 mb-0" hidden></div>
                </div>
                <div class="modal-footer justify-content-between">
                    <button type="button" class="btn btn-outline-secondary fw-bold" data-bs-dismiss="modal">Hủy</button>
                    <div class="d-flex gap-2"><button type="button" class="btn btn-outline-primary fw-bold" onclick="previewDiscipline()"><i class="fa-solid fa-eye me-1"></i>Xem trước</button><button type="button" class="btn btn-danger fw-bold" onclick="commitDiscipline()"><i class="fa-solid fa-check me-1"></i>Xác nhận</button></div>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="xuModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow-lg" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0"><h5 class="modal-title fw-black text-warning"><i class="fa-solid fa-coins me-2"></i> QUẢN LÝ XU WEB</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body p-4">
                <form class="ajax-form"><input type="hidden" name="action" value="update_xu"><input type="hidden" name="username" id="xu_acc">
                <p class="text-muted fw-bold mb-2">Tài khoản thao tác: <strong id="xu_acc_text" class="text-dark fs-5"></strong></p>
                <p class="text-muted fw-bold mb-2">Số dư hiện tại: <strong id="xu_current" class="text-danger fs-5"></strong> Xu</p>
                <p class="text-muted fw-bold mb-4">Điểm nạp đã ghi: <strong id="xu_recharge_current" class="text-success fs-5">0</strong> đ</p>
                <label class="fw-bold text-dark mb-2">Nhập số lượng (Ví dụ: 10000 hoặc -50000 để trừ)</label>
                <input type="number" name="amount" class="form-control form-control-lg mb-4 shadow-sm fw-black text-primary" placeholder="..." required>
                <div class="form-check xu-recharge-check border border-warning rounded-3 bg-warning bg-opacity-10 p-3 mb-4">
                    <input class="form-check-input" type="checkbox" name="add_recharge" value="1" id="xu_add_recharge">
                    <label class="form-check-label fw-bold text-dark" for="xu_add_recharge">Cộng điểm nạp</label>
                    <button type="button" class="xu-help-button ms-1" onclick="openXuGuide()" aria-label="Hướng dẫn cộng điểm nạp" title="Hướng dẫn">!</button>
                    <div id="xuRechargeFields" class="mt-3" hidden>
                        <label class="form-label fw-bold text-dark mb-1" for="xu_recharge_amount">Điểm nạp cần cộng (đ)</label>
                        <input type="number" name="recharge_amount" id="xu_recharge_amount" class="form-control fw-bold text-success" min="1" max="2000000000" step="1" placeholder="Mặc định bằng số Xu">
                    </div>
                </div>

                <button type="submit" class="btn-custom w-100 text-dark shadow-sm" style="background: linear-gradient(135deg, #f59e0b, #fbbf24);"><i class="fa-solid fa-check me-1"></i> XÁC NHẬN CẬP NHẬT XU</button></form>
            </div>
        </div></div>
    </div>

    <div class="modal fade" id="xuGuideModal" tabindex="-1" aria-labelledby="xuGuideTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
            <div class="modal-header border-0 pb-0"><h5 class="modal-title fw-black text-warning" id="xuGuideTitle"><span class="xu-help-button me-2">!</span> HƯỚNG DẪN CỘNG ĐIỂM NẠP</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
            <div class="modal-body p-4">
                <ol class="mb-0 ps-3">
                    <li class="mb-2">Nhập số Xu muốn thay đổi. Số âm chỉ trừ Xu, không cộng điểm nạp.</li>
                    <li class="mb-2">Bật <strong>Cộng điểm nạp</strong> nếu muốn tính vào mốc Donate.</li>
                    <li>Nhập điểm nạp riêng nếu khác số Xu; để trống sẽ dùng đúng số Xu đã nhập.</li>
                </ol>
            </div>
        </div></div>
    </div>

    <div class="modal fade" id="vipModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow-lg" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0"><h5 class="modal-title fw-black text-success"><i class="fa-solid fa-bolt me-2"></i> CẤP QUYỀN VIP NHANH</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body p-4">
                <form class="ajax-form"><input type="hidden" name="action" value="set_user_vip"><input type="hidden" name="account" id="vip_acc"><p class="text-muted fw-bold mb-3">Tài khoản: <strong id="vip_acc_text" class="text-dark fs-5"></strong></p>
                <select name="vip_type" class="form-select form-select-lg mb-4 shadow-sm fw-bold"><option value="1">VIP 1 (Gói tri ân)</option><option value="2">VIP 2 (Đầy đủ chức năng)</option></select>
                <button type="submit" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #10b981, #059669);"><i class="fa-solid fa-check me-1"></i> XÁC NHẬN CẤP QUYỀN</button></form>
            </div>
        </div></div>
    </div>
    
    <div class="modal fade" id="pwdModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content border-0 shadow-lg" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0"><h5 class="modal-title fw-black text-danger"><i class="fa-solid fa-key me-2"></i> ĐỔI MẬT KHẨU</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body p-4">
                <form class="ajax-form"><input type="hidden" name="action" value="change_password"><input type="hidden" name="account" id="pwd_acc"><p class="text-muted fw-bold mb-3">Tài khoản: <strong id="pwd_acc_text" class="text-dark fs-5"></strong></p>
                <input type="text" name="new_password" class="form-control form-control-lg mb-4 shadow-sm" placeholder="Nhập mật khẩu mới vào đây..." required>
                <button type="submit" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #ef4444, #dc2626);"><i class="fa-solid fa-save me-1"></i> LƯU MẬT KHẨU</button></form>
            </div>
        </div></div>
    </div>

    <script>
    $('.menu-btn').click(function() {
        var tab = $(this).data('tab');
        $('.menu-btn').removeClass('active'); $(this).addClass('active');
        $('.main-tab-pane').removeClass('active'); $('#' + tab).addClass('active');
        if(tab === 'tab-overview') loadOverview();
        if(tab === 'tab-config') loadSettings();
        if(tab === 'tab-audit') loadAuditLogs(1);
        if(tab === 'tab-monitor') loadMonitorLogs(1);
        if(tab === 'tab-webshop-admin') loadWebshopItems();
        if(tab === 'tab-item-icons') loadItemIcons();
        if(tab === 'tab-recharge-admin') selectDonatePeriod(donateAdminPeriod);
        if(tab === 'tab-lucky-wheel-admin') { loadLuckyWheelPrizes(); loadLuckyWheelHistory(); }
        initAdminSelects();
    });

    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function() { 
        initAdminSelects();
    });

    function copyText(text) {
        var ta = document.createElement("textarea"); ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); 
            if (typeof appToast === 'function') appToast('success', 'Đã sao chép', text);
            else Swal.fire({ title: 'Đã sao chép!', text: text, icon: 'success', timer: 1500, showConfirmButton: false });
        } catch (e) { alert('Lỗi sao chép!'); }
        document.body.removeChild(ta);
    }

    var giftcodeItems = {};
    var adminItemCatalog = <?php echo json_encode($admin_item_catalog); ?>;
    var adminItemImages = <?php echo json_encode($admin_item_images); ?>;
    var rechargePeriodLabels = { total: 'Tổng Donate', day: 'Donate ngày', week: 'Donate tuần', month: 'Donate tháng' };
</script>
<script src="<?php echo site_asset_url('assets/js/web-context.js', '../'); ?>?v=20260906_context_v1"></script>
<script src="<?php echo site_asset_url('assets/js/webshop-admin.js', '../'); ?>?v=20260906_bundle_v1"></script>
<script src="<?php echo site_asset_url('assets/js/admin.js', '../'); ?>?v=<?php echo time(); ?>"></script>
<script src="<?php echo site_asset_url('assets/js/wheel-admin.js', '../'); ?>?v=20260913_wheel_slider_v1"></script>
<?php lhs_web_experience_assets('../'); ?>
<script src="../assets/js/admin-management.js?v=20260907_1"></script>
</body>
</html>
