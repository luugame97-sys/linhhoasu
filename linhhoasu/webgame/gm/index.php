<?php
require_once 'config.php';
require_once 'web_experience.php';
require_once 'web_context.php';
if (session_status() == PHP_SESSION_NONE) session_start();
lhs_web_private_headers();
if (!lhs_web_session_valid()) { header('Location: login.php'); exit; }
vht6ur_login_required();

$username = $_SESSION['username'];
$account_userid = $_SESSION['uin'];
$server_id = $_SESSION['server_id'];
$server_name = $_SESSION['server_name'];
$is_admin_account = current_session_is_admin();

if (maintenance_mode_enabled() && !$is_admin_account) {
    http_response_code(503);
    header('Retry-After: 600');
    $site_logo_url = site_asset_url(site_logo_image());
    $site_bg_css_url = site_absolute_asset_url(site_bg_image());
    ?>
<!doctype html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Linh Họa Sư - Bảo trì</title>
    <link rel="icon" type="image/svg+xml" href="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>">
    <style>
        :root{--site-bg-image:url('<?php echo htmlspecialchars($site_bg_css_url, ENT_QUOTES, 'UTF-8'); ?>');}
        *{box-sizing:border-box}
        body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;background-image:linear-gradient(rgba(15,23,42,.78),rgba(15,23,42,.82)),var(--site-bg-image);background-size:cover;background-position:center;color:#f8fafc;font-family:Arial,"Segoe UI",sans-serif}
        .maintenance-box{width:min(520px,calc(100% - 32px));padding:28px;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:rgba(15,23,42,.88);box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center}
        .maintenance-box img{width:82px;height:82px;object-fit:contain;margin-bottom:18px}
        h1{margin:0 0 10px;font-size:26px}
        p{margin:0;color:#cbd5e1;line-height:1.6;font-weight:700}
        .actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:24px}
        button,a{border:0;border-radius:8px;padding:11px 16px;font-weight:900;text-decoration:none;cursor:pointer}
        button{background:#e11d48;color:#fff}
        a{background:#fff;color:#0f172a}
    </style>
</head>
<body>
    <main class="maintenance-box">
        <img src="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>" alt="Logo">
        <h1>Website đang bảo trì</h1>
        <p>Linh Họa Sư đang sửa chữa hệ thống. Tài khoản admin vẫn truy cập được trang người chơi để kiểm tra.</p>
        <div class="actions">
            <a href="login.php">Đăng nhập admin</a>
            <form method="post" action="api/user_api.php" class="m-0">
                <input type="hidden" name="action" value="logout">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="web_context_token" value="<?php echo htmlspecialchars(lhs_web_context_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <button type="submit">Đăng xuất</button>
            </form>
        </div>
    </main>
<?php lhs_web_experience_assets(); ?>
</body>
</html>
    <?php
    exit;
}

$linked_phone = '';
try {
    $stmt = $conn_web->prepare('SELECT phone FROM account_phones WHERE account_name = ? LIMIT 1');
    $stmt->execute(array($username));
    if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $linked_phone = trim($row['phone']);
    }
} catch (Exception $e) {}

$vip_level = 0;
try {
    $stmt = $conn_web->prepare('SELECT vip_type FROM auth_codes WHERE used_by_account = :acc AND used_server_id = :sv AND is_used = 1 AND is_active = 1 ORDER BY vip_type DESC LIMIT 1');
    $stmt->execute(array(':acc' => $username, ':sv' => $server_id));
    if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) $vip_level = intval($row['vip_type']);
} catch (Exception $e) {}
$_SESSION['vip_level'] = $vip_level;

$xu_web = 0;
try {
    $stmt_xu = $conn_game->prepare('SELECT ptb FROM account WHERE account = ? LIMIT 1');
    $stmt_xu->execute(array($username));
    if ($row = $stmt_xu->fetch(PDO::FETCH_ASSOC)) $xu_web = intval($row['ptb']);
} catch (Exception $e) {}

$region_uin = $account_userid;
$role_id = '';
$role_name = 'Chưa tạo nhân vật';
$role_error = '';
$role = gm_get_role($username, $server_id, $role_error, array($account_userid));
if ($role) {
    $role_id = gm_role_id($role);
    $role_name = gm_role_name($role, 'Nhân vật');
}

$public_giftcodes = array();
try {
    $stmt = $conn_web->prepare('SELECT g.*, (SELECT COUNT(*) FROM giftcode_logs gl WHERE gl.giftcode_id = g.id AND gl.account_name = :acc AND gl.server_id = :sv) AS is_claimed FROM giftcodes g WHERE g.hide = 1 AND g.is_active = 1 ORDER BY (is_claimed > 0 OR (g.max_uses > 0 AND g.used_count >= g.max_uses)) ASC, g.id DESC');
    $stmt->execute(array(':acc' => $username, ':sv' => $server_id));
    $public_giftcodes = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {}
$public_giftcode_revision = 0;
$has_unclaimed_public_giftcode = false;
foreach ($public_giftcodes as $public_giftcode) {
    $public_giftcode_revision = max($public_giftcode_revision, (int)($public_giftcode['id'] ?? 0));
    $expires_at = !empty($public_giftcode['expires_at']) ? strtotime((string)$public_giftcode['expires_at']) : 0;
    $expired = $expires_at > 0 && $expires_at < time();
    $max_uses = (int)($public_giftcode['max_uses'] ?? 0);
    $out_of_uses = $max_uses > 0 && (int)($public_giftcode['used_count'] ?? 0) >= $max_uses;
    $claimed_by_player = (int)($public_giftcode['is_claimed'] ?? 0) > 0;
    if (!$expired && !$out_of_uses && !$claimed_by_player) $has_unclaimed_public_giftcode = true;
}

$feature_webshop = web_setting_enabled('webshop_enabled');
$feature_daily_checkin = web_setting_enabled('daily_checkin_enabled');
$daily_checkin_amount = daily_checkin_reward_xu();
$daily_checkin_claimed = false;
$daily_checkin_reward_type = 'xu';
$daily_checkin_reward_spins = 0;
$daily_checkin_date = lhs_daily_checkin_date();
$daily_checkin_error = false;
if ($feature_daily_checkin) {
    try {
        $daily_status = lhs_daily_checkin_status($conn_web, $username, $daily_checkin_date);
        $daily_checkin_claimed = !empty($daily_status['claimed']);
        $daily_checkin_reward_type = isset($daily_status['reward_type']) ? (string)$daily_status['reward_type'] : 'xu';
        $daily_checkin_reward_spins = isset($daily_status['reward_spins']) ? (int)$daily_status['reward_spins'] : 0;
    } catch (Exception $e) { $daily_checkin_error = true; }
}
$feature_lucky_wheel = lucky_wheel_enabled();
$lucky_wheel_prizes = array(); $lucky_wheel_total_weight = 0; $lucky_wheel_spins = 0;
if ($feature_lucky_wheel) {
    try {
        $lucky_wheel_prizes = lucky_wheel_active_prizes();
        foreach ($lucky_wheel_prizes as $lucky_wheel_prize) $lucky_wheel_total_weight += max(0,(int)$lucky_wheel_prize['weight']);
        $lucky_wheel_spins = lucky_wheel_available_spins($username,$server_id);
    } catch (Exception $e) { $lucky_wheel_prizes = array(); $lucky_wheel_total_weight = 0; }
}
$lucky_wheel_ready = $feature_lucky_wheel && count($lucky_wheel_prizes) > 0 && $lucky_wheel_total_weight > 0;
$lucky_wheel_player_prizes = array();
foreach ($lucky_wheel_prizes as $lucky_wheel_prize) {
    $lucky_wheel_snapshot = lucky_wheel_prize_snapshot($lucky_wheel_prize);
    $lucky_wheel_snapshot['chance'] = round(((int)$lucky_wheel_prize['weight'] * 100) / $lucky_wheel_total_weight, 3);
    $lucky_wheel_snapshot['subtitle'] = $lucky_wheel_snapshot['prize_type'] === 'item' ? ('Vật phẩm x' . number_format($lucky_wheel_snapshot['item_amount'])) : ($lucky_wheel_snapshot['prize_type'] === 'message' ? 'Chúc bạn may mắn ở lượt sau' : (number_format($lucky_wheel_snapshot['xu_amount']) . ' Xu Web'));
    $lucky_wheel_player_prizes[] = $lucky_wheel_snapshot;
}
$feature_rewards = web_setting_enabled('recharge_rewards_enabled');
$feature_vip = web_setting_enabled('vip_enabled');
$feature_gm = web_setting_enabled('gm_tools_enabled');
$is_admin_account = isset($_SESSION['role']) && $_SESSION['role'] === 'admin';
$payment_bank_config = payment_bank_config();
$vietqr_bank = $payment_bank_config['bank'];
$vietqr_account = $payment_bank_config['account'];
$vietqr_account_name = $payment_bank_config['account_name'];
$vip_amount = vip_base_amount();
$transfer_tags = payment_transfer_tags();
$topup_transfer_preview = 'DONATE ' . $transfer_tags['topup'] . ' S' . $server_id . ' ' . $username . ' 1000';
$vip_transfer_preview = 'DONATE ' . $transfer_tags['vip'] . ' S' . $server_id . ' ' . $username;
$download_links = game_download_links();
$site_logo_url = site_asset_url(site_logo_image());
$site_bg_url = site_asset_url(site_bg_image());
$site_bg_css_url = site_absolute_asset_url(site_bg_image());

function loadItemCatalog($filename) {
    return hk_item_catalog_map($filename);
}

function rewardItemInfo($reward_key, $item_catalog, $item_images) {
    $reward_key = trim((string)$reward_key);
    $raw_id = preg_replace('/^(item_|gift_|charge_)/', '', $reward_key);
    $name = isset($item_catalog[$reward_key]) ? $item_catalog[$reward_key] : (isset($item_catalog[$raw_id]) ? $item_catalog[$raw_id] : ('Vật phẩm ID ' . $raw_id));
    $image = isset($item_images[$reward_key]) && $item_images[$reward_key] !== '' ? $item_images[$reward_key] : (isset($item_images[$raw_id]) && $item_images[$raw_id] !== '' ? $item_images[$raw_id] : site_logo_image());
    return array('id' => $raw_id, 'name' => $name, 'image' => $image);
}

$item_catalog = array();
foreach (loadItemCatalog('gmitem.txt') as $catalog_id => $catalog_name) {
    $item_catalog['item_' . $catalog_id] = $catalog_name;
    if (!isset($item_catalog[$catalog_id])) $item_catalog[$catalog_id] = $catalog_name;
}
$item_images = item_icon_image_map(true);

$recharge_event_snapshot = array('events' => array(), 'now' => date('Y-m-d H:i:s'), 'server_id' => (string)$server_id);
try {
    $recharge_event_snapshot = lhs_event_public($conn_web, $username, $server_id);
} catch (Throwable $e) {
    $recharge_event_snapshot = array('events' => array(), 'now' => date('Y-m-d H:i:s'), 'server_id' => (string)$server_id);
}
$feature_recharge_events = false;
foreach ($recharge_event_snapshot['events'] as $visible_event) {
    if (!empty($visible_event['enabled']) && $visible_event['ends_at'] > $recharge_event_snapshot['now']) {
        $feature_recharge_events = true;
        break;
    }
}

// Nhóm hiển thị được quản lý từ catalog JSON; item cũ không có nhóm sẽ nằm ở “Khác”.
$webshop_catalog_meta = array();
$webshop_catalog_file = __DIR__ . '/assets/item/webshop_catalog.json';
if (is_readable($webshop_catalog_file)) {
    $webshop_catalog_doc = json_decode((string)file_get_contents($webshop_catalog_file), true);
    if (is_array($webshop_catalog_doc) && is_array($webshop_catalog_doc['items'] ?? null)) {
        foreach ($webshop_catalog_doc['items'] as $catalog_row) {
            if (is_array($catalog_row) && isset($catalog_row['item_id'])) {
                $webshop_catalog_meta[(string)(int)$catalog_row['item_id']] = array(
                    'category' => (string)($catalog_row['category'] ?? 'other'),
                    'category_label' => (string)($webshop_catalog_doc['sort_groups'][$catalog_row['category']]['label'] ?? 'Khác')
                );
            }
        }
    }
}

$webshop_items = array();
if ($feature_webshop) {
    try {
        $stmt = $conn_web->query('SELECT * FROM webshop_items WHERE is_active = 1 ORDER BY sort_order ASC, id DESC');
        $webshop_items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {}
}

$total_recharge = 0;
$recharge_periods = recharge_period_types();
$recharge_totals = array();
$recharge_milestone_groups = array();
$claimed_milestones = array();
if ($feature_rewards) {
    try {
        $stmt = $conn_web->query("SELECT * FROM recharge_milestones WHERE is_active = 1 ORDER BY FIELD(period_type, 'total', 'day', 'week', 'month'), milestone_amount ASC, sort_order ASC, id DESC");
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $milestone_row) {
            $period_type = isset($milestone_row['period_type']) ? normalize_recharge_period($milestone_row['period_type']) : 'total';
            $milestone_row['period_type'] = $period_type;
            if (!isset($recharge_milestone_groups[$period_type])) {
                $recharge_milestone_groups[$period_type] = array();
            }
            if (!isset($recharge_totals[$period_type])) {
                $recharge_totals[$period_type] = account_total_recharge($username, $period_type);
            }
            $recharge_milestone_groups[$period_type][] = $milestone_row;
        }
        $total_recharge = isset($recharge_totals['total']) ? $recharge_totals['total'] : account_total_recharge($username, 'total');

        $current_claim_periods = array('total', recharge_period_key('day'), recharge_period_key('week'), recharge_period_key('month'));
        $stmt = $conn_web->prepare('SELECT milestone_id, claim_period FROM recharge_milestone_claims WHERE account_name = ? AND server_id = ? AND claim_period IN (?,?,?,?)');
        $stmt->execute(array($username, $server_id, $current_claim_periods[0], $current_claim_periods[1], $current_claim_periods[2], $current_claim_periods[3]));
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $claimed_row) {
            $claim_period = isset($claimed_row['claim_period']) && $claimed_row['claim_period'] !== '' ? $claimed_row['claim_period'] : 'total';
            $claimed_milestones[intval($claimed_row['milestone_id']) . '|' . $claim_period] = true;
        }
    } catch (Exception $e) {}
}

function getTxtOptions($filename, $prefix = '') {
    $html = '';
    foreach (hk_item_catalog_entries($filename) as $entry) {
        $id = $entry['id'];
        $name = $entry['name'];
        $html .= '<option value="' . htmlspecialchars($prefix . $id, ENT_QUOTES, 'UTF-8') . '">' . htmlspecialchars($id . ' - ' . $name, ENT_QUOTES, 'UTF-8') . '</option>';
    }
    return $html;
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web quản lý tài khoản Linh Họa Sư</title>
    <?php echo csrf_meta_tag(); ?>
    <?php echo lhs_web_context_meta_tag(); ?>
    <!-- FAVICON -->
    <link rel="icon" type="image/png" href="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>">
    
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/select2-bootstrap-5-theme@1.3.0/dist/select2-bootstrap-5-theme.min.css" rel="stylesheet">
    
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    <link rel="stylesheet" href="<?php echo site_asset_url('assets/css/index.css') . '?v=' . time(); ?>">
    <link rel="stylesheet" href="<?php echo site_asset_url('assets/css/lucky-wheel.css') . '?v=' . time(); ?>">
    <link rel="stylesheet" href="<?php echo site_asset_url('assets/css/ui-refactor.css') . '?v=' . time(); ?>">
    <style>
        :root{--site-bg-image:url('<?php echo htmlspecialchars($site_bg_css_url, ENT_QUOTES, 'UTF-8'); ?>');}
        .recharge-event-hero{position:relative;overflow:hidden;border-radius:22px;background:linear-gradient(135deg,#172554,#0f766e);box-shadow:0 18px 45px rgba(15,23,42,.16);color:#fff}.recharge-event-hero img{display:block;width:100%;max-height:330px;object-fit:cover}.recharge-event-hero-overlay{padding:18px 20px;background:linear-gradient(180deg,rgba(15,23,42,.05),rgba(15,23,42,.72))}.recharge-event-hero-overlay h4{margin:0 0 5px;font-weight:900}.recharge-event-time{font-size:.82rem;font-weight:800;opacity:.88}.recharge-event-tier-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.recharge-event-tier{position:relative;padding:16px;border:1px solid #dbeafe;border-radius:18px;background:linear-gradient(145deg,#fff,#f8fbff);box-shadow:0 8px 20px rgba(15,23,42,.05)}.recharge-event-tier.is-ready{border-color:#fbbf24;box-shadow:0 10px 24px rgba(245,158,11,.16)}.recharge-event-tier.is-claimed{border-color:#86efac;background:#f0fdf4}.recharge-event-tier-head{display:flex;justify-content:space-between;gap:8px;align-items:start;margin-bottom:9px}.recharge-event-tier-amount{color:#b45309;font-weight:900;font-size:1.05rem}.recharge-event-tier-title{color:#0f172a;font-weight:900}.recharge-event-items{display:flex;flex-wrap:wrap;gap:7px;min-height:52px}.recharge-event-item{display:flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:.76rem;font-weight:900;color:#334155}.recharge-event-item img{width:34px;height:34px;object-fit:contain}.recharge-event-progress{height:8px;border-radius:99px;background:#e2e8f0;overflow:hidden}.recharge-event-progress>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f59e0b,#ef4444)}.recharge-event-popup-banner{width:100%;max-height:65vh;object-fit:contain;border-radius:18px;background:#0f172a}.recharge-event-popup-title{font-weight:900;color:#0f172a}.recharge-event-empty{border:1px dashed #cbd5e1;border-radius:18px;padding:28px;text-align:center;color:#64748b;font-weight:800}
        @media(max-width:576px){.recharge-event-tier-grid{grid-template-columns:1fr}.recharge-event-hero img{max-height:230px}}
    </style>
    <script>
        if (window.self !== window.top) {
            document.documentElement.classList.add('is-iframe-popup');
        }
    </script>
</head>
<?php
$is_popup_view = isset($_GET['is_popup']) && $_GET['is_popup'] == '1';
?>
<body class="player-page<?php echo $is_popup_view ? ' is-iframe-popup' : ''; ?>">
<div class="top-navbar">
    <div class="container d-flex justify-content-between align-items-center">
        <!-- LOGO -->
        <a href="#" class="brand">
            <img src="<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>" alt="Logo"> 
            <span>Linh Họa Sư</span>
        </a>
        <div class="d-flex align-items-center gap-2">
            <!-- Hiển thị Xu Web trên Header (Luôn hiển thị kể cả trên điện thoại) -->
            <div class="user-badge xu-badge"><i class="fa-solid fa-coins"></i> <span class="d-none d-sm-inline ms-1">Xu:</span> <span class="xu-val-header"><?php echo number_format($xu_web); ?></span></div>
            
            <div class="user-badge d-flex align-items-center gap-2 border-0 bg-transparent px-2" id="connectionStatusIndicator" title="Trạng thái kết nối hệ thống">
                <span class="status-pulse-dot bg-success"></span>
                <span class="small fw-bold text-success d-none d-md-inline" id="connectionStatusText">Trực tuyến</span>
            </div>
            <div class="user-badge text-primary border-primary bg-primary bg-opacity-10 user-badge-server"><i class="fa-solid fa-server"></i> S<?php echo htmlspecialchars($server_id); ?></div>
            <div class="user-badge user-badge-name"><i class="fa-solid fa-user-circle text-muted"></i> <?php echo htmlspecialchars($username); ?></div>
            
            <button type="button" class="btn-logout-top btn-player-download" data-bs-toggle="modal" data-bs-target="#downloadModal" title="Tải trò chơi"><i class="fa-solid fa-cloud-arrow-down"></i></button>
            <?php if ($is_admin_account): ?><a href="admin/index.php" class="btn-logout-top" style="background:#e0f2fe;color:#0369a1" title="Quay lại trang admin"><i class="fa-solid fa-screwdriver-wrench"></i></a><?php endif; ?>
            <form method="post" action="api/user_api.php" class="m-0">
                <input type="hidden" name="action" value="logout">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="web_context_token" value="<?php echo htmlspecialchars(lhs_web_context_token(), ENT_QUOTES, 'UTF-8'); ?>">
                <button type="submit" class="btn-logout-top"><i class="fa-solid fa-right-from-bracket"></i></button>
            </form>
        </div>
    </div>
</div>

<button type="button" class="player-mobile-menu-toggle" id="playerMobileMenuToggle" aria-controls="playerSidebarMenu" aria-expanded="false">
    <i class="fa-solid fa-bars-staggered"></i>
    <span>Menu</span>
</button>
<div class="player-mobile-menu-backdrop" id="playerMobileMenuBackdrop"></div>

<div class="container mb-5">
    <div class="row g-4">
        <div class="col-md-4 col-lg-3 gm-menu-col">
            <div class="inner-box sidebar-menu" id="playerSidebarMenu">
                <div class="player-menu-drawer-header d-md-none">
                    <div class="d-flex align-items-center justify-content-between pb-3 mb-2 border-bottom">
                        <span class="fw-bold text-dark fs-6"><i class="fa-solid fa-bars-staggered me-2 text-primary"></i>Menu Chức Năng</span>
                        <button type="button" class="btn btn-sm btn-light rounded-circle shadow-none p-0" id="playerMobileMenuClose" style="width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1;" aria-label="Đóng menu">
                            <i class="fa-solid fa-xmark text-secondary fs-5"></i>
                        </button>
                    </div>
                </div>
                <div class="menu-btn active" data-tab="tab-profile"><i class="fa-solid fa-id-badge"></i> Hồ sơ</div>
                <div class="menu-btn" data-tab="tab-topup"><i class="fa-solid fa-qrcode text-success"></i> Donate Xu</div>
                <?php if ($feature_webshop): ?><div class="menu-btn" data-tab="tab-webshop"><i class="fa-solid fa-store text-primary"></i> Webshop</div><?php endif; ?>
                <?php if ($feature_rewards): ?><div class="menu-btn" data-tab="tab-rewards"><i class="fa-solid fa-medal text-warning"></i> Tích Donate</div><?php endif; ?>
                <?php if ($feature_lucky_wheel): ?><div class="menu-btn" data-tab="tab-lucky-wheel"><i class="fa-solid fa-dharmachakra text-danger"></i> Vòng Quay <span class="badge rounded-pill bg-danger ms-1">NEW</span></div><?php endif; ?>
                <div class="menu-btn" data-tab="tab-vip"><i class="fa-solid fa-crown text-warning"></i> Donate VIP</div>
                <div class="menu-btn" data-tab="tab-giftcode"><i class="fa-solid fa-gift text-success"></i> Mã quà tặng</div>
                <div class="menu-btn" data-tab="tab-gm"><i class="fa-solid fa-wand-magic-sparkles text-danger"></i> Tiện ích nhân vật</div>
                <div class="menu-btn" data-tab="tab-transactions"><i class="fa-solid fa-clock-rotate-left text-info"></i> Lịch sử Donate</div>
                <div class="menu-btn" data-tab="tab-spend-history"><i class="fa-solid fa-receipt text-danger"></i> Lịch sử tiêu Xu</div>
                <?php if ($feature_recharge_events): ?><div class="menu-btn" data-tab="tab-recharge-events"><i class="fa-solid fa-bolt text-danger"></i> Sự Kiện <span class="badge rounded-pill bg-danger ms-1">NEW</span></div><?php endif; ?>
            </div>
        </div>
        <div class="col-md-8 col-lg-9 gm-content-col">
            <section class="alert alert-warning border shadow-sm mb-3" id="pendingRewardsPanel" hidden aria-live="polite">
                <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <strong><i class="fa-solid fa-box me-2"></i>Quà đang chờ giao</strong>
                    <button type="button" class="btn btn-sm btn-outline-dark" id="pendingRewardsRefresh">Làm mới</button>
                </div>
                <p class="small mb-2">Quà đã được ghi nhận tại máy chủ này. Bấm gửi lại để tiếp tục đúng đơn cũ, không tạo thêm lượt nhận.</p>
                <div id="pendingRewardsList"></div>
            </section>
            <div class="main-card">
                
                <!-- TAB HỒ SƠ -->
                <div class="main-tab-pane active" id="tab-profile">
                    <div class="tab-title"><i class="fa-solid fa-address-card me-2 text-primary"></i> Tổng quan tài khoản</div>
                    
                    <div class="vip-card-banner vip-level-<?php echo min(2, max(0, intval($vip_level))); ?>" data-vip-level="<?php echo intval($vip_level); ?>">
                        <h3 class="fw-black mb-1"><?php echo $vip_level > 0 ? 'ĐẶC QUYỀN VIP ' . $vip_level : 'TÀI KHOẢN THƯỜNG'; ?></h3>
                        <p class="mb-0 fw-bold opacity-75">Áp dụng tại máy chủ S<?php echo htmlspecialchars($server_id); ?></p>
                        <span class="badge-level"><i class="fa-solid fa-shield-check me-1"></i> Đã Bảo Vệ</span>
                    </div>
                    
                    <div class="char-info-box">
                        <div class="char-info-header">
                            <div class="char-icon"><i class="fa-solid fa-user-astronaut"></i></div>
                            <div>
                                <h4 class="fw-black text-dark mb-1"><?php echo htmlspecialchars($role_name); ?></h4>
                                <div class="text-muted fw-bold">ID nhân vật: <code class="text-danger fs-6 bg-danger bg-opacity-10 px-2 py-1 rounded"><?php echo htmlspecialchars($role_id ?: 'Chưa tạo nhân vật'); ?></code></div>
                            </div>
                        </div>
                        <div class="badges-wrap">
                            <div class="custom-badge"><i class="fa-solid fa-coins text-warning"></i> Ví Web: <span class="text-danger fw-bold"><span class="xu-val-profile"><?php echo number_format($xu_web); ?></span> Xu</span></div>
                            <?php if ($feature_lucky_wheel): ?><div class="custom-badge lucky-spin-badge"><i class="fa-solid fa-dharmachakra text-danger"></i> Lượt quay tài khoản: <span class="fw-black" data-lucky-wheel-count><?php echo number_format($lucky_wheel_spins); ?></span></div><?php endif; ?>
                        <div class="custom-badge"><i class="fa-solid fa-fingerprint"></i> Tên đăng nhập: <?php echo htmlspecialchars($username); ?></div>
                        <div class="custom-badge"><i class="fa-solid fa-hashtag"></i> ID tài khoản: <?php echo htmlspecialchars($region_uin ?: 'Chưa có'); ?></div>
                        </div>
                    </div>

                    <?php if ($feature_daily_checkin): ?>
                    <!-- ĐIỂM DANH TÍCH HỢP TRONG HỒ SƠ -->
                    <div class="daily-checkin-card mt-4">
                        <div class="daily-checkin-icon"><i class="fa-solid fa-calendar-check"></i></div>
                        <div class="daily-checkin-content">
                            <div class="daily-checkin-eyebrow">QUÀ ĐĂNG NHẬP MỖI NGÀY</div>
                            <h4 class="daily-checkin-title">Chọn quà điểm danh mỗi ngày</h4>
                            <?php if ($daily_checkin_error): ?>
                                <div class="daily-checkin-status">Chưa tải được trạng thái điểm danh. Vui lòng tải lại trang.</div>
                            <?php elseif ($daily_checkin_claimed): ?>
                                <div class="daily-checkin-status"><i class="fa-solid fa-circle-check me-1"></i>Hôm nay tài khoản đã nhận <?php echo $daily_checkin_reward_type === 'spin' ? (($daily_checkin_reward_spins > 0 ? $daily_checkin_reward_spins : 1) . ' lượt quay tại S' . htmlspecialchars($daily_status['source_server_id'])) : (number_format($daily_checkin_amount) . ' Xu Web'); ?>.</div>
                            <?php else: ?>
                                <div class="daily-checkin-status"><i class="fa-solid fa-gift me-1"></i>Chọn 1 lượt quay tại S<?php echo htmlspecialchars($server_id); ?> hoặc <?php echo number_format($daily_checkin_amount); ?> Xu Web.</div>
                            <?php endif; ?>
                            <div class="daily-checkin-time"><i class="fa-regular fa-clock me-1"></i>Mỗi tài khoản nhận 1 lần/ngày trên toàn bộ máy chủ. Làm mới lúc 00:00 (GMT+7).</div>
                        </div>
                        <div class="daily-checkin-action">
                            <?php if ($daily_checkin_error): ?>
                                <button type="button" class="daily-checkin-button is-claimed" disabled>Chưa tải được trạng thái</button>
                            <?php elseif ($daily_checkin_claimed): ?>
                                <button type="button" class="daily-checkin-button is-claimed" disabled><i class="fa-solid fa-circle-check me-2"></i>Đã điểm danh</button>
                            <?php else: ?>
                                <form class="ajax-form">
                                    <input type="hidden" name="action" value="claim_daily_checkin">
                                    <div class="daily-reward-choice" role="radiogroup" aria-label="Quà điểm danh">
                                        <label class="daily-reward-option is-selected"><input type="radio" name="reward_choice" value="xu" checked><span><i class="fa-solid fa-coins"></i><?php echo number_format($daily_checkin_amount); ?> Xu</span></label>
                                        <?php if ($lucky_wheel_ready): ?><label class="daily-reward-option"><input type="radio" name="reward_choice" value="spin"><span><i class="fa-solid fa-dharmachakra"></i>1 lượt quay</span></label><?php endif; ?>
                                    </div>
                                    <button type="button" class="daily-checkin-button" onclick="submitAjax(this)"><i class="fa-solid fa-hand-pointer me-2"></i>Điểm danh ngay</button>
                                </form>
                            <?php endif; ?>
                        </div>
                    </div>

                    <?php endif; ?>

                    <!-- Liên kết SĐT bảo mật (Pass cấp 2) -->
                    <div class="inner-box border-2 border-primary bg-primary bg-opacity-10 p-4 mt-4" id="phoneSecurityBox">
                        <h5 class="fw-black text-primary mb-2"><i class="fa-solid fa-phone me-2"></i>Số điện thoại bảo mật (Mật khẩu cấp 2)</h5>
                        
                        <?php if ($linked_phone !== ''): ?>
                            <!-- Đã liên kết -->
                            <div class="d-flex align-items-center gap-3">
                                <div class="fs-1 text-success"><i class="fa-solid fa-circle-check"></i></div>
                                <div>
                                    <div class="fw-bold text-dark fs-6">Đã liên kết bảo mật thành công</div>
                                    <div class="text-muted fw-bold small mt-1">Số điện thoại liên kết: <strong class="text-primary fs-5" id="linkedPhoneMasked"><?php echo htmlspecialchars(str_repeat('*', max(0, strlen($linked_phone) - 2)) . substr($linked_phone, -2)); ?></strong></div>
                                    <div class="small text-muted mt-1 font-italic">Dùng số điện thoại này để khôi phục mật khẩu nếu bị quên.</div>
                                </div>
                            </div>
                        <?php else: ?>
                            <!-- Chưa liên kết -->
                            <p class="small fw-bold text-muted mb-4">Liên kết số điện thoại dùng để lấy lại mật khẩu nhanh khi quên (Mật khẩu cấp 2).</p>
                            <form class="ajax-form">
                                <input type="hidden" name="action" value="link_phone">
                                <div class="row g-2">
                                    <div class="col-md-5">
                                        <input type="text" name="phone" maxlength="12" class="form-control" placeholder="Nhập số điện thoại bảo mật..." required>
                                    </div>
                                    <div class="col-md-5">
                                        <input type="password" name="password" class="form-control" placeholder="Nhập mật khẩu hiện tại..." required>
                                    </div>
                                    <div class="col-md-2">
                                        <button type="button" class="btn-custom w-100 text-white shadow-sm" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)" onclick="submitAjax(this)">LIÊN KẾT</button>
                                    </div>
                                </div>
                            </form>
                        <?php endif; ?>
                    </div>

                    <div class="inner-box border-2 border-danger bg-danger bg-opacity-10 p-4 mt-4">
                        <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap">
                            <div>
                                <h5 class="fw-black text-danger mb-1"><i class="fa-solid fa-shield-halved me-2"></i>Bảo mật tài khoản</h5>
                                <div class="small text-muted fw-bold">Đổi mật khẩu trong popup bảo mật, không rời khỏi hồ sơ.</div>
                            </div>
                            <button type="button" class="btn btn-danger fw-black rounded-4 px-4" data-bs-toggle="modal" data-bs-target="#passwordModal">
                                <i class="fa-solid fa-key me-1"></i> Đổi mật khẩu
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB NÂNG VIP -->
                <div class="main-tab-pane" id="tab-topup">
                    <div class="tab-title"><i class="fa-solid fa-qrcode me-2 text-success"></i> Donate Xu</div>
                    <div class="row g-4 align-items-start">
                        <div class="col-lg-5">
                            <div class="qr-box">
                                <h5 class="fw-black text-success mb-3">Quét QR chuyển khoản</h5>
                                <img id="topupQrImage" src="" class="img-fluid rounded-4 shadow-sm mb-3" style="max-width:240px" alt="QR Donate Xu">
                                <div class="alert alert-light border text-start small fw-bold mb-0">
                                    <div class="mb-1">Số tiền: <span class="text-danger" id="topupAmountText">0</span> VNĐ</div>
                                    <div class="mb-1">Ngân hàng: <span class="text-dark" id="topupBankText"></span></div>
                                    <div class="mb-1">Số tài khoản: <span class="text-dark" id="topupBankAccountText"></span></div>
                                    <div class="mb-1">Chủ tài khoản: <span class="text-dark" id="topupBankAccountNameText"></span></div>
                                    <div>Nội dung: <span class="text-primary" id="topupContentText"><?php echo htmlspecialchars($topup_transfer_preview, ENT_QUOTES, 'UTF-8'); ?></span></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-7">
                            <div class="inner-box p-4 border-2 border-success bg-success bg-opacity-10">
                                <h5 class="fw-black text-success mb-3"><i class="fa-solid fa-coins me-2"></i> Chọn số Xu muốn Donate</h5>
                                <div class="row g-2 mb-3">
                                    <?php foreach (array(10000, 20000, 50000, 100000, 200000, 500000) as $preset): ?>
                                    <div class="col-6 col-md-4"><button type="button" class="btn btn-light border fw-black w-100 topup-preset" data-amount="<?php echo $preset; ?>"><?php echo number_format($preset); ?></button></div>
                                    <?php endforeach; ?>
                                </div>
                                <label class="fw-bold mb-2 text-dark">Số Xu muốn Donate</label>
                                <input type="number" id="topupAmountInput" class="form-control form-control-lg fw-black text-success mb-3" value="50000" min="1000" step="1000">
                                <div class="alert alert-info border-0 bg-info bg-opacity-10 fw-bold small mb-0">
                                    Hệ thống SePay sẽ ghi nhận Donate Xu Web tự động theo đúng số tiền Donate nhận được.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <?php if ($feature_recharge_events): ?>
                <div class="main-tab-pane" id="tab-recharge-events">
                    <div class="tab-title"><i class="fa-solid fa-bolt me-2 text-danger"></i> Sự Kiện Nạp</div>
                    <div class="alert alert-info border-0 bg-info bg-opacity-10 fw-bold rounded-4"><i class="fa-solid fa-circle-info me-2"></i>Sự kiện dùng chung tổng Donate của tài khoản, chỉ tính giao dịch phát sinh trong đúng thời gian hiển thị. Quà sự kiện tách biệt với Tích Donate.</div>
                    <p class="small text-muted">Mỗi mốc nhận một lần trên toàn tài khoản. Quà gửi vào nhân vật tại S<?php echo htmlspecialchars($server_id); ?> đang chọn. Nhận trước giờ kết thúc; quà đã ghi nhận chờ giao vẫn được gửi lại sau đó.</p>
                    <?php if (empty($recharge_event_snapshot['events'])): ?><div class="recharge-event-empty">Chưa có sự kiện đang mở.</div><?php endif; ?>
                    <?php foreach ($recharge_event_snapshot['events'] as $event): ?>
                        <section class="recharge-event-shell mb-4" data-event-card-root data-event-id="<?php echo (int)$event['id']; ?>">
                            <div class="recharge-event-hero mb-3">
                                <?php if (!empty($event['banner'])): ?><img src="<?php echo htmlspecialchars($event['banner'], ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($event['title'], ENT_QUOTES, 'UTF-8'); ?>" onerror="this.style.display='none';"><?php endif; ?>
                                <div class="recharge-event-hero-overlay"><h4><?php echo htmlspecialchars($event['title'], ENT_QUOTES, 'UTF-8'); ?></h4><div class="recharge-event-time"><i class="fa-regular fa-clock me-1"></i><?php echo htmlspecialchars($event['starts_at']); ?> → <?php echo htmlspecialchars($event['ends_at']); ?> (GMT+7)</div></div>
                            </div>
                            <?php $event_label = !$event['enabled'] ? 'Tạm đóng' : ($event['starts_at'] > $recharge_event_snapshot['now'] ? 'Sắp diễn ra' : ($event['active'] ? 'Đang diễn ra' : 'Đã kết thúc')); ?>
                            <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3"><div class="fw-black text-danger fs-5">Đã Donate trong sự kiện: <span data-event-total><?php echo number_format((int)$event['total']); ?></span>đ</div><span class="badge rounded-pill <?php echo $event['active'] ? 'bg-success' : 'bg-secondary'; ?> px-3 py-2" data-event-status><?php echo $event_label; ?></span></div>
                            <div class="recharge-event-tier-grid">
                            <?php foreach ($event['tiers'] as $tier): $tier_total = (int)$event['total']; $tier_need = max(1,(int)$tier['amount']); $tier_percent = min(100,(int)floor(($tier_total/$tier_need)*100)); $tier_ready = !empty($tier['ready']); $tier_claimed = !empty($tier['claimed']); $tier_pending = !empty($tier['pending']); ?>
                                <article class="recharge-event-tier <?php echo $tier_claimed ? 'is-claimed' : ($tier_ready ? 'is-ready' : ''); ?>" data-event-tier data-event-id="<?php echo (int)$event['id']; ?>" data-event-tier-id="<?php echo (int)$tier['id']; ?>" data-event-need="<?php echo $tier_need; ?>">
                                    <div class="recharge-event-tier-head"><div><div class="recharge-event-tier-amount">Nạp <?php echo number_format($tier_need); ?>đ</div><div class="recharge-event-tier-title">Mốc <?php echo (int)$tier['id']; ?></div></div><span class="badge bg-warning text-dark rounded-pill">+ quà</span></div>
                                    <div class="recharge-event-items mb-3">
                                    <?php foreach ($tier['items'] as $item): ?><span class="recharge-event-item"><img src="<?php echo htmlspecialchars($item['image'], ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($item['name'], ENT_QUOTES, 'UTF-8'); ?>" onerror="this.src='<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>'"><span><?php echo htmlspecialchars($item['name'], ENT_QUOTES, 'UTF-8'); ?> ×<?php echo number_format((int)$item['amount']); ?></span></span><?php endforeach; ?>
                                    </div>
                                    <div class="recharge-event-progress mb-2"><span style="width:<?php echo $tier_percent; ?>%"></span></div>
                                    <div class="recharge-event-tier-footer text-center" data-event-tier-footer>
                                    <?php if ($tier_claimed): ?><span class="badge bg-secondary rounded-pill px-3 py-2"><i class="fa-solid fa-check me-1"></i>Đã nhận</span>
                                    <?php elseif ($tier_pending && (string)$tier['server_id'] !== (string)$server_id): ?><span class="small text-warning">Quà đang chờ tại S<?php echo htmlspecialchars($tier['server_id']); ?></span>
                                    <?php elseif ($tier_pending): ?><button type="button" class="btn btn-outline-warning fw-bold" data-reward-retry data-kind="recharge_event" data-delivery-id="<?php echo (int)$tier['delivery_id']; ?>">Gửi lại quà đang chờ</button>
                                    <?php elseif ($tier_ready): ?><form class="ajax-form form-no-reset"><input type="hidden" name="action" value="claim_recharge_event_milestone"><input type="hidden" name="event_id" value="<?php echo (int)$event['id']; ?>"><input type="hidden" name="tier_id" value="<?php echo (int)$tier['id']; ?>"><button type="button" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#ef4444,#b91c1c)" onclick="submitAjax(this)">Nhận quà</button></form>
                                    <?php else: ?><div class="small fw-bold text-muted"><?php echo $event['active'] ? ('Còn thiếu '.number_format(max(0,$tier_need-$tier_total)).'đ') : $event_label; ?></div><?php endif; ?>
                                    </div>
                                </article>
                            <?php endforeach; ?>
                            </div>
                        </section>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>

                <?php if ($feature_lucky_wheel): ?>
                <div class="main-tab-pane" id="tab-lucky-wheel">
                    <div class="tab-title"><i class="fa-solid fa-dharmachakra me-2 text-danger"></i> Vòng Quay May Mắn</div>
                    <section class="lucky-wheel-card <?php echo $lucky_wheel_ready ? '' : 'is-not-ready'; ?>" id="luckyWheelCard">
                        <div class="lucky-wheel-glow lucky-wheel-glow-one"></div><div class="lucky-wheel-glow lucky-wheel-glow-two"></div>
                        <div class="lucky-wheel-heading"><div class="lucky-wheel-heading-icon"><i class="fa-solid fa-dharmachakra"></i></div><div><div class="lucky-wheel-kicker">SỰ KIỆN ƯU ĐÃI · TÀI KHOẢN</div><h3>Vòng Quay May Mắn</h3><p>Điểm danh nhận 1 lượt hoặc Donate mỗi 10.000đ nhận 1 lượt. Lượt thuộc tài khoản chung; quà luôn phát vào nhân vật S<?php echo htmlspecialchars($server_id); ?> đang đăng nhập.</p></div><div class="lucky-wheel-balance"><span>LƯỢT TÀI KHOẢN</span><strong data-lucky-wheel-count><?php echo number_format($lucky_wheel_spins); ?></strong></div></div>
                        <?php if ($lucky_wheel_ready): ?>
                        <div class="lucky-wheel-layout"><div class="lucky-wheel-stage" aria-label="Vòng quay phần thưởng"><div class="lucky-wheel-pointer"><i class="fa-solid fa-caret-down"></i></div><div class="lucky-wheel-disc" id="luckyWheelDisc"><div class="lucky-wheel-hub"><i class="fa-solid fa-star"></i></div></div><div class="lucky-wheel-spark lucky-wheel-spark-a"></div><div class="lucky-wheel-spark lucky-wheel-spark-b"></div><div class="lucky-wheel-spark lucky-wheel-spark-c"></div></div><div class="lucky-wheel-side"><div class="lucky-wheel-note"><i class="fa-solid fa-shield-halved"></i><span>Kết quả và số dư lượt được ghi trực tiếp tại máy chủ, theo đúng tài khoản và máy chủ hiện tại.</span></div><button type="button" class="lucky-wheel-spin-button" id="luckyWheelSpinButton" <?php echo $lucky_wheel_spins > 0 ? '' : 'disabled'; ?>><i class="fa-solid fa-wand-magic-sparkles"></i><span>QUAY NGAY</span></button><div class="lucky-wheel-helper" data-lucky-wheel-helper><?php echo $lucky_wheel_spins > 0 ? 'Bạn đang có lượt quay chung của tài khoản, chúc may mắn!' : 'Tài khoản chưa có lượt quay — điểm danh hoặc Donate để nhận thêm.'; ?></div><div class="lucky-wheel-prize-list" id="luckyWheelPrizeList"></div></div></div>
                        <?php else: ?>
                        <div class="lucky-wheel-empty"><i class="fa-solid fa-gift"></i><div><strong>Vòng quay đang chờ cấu hình quà.</strong><span>Quản trị viên cần thêm ít nhất một phần thưởng và tỷ lệ trước khi mở.</span></div></div>
                        <?php endif; ?>
                    </section>
                </div>
                <?php endif; ?>

                <div class="main-tab-pane" id="tab-transactions">
                    <div class="tab-title"><i class="fa-solid fa-clock-rotate-left me-2 text-info"></i> Lịch sử Donate</div>
                    <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
                        <div class="fw-bold text-muted">Tài khoản: <span class="text-dark"><?php echo htmlspecialchars($username); ?></span></div>
                        <button type="button" class="btn btn-light border fw-bold text-info" onclick="loadTransactionHistory(1)">
                            <i class="fa-solid fa-rotate me-1"></i> Làm mới
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead class="table-light">
                                <tr>
                                    <th>Thời gian</th>
                                    <th>Loại</th>
                                    <th>Số tiền</th>
                                    <th>Trạng thái</th>
                                    <th>Nội dung</th>
                                    <th>Mã Donate</th>
                                </tr>
                            </thead>
                            <tbody id="transactionHistoryBody">
                                <tr><td colspan="6" class="text-center text-muted fw-bold py-4">Chưa tải lịch sử.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="transactionHistoryPagination" class="pagination-box mt-3"></div>
                </div>

                <div class="main-tab-pane" id="tab-spend-history">
                    <div class="tab-title"><i class="fa-solid fa-receipt me-2 text-danger"></i> Lịch sử tiêu Xu Web</div>
                    <div class="spend-history-toolbar mb-3">
                        <div class="spend-period-buttons" role="group" aria-label="Khoảng thời gian lịch sử tiêu Xu">
                            <button type="button" class="spend-period-btn active" data-period="today">Hôm nay</button>
                            <button type="button" class="spend-period-btn" data-period="week">Tuần này</button>
                            <button type="button" class="spend-period-btn" data-period="month">Tháng này</button>
                            <button type="button" class="spend-period-btn" data-period="all">Toàn bộ</button>
                            <button type="button" class="spend-period-btn" data-period="custom">Chọn thời gian</button>
                        </div>
                        <div class="spend-history-actions">
                            <select id="spendStatusFilter" class="form-select form-select-sm fw-bold" aria-label="Lọc trạng thái đơn">
                                <option value="all">Tất cả trạng thái</option>
                                <option value="paid">Đã thanh toán</option>
                                <option value="refunded">Đã hoàn Xu</option>
                                <option value="failed">Thất bại</option>
                            </select>
                            <button type="button" id="spendHistoryRefresh" class="btn btn-light border fw-bold text-danger">
                                <i class="fa-solid fa-rotate me-1"></i> Làm mới
                            </button>
                        </div>
                    </div>
                    <div id="spendCustomRange" class="spend-custom-range mb-3" hidden>
                        <div>
                            <label for="spendDateFrom">Từ ngày</label>
                            <input type="date" id="spendDateFrom" class="form-control">
                        </div>
                        <div>
                            <label for="spendDateTo">Đến ngày</label>
                            <input type="date" id="spendDateTo" class="form-control">
                        </div>
                        <button type="button" id="spendApplyCustom" class="btn btn-danger fw-bold"><i class="fa-solid fa-filter me-1"></i> Xem lịch sử</button>
                    </div>
                    <div class="spend-range-label" id="spendRangeLabel">Đang xem: Hôm nay</div>
                    <div class="spend-summary-grid">
                        <div class="spend-summary-card is-primary">
                            <span>Tổng Xu đã tiêu</span>
                            <strong id="spendSummaryNet">0</strong>
                            <small>Trong khoảng đang chọn</small>
                        </div>
                        <div class="spend-summary-card">
                            <span>Tổng số đơn</span>
                            <strong id="spendSummaryOrders">0</strong>
                            <small id="spendSummaryPackages">0 gói đã mua</small>
                        </div>
                        <div class="spend-summary-card is-today">
                            <span>Tiêu hôm nay</span>
                            <strong id="spendSummaryToday">0</strong>
                            <small id="spendSummaryTodayOrders">0 đơn hôm nay</small>
                        </div>
                        <div class="spend-summary-card is-refund">
                            <span>Xu đã hoàn</span>
                            <strong id="spendSummaryRefund">0</strong>
                            <small id="spendSummaryFailed">0 đơn thất bại</small>
                        </div>
                    </div>
                    <div class="spend-daily-panel mb-3">
                        <div class="spend-panel-head">
                            <div>
                                <h6 class="mb-1 fw-black"><i class="fa-solid fa-chart-column me-1 text-primary"></i> Tổng tiêu theo ngày</h6>
                                <div class="small text-muted fw-bold">So sánh các ngày trong khoảng đang xem.</div>
                            </div>
                        </div>
                        <div id="spendDailyChart" class="spend-daily-chart">
                            <div class="text-muted fw-bold py-3">Chưa tải dữ liệu.</div>
                        </div>
                    </div>
                    <div class="table-responsive spend-history-table-wrap">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>Thời gian</th>
                                    <th>Vật phẩm đã mua</th>
                                    <th>Số gói / Nhận</th>
                                    <th>Đơn giá</th>
                                    <th>Tổng Xu</th>
                                    <th>Trạng thái</th>
                                    <th>Mã đơn</th>
                                </tr>
                            </thead>
                            <tbody id="spendHistoryBody">
                                <tr><td colspan="7" class="text-center text-muted fw-bold py-4">Chưa tải lịch sử.</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="spendHistoryPagination" class="pagination-box mt-3"></div>
                </div>

                <?php if ($feature_webshop): ?>
                <div class="main-tab-pane" id="tab-webshop">
                    <div class="tab-title"><i class="fa-solid fa-store me-2 text-primary"></i> Webshop</div>
                    <?php if (empty($webshop_items)): ?>
                        <div class="alert alert-light border fw-bold rounded-4">Webshop chưa có vật phẩm nào.</div>
                    <?php else: ?>
                        <!-- Quick Search Filter -->
                        <div class="row g-2 mb-3 align-items-center">
                            <div class="col-md-8">
                                <div class="input-group">
                                    <span class="input-group-text bg-white border-end-0" style="border-radius: 8px 0 0 8px; border-color: #cbd5e1;"><i class="fa-solid fa-magnifying-glass text-muted"></i></span>
                                    <input type="text" id="shopSearchInput" class="form-control border-start-0 ps-0" placeholder="Nhập tên vật phẩm cần tìm..." style="border-radius: 0 8px 8px 0; border-color: #cbd5e1; box-shadow: none;">
                                </div>
                            </div>
                            <div class="col-md-4 text-end">
                                <span class="small text-muted fw-bold" style="font-size: 0.85rem;">Hiển thị <span id="shopFilteredCount" class="text-primary">0</span>/<span id="shopTotalCount">0</span> vật phẩm</span>
                            </div>
                        </div>

                        <div class="shop-category-nav-wrapper mb-3">
                            <button type="button" class="shop-nav-arrow shop-nav-prev" id="shopNavPrev" aria-label="Cuộn sang trái" title="Cuộn sang trái">
                                <i class="fa-solid fa-chevron-left"></i>
                            </button>
                            <div class="shop-category-filter" id="shopCategoryFilter" role="tablist" aria-label="Nhóm Webshop">
                                <button type="button" class="shop-filter-btn active" data-shop-category="all">Tất cả</button>
                                <?php $shop_categories = array(); foreach ($webshop_items as $shop_filter_row) { $shop_filter_id = (string)(int)$shop_filter_row['item_id']; $shop_filter_cat = $webshop_catalog_meta[$shop_filter_id]['category'] ?? 'other'; $shop_filter_label = $webshop_catalog_meta[$shop_filter_id]['category_label'] ?? 'Khác'; $shop_categories[$shop_filter_cat] = $shop_filter_label; } foreach ($shop_categories as $shop_category_key => $shop_category_label): ?>
                                    <button type="button" class="shop-filter-btn" data-shop-category="<?php echo htmlspecialchars($shop_category_key, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($shop_category_label); ?></button>
                                <?php endforeach; ?>
                            </div>
                            <button type="button" class="shop-nav-arrow shop-nav-next" id="shopNavNext" aria-label="Cuộn sang phải" title="Cuộn sang phải">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                        <div class="shop-grid" id="webshopGrid">
                            <?php foreach ($webshop_items as $shop): 
                                $clean_name = preg_replace('/^\s*\d+(?:_\d+)?\s*[-–]?\s*/u', '', $shop['item_name']);
                                $item_amount = intval(isset($shop['item_amount']) ? $shop['item_amount'] : 1);
                                $shop_item_id = intval(isset($shop['item_id']) ? $shop['item_id'] : 0);
                                $shop_image = lhs_shop_image_url($shop_item_id,isset($shop['image_url'])?$shop['image_url']:'');
                                $shop_rewards = lhs_shop_public_rewards($shop);
                                $shop_is_bundle = !empty($shop['reward_items']);
                                $shop_category = $webshop_catalog_meta[(string)$shop_item_id]['category'] ?? 'other';
                            ?>
                            <div class="shop-item-wrapper" data-category="<?php echo htmlspecialchars($shop_category, ENT_QUOTES, 'UTF-8'); ?>" data-name="<?php echo htmlspecialchars(strtolower($clean_name)); ?>" onclick="openShopBuyModal(<?php echo intval($shop['id']); ?>, <?php echo htmlspecialchars(json_encode($clean_name), ENT_QUOTES, 'UTF-8'); ?>, <?php echo htmlspecialchars(json_encode((string)$shop['price']), ENT_QUOTES, 'UTF-8'); ?>, <?php echo htmlspecialchars(json_encode((string)$item_amount), ENT_QUOTES, 'UTF-8'); ?>, <?php echo htmlspecialchars(json_encode($shop_image), ENT_QUOTES, 'UTF-8'); ?>, <?php echo htmlspecialchars(json_encode($shop_rewards), ENT_QUOTES, 'UTF-8'); ?>, <?php echo $shop_is_bundle?'true':'false'; ?>)">
                                <div class="shop-card">
                                    <div class="shop-image">
                                        <?php if ($shop_image !== ''): ?>
                                            <img src="<?php echo htmlspecialchars(site_asset_url($shop_image)); ?>" alt="<?php echo htmlspecialchars($clean_name); ?>" onerror="this.onerror=null;this.src='<?php echo htmlspecialchars(site_asset_url(site_logo_image())); ?>';">
                                        <?php else: ?>
                                            <i class="fa-solid fa-box-open text-primary fs-3"></i>
                                        <?php endif; ?>
                                    </div>
                                    <div class="shop-name"><?php echo htmlspecialchars($clean_name); ?></div>
                                    <div class="shop-price"><?php echo htmlspecialchars(webshop_format_int($shop['price']), ENT_QUOTES, 'UTF-8'); ?> Xu</div>
                                    <div class="shop-amount-badge"><?php echo $shop_is_bundle ? (count($shop_rewards).' loại item · nhận tất cả') : ('SL: '.htmlspecialchars(webshop_format_int($item_amount),ENT_QUOTES,'UTF-8').' cái'); ?></div>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <div class="pagination-box mt-4" id="shopPagination"></div>
                    <?php endif; ?>
                </div>
                <?php endif; ?>

                <?php if ($feature_rewards): ?>
                <div class="main-tab-pane" id="tab-rewards">
                    <div class="tab-title"><i class="fa-solid fa-medal me-2 text-warning"></i> Tích Donate nhận quà</div>
                    <?php if (empty($recharge_milestone_groups)): ?>
                        <div class="alert alert-light border fw-bold rounded-4">Chưa có mốc Donate nào.</div>
                    <?php else: ?>
                        <?php
                            $available_reward_periods = array();
                            foreach ($recharge_periods as $period_type => $period_label) {
                                if (!empty($recharge_milestone_groups[$period_type])) $available_reward_periods[$period_type] = $period_label;
                            }
                            $reward_tab_index = 0;
                        ?>
                        <div class="recharge-tabs" role="tablist" aria-label="Chọn kỳ Donate">
                            <?php foreach ($available_reward_periods as $period_type => $period_label): ?>
                                <button type="button" class="recharge-tab <?php echo $reward_tab_index === 0 ? 'active' : ''; ?>" data-bs-toggle="pill" data-bs-target="#recharge-pane-<?php echo htmlspecialchars($period_type, ENT_QUOTES, 'UTF-8'); ?>">
                                    <?php echo htmlspecialchars($period_label); ?>
                                    <?php if(in_array($period_type,array('day','week','month'),true)): ?><small class="lhs-period-countdown" data-reset-period="<?php echo htmlspecialchars($period_type); ?>">Đang tính giờ làm mới…</small><?php endif; ?>
                                </button>
                            <?php $reward_tab_index++; endforeach; ?>
                        </div>
                        <div class="tab-content recharge-tab-content">
                            <?php $reward_tab_index = 0; foreach ($available_reward_periods as $period_type => $period_label):
                                $period_total = isset($recharge_totals[$period_type]) ? $recharge_totals[$period_type] : 0;
                                $claim_period = recharge_period_key($period_type);
                            ?>
                            <div class="tab-pane fade <?php echo $reward_tab_index === 0 ? 'show active' : ''; ?>" id="recharge-pane-<?php echo htmlspecialchars($period_type, ENT_QUOTES, 'UTF-8'); ?>">
                                <div class="recharge-period-header">
                                    <div>
                                        <div class="fw-black text-dark"><?php echo htmlspecialchars($period_label); ?></div>
                                        <div class="small text-muted fw-bold"><?php echo count($recharge_milestone_groups[$period_type]); ?> mốc đang áp dụng</div>
                                    </div>
                                    <div class="fw-black text-danger recharge-period-total" data-recharge-period-total="<?php echo htmlspecialchars($period_type, ENT_QUOTES, 'UTF-8'); ?>">Đã Donate: <?php echo number_format($period_total); ?> VNĐ</div>
                                </div>
                                <div class="recharge-card-grid">
                                    <?php foreach ($recharge_milestone_groups[$period_type] as $milestone):
                                        $milestone_id = intval($milestone['id']);
                                        $need_amount = max(1, intval($milestone['milestone_amount']));
                                        $percent = min(100, floor(($period_total / $need_amount) * 100));
                                        $is_claimed = isset($claimed_milestones[$milestone_id . '|' . $claim_period]);
                                        $is_ready = $period_total >= $need_amount;
                                         /* Nhận cả object map cũ {id:amount} và list
                                          * [{item_id,amount}], tránh tab tuần/tháng
                                          * có dữ liệu nhưng không render chip quà. */
                                         $reward_items = parse_donate_reward_items($milestone['reward_items'], 20);
                                         $reward_detail = array();
                                         if (is_array($reward_items)) {
                                             foreach ($reward_items as $reward_row) {
                                                 $rid = isset($reward_row['item_id']) ? $reward_row['item_id'] : '';
                                                 $ramount = isset($reward_row['amount']) ? $reward_row['amount'] : 0;
                                                 $reward_info = rewardItemInfo($rid, $item_catalog, $item_images);
                                                $reward_info['amount'] = max(1, intval($ramount));
                                                $reward_info['image'] = site_asset_url($reward_info['image']);
                                                $reward_detail[] = $reward_info;
                                            }
                                        }
                                        $reward_detail_json = htmlspecialchars(json_encode($reward_detail, JSON_UNESCAPED_UNICODE), ENT_QUOTES, 'UTF-8');
                                        $preview_rewards = array_slice($reward_detail, 0, 4);
                                    ?>
                                    <div class="recharge-card <?php echo $is_claimed ? 'is-claimed' : ($is_ready ? 'is-ready' : ''); ?>" data-recharge-card data-milestone-id="<?php echo $milestone_id; ?>" data-recharge-period="<?php echo htmlspecialchars($period_type, ENT_QUOTES, 'UTF-8'); ?>" data-recharge-need="<?php echo $need_amount; ?>">
                                        <div class="recharge-card-amount"><?php echo number_format($need_amount); ?>đ</div>
                                        <div class="recharge-card-title"><?php echo htmlspecialchars($milestone['title']); ?></div>
                                        <button type="button" class="recharge-reward-preview" data-title="<?php echo htmlspecialchars($milestone['title'], ENT_QUOTES, 'UTF-8'); ?>" data-rewards="<?php echo $reward_detail_json; ?>" onclick="openRewardDetailModal(this)">
                                            <?php if (empty($preview_rewards)): ?>
                                                <span class="text-muted fw-bold small">Chưa có quà</span>
                                            <?php else: foreach ($preview_rewards as $reward_info): ?>
                                                <span class="recharge-reward-chip">
                                                    <img src="<?php echo htmlspecialchars($reward_info['image'], ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($reward_info['name'], ENT_QUOTES, 'UTF-8'); ?>" onerror="this.src='<?php echo htmlspecialchars($site_logo_url, ENT_QUOTES, 'UTF-8'); ?>'">
                                                    <b>x<?php echo number_format($reward_info['amount']); ?></b>
                                                </span>
                                            <?php endforeach; if (count($reward_detail) > count($preview_rewards)): ?>
                                                <span class="recharge-reward-more">+<?php echo count($reward_detail) - count($preview_rewards); ?></span>
                                            <?php endif; endif; ?>
                                        </button>
                                        <div class="small fw-bold text-muted text-center mb-3"><?php echo count($reward_detail); ?> vật phẩm</div>
                                        <div class="milestone-progress"><span style="width:<?php echo intval($percent); ?>%"></span></div>
                                        <div class="recharge-card-footer">
                                            <?php if ($is_claimed): ?>
                                                <span class="badge bg-secondary rounded-pill px-3 py-2"><i class="fa-solid fa-check me-1"></i> Đã nhận</span>
                                            <?php elseif ($is_ready): ?>
                                                <form class="ajax-form form-no-reset">
                                                    <input type="hidden" name="action" value="claim_recharge_milestone">
                                                    <input type="hidden" name="milestone_id" value="<?php echo $milestone_id; ?>">
                                                    <button type="button" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#10b981,#059669)" onclick="submitAjax(this)">Nhận quà</button>
                                                </form>
                                            <?php else: ?>
                                                <div>
                                                    <div class="fw-black text-warning"><?php echo intval($percent); ?>%</div>
                                                    <div class="small text-muted fw-bold">Chưa đủ mốc</div>
                                                </div>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                            <?php $reward_tab_index++; endforeach; ?>
                        </div>
                        <script>
                        (function () {
                            document.addEventListener('click', function (event) {
                                var menuButton = event.target.closest('.menu-btn[data-tab]');
                                if (menuButton) {
                                    var mainTarget = document.getElementById(menuButton.getAttribute('data-tab'));
                                    if (mainTarget) {
                                        document.querySelectorAll('.menu-btn').forEach(function (tab) {
                                            tab.classList.toggle('active', tab === menuButton);
                                        });
                                        document.querySelectorAll('.main-tab-pane').forEach(function (pane) {
                                            pane.classList.toggle('active', pane === mainTarget);
                                        });
                                    }
                                }

                                var button = event.target.closest('.recharge-tab[data-bs-target]');
                                if (!button) return;
                                var rewardsRoot = button.closest('#tab-rewards');
                                var targetSelector = button.getAttribute('data-bs-target');
                                if (!rewardsRoot || !targetSelector || targetSelector.charAt(0) !== '#') return;
                                var targetPane = rewardsRoot.querySelector(targetSelector);
                                if (!targetPane) return;

                                rewardsRoot.querySelectorAll('.recharge-tab').forEach(function (tab) {
                                    var active = tab === button;
                                    tab.classList.toggle('active', active);
                                    tab.setAttribute('aria-selected', active ? 'true' : 'false');
                                });
                                rewardsRoot.querySelectorAll('.recharge-tab-content > .tab-pane').forEach(function (pane) {
                                    var active = pane === targetPane;
                                    pane.classList.toggle('active', active);
                                    pane.classList.toggle('show', active);
                                });
                            });
                        })();
                        </script>
                    <?php endif; ?>
                </div>
                <?php endif; ?>

                <div class="main-tab-pane" id="tab-vip">
                    <div class="tab-title"><i class="fa-solid fa-crown me-2 text-warning"></i> Donate <?php echo number_format($vip_amount); ?> VNĐ lên VIP</div>
                    
                    <div class="alert alert-info border-0 rounded-4 mb-4 fw-bold p-3 bg-info bg-opacity-10 text-dark">
                        <i class="fa-solid fa-circle-info text-info me-2"></i> <b>Lưu ý:</b> Công cụ này chỉ hỗ trợ kiểm thử trò chơi, vẫn có nhiều vật phẩm chưa hoàn thiện và có thể gây lỗi trong quá trình chơi và sử dụng.
                    </div>

                    <div class="row g-4">
                        <div class="col-md-6">
                            <div class="inner-box h-100 text-center p-4 border-2 border-primary bg-primary bg-opacity-10">
                                <h5 class="fw-black text-primary mb-3"><i class="fa-solid fa-qrcode me-2"></i> QUÉT MÃ NÂNG VIP</h5>
                                <p class="small fw-bold text-muted mb-4">Hệ thống quét tự động sau 1-3 phút <i class="fa-solid fa-spinner fa-spin ms-1 text-warning"></i></p>
                                <img id="vipQrImage" src="" class="img-fluid rounded-4 mb-3 shadow" style="max-width:180px" alt="QR">
                                <div class="input-group mb-3">
                                    <input type="text" id="vipVoucherCode" class="form-control text-uppercase fw-black" placeholder="Nhập mã giảm giá">
                                    <button type="button" class="btn btn-success fw-black" id="btnApplyVipVoucher"><i class="fa-solid fa-tags me-1"></i> Áp mã</button>
                                </div>
                                <div id="vipVoucherStatus" class="alert alert-light border small fw-bold mb-2">Số tiền cần chuyển: <span class="text-danger" id="vipPayAmountText"><?php echo number_format($vip_amount); ?></span> VNĐ</div>
                                <div class="alert alert-light border small fw-bold mb-0">Nội dung chuyển khoản: <span class="text-danger" id="vipTransferContent"><?php echo htmlspecialchars($vip_transfer_preview, ENT_QUOTES, 'UTF-8'); ?></span></div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="inner-box h-100 p-4 d-flex flex-column justify-content-center border-2 border-success bg-success bg-opacity-10">
                                <h5 class="fw-black text-success mb-3"><i class="fa-solid fa-key me-2"></i> NHẬP MÃ BẢO LƯU</h5>
                                <p class="small fw-bold text-muted mb-4">Nếu bạn được cấp mã ủy quyền, hãy dán vào đây để nhận quyền ngay lập tức.</p>
                                <form class="ajax-form">
                                    <input type="hidden" name="action" value="activate_vip">
                                    <input type="text" name="auth_code" class="form-control form-control-lg mb-3 shadow-sm" placeholder="Dán mã VIP vào đây..." required>
                                    <button type="button" class="btn-custom w-100 text-white shadow-sm" style="background: linear-gradient(135deg, #10b981, #34d399)" onclick="submitAjax(this)">KÍCH HOẠT VIP NGAY <i class="fa-solid fa-rocket ms-1"></i></button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- TAB GIFTCODE -->
                <div class="main-tab-pane" id="tab-giftcode">
                    <div class="tab-title"><i class="fa-solid fa-gift me-2 text-success"></i> Kho báu mã quà tặng</div>
                    <div class="inner-box p-4 mb-4 border-2 border-success bg-success bg-opacity-10">
                        <form class="ajax-form d-flex gap-3 align-items-center">
                            <input type="hidden" name="action" value="submit_giftcode">
                            <input type="text" name="giftcode" id="inputMaQuaTang" class="form-control form-control-lg text-uppercase fw-black shadow-sm" placeholder="Nhập mã quà tặng..." required>
                            <button type="button" class="btn-custom text-white px-5 shadow-sm" style="background: linear-gradient(135deg, #10b981, #34d399); white-space:nowrap" onclick="submitAjax(this)">ĐỔI QUÀ <i class="fa-solid fa-box-open ms-1"></i></button>
                        </form>
                    </div>
                    
                    <h5 class="fw-bold mb-3 text-dark"><i class="fa-solid fa-star text-warning me-2"></i> Mã Quà Công Khai</h5>
                    <div class="row g-3">
                        <?php foreach ($public_giftcodes as $gc): 
                            // Lấy thông tin ngày hết hạn và check các điều kiện làm mờ
                            $exp_text = !empty($gc['expires_at']) ? date('d/m/Y H:i', strtotime($gc['expires_at'])) : 'Vĩnh viễn';
                            $is_expired = (!empty($gc['expires_at']) && strtotime($gc['expires_at']) < time());
                            $used_count = intval($gc['used_count']);
                            $max_uses = intval($gc['max_uses']);
                            $is_out_of_uses = ($max_uses > 0 && $used_count >= $max_uses);
                            $uses_text = $max_uses > 0 ? ($used_count . '/' . $max_uses) : ($used_count . '/Không giới hạn');
                            $gc_code = !empty($gc['code']) ? (string)$gc['code'] : (isset($gc['giftcode']) ? (string)$gc['giftcode'] : '');
                            $gc_code_upper = strtoupper(trim($gc_code));
                            $is_claimed = (intval($gc['is_claimed']) > 0);
                            
                            // Nếu đã nhận, hết lượt hoặc hết hạn -> Làm mờ
                            $disabled = ($gc_code_upper === '' || $is_claimed || $is_out_of_uses || $is_expired);
                            $click_attr = $disabled ? 'aria-disabled="true"' : 'role="button" tabindex="0" onclick="chonMaQuaTang(\'' . htmlspecialchars($gc_code_upper, ENT_QUOTES, 'UTF-8') . '\')"';
                        ?>
                        <div class="col-md-6 col-lg-4">
                            <div class="gc-card shadow-sm <?php echo $disabled ? 'gc-claimed' : ''; ?>" data-giftcode="<?php echo htmlspecialchars($gc_code_upper, ENT_QUOTES, 'UTF-8'); ?>" data-giftcode-id="<?php echo intval($gc['id']); ?>" <?php echo $click_attr; ?>>
                                <div class="text-center mb-2">
                                    <h4 class="fw-black text-primary mb-0"><?php echo htmlspecialchars($gc_code_upper); ?></h4>
                                </div>
                                
                                                                <div class="gc-info-box text-start text-muted small">
                                    <div class="mb-1"><i class="fa-solid fa-users text-info me-1"></i> Lượt dùng: <b class="giftcode-uses-text"><?php echo htmlspecialchars($uses_text, ENT_QUOTES, 'UTF-8'); ?></b></div>
                                    <div><i class="fa-solid fa-clock text-warning me-1"></i> HSD: <b><?php echo $exp_text; ?></b></div>
                                </div>

                                <div class="text-center giftcode-status-slot">
                                    <?php if ($is_claimed): ?><span class="badge bg-secondary py-2 px-3 rounded-pill"><i class="fa-solid fa-check"></i> Đã nhận</span>
                                    <?php elseif ($is_expired): ?><span class="badge bg-dark py-2 px-3 rounded-pill"><i class="fa-solid fa-clock"></i> Hết hạn</span>
                                    <?php elseif ($is_out_of_uses): ?><span class="badge bg-danger py-2 px-3 rounded-pill"><i class="fa-solid fa-xmark"></i> Hết lượt</span>
                                    <?php elseif ($gc_code_upper === ''): ?><span class="badge bg-danger py-2 px-3 rounded-pill"><i class="fa-solid fa-triangle-exclamation"></i> Mã lỗi</span>
                                    <?php else: ?><span class="badge bg-success py-2 px-3 rounded-pill shadow-sm"><i class="fa-solid fa-hand-pointer"></i> Bấm để nhập</span><?php endif; ?>
                                </div>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <!-- TAB TIỆN ÍCH NHÂN VẬT -->
                <div class="main-tab-pane" id="tab-gm">
                    <div class="tab-title"><i class="fa-solid fa-wand-magic-sparkles me-2 text-danger"></i> Cổng không gian (Tiện ích nhân vật)</div>
                    <div class="alert alert-danger bg-danger bg-opacity-10 border-0 rounded-4 mb-4 fw-bold p-3">
                        <i class="fa-solid fa-circle-exclamation me-2"></i> Đồ sẽ gửi thẳng vào <span class="text-danger">ID nhân vật: <?php echo htmlspecialchars($role_id ?: 'CHƯA TẠO NV'); ?></span>. Chỉ áp dụng cho nhân vật thuộc tài khoản đang đăng nhập.
                    </div>
                    
                    <ul class="nav nav-pills-custom">
                        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sub-item" type="button"><i class="fa-solid fa-box me-1"></i> Vật Phẩm</button></li>
                        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sub-clear-mail" type="button"><i class="fa-solid fa-envelope-open-text me-1"></i> Dọn Hòm Thư</button></li>
                        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sub-clear-bag" type="button"><i class="fa-solid fa-briefcase me-1"></i> Dọn Balo</button></li>
                    </ul>
                    
                    <div class="tab-content mb-4 pb-3">
                        <div class="tab-pane fade show active" id="sub-item">
                            <form class="ajax-form form-no-reset bg-white p-4 rounded-4 border shadow-sm">
                                <input type="hidden" name="action" value="send_gm_action"><input type="hidden" name="gm_type" value="item">
                                <div class="row g-3 mb-4">
                                    <div class="col-md-8">
                                        <label class="fw-bold mb-2 text-primary">Chọn vật phẩm (Yêu cầu VIP 2)</label>
                                        <select name="item_id" class="form-select select2-custom" required data-placeholder="-- Gõ tên để tìm --">
                                            <option value=""></option>
                                            <optgroup label="Vật phẩm"><?php echo getTxtOptions('gmitem.txt', 'item_'); ?></optgroup>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="fw-bold mb-2 text-primary">Số lượng</label>
                                        <input type="number" name="amount" id="gm_item_amount" class="form-control" value="1" min="1" max="1000000000" step="1" required>
                                    </div>
                                </div>
                                <button type="button" class="btn-custom w-100 text-white shadow-sm" style="background:linear-gradient(135deg,#0ea5e9,#22d3ee)" onclick="submitAjax(this)">BƠM VÀO THƯ <i class="fa-solid fa-paper-plane ms-1"></i></button>
                            </form>
                        </div>
                        
                        <!-- Tab Dọn Hòm Thư -->
                        <div class="tab-pane fade" id="sub-clear-mail">
                            <form class="ajax-form form-no-reset bg-white p-4 rounded-4 border shadow-sm">
                                <input type="hidden" name="action" value="send_gm_action"><input type="hidden" name="gm_type" value="clear_mail">
                                <div class="alert alert-warning border rounded-4 small fw-bold mb-4 text-start">
                                    <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Lưu ý:</strong> Yêu cầu <strong>THOÁT GAME TRƯỚC 5 PHÚT</strong> trước khi bấm dọn hòm thư để tránh mất đồng bộ dữ liệu. Thao tác này sẽ xóa toàn bộ thư trong hòm thư của bạn.
                                </div>
                                <button type="button" class="btn btn-danger w-100 py-2.5 fw-bold rounded-3" onclick="submitAjax(this, 'Xác nhận xóa toàn bộ thư của nhân vật? Hãy chắc chắn bạn đã thoát game trước 5 phút!')"><i class="fa-solid fa-trash-can me-2"></i> XÓA TOÀN BỘ THƯ</button>
                            </form>
                        </div>

                        <!-- Tab Dọn Balo -->
                        <div class="tab-pane fade" id="sub-clear-bag">
                            <div class="bg-white p-4 rounded-4 border shadow-sm">
                                <div class="alert alert-danger border rounded-4 small fw-bold mb-4 text-start">
                                    <i class="fa-solid fa-shield-halved me-1"></i> Tính năng dọn balo đang khóa an toàn vì dữ liệu balo được serialize trong bảng role; chưa có thao tác xóa an toàn đã kiểm thử.
                                </div>
                                <button type="button" class="btn btn-secondary w-100 py-2.5 fw-bold rounded-3" disabled><i class="fa-solid fa-lock me-2"></i> CHƯA HỖ TRỢ AN TOÀN</button>
                            </div>
                        </div>
                    </div>
                </div>
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

<script>
var currentVipLevel = <?php echo $vip_level; ?>;
var currentXuWeb = <?php echo intval($xu_web); ?>;
var featureVip = <?php echo $feature_vip ? 'true' : 'false'; ?>;
var featureGm = <?php echo $feature_gm ? 'true' : 'false'; ?>;
var topupAccount = <?php echo json_encode($username); ?>;
var topupServer = <?php echo json_encode($server_id); ?>;
var vietqrBank = <?php echo json_encode($vietqr_bank, JSON_UNESCAPED_UNICODE); ?>;
var vietqrAccount = <?php echo json_encode($vietqr_account, JSON_UNESCAPED_UNICODE); ?>;
var vietqrAccountName = <?php echo json_encode($vietqr_account_name, JSON_UNESCAPED_UNICODE); ?>;
var sepayTopupTag = <?php echo json_encode($transfer_tags['topup'], JSON_UNESCAPED_UNICODE); ?>;
var sepayVipTag = <?php echo json_encode($transfer_tags['vip'], JSON_UNESCAPED_UNICODE); ?>;
var vipBaseAmount = <?php echo intval($vip_amount); ?>;
var vipVoucherCode = '';
var vipVoucherDiscount = 0;
var luckyWheelConfig = <?php echo json_encode(array('enabled'=>$lucky_wheel_ready,'spins'=>$lucky_wheel_spins,'prizes'=>$lucky_wheel_player_prizes), JSON_UNESCAPED_UNICODE); ?>;
var publicGiftcodeStatus = <?php echo json_encode(array('revision'=>$public_giftcode_revision,'has_unclaimed'=>$has_unclaimed_public_giftcode), JSON_UNESCAPED_UNICODE); ?>;
</script>
<script src="<?php echo site_asset_url('assets/js/web-context.js'); ?>?v=20260906_context_v1"></script>
<script src="assets/js/webshop-buyer.js?v=20260906_bundle_v1"></script>
<script>var webshopPurchaseScope=<?php echo json_encode(hash('sha256',(string)$_SESSION['username'].'|'.(string)$_SESSION['server_id'])); ?>;</script>
<script src="<?php echo site_asset_url('assets/js/index.js') . '?v=' . time(); ?>"></script>
<script src="<?php echo site_asset_url('assets/js/lucky-wheel.js') . '?v=' . time(); ?>"></script>
<!-- Modal Đổi Mật Khẩu -->
<div class="modal fade" id="passwordModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 460px;">
        <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            <div class="modal-header border-0 pb-0">
                <div>
                    <h5 class="fw-black text-danger mb-1"><i class="fa-solid fa-key me-2"></i>Đổi mật khẩu</h5>
                    <div class="small text-muted fw-bold">Xác nhận mật khẩu cũ trước khi đổi.</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <form class="ajax-form" id="passwordModalForm">
                    <input type="hidden" name="action" value="change_password">
                    <div class="mb-3">
                        <label class="fw-bold mb-2 text-dark">Mật khẩu hiện tại</label>
                        <input type="password" name="old_password" class="form-control" placeholder="Nhập mật khẩu cũ..." autocomplete="current-password" required>
                    </div>
                    <div class="mb-3">
                        <label class="fw-bold mb-2 text-dark">Mật khẩu mới</label>
                        <input type="password" name="new_password" class="form-control" placeholder="Tối thiểu 6 ký tự..." autocomplete="new-password" required>
                    </div>
                    <div class="mb-4">
                        <label class="fw-bold mb-2 text-dark">Nhập lại mật khẩu mới</label>
                        <input type="password" name="re_password" class="form-control" placeholder="Xác nhận lại mật khẩu mới..." autocomplete="new-password" required>
                    </div>
                    <button type="button" class="btn btn-danger w-100 fw-black rounded-4 py-3" onclick="submitAjax(this)">
                        <i class="fa-solid fa-shield-halved me-1"></i> Cập nhật mật khẩu
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="rewardDetailModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 560px;">
        <div class="modal-content reward-detail-modal border-0 shadow-lg">
            <div class="modal-header border-0 pb-0">
                <div>
                    <h5 class="fw-black text-dark mb-1" id="rewardDetailTitle">Thông tin vật phẩm</h5>
                    <div class="small text-muted fw-bold">Danh sách chi tiết vật phẩm nhận được.</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="rewardDetailList" class="reward-detail-list"></div>
            </div>
        </div>
    </div>
</div>

<?php if ($feature_recharge_events): ?>
<div class="modal fade" id="rechargeEventPopupModal" tabindex="-1" aria-hidden="true" data-recharge-event-popup>
    <div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <div class="modal-header border-0 pb-0"><div><div class="small text-danger fw-black text-uppercase">Sự kiện nạp có thời hạn</div><h5 class="modal-title recharge-event-popup-title"><i class="fa-solid fa-bolt me-2 text-danger"></i>Quà nạp thêm đang mở</h5></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
        <div class="modal-body pt-3">
            <?php foreach ($recharge_event_snapshot['events'] as $event): if (empty($event['active'])) continue; ?>
            <img class="recharge-event-popup-banner" src="<?php echo htmlspecialchars($event['banner'], ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($event['title'], ENT_QUOTES, 'UTF-8'); ?>">
            <div class="recharge-event-items justify-content-center mb-3">
                <?php foreach ($event['tiers'] as $popup_tier): ?>
                <div class="recharge-event-tier w-100"><strong class="d-block mb-2">Nạp đủ <?php echo number_format((int)$popup_tier['amount']); ?>đ để nhận thêm</strong><div class="recharge-event-items">
                    <?php foreach ($popup_tier['items'] as $popup_item): ?><span class="recharge-event-item"><img src="<?php echo htmlspecialchars($popup_item['image'], ENT_QUOTES, 'UTF-8'); ?>" alt=""><span><?php echo htmlspecialchars($popup_item['name'], ENT_QUOTES, 'UTF-8'); ?> ×<?php echo number_format((int)$popup_item['amount']); ?></span></span><?php endforeach; ?>
                </div></div>
                <?php endforeach; ?>
            </div>
            <div class="recharge-event-popup-entry mb-3" data-popup-event-id="<?php echo (int)$event['id']; ?>"><div class="text-center mt-3"><h5 class="fw-black mb-1"><?php echo htmlspecialchars($event['title'], ENT_QUOTES, 'UTF-8'); ?></h5><div class="small text-muted fw-bold">Kết thúc <?php echo htmlspecialchars($event['ends_at']); ?> (GMT+7)</div><button type="button" class="btn btn-danger fw-black rounded-pill px-4 mt-3" data-bs-dismiss="modal" data-open-event-tab> Xem mốc nhận quà </button></div></div>
            <?php endforeach; ?>
        </div>
    </div></div>
</div>
<?php endif; ?>

<!-- Modal Nhận Vật Phẩm Shop -->
<div class="modal fade modern-shop-modal" id="shopBuyModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 430px;">
        <div class="modal-content shop-buy-content border-0 shadow-lg">
            <div class="modal-header shop-buy-head border-0">
                <div>
                    <h5 class="fw-black text-dark mb-1"><i class="fa-solid fa-cart-shopping text-primary me-2"></i>Nhận vật phẩm</h5>
                    <div class="small text-muted fw-bold">Xác nhận gói trước khi trừ Xu Web.</div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body pt-0">
                <div class="shop-buy-hero">
                    <div id="modal_shop_img" class="shop-buy-image"></div>
                    <div class="min-w-0 flex-grow-1">
                        <div class="shop-buy-badge" id="modal_shop_amount_badge">x1</div>
                        <div id="modal_shop_name" class="shop-buy-name"></div>
                        <div id="modal_shop_price_label" class="shop-buy-sub"></div>
                    </div>
                </div>
                <form class="ajax-form form-no-reset" id="modalShopForm">
                    <input type="hidden" name="action" value="buy_shop_item">
                    <input type="hidden" name="shop_item_id" id="modal_shop_item_id"><input type="hidden" name="request_key" id="modal_shop_request_key"><div id="modal_shop_rewards" class="mb-3"></div>
                    <div class="shop-buy-stat">
                        <span>Đơn giá</span>
                        <b id="modal_shop_unit_price">0 Xu</b>
                    </div>
                    <div class="shop-buy-qty">
                        <label class="small fw-bold text-muted mb-2">Số lượng nhận</label>
                        <div class="shop-stepper">
                            <button type="button" onclick="adjustModalQty(-1)" title="Giảm số lượng"><i class="fa-solid fa-minus"></i></button>
                            <input type="number" name="quantity" id="modal_shop_qty" class="form-control text-center fw-black" value="1" min="1" required>
                            <button type="button" onclick="adjustModalQty(1)" title="Tăng số lượng"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                    <div class="shop-buy-total">
                        <span>Tổng Xu thanh toán</span>
                        <strong id="modal_shop_total">0 Xu</strong>
                    </div>
                    <button type="button" class="shop-buy-submit btn w-100 fw-black" onclick="submitModalShopBuy()">
                        <i class="fa-solid fa-bag-shopping me-1"></i> Xác nhận nhận
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>

<?php lhs_web_experience_assets(); ?>
</body>
</html>
