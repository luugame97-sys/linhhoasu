
var userSortBy = 'account';
var userSortDir = 'desc';

function setUserSort(sortBy, sortDir) {
    if (['account', 'balance', 'vip'].indexOf(sortBy) === -1) sortBy = 'account';
    sortDir = String(sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
    userSortBy = sortBy;
    userSortDir = sortDir;
    loadUsers(1);
}

function toggleUserSort(sortBy) {
    if (['balance', 'vip'].indexOf(sortBy) === -1) return;
    if (userSortBy === sortBy) {
        userSortDir = userSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        userSortBy = sortBy;
        // Lần bấm đầu tiên theo kiểu mặc định: cao xuống thấp.
        userSortDir = 'desc';
    }
    loadUsers(1);
}

function updateUserSortStatus() {
    var labels = {account: 'mặc định', balance: userSortDir === 'asc' ? 'Xu tăng dần' : 'Xu giảm dần', vip: userSortDir === 'asc' ? 'VIP tăng dần' : 'VIP giảm dần'};
    $('#userSortStatus').text('Đang xem: ' + (labels[userSortBy] || labels.account));
    var specs = [
        {key: 'balance', header: '#userSortBalanceHeader', icon: '#userSortBalanceIcon'},
        {key: 'vip', header: '#userSortVipHeader', icon: '#userSortVipIcon'}
    ];
    $.each(specs, function(_, spec) {
        var active = userSortBy === spec.key;
        $(spec.header).toggleClass('sort-active', active)
            .attr('title', active ? ('Đang sắp xếp ' + labels[spec.key] + '. Bấm để đảo chiều.') : ('Bấm để sắp xếp ' + (spec.key === 'balance' ? 'Xu' : 'VIP')));
        $(spec.icon).text(active ? (userSortDir === 'asc' ? '▲' : '▼') : '↕');
    });
}

function toggleUserBan(accountName, uin, ban) {
    var actionText = ban ? 'Khóa' : 'Mở khóa';
    appConfirmDanger({
        title: actionText + ' tài khoản ' + accountName + '?',
        text: 'Thao tác này sẽ ' + (ban ? 'chặn đứng' : 'cho phép') + ' tài khoản đăng nhập vào game.'
    }).then(function(result) {
        if (!result.isConfirmed) return;
        appLoading(actionText + ' tài khoản...');
        $.post("admin_api.php", { action: 'toggle_user_ban', uin: uin, account: accountName, ban: ban }, function(r) {
            if (r.status === 'success') {
                Swal.close();
                appToast('success', 'Thành công', r.message);
                loadUsers($('#userPagination .active').text() || 1);
            } else {
                Swal.fire('Lỗi!', r.message, 'error');
            }
        }, 'json');
    });
}

function resolveItemImageUrl(url) {
    if (!url) return '';
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('/') === 0) return url;
    return '../' + url;
}

var playerActionTarget = { account: '', uin: '', roleName: '', serverId: '', serverName: '', xu: 0, recharge: 0 };
var disciplineTarget = { account: '', uin: '', roleName: '' };

function openPlayerActionModal(account, uin, roleName, serverId, serverName, xu, recharge) {
    playerActionTarget = { account: String(account || ''), uin: String(uin || ''), roleName: String(roleName || ''), serverId: String(serverId || ''), serverName: String(serverName || ''), xu: Number(xu || 0), recharge: Number(recharge || 0) };
    $('#playerActionTarget').text('S' + (playerActionTarget.serverId || '-') + ' · ' + (playerActionTarget.serverName || 'Không rõ server') + ' · ' + (playerActionTarget.roleName || 'Chưa có nhân vật') + ' · ' + (playerActionTarget.account || playerActionTarget.uin));
    $('#playerActionModal').modal('show');
}

function choosePlayerAction(action) {
    $('#playerActionModal').modal('hide');
    if (action === 'xu') return openXuModal(playerActionTarget.account, playerActionTarget.xu, playerActionTarget.recharge);
    if (action === 'vip') return openVipModal(playerActionTarget.account);
    if (action === 'password') return openPwdModal(playerActionTarget.account);
    if (action === 'discipline') return openDisciplineModal(playerActionTarget.account, playerActionTarget.uin, playerActionTarget.roleName);
}

function formatDisciplineUntil(ban) {
    if (!ban) return '';
    if (ban.permanent) return 'vĩnh viễn';
    if (ban.unlockTime) return 'đến ' + ban.unlockTime + ' (GMT+7)';
    return 'có thời hạn';
}

function formatLockDuration(seconds, permanent) {
    seconds = Math.max(0, Math.floor(Number(seconds || 0)));
    if (permanent) return 'Vĩnh viễn';
    var units = [[86400, 'ngày'], [3600, 'giờ'], [60, 'phút']];
    for (var i = 0; i < units.length; i++) {
        if (seconds >= units[i][0] && seconds % units[i][0] === 0) return (seconds / units[i][0]).toLocaleString('vi-VN') + ' ' + units[i][1];
    }
    return seconds.toLocaleString('vi-VN') + ' giây';
}

function formatWebUnlockTime(until) {
    var value = Number(until || 0);
    if (value <= 0) return '';
    try { return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Bangkok', hour12: false }); }
    catch (_error) { return new Date(value).toISOString(); }
}

function lockMessageCard(label, state, fallbackTitle) {
    state = state || {};
    var banned = state.banned === true;
    var meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
    var title = String(state.title || meta.title || fallbackTitle || 'Thông báo kỷ luật');
    var reason = String(state.reason || '').trim();
    var adminMessage = String(state.adminMessage || reason || '').trim();
    var generatedMessage = String(state.message || '').trim();
    var unlockTime = String(state.unlockTime || formatWebUnlockTime(state.until) || '').trim();
    var duration = formatLockDuration(state.remainingSeconds, state.permanent === true);
    var statusClass = banned ? 'is-locked' : 'is-active';
    var statusText = banned ? ('Đang khóa · ' + duration) : 'Đang hoạt động';
    var html = '<section class="lock-report-card ' + statusClass + '">';
    html += '<div class="lock-report-head"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(statusText) + '</span></div>';
    if (banned) {
        html += '<div class="lock-report-title"><i class="fa-solid fa-scroll me-1"></i>' + escapeHtml(title) + '</div>';
        html += '<dl class="lock-report-grid">';
        html += '<div><dt>Mã xử lý</dt><dd>' + escapeHtml(state.code || '—') + '</dd></div>';
        html += '<div><dt>Người thực hiện</dt><dd>' + escapeHtml(state.bannedBy || '—') + '</dd></div>';
        html += '<div class="lock-report-wide"><dt>Lý do nguyên bản</dt><dd>' + escapeHtml(reason || 'Không ghi lý do') + '</dd></div>';
        html += '<div class="lock-report-wide"><dt>Lời nhắn gốc của admin</dt><dd class="lock-report-message">' + escapeHtml(adminMessage || 'Không có lời nhắn riêng') + '</dd></div>';
        if (generatedMessage && generatedMessage !== adminMessage) html += '<div class="lock-report-wide"><dt>Thông báo hệ thống</dt><dd>' + escapeHtml(generatedMessage) + '</dd></div>';
        html += '</dl>';
        if (unlockTime) html += '<div class="lock-report-unlock">Thời gian mở khóa: ' + escapeHtml(unlockTime) + ' (GMT+7)</div>';
    }
    html += '</section>';
    return html;
}

function renderDisciplineState(data) {
    var game = data && data.game ? data.game.ban || {} : {};
    var web = data && data.web ? data.web : {};
    var webMeta = web.meta && typeof web.meta === 'object' ? web.meta : {};
    var title = String(web.title || webMeta.title || 'Thiên Đạo Ban Lệnh');
    if (!game.title) game.title = title;
    if (!game.adminMessage) game.adminMessage = game.reason || '';
    $('#gameBanCurrent').html(lockMessageCard('Tài khoản game', game, title) + lockMessageCard('Tài khoản WebGM', web, title) + '<div class="small text-muted mt-2">Dữ liệu trên là báo cáo hiện tại; chỉ các nút bên dưới mới thay đổi trạng thái.</div>');
}

function openDisciplineModal(account, uin, roleName) {
    disciplineTarget = { account: String(account || ''), uin: String(uin || ''), roleName: String(roleName || '') };
    $('#gameBanTarget').text((disciplineTarget.roleName ? disciplineTarget.roleName + ' · ' : '') + (disciplineTarget.account || disciplineTarget.uin));
    $('#disciplineOperation').val('ban'); $('#disciplineScope').val('game'); $('#disciplineSeconds').val(''); $('#disciplineReason').val(''); $('#disciplineCode').val('ACCOUNT_DISCIPLINE'); $('#disciplinePreview').prop('hidden', true).empty(); updateDisciplineForm();
    $('#gameBanModal').modal('show');
    $.post('admin_api.php', { action: 'get_account_discipline_status', account: disciplineTarget.account, uin: disciplineTarget.uin }, function(r) {
        if (r.status === 'success') renderDisciplineState(r); else $('#gameBanCurrent').html('<span class="text-danger">' + escapeHtml(r.message || 'Không đọc được trạng thái.') + '</span>');
    }, 'json');
}

function disciplinePayload(action) {
    return { action: action, account: disciplineTarget.account, uin: disciplineTarget.uin, operation: String($('#disciplineOperation').val() || 'ban'), scope: String($('#disciplineScope').val() || 'game'), duration_seconds: Math.max(0, Math.floor(Number($('#disciplineSeconds').val() || 0))), reason: String($('#disciplineReason').val() || '').trim(), code: String($('#disciplineCode').val() || 'ACCOUNT_DISCIPLINE').trim(), exploit_count: 0, exploit_baozi: 0, evidence_id: '' };
}

function updateDisciplineForm() {
    var ban = String($('#disciplineOperation').val() || 'ban') === 'ban';
    $('#disciplineDurationWrap').toggle(ban);
    $('#disciplineSeconds').prop('disabled', !ban);
    $('#disciplineCode').prop('disabled', !ban);
}

function showDisciplinePreview(result) {
    var game = result.game && result.game.ban ? result.game.ban : null;
    var web = result.web || null;
    var parts = [];
    if (game) parts.push('Game: ' + (game.banned ? ('khóa ' + formatDisciplineUntil(game)) : 'đang hoạt động') + (game.message ? '<br>' + escapeHtml(game.message) : ''));
    if (web) parts.push('WebGM: ' + (web.banned ? ('khóa ' + (web.permanent ? 'vĩnh viễn' : (web.remainingSeconds || 0) + ' giây')) : 'đang hoạt động') + (web.message ? '<br>' + escapeHtml(web.message) : ''));
    $('#disciplinePreview').html(parts.join('<hr class="my-2">') || 'Không có dữ liệu preview.').prop('hidden', false);
}

function previewDiscipline() {
    var payload = disciplinePayload('preview_account_discipline');
    if (payload.operation === 'ban' && payload.duration_seconds <= 0) return Swal.fire('Thiếu thời hạn', 'Nhập số giây khóa.', 'warning');
    appLoading('Đang tạo bản xem trước...');
    $.post('admin_api.php', payload, function(r) { Swal.close(); if (r.status === 'success') showDisciplinePreview(r); else Swal.fire('Lỗi', r.message || 'Không xem trước được.', 'error'); }, 'json');
}

function commitDiscipline() {
    var payload = disciplinePayload('commit_account_discipline');
    if (payload.operation === 'ban' && payload.duration_seconds <= 0) return Swal.fire('Thiếu thời hạn', 'Nhập số giây khóa.', 'warning');
    if (payload.operation === 'ban' && payload.reason.length < 5) return Swal.fire('Thiếu lý do', 'Nhập lý do để xác nhận khóa.', 'warning');
    var actionText = payload.operation === 'ban' ? 'khóa' : 'mở khóa';
    Swal.fire({ title: 'Xác nhận ' + actionText + ' tài khoản?', html: 'Phạm vi: <b>' + escapeHtml(payload.scope) + '</b>' + (payload.operation === 'ban' ? '<br>Thời hạn: <b>' + payload.duration_seconds.toLocaleString('vi-VN') + ' giây</b><br>Lý do: ' + escapeHtml(payload.reason) : ''), icon: 'warning', showCancelButton: true, confirmButtonText: 'Xác nhận', cancelButtonText: 'Hủy', confirmButtonColor: payload.operation === 'ban' ? '#dc2626' : '#059669' }).then(function(result) {
        if (!result.isConfirmed) return;
        appLoading('Đang ' + actionText + ' tài khoản...');
        $.post('admin_api.php', payload, function(r) { Swal.close(); if (r.status === 'success') { appToast('success', r.message || 'Hoàn tất', ''); if (r.game || r.web) showDisciplinePreview(r); loadUsers($('#userPagination .active').text() || 1); } else Swal.fire('Lỗi', r.message || 'Không thể cập nhật.', 'error'); }, 'json');
    });
}

$(function(){ $('#disciplineOperation').on('change', updateDisciplineForm); updateDisciplineForm(); });

function updateShopImagePreview(url) {
    var $box = $('#shopImagePreview');
    if (!$box.length) return;
    url = String(url || $('#shop_image_url').val() || '').trim();
    if (!url) {
        $box.html('<i class="fa-solid fa-image text-primary"></i>');
        return;
    }
    $box.html('<img src="'+escapeHtml(resolveItemImageUrl(url))+'" alt="Item image" onerror="this.parentNode.innerHTML=\'<i class=&quot;fa-solid fa-image text-primary&quot;></i>\'">');
}

function uploadShopItemImage(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var selectedKey = String($('#shop_item_select').val() || '');
    var selectedName = String($('#shop_item_name').val() || cleanSelectedItemName($('#shop_item_select option:selected').text()) || '');
    var formData = new FormData();
    formData.append('action', 'upload_site_image');
    formData.append('image_type', 'shop_item');
    formData.append('image_file', file);
    if (selectedKey) formData.append('item_id', selectedKey);
    if (selectedName) formData.append('item_name', selectedName);
    
    appLoading('Đang tải ảnh vật phẩm lên...');
    $.ajax({
        url: 'admin_api.php',
        type: 'POST',
        data: formData,
        contentType: false,
        processData: false,
        dataType: 'json',
        success: function(r) {
            if (r.status === 'success') {
                $('#shop_image_url').val(r.url_path);
                updateShopImagePreview(r.url_path);
                if (selectedKey) setAdminItemIcon(selectedKey, r.url_path);
                if ($('#tab-item-icons').hasClass('active')) loadItemIcons();
                Swal.close();
                appToast('success', 'Thành công', 'Đã tải ảnh lên.');
            } else {
                Swal.fire('Lỗi!', r.message, 'error');
            }
        },
        error: function() {
            Swal.fire('Lỗi!', 'Không thể kết nối đến máy chủ.', 'error');
        }
    });
}

// Wrap Swal.fire to intercept session timeout messages globally
(function() {
    var originalSwalFire = Swal.fire;
    Swal.fire = function() {
        var args = arguments;
        if (args.length > 0) {
            var msg = '';
            if (typeof args[0] === 'object' && args[0] !== null) {
                msg = args[0].text || args[0].html || '';
            } else if (args.length >= 2) {
                msg = String(args[1]);
            }
            var isTimeout = false;
            if (typeof args[0] === 'object' && args[0] !== null) {
                if (args[0].login_required) isTimeout = true;
            }
            if (typeof msg === 'string' && (/phiên\s+đăng\s+nhập/i.test(msg) || /login_required/i.test(msg) || /phiên\s+làm\s+việc\s+đã\s+hết\s+hạn/i.test(msg))) {
                isTimeout = true;
            }
            if (isTimeout) {
                var redirectUrl = window.location.pathname.indexOf('/admin/') !== -1 ? '../login.php' : 'login.php';
                return originalSwalFire.call(Swal, {
                    title: 'Phiên làm việc đã hết hạn',
                    text: 'Vui lòng đăng nhập lại để tiếp tục.',
                    icon: 'warning',
                    confirmButtonText: 'Đăng nhập lại',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(function() {
                    window.location.href = redirectUrl;
                });
            }
        }
        return originalSwalFire.apply(Swal, args);
    };
})();

function appToast(icon, title, message) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icon || 'success',
        title: title || '',
        text: message || '',
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true
    });
}

function appLoading(title) {
    Swal.fire({
        title: title || 'Đang xử lý...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: function() { Swal.showLoading(); }
    });
}

function appConfirmDanger(options) {
    options = options || {};
    return Swal.fire({
        title: options.title || 'Xác nhận thao tác nguy hiểm?',
        html: '<div class="text-start">'
            + '<div class="fw-bold text-danger mb-2"><i class="fa-solid fa-triangle-exclamation me-1"></i> Thao tác này có thể ảnh hưởng dữ liệu.</div>'
            + '<div class="text-muted fw-bold">' + escapeHtml(options.text || 'Vui lòng kiểm tra kỹ trước khi tiếp tục.') + '</div>'
            + '</div>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: options.confirmText || 'Xác nhận',
        cancelButtonText: options.cancelText || 'Hủy',
        reverseButtons: true,
        focusCancel: true
    });
}

function tableLoadingRow(colspan, text) {
    var rowsCount = 3;
    var html = '';
    for (var i = 0; i < rowsCount; i++) {
        html += '<tr class="ui-skeleton-row">';
        for (var j = 0; j < colspan; j++) {
            var shapeClass = '';
            if (j === 0) shapeClass = 'title';
            else if (j === colspan - 1) shapeClass = 'btn';
            else if (j === colspan - 2) shapeClass = 'badge';
            else shapeClass = 'subtitle';
            html += '<td><div class="ui-skeleton-line ' + shapeClass + '"></div></td>';
        }
        html += '</tr>';
    }
    return html;
}

function tableEmptyRow(colspan, text, icon) {
    return '<tr><td colspan="'+Number(colspan || 1)+'"><div class="ui-empty table-state"><i class="fa-solid '+escapeHtml(icon || 'fa-folder-open')+'"></i><span>'+escapeHtml(text || 'Chưa có dữ liệu.')+'</span></div></td></tr>';
}

function tableErrorRow(colspan, text) {
    return '<tr><td colspan="'+Number(colspan || 1)+'"><div class="ui-empty table-state ui-empty-danger"><i class="fa-solid fa-circle-exclamation"></i><span>'+escapeHtml(text || 'Không tải được dữ liệu.')+'</span></div></td></tr>';
}

function panelEmpty(text, icon) {
    return '<div class="ui-empty compact-empty"><i class="fa-solid '+escapeHtml(icon || 'fa-folder-open')+'"></i><span>'+escapeHtml(text || 'Chưa có dữ liệu.')+'</span></div>';
}

    function initTooltips(context) {
        if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
        $(context || document).find('[title]').each(function() {
            var currentToggle = this.getAttribute('data-bs-toggle');
            if (currentToggle && currentToggle !== 'tooltip') return;
            if (!this.getAttribute('data-bs-title')) this.setAttribute('data-bs-title', this.getAttribute('title'));
            this.setAttribute('data-bs-toggle', 'tooltip');
            if (!bootstrap.Tooltip.getInstance(this)) new bootstrap.Tooltip(this);
        });
    }

    function setAdminMobileMenu(open) {
        $('body').toggleClass('admin-menu-open', !!open);
        $('#adminMobileMenuToggle').attr('aria-expanded', open ? 'true' : 'false');
    }

function rewardKeyToId(id) {
        return String(id || '').replace(/^(item_|gift_|charge_)/, '');
    }

    function cleanSelectedItemName(text) {
        return String(text || '').replace(/^\s*(?:item_|gift_|charge_)?\d+(?:_\d+)?\s*[-–:]?\s*/i, '').trim();
    }

    function adminItemKeyVariants(itemId) {
        var key = String(itemId || '').trim();
        var rawId = rewardKeyToId(key);
        var variants = [];
        function add(value) {
            value = String(value || '').trim();
            if (value && variants.indexOf(value) === -1) variants.push(value);
        }
        add(key);
        add(rawId);
        if (rawId) {
            add('item_' + rawId);
            add('gift_' + rawId);
            add('charge_' + rawId);
        }
        return variants;
    }

    function setAdminItemIcon(itemId, imageUrl) {
        imageUrl = String(imageUrl || '').trim();
        if (!imageUrl) return;
        adminItemKeyVariants(itemId).forEach(function(key) {
            adminItemImages[key] = imageUrl;
        });
    }

    function removeAdminItemIcon(itemId) {
        adminItemKeyVariants(itemId).forEach(function(key) {
            delete adminItemImages[key];
        });
    }

    function getAdminItemIcon(itemId) {
        var variants = adminItemKeyVariants(itemId);
        for (var i = 0; i < variants.length; i++) {
            if (adminItemImages[variants[i]]) return adminItemImages[variants[i]];
        }
        return '';
    }

    function getAdminItemName(itemId, fallbackName) {
        var variants = adminItemKeyVariants(itemId);
        for (var i = 0; i < variants.length; i++) {
            if (adminItemCatalog[variants[i]]) return adminItemCatalog[variants[i]];
        }
        return fallbackName || ('Vật phẩm ID ' + rewardKeyToId(itemId));
    }

    function updateIconImagePreview(url) {
        var $box = $('#iconImagePreview');
        if (!$box.length) return;
        url = String(url || $('#icon_image_url').val() || '').trim();
        if (!url) {
            $box.html('<i class="fa-solid fa-image text-info"></i>');
            return;
        }
        $box.html('<img src="'+escapeHtml(resolveItemImageUrl(url))+'" alt="Item icon" onerror="this.parentNode.innerHTML=\'<i class=&quot;fa-solid fa-image text-info&quot;></i>\'">');
    }

    function uploadItemIconImage(input) {
        if (!input.files || !input.files[0]) return;
        var selectedKey = String($('#icon_item_select').val() || '');
        if (!selectedKey) {
            input.value = '';
            Swal.fire('Thiếu item', 'Vui lòng chọn item trước khi upload icon.', 'warning');
            return;
        }
        var selectedName = String($('#icon_item_name').val() || cleanSelectedItemName($('#icon_item_select option:selected').text()) || '');
        var formData = new FormData();
        formData.append('action', 'upload_site_image');
        formData.append('image_type', 'shop_item');
        formData.append('image_file', input.files[0]);
        formData.append('item_id', selectedKey);
        formData.append('item_name', selectedName);

        appLoading('Đang tải icon item lên...');
        $.ajax({
            url: 'admin_api.php',
            type: 'POST',
            data: formData,
            contentType: false,
            processData: false,
            dataType: 'json',
            success: function(r) {
                input.value = '';
                if (r.status === 'success') {
                    $('#icon_image_url').val(r.url_path);
                    updateIconImagePreview(r.url_path);
                    setAdminItemIcon(selectedKey, r.url_path);
                    Swal.close();
                    appToast('success', 'Đã upload', 'Icon item đã đồng bộ.');
                    loadItemIcons();
                } else {
                    Swal.fire('Lỗi!', r.message, 'error');
                }
            },
            error: function() {
                input.value = '';
                Swal.fire('Lỗi!', 'Không thể kết nối đến máy chủ.', 'error');
            }
        });
    }

    function rewardCardHtml(id, amt) {
        var rawId = rewardKeyToId(id);
        var name = getAdminItemName(id, 'Vật phẩm ID ' + rawId);
        var iconUrl = getAdminItemIcon(id);
        var img = iconUrl ? resolveItemImageUrl(iconUrl) : '../assets/images/logo.png';
        return '<div class="admin-reward-card"><img src="'+escapeHtml(img)+'" alt="'+escapeHtml(name)+'" onerror="this.src=\'../assets/images/logo.png\'"><div class="min-w-0"><div class="admin-reward-name">'+escapeHtml(name)+'</div><div class="admin-reward-meta">ID '+escapeHtml(rawId)+' | SL '+escapeHtml(amt)+'</div></div></div>';
    }

    function rewardItemsFromJson(raw) {
        try {
            var parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch(e) {
            return {};
        }
    }

    function rewardSummaryHtml(raw, title) {
        var items = rewardItemsFromJson(raw);
        var keys = Object.keys(items);
        if (keys.length === 0) return '<span class="text-muted fw-bold">Chưa có quà</span>';
        var encoded = encodeURIComponent(JSON.stringify(items));
        var html = '<button type="button" class="admin-reward-summary" data-title="'+escapeHtml(title || 'Chi tiết quà')+'" data-rewards="'+encoded+'" onclick="showAdminRewardDetail(this)">';
        keys.slice(0, 4).forEach(function(id) {
            var rawId = rewardKeyToId(id);
            var name = adminItemCatalog[id] || adminItemCatalog[rawId] || ('Vật phẩm ID ' + rawId);
            html += '<span>'+escapeHtml(name)+' x '+escapeHtml(items[id])+'</span>';
        });
        if (keys.length > 4) html += '<b>+'+(keys.length - 4)+'</b>';
        html += '</button>';
        return html;
    }

    function showAdminRewardDetail(button) {
        var $btn = $(button);
        var items = {};
        try {
            items = JSON.parse(decodeURIComponent($btn.attr('data-rewards') || '%7B%7D'));
        } catch(e) {
            items = {};
        }
        var body = '<div class="admin-reward-detail-grid">';
        $.each(items, function(id, amt) { body += rewardCardHtml(id, amt); });
        body += '</div>';
        Swal.fire({
            title: escapeHtml($btn.attr('data-title') || 'Chi tiết quà'),
            html: body,
            width: 620,
            showConfirmButton: false,
            showCloseButton: true
        });
    }

    function updateJsonPreview() {
        var j = JSON.stringify(giftcodeItems); $('#jsonPreview').text(j); $('#final_json_input').val(j);
        var box = $('#itemPreviewBox').empty();
        if(Object.keys(giftcodeItems).length === 0) box.html('<span class="text-muted fw-bold">Chưa thêm vật phẩm...</span>');
        else $.each(giftcodeItems, function(id, amt) { box.append('<div class="d-inline-block position-relative me-1 mb-1">'+rewardCardHtml(id, amt)+'<button type="button" class="btn btn-sm btn-danger rounded-circle position-absolute top-0 end-0" style="width:24px;height:24px;padding:0;transform:translate(35%,-35%)" onclick="removeGiftcodeItem(\''+jsString(id)+'\');"><i class="fa-solid fa-xmark"></i></button></div>'); });
    }

    var webshopCache = [];
    var itemIconCache = [];
    var milestoneCache = [];
    var luckyWheelPrizeCache = [];
    var giftcodeCache = [];
    var milestoneItems = {};

    function loadSettings() {
        $.post("admin_api.php", { action: 'get_settings' }, function(r) {
            if(r.status !== 'success') return;
            var s = r.settings || {};
            $('.setting-toggle').each(function(){
                var key = $(this).data('key');
                var fallback = $(this).data('default');
                if (fallback == null) fallback = '1';
                $(this).prop('checked', (s[key] != null ? s[key] : String(fallback)) === '1');
            });
            $('.text-setting-input').each(function(){
                var key = $(this).data('key');
                if (s[key] != null) $(this).val(s[key]);
            });
        }, 'json');
    }

    function loadWebshopItems() {
        $('#webshopTableBody').html(tableLoadingRow(6, 'Đang tải Webshop...'));
        $.post("admin_api.php", { action: 'get_webshop_items' }, function(r) {
            if(r.status !== 'success') {
                $('#webshopTableBody').html(tableErrorRow(6, r.message || 'Không tải được Webshop.'));
                return;
            }
            webshopCache = r.data || [];
            $.each(webshopCache, function(i, item) {
                if(item.image_url) {
                    setAdminItemIcon(item.item_id, item.image_url);
                }
            });
            var html = '';
            if(webshopCache.length === 0) html = tableEmptyRow(6, 'Chưa có vật phẩm Webshop.', 'fa-store-slash');
            else $.each(webshopCache, function(i, item) {
                var img = item.image_url ? '<img class="shop-thumb" src="'+escapeHtml(resolveItemImageUrl(item.image_url))+'" alt="">' : '<div class="shop-thumb d-inline-grid place-items-center"><i class="fa-solid fa-box text-primary"></i></div>';
                var status = Number(item.is_active) === 1 ? '<span class="badge bg-success rounded-pill px-3 py-2">Đang mở</span>' : '<span class="badge bg-secondary rounded-pill px-3 py-2">Đã tắt</span>';
                var toggleText = Number(item.is_active) === 1 ? 'Tắt' : 'Bật';
                var itemQtySuffix = item.reward_items ? ' · Gói ' + (item.bundle_rewards||[]).length + ' item' : (Number(item.item_amount || 1) > 1 ? ' (' + formatNumber(item.item_amount) + ' cái)' : '');
                html += '<tr><td>'+img+'</td><td class="text-start"><div class="fw-black text-dark">'+escapeHtml(item.item_name)+itemQtySuffix+'</div><div class="small text-muted fw-bold">ID '+escapeHtml(item.item_id)+'</div></td><td class="fw-black text-warning">'+formatNumber(item.price)+' Xu</td><td>'+escapeHtml(item.sort_order)+'</td><td>'+status+'</td><td><div class="btn-group"><button class="btn btn-sm btn-light border fw-bold text-primary" onclick="editWebshopItem('+item.id+')" title="Sửa vật phẩm"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-light border fw-bold text-warning" onclick="toggleWebshopItem('+item.id+', '+(Number(item.is_active) === 1 ? 0 : 1)+')" title="'+toggleText+' vật phẩm">'+toggleText+'</button><button class="btn btn-sm btn-light border fw-bold text-danger" onclick="deleteWebshopItem('+item.id+')" title="Xóa vật phẩm"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
            });
            $('#webshopTableBody').html(html);
            initTooltips('#webshopTableBody');
        }, 'json');
    }

    function renderItemIconRows() {
        var query = String($('#itemIconSearchFilter').val() || '').toLowerCase().trim();
        var rows = itemIconCache.filter(function(item) {
            if (!query) return true;
            var sourceText = item.source === 'icon' ? 'icon riêng' : 'webshop';
            var rawId = String(item.raw_id || rewardKeyToId(item.item_id));
            var name = String(item.item_name || getAdminItemName(item.item_id, 'Vật phẩm ID ' + rawId));
            return (name + ' ' + item.item_id + ' ' + rawId + ' ' + sourceText).toLowerCase().indexOf(query) !== -1;
        });

        if (rows.length === 0) {
            $('#itemIconTableBody').html(tableEmptyRow(5, query ? 'Không tìm thấy icon phù hợp.' : 'Chưa có icon item.', 'fa-images'));
            return;
        }

        var html = '';
        $.each(rows.slice(0, 100), function(i, item) {
            var itemId = String(item.item_id || '');
            var rawId = String(item.raw_id || rewardKeyToId(itemId));
            var name = String(item.item_name || getAdminItemName(itemId, 'Vật phẩm ID ' + rawId));
            var imageUrl = String(item.image_url || getAdminItemIcon(itemId) || '');
            if (imageUrl) setAdminItemIcon(itemId, imageUrl);
            var img = imageUrl
                ? '<img class="item-icon-thumb" src="'+escapeHtml(resolveItemImageUrl(imageUrl))+'" alt="'+escapeHtml(name)+'" onerror="this.outerHTML=\'<div class=&quot;item-icon-thumb item-icon-empty&quot;><i class=&quot;fa-solid fa-image&quot;></i></div>\'">'
                : '<div class="item-icon-thumb item-icon-empty"><i class="fa-solid fa-image"></i></div>';
            var sourceText = item.source === 'icon' ? 'Icon riêng' : (item.source === 'catalog' ? 'Danh mục game' : 'Webshop');
            var sourceBadge = '<span class="badge rounded-pill '+(item.source === 'icon' ? 'bg-info' : 'bg-primary')+' item-icon-source">'+sourceText+'</span>';
            var deleteButton = item.source === 'icon'
                ? '<button class="btn btn-sm btn-light border fw-bold text-danger" onclick="deleteItemIcon(\''+jsString(itemId)+'\')" title="Xóa icon riêng"><i class="fa-solid fa-trash"></i></button>'
                : '<button class="btn btn-sm btn-light border fw-bold text-muted" disabled title="Ảnh Webshop sửa trong tab Webshop"><i class="fa-solid fa-lock"></i></button>';
            html += '<tr>'
                + '<td>'+img+'</td>'
                + '<td class="text-start"><div class="fw-black text-dark">'+escapeHtml(name)+'</div><div class="small text-muted fw-bold">ID '+escapeHtml(rawId)+' <span class="text-secondary">('+escapeHtml(itemId)+')</span></div></td>'
                + '<td>'+sourceBadge+'</td>'
                + '<td class="small fw-bold text-muted">'+escapeHtml(item.updated_at || 'Chưa rõ')+'</td>'
                + '<td><div class="btn-group"><button class="btn btn-sm btn-light border fw-bold text-primary" onclick="editItemIcon(\''+jsString(itemId)+'\')" title="Sửa icon"><i class="fa-solid fa-pen"></i></button>'+deleteButton+'</div></td>'
                + '</tr>';
        });
        $('#itemIconTableBody').html(html);
        initTooltips('#itemIconTableBody');
    }

    function loadItemIcons() {
        if (!$('#itemIconTableBody').length) return;
        $('#itemIconTableBody').html(tableLoadingRow(5, 'Đang tải icon item...'));
        $.post("admin_api.php", { action: 'get_item_icons' }, function(r) {
            if(r.status !== 'success') {
                $('#itemIconTableBody').html(tableErrorRow(5, r.message || 'Không tải được icon item.'));
                return;
            }
            itemIconCache = r.data || [];
            $.each(itemIconCache, function(i, item) {
                if (item.image_url) setAdminItemIcon(item.item_id, item.image_url);
            });
            renderItemIconRows();
        }, 'json');
    }

    function resetItemIconForm() {
        if ($('#itemIconForm').length && $('#itemIconForm')[0]) $('#itemIconForm')[0].reset();
        $('#icon_item_select').val(null).trigger('change');
        $('#icon_item_name').val('').attr('data-auto-name', '1');
        $('#icon_image_url').val('');
        updateIconImagePreview('');
    }

    function editItemIcon(itemId) {
        var rawId = rewardKeyToId(itemId);
        var item = itemIconCache.find(function(row) {
            return String(row.item_id) === String(itemId) || String(row.raw_id || rewardKeyToId(row.item_id)) === rawId;
        }) || {};
        var $select = $('#icon_item_select');
        var selectedValue = '';
        adminItemKeyVariants(itemId).some(function(value) {
            if ($select.find('option').filter(function(){ return this.value === value; }).length) {
                selectedValue = value;
                return true;
            }
            return false;
        });
        if (selectedValue) $select.val(selectedValue).trigger('change');
        $('#icon_item_name').val(item.item_name || getAdminItemName(itemId, 'Vật phẩm ID ' + rawId)).attr('data-auto-name', '0');
        var imageUrl = item.image_url || getAdminItemIcon(itemId);
        $('#icon_image_url').val(imageUrl);
        updateIconImagePreview(imageUrl);
        $('.menu-btn[data-tab="tab-item-icons"]').trigger('click');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function deleteItemIcon(itemId) {
        appConfirmDanger({ title:'Xóa icon riêng?', text:'Ảnh riêng sẽ bị xóa khỏi hệ thống icon chung. Nếu Webshop còn ảnh thì ảnh Webshop vẫn làm dự phòng.', confirmText:'Xóa icon' }).then(function(result){
            if(!result.isConfirmed) return;
            $.post("admin_api.php", { action: 'delete_item_icon', item_id: itemId }, function(r) {
                if(r.status === 'success') {
                    appToast('success', 'Đã xóa', r.message);
                    removeAdminItemIcon(itemId);
                    loadItemIcons();
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });
    }

    function resetWebshopForm() {
        $('#webshopForm')[0].reset();
        $('#shop_id').val('');
        shopBundleItems=[];$('#shop_product_mode').val('single');updateShopProductMode();
        $('#shop_item_name').attr('data-auto-name', '1');
        $('#shop_item_select').val(null).trigger('change');
        $('#shop_is_active').prop('checked', true);
        $('#shop_is_active_value').val(1);
        updateShopImagePreview('');
    }

    function editWebshopItem(id) {
        var item = webshopCache.find(function(row){ return Number(row.id) === Number(id); });
        if(!item) return;
        $('#shop_id').val(item.id);
        $('#shop_item_select').val('item_' + item.item_id).trigger('change');
        $('#shop_item_name').val(item.item_name).attr('data-auto-name', '0');
        $('#shop_price').val(item.price);
        $('#shop_item_amount').val(item.item_amount || 1);
        $('#shop_sort_order').val(item.sort_order);
        $('#shop_image_url').val(item.image_url);
        updateShopImagePreview(item.image_url);
        $('#shop_is_active').prop('checked', Number(item.is_active) === 1);
        $('#shop_is_active_value').val(Number(item.is_active) === 1 ? 1 : 0);
        shopBundleItems = item.reward_items ? (item.bundle_rewards||[]).map(function(r){return{id:Number(r.id),amount:Number(r.amount)};}) : [];
        $('#shop_product_mode').val(item.reward_items?'bundle':'single');updateShopProductMode();
        $('#webshopEditTitle').text('Sửa Webshop #' + item.id);
        bootstrap.Modal.getOrCreateInstance(document.getElementById('webshopEditModal')).show();
    }

    function toggleWebshopItem(id, value) {
        $.post("admin_api.php", { action: 'toggle_webshop_item', id: id, value: value }, function(r) {
            if(r.status === 'success') loadWebshopItems();
            else Swal.fire('Lỗi!', r.message, 'error');
        }, 'json');
    }

    function deleteWebshopItem(id) {
        appConfirmDanger({ title:'Xóa vật phẩm Webshop?', text:'Vật phẩm sẽ bị xóa khỏi danh sách Webshop.', confirmText:'Xóa vật phẩm' }).then(function(result){
            if(!result.isConfirmed) return;
            $.post("admin_api.php", { action: 'delete_webshop_item', id: id }, function(r) {
                if(r.status === 'success') { appToast('success', 'Đã xóa', r.message); loadWebshopItems(); }
                else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });
    }

    function updateMilestonePreview() {
        var j = JSON.stringify(milestoneItems);
        $('#milestoneJsonPreview').text(j);
        $('#milestone_json_input').val(j);
        var box = $('#milestonePreviewBox').empty();
        if(Object.keys(milestoneItems).length === 0) box.html('<span class="text-muted fw-bold">Chưa thêm quà...</span>');
        else $.each(milestoneItems, function(id, amt) {
            box.append('<div class="d-inline-block position-relative me-1 mb-1">'+rewardCardHtml(id, amt)+'<button type="button" class="btn btn-sm btn-danger rounded-circle position-absolute top-0 end-0" style="width:24px;height:24px;padding:0;transform:translate(35%,-35%)" onclick="removeMilestoneItem(\''+jsString(id)+'\');"><i class="fa-solid fa-xmark"></i></button></div>');
        });
    }

    var donateAdminPeriod = 'day';
    function selectDonatePeriod(period) {
        if (['day','week','month','total','event'].indexOf(period) === -1) period = 'day';
        donateAdminPeriod = period;
        $('[data-donate-period]').each(function() {
            var active = $(this).attr('data-donate-period') === period;
            $(this).toggleClass('active', active).attr('aria-selected', active ? 'true' : 'false');
        });
        $('#donateMilestonePanel').prop('hidden', period === 'event');
        $('#tab-recharge-events-admin').prop('hidden', period !== 'event');
        if (period === 'event') loadRechargeEvents(); else loadRechargeMilestones();
    }
    $(document).on('click', '[data-donate-period]', function() { selectDonatePeriod($(this).attr('data-donate-period')); });
    function showDonateEditor(id, title) {
        var modal = document.getElementById(id);
        // Keep overlays outside hidden tabs and transformed layout containers.
        $(modal).appendTo(document.body);
        $(modal).find('.modal-title').text(title);
        if ($.fn.select2) $(modal).find('.select2-hidden-accessible').select2('destroy');
        initAdminSelects();
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }
    function openNewDonateMilestone() {
        resetMilestoneForm();
        showDonateEditor('donateMilestoneModal', 'Thêm mốc — ' + rechargePeriodLabels[donateAdminPeriod]);
    }
    function openNewDonateEvent() {
        resetRechargeEventForm();
        showDonateEditor('donateEventModal', 'Thêm sự kiện có hạn');
    }
    function normalizeDonateEditorItems(raw) {
        var result = {};
        var items = typeof raw === 'string' ? JSON.parse(raw) : raw;
        $.each(items || {}, function(key, value) {
            var row = value && typeof value === 'object';
            var id = String(row ? (value.item_id || value.id || '') : key).replace(/^item_/, '');
            var amount = Number(row ? value.amount : value);
            if (/^\d+$/.test(id) && Number.isSafeInteger(amount) && amount > 0) {
                var itemKey = 'item_' + id;
                result[itemKey] = (result[itemKey] || 0) + amount;
            }
        });
        return result;
    }
    function donateCompactRewardsHtml(raw, title) {
        var items;
        try { items = normalizeDonateEditorItems(raw); }
        catch (e) { return '<span class="text-danger small">Không đọc được quà</span>'; }
        var ids = Object.keys(items);
        if (!ids.length) return '<span class="text-muted small">Chưa có quà</span>';
        var html = '<div class="donate-reward-compact"><div class="donate-reward-icons">';
        ids.slice(0, 4).forEach(function(id) {
            var amount = items[id];
            var full = Number(amount).toLocaleString('vi-VN');
            var short = amount >= 1000000 && amount % 1000000 === 0 ? (amount / 1000000) + 'M'
                : (amount >= 1000 && amount % 1000 === 0 ? (amount / 1000) + 'K' : full);
            var name = getAdminItemName(id, 'Vật phẩm ID ' + rewardKeyToId(id));
            var label = name + ' · ID ' + rewardKeyToId(id) + ' · ×' + full;
            var icon = resolveItemImageUrl(getAdminItemIcon(id)) || '../assets/images/logo.png';
            html += '<span class="donate-reward-icon" title="' + escapeHtml(label) + '"><img src="' + escapeHtml(icon) + '" alt="' + escapeHtml(name) + '" loading="lazy" onerror="this.onerror=null;this.src=\'../assets/images/logo.png\'"><b>×' + escapeHtml(short) + '</b></span>';
        });
        html += '</div><button type="button" class="donate-reward-view" data-title="' + escapeHtml(title || 'Chi tiết quà')
            + '" data-rewards="' + encodeURIComponent(JSON.stringify(items)) + '" onclick="showAdminRewardDetail(this)">'
            + (ids.length > 4 ? '+' + (ids.length - 4) + ' vật phẩm · ' : '') + 'Xem đủ ' + ids.length + ' quà</button>';
        // Preserve searching by names/IDs for items hidden from the compact preview.
        html += '<span class="visually-hidden">' + escapeHtml(ids.map(function(id) {
            return getAdminItemName(id, id) + ' ' + rewardKeyToId(id);
        }).join(' ')) + '</span></div>';
        return html;
    }
    function loadRechargeMilestones() {
        $('#milestoneTableBody').html(tableLoadingRow(5, 'Đang tải mốc Donate...'));
        $.post("admin_api.php", { action: 'get_recharge_milestones' }, function(r) {
            if(r.status !== 'success') {
                $('#milestoneTableBody').html(tableErrorRow(5, r.message || 'Không tải được mốc Donate.'));
                return;
            }
            milestoneCache = r.data || [];
            var rows = milestoneCache.filter(function(row) { return (row.period_type || 'total') === donateAdminPeriod; });
            $('#donateListTitle').text(rechargePeriodLabels[donateAdminPeriod] || 'Mốc Donate');
            var html = '';
            if(rows.length === 0) html = tableEmptyRow(5, 'Chưa có mốc cho kỳ này.', 'fa-medal');
            else $.each(rows, function(i, row) {
                var rewards = donateCompactRewardsHtml(row.reward_items, row.title);
                var status = Number(row.is_active) === 1 ? '<span class="badge bg-success rounded-pill px-3 py-2">Đang bật</span>' : '<span class="badge bg-secondary rounded-pill px-3 py-2">Đã tắt</span>';
                var toggleText = Number(row.is_active) === 1 ? 'Tắt' : 'Bật';
                var periodLabel = rechargePeriodLabels[row.period_type || 'total'] || rechargePeriodLabels.total;
                html += '<tr><td class="text-start"><div class="fw-black text-dark">'+escapeHtml(row.title)+'</div><div class="small text-warning fw-black">'+formatMoney(row.milestone_amount)+'</div><span class="badge bg-info bg-opacity-10 text-info border border-info rounded-pill mt-2">'+escapeHtml(periodLabel)+'</span></td><td class="text-start">'+rewards+'</td><td>'+escapeHtml(row.sort_order)+'</td><td>'+status+'</td><td><div class="btn-group"><button class="btn btn-sm btn-light border fw-bold text-primary" onclick="editMilestone('+row.id+')" title="Sửa mốc"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-light border fw-bold text-warning" onclick="toggleMilestone('+row.id+', '+(Number(row.is_active) === 1 ? 0 : 1)+')" title="'+toggleText+' mốc">'+toggleText+'</button><button class="btn btn-sm btn-light border fw-bold text-danger" onclick="deleteMilestone('+row.id+')" title="Xóa mốc"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
            });
            $('#milestoneTableBody').html(html);
            $('#milestonesSearchFilter').trigger('input');
            initTooltips('#milestoneTableBody');
        }, 'json');
    }

    function resetMilestoneForm() {
        $('#milestoneForm')[0].reset();
        $('#milestone_id').val('');
        $('#milestone_period_type').val(donateAdminPeriod === 'event' ? 'day' : donateAdminPeriod);
        $('#milestone_builder_item').val(null).trigger('change');
        $('#milestone_is_active').prop('checked', true);
        $('#milestone_is_active_value').val(1);
        milestoneItems = {};
        updateMilestonePreview();
    }

    function editMilestone(id) {
        var row = milestoneCache.find(function(item){ return Number(item.id) === Number(id); });
        if(!row) return;
        $('#milestone_id').val(row.id);
        $('#milestone_period_type').val(row.period_type || 'total');
        $('#milestone_title').val(row.title);
        $('#milestone_amount').val(row.milestone_amount);
        $('#milestone_sort_order').val(row.sort_order);
        $('#milestone_is_active').prop('checked', Number(row.is_active) === 1);
        $('#milestone_is_active_value').val(Number(row.is_active) === 1 ? 1 : 0);
        try { milestoneItems = normalizeDonateEditorItems(row.reward_items); } catch(e) { milestoneItems = {}; }
        updateMilestonePreview();
        showDonateEditor('donateMilestoneModal', 'Sửa mốc — ' + row.title);
    }

    function toggleMilestone(id, value) {
        $.post("admin_api.php", { action: 'toggle_recharge_milestone', id: id, value: value }, function(r) {
            if(r.status === 'success') loadRechargeMilestones();
            else Swal.fire('Lỗi!', r.message, 'error');
        }, 'json');
    }

    function deleteMilestone(id) {
        appConfirmDanger({ title:'Xóa mốc Donate?', text:'Lịch sử đã nhận của mốc này cũng sẽ bị xóa.', confirmText:'Xóa mốc' }).then(function(result){
            if(!result.isConfirmed) return;
            $.post("admin_api.php", { action: 'delete_recharge_milestone', id: id }, function(r) {
                if(r.status === 'success') { appToast('success', 'Đã xóa', r.message); loadRechargeMilestones(); }
                else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });
    }

    var rechargeEventTiers = [];
    var rechargeEventCache = [];
    var rechargeEventItemEdit = null;
    var rechargeEventAddLabel = $('#addRechargeEventTier').html();
    $('#addRechargeEventTier').after('<button type="button" id="cancelRechargeEventItemEdit" class="btn btn-outline-secondary w-100 mt-2" hidden>Hủy sửa item</button><div id="rechargeEventItemEditHint" class="small text-primary mt-2" role="status" hidden></div>');
    function cancelRechargeEventItemEdit() {
        rechargeEventItemEdit = null;
        $('#recharge_event_tier_amount').prop('disabled', false);
        $('#recharge_event_item').val(null).trigger('change');
        $('#recharge_event_item_amount').val(1).removeAttr('max');
        $('#addRechargeEventTier').html(rechargeEventAddLabel);
        $('#cancelRechargeEventItemEdit,#rechargeEventItemEditHint').prop('hidden', true);
    }
    $('#cancelRechargeEventItemEdit').on('click', cancelRechargeEventItemEdit);
    window.editRechargeEventItem = function(index, id) {
        var row = rechargeEventTiers[Number(index)];
        id = String(id);
        if (!row || !Object.prototype.hasOwnProperty.call(row.items, id)) return;
        rechargeEventItemEdit = { row: row, id: id };
        $('#recharge_event_tier_amount').val(row.amount).prop('disabled', true);
        $('#recharge_event_item').val('item_' + id).trigger('change');
        $('#recharge_event_item_amount').val(row.items[id]);
        $('#addRechargeEventTier').text('Cập nhật item');
        $('#cancelRechargeEventItemEdit,#rechargeEventItemEditHint').prop('hidden', false);
        $('#rechargeEventItemEditHint').text('Đang sửa ID ' + id + ' · mốc ' + formatMoney(row.amount) + '. Cập nhật rồi bấm Lưu sự kiện.');
        document.getElementById('recharge_event_item_amount').scrollIntoView({block:'center', behavior:'smooth'});
        $('#recharge_event_item_amount').trigger('focus');
    };
    window.removeRechargeEventItem = function(index, id) {
        var row = rechargeEventTiers[Number(index)];
        id = String(id);
        if (!row || !Object.prototype.hasOwnProperty.call(row.items, id)) return;
        if (rechargeEventItemEdit && rechargeEventItemEdit.row === row && rechargeEventItemEdit.id === id) cancelRechargeEventItemEdit();
        delete row.items[id];
        updateRechargeEventTierPreview();
    };
    function eventTierJson() {
        return rechargeEventTiers.map(function(row, index) {
            return { id: Number(row.id || 0), amount: Number(row.amount || 0), items: Object.keys(row.items || {}).map(function(id) { return { item_id: Number(id), amount: Number(row.items[id] || 0) }; }) };
        });
    }
    function updateRechargeEventTierPreview() {
        var json = eventTierJson();
        $('#recharge_event_tiers_json').val(JSON.stringify(json));
        $('#rechargeEventTiersPreview').text(JSON.stringify(json));
        var box = $('#rechargeEventTierPreview').empty();
        if (!rechargeEventTiers.length) { box.html('<span class="text-muted fw-bold">Chưa thêm mốc...</span>'); return; }
        rechargeEventTiers.forEach(function(row, index) {
            var rewards = ''; Object.keys(row.items || {}).forEach(function(id) {
                if (!/^\d+$/.test(id)) return;
                rewards += '<div style="min-width:0">' + rewardCardHtml(id, row.items[id]) + '<div class="d-flex gap-2 mt-1"><button type="button" class="btn btn-sm btn-outline-primary" aria-label="Sửa item ' + id + '" onclick="editRechargeEventItem(' + index + ',\'' + id + '\')">Sửa</button><button type="button" class="btn btn-sm btn-outline-danger" aria-label="Xóa item ' + id + '" onclick="removeRechargeEventItem(' + index + ',\'' + id + '\')">Xóa</button></div></div>';
            });
            if (!rewards) rewards = '<span class="text-danger small">Mốc chưa có item. Thêm item vào mốc này hoặc xóa mốc trước khi lưu.</span>';
            box.append('<div class="border rounded-3 p-2 mb-2 bg-light"><div class="d-flex align-items-center justify-content-between gap-2 mb-2"><b class="text-danger">Nạp ' + formatMoney(row.amount) + '</b><button type="button" class="btn btn-sm btn-outline-danger flex-shrink-0" onclick="removeRechargeEventTier(' + index + ')">Xóa mốc</button></div><div class="admin-reward-grid mt-1" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))">' + rewards + '</div></div>');
        });
    }
    window.removeRechargeEventTier = function(index) {
        index = Number(index);
        if (!Number.isInteger(index) || index < 0 || index >= rechargeEventTiers.length) return;
        if (rechargeEventItemEdit && rechargeEventItemEdit.row === rechargeEventTiers[index]) cancelRechargeEventItemEdit();
        rechargeEventTiers.splice(index, 1); updateRechargeEventTierPreview();
    };
    function resetRechargeEventForm() {
        cancelRechargeEventItemEdit();
        $('#rechargeEventForm')[0].reset(); $('#recharge_event_id').val(''); $('#recharge_event_edit_version').val('0'); $('#recharge_event_banner_path').val(''); $('#recharge_event_is_active').prop('checked', true); $('#recharge_event_is_active_value').val('1'); $('#recharge_event_banner_preview').attr('src','').addClass('d-none'); $('#recharge_event_item').val(null).trigger('change'); rechargeEventTiers = []; updateRechargeEventTierPreview();
    }
    function loadRechargeEvents() {
        $('#rechargeEventTableBody').html(tableLoadingRow(5, 'Đang tải sự kiện...'));
        $.post('admin_api.php', { action: 'get_recharge_events' }, function(r) {
            if (r.status !== 'success') { $('#rechargeEventTableBody').html(tableErrorRow(5, r.message || 'Không tải được sự kiện.')); return; }
            rechargeEventCache = r.data || []; var html = '';
            if (!rechargeEventCache.length) html = tableEmptyRow(5, 'Chưa có sự kiện nạp.', 'fa-bolt');
            else $.each(rechargeEventCache, function(_, row) {
                var tiers = Array.isArray(row.tiers) ? row.tiers : [];
                var status = Number(row.is_active) === 1 ? '<span class="badge bg-success rounded-pill">Đang bật</span>' : '<span class="badge bg-secondary rounded-pill">Đã tắt</span>';
                var toggle = Number(row.is_active) === 1 ? 'Tắt' : 'Bật';
                html += '<tr><td class="text-start"><div class="fw-black">' + escapeHtml(row.title) + '</div><div class="small text-muted">#' + Number(row.id) + '</div></td><td class="small fw-bold">' + escapeHtml(row.starts_at) + '<br>→ ' + escapeHtml(row.ends_at) + '</td><td><span class="badge bg-info text-dark rounded-pill">' + tiers.length + ' mốc</span></td><td>' + status + '</td><td><div class="btn-group"><button class="btn btn-sm btn-light border fw-bold text-primary" onclick="editRechargeEvent(' + Number(row.id) + ')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-light border fw-bold text-warning" onclick="toggleRechargeEvent(' + Number(row.id) + ',' + (Number(row.is_active) === 1 ? 0 : 1) + ')">' + toggle + '</button><button class="btn btn-sm btn-light border fw-bold text-danger" onclick="deleteRechargeEvent(' + Number(row.id) + ')"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
            });
            $('#rechargeEventTableBody').html(html); initTooltips('#rechargeEventTableBody');
        }, 'json');
    }
    window.editRechargeEvent = function(id) {
        var row = rechargeEventCache.find(function(x) { return Number(x.id) === Number(id); }); if (!row) return;
        cancelRechargeEventItemEdit();
        $('#recharge_event_id').val(row.id); $('#recharge_event_edit_version').val(row.edit_version || 0); $('#recharge_event_title').val(row.title || ''); $('#recharge_event_starts_at').val(String(row.starts_at || '').replace(' ', 'T').slice(0,16)); $('#recharge_event_ends_at').val(String(row.ends_at || '').replace(' ', 'T').slice(0,16)); $('#recharge_event_is_active').prop('checked', Number(row.is_active) === 1); $('#recharge_event_is_active_value').val(Number(row.is_active) === 1 ? 1 : 0); $('#recharge_event_banner_path').val(row.banner_path || ''); if (row.banner_path) $('#recharge_event_banner_preview').attr('src','../' + row.banner_path + '?v=' + Date.now()).removeClass('d-none');
        rechargeEventTiers = (row.tiers || []).map(function(t) { var items = {}; (t.items || []).forEach(function(i) { items[String(i.item_id)] = Number(i.amount); }); return { id: Number(t.id || 0), amount: Number(t.amount), items: items }; }); updateRechargeEventTierPreview(); showDonateEditor('donateEventModal', 'Sửa sự kiện — ' + row.title);
    };
    window.toggleRechargeEvent = function(id, value) {
        var row = rechargeEventCache.find(function(x) { return Number(x.id) === Number(id); });
        if (!row) return;
        $.post('admin_api.php', {action:'toggle_recharge_event',id:id,value:value,edit_version:row.edit_version}, function(r) {
            if (r.status === 'success') loadRechargeEvents(); else Swal.fire('Lỗi!', r.message, 'error');
        }, 'json');
    };
    window.deleteRechargeEvent = function(id) {
        appConfirmDanger({title:'Tắt sự kiện?',text:'Lịch sử nhận và quà chờ giao được giữ lại.',confirmText:'Tắt sự kiện'}).then(function(r) {
            if (r.isConfirmed) window.toggleRechargeEvent(id, 0);
        });
    };
    $('#addRechargeEventTier').on('click', function(){
        var amount = Number($('#recharge_event_tier_amount').val()), key = String($('#recharge_event_item').val()||'').replace(/^item_/,'');
        var itemAmount = Number($('#recharge_event_item_amount').val());
        if(!Number.isSafeInteger(amount)||amount<1||!/^\d+$/.test(key)||Number(key)<1||!Number.isSafeInteger(itemAmount)||itemAmount<1){Swal.fire('Thiếu dữ liệu','Nhập mức nạp, chọn item và số lượng nguyên dương.','warning');return;}
        if (rechargeEventItemEdit) {
            var editing = rechargeEventItemEdit, row = editing.row;
            if (rechargeEventTiers.indexOf(row) < 0 || !Object.prototype.hasOwnProperty.call(row.items, editing.id)) { cancelRechargeEventItemEdit(); return; }
            if (key !== editing.id && Object.prototype.hasOwnProperty.call(row.items, key)) { Swal.fire('Item đã có','Item này đã có trong mốc. Hãy sửa trực tiếp item đó để tránh ghi đè.','warning'); return; }
            delete row.items[editing.id]; row.items[key] = itemAmount;
            cancelRechargeEventItemEdit();
        } else {
            var existing = rechargeEventTiers.find(function(x){return Number(x.amount)===amount;});
            var total = (existing && existing.items[key] || 0) + itemAmount;
            if (!Number.isSafeInteger(total)) { Swal.fire('Số lượng quá lớn','Tổng số lượng vượt giới hạn số nguyên an toàn.','warning'); return; }
            if(!existing){existing={amount:amount,items:{}};rechargeEventTiers.push(existing);}
            existing.items[key]=total; rechargeEventTiers.sort(function(a,b){return a.amount-b.amount;});
            $('#recharge_event_item').val(null).trigger('change'); $('#recharge_event_item_amount').val(1);
        }
        updateRechargeEventTierPreview();
    });
    $('#resetRechargeEventForm').on('click', resetRechargeEventForm);
    $('#recharge_event_is_active').on('change', function(){ $('#recharge_event_is_active_value').val(this.checked?1:0); });
    $('#rechargeEventForm').on('submit', function(e){ e.preventDefault();
        if (rechargeEventItemEdit) { Swal.fire('Chưa cập nhật item','Bấm Cập nhật item hoặc Hủy sửa item trước khi lưu sự kiện.','warning'); return; }
        if (rechargeEventTiers.some(function(row) { return !Object.keys(row.items || {}).length; })) { Swal.fire('Mốc chưa có item','Thêm ít nhất một item vào mỗi mốc hoặc xóa mốc rỗng trước khi lưu.','warning'); return; }
        updateRechargeEventTierPreview(); var form=this; appLoading('Đang lưu sự kiện...'); $.post('admin_api.php',$(form).serialize(),function(r){Swal.close();if(r.status==='success'){bootstrap.Modal.getOrCreateInstance(document.getElementById('donateEventModal')).hide();appToast('success','Đã lưu sự kiện',r.message);resetRechargeEventForm();loadRechargeEvents();}else Swal.fire('Lỗi!',r.message,'error');},'json').fail(function(){Swal.close();Swal.fire('Lỗi!','Không kết nối được server.','error');}); });
    $('#uploadRechargeEventBanner').on('click', function(){ var input=$('#recharge_event_banner_file')[0]; if(!input||!input.files||!input.files.length){Swal.fire('Thiếu ảnh','Chọn banner trước khi upload.','warning');return;} var fd=new FormData();fd.append('action','upload_recharge_event_banner');fd.append('image_file',input.files[0]);appLoading('Đang upload banner...');$.ajax({url:'admin_api.php',method:'POST',data:fd,processData:false,contentType:false,dataType:'json'}).done(function(r){Swal.close();if(r.status==='success'){$('#recharge_event_banner_path').val(r.path||'');$('#recharge_event_banner_preview').attr('src',r.url||'').removeClass('d-none');appToast('success','Đã upload banner','Bấm Lưu sự kiện để ghi cấu hình.');}else Swal.fire('Lỗi!',r.message,'error');}).fail(function(){Swal.close();Swal.fire('Lỗi!','Không kết nối được server.','error');}); });

    function loadLuckyWheelHistory(){$('#luckyWheelHistoryTableBody').html(tableLoadingRow(4,'Đang tải lịch sử quay...'));$.post('admin_api.php',{action:'get_lucky_wheel_history'},function(r){if(window.lhsWebContext&&window.lhsWebContext.handleResponse(r))return;if(r.status!=='success'){$('#luckyWheelHistoryTableBody').html(tableErrorRow(4,r.message||'Không tải được lịch sử.'));return;}var rows=r.data||[],html='';if(rows.length===0)html=tableEmptyRow(4,'Chưa có lượt quay nào.','fa-clock-rotate-left');else $.each(rows,function(_,row){var value=row.prize_type==='item'?('ID '+escapeHtml(row.item_id)+' × '+formatNumber(row.item_amount)):(row.prize_type==='message'?'Không phát vật phẩm':(formatNumber(row.xu_amount)+' Xu Web'));var delivery=row.prize_type==='message'?'<span class="badge bg-info text-dark rounded-pill">Thông báo</span>':(row.delivery_status==='delivered'?'<span class="badge bg-success rounded-pill">Đã phát</span>':'<span class="badge bg-warning text-dark rounded-pill" title="'+escapeHtml(row.last_error||'Đang chờ gửi thư')+'">Chờ gửi thư</span>');html+='<tr><td class="small fw-bold">'+escapeHtml(row.created_at)+'</td><td><div class="fw-black">'+escapeHtml(row.account_name)+'</div><div class="small text-muted">S'+escapeHtml(row.server_id)+'</div></td><td class="text-start"><div class="fw-black text-dark">'+escapeHtml(row.prize_title)+'</div><div class="small text-muted">'+value+'</div></td><td>'+delivery+'</td></tr>';});$('#luckyWheelHistoryTableBody').html(html);initTooltips('#luckyWheelHistoryTableBody');},'json').fail(function(){$('#luckyWheelHistoryTableBody').html(tableErrorRow(4,'Không kết nối được máy chủ.'));});}

    function openVipModal(acc) { $('#vip_acc').val(acc); $('#vip_acc_text').text(acc); $('#vipModal').modal('show'); }
    function openPwdModal(acc) { $('#pwd_acc').val(acc); $('#pwd_acc_text').text(acc); $('#pwdModal').modal('show'); }
    function syncXuRechargeInput() {
        var enabled = $('#xu_add_recharge').prop('checked');
        $('#xuRechargeFields').prop('hidden', !enabled);
        $('#xu_recharge_amount').prop('disabled', !enabled);
        if (enabled && !$('#xu_recharge_amount').val()) $('#xu_recharge_amount').val($('#xuModal input[name="amount"]').val() || '');
    }
    function openXuGuide() { $('#xuGuideModal').modal('show'); }
    function openXuModal(acc, currentXu, currentRecharge) {
        $('#xu_acc').val(acc); $('#xu_acc_text').text(acc); $('#xu_current').text(Number(currentXu || 0).toLocaleString('vi-VN'));
        $('#xu_recharge_current').text(Number(currentRecharge || 0).toLocaleString('vi-VN'));
        $('#xu_add_recharge').prop('checked', false); $('#xu_recharge_amount').val('').prop('disabled', true); $('#xuRechargeFields').prop('hidden', true);
        $('#xu_add_recharge').off('change.xu').on('change.xu', syncXuRechargeInput);
        $('#xuModal').modal('show');
    }

    function submitGmForm(btn, confirmMsg) {
        var $form = $(btn).closest('form');
        var target=typeof lhsAdminTarget==='function'?lhsAdminTarget():null;
        if(!target){Swal.fire('Chưa chọn nhân vật','Nhập tài khoản, UID hoặc tên ở ô mục tiêu và chờ nhận diện. Nếu có nhiều kết quả, chọn một nhân vật.','warning');return;}
        var role_id=target.role_id;
        $form.find('.hidden_uid').val(role_id);
        if(!$form.find('[name="target_query"]').length)$form.append($('<input>').attr({type:'hidden',name:'target_query'}));
        $form.find('[name="target_query"]').val(target.query);
        
        var gmPayload=$form.serialize();
        var executeSubmit = function() {
            if(window.lhsWebContext && window.lhsWebContext.isExpired())return;
            var liveTarget=typeof lhsAdminTarget==='function'?lhsAdminTarget():null;
            if(!liveTarget||liveTarget.role_id!==target.role_id||liveTarget.query!==target.query){Swal.fire('Mục tiêu đã thay đổi','Kiểm tra lại nhân vật nhận rồi gửi lại.','warning');return;}
            appLoading('Đang gửi lệnh GM...');
            $.post("admin_api.php", gmPayload, function(r) {
                if(r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Thành công', r.message);
                    loadOverview();
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        };
        
        if (confirmMsg) {
            appConfirmDanger({ title: 'Xác nhận thao tác?', text: confirmMsg+'\nNhân vật: '+target.label+' · UID '+target.role_id }).then(function(result) {
                if (result.isConfirmed) executeSubmit();
            });
        } else {
            executeSubmit();
        }
    }

    function formatNumber(value) {
        var raw = String(value == null ? 0 : value).trim();
        if (/^\d+$/.test(raw) && raw.length > 15) {
            raw = raw.replace(/^0+(?=\d)/, '');
            return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
        return Number(value || 0).toLocaleString('vi-VN');
    }
    function formatMoney(value) {
        return formatNumber(Number(value || 0)) + ' đ';
    }
    function escapeHtml(value) {
        return $('<div>').text(value == null ? '' : value).html();
    }
    function jsString(value) {
        return String(value == null ? '' : value)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r?\n/g, ' ')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function clampPage(page, totalPages) {
        totalPages = Math.max(1, Number(totalPages || 1));
        page = parseInt(page, 10);
        if (!page || page < 1) page = 1;
        if (page > totalPages) page = totalPages;
        return page;
    }

    window.adminGoPage = function(input, loaderName) {
        var $box = $(input).closest('.pagination-box');
        var totalPages = Number($box.attr('data-total-pages') || 1);
        var page = clampPage($box.find('.pagination-jump-input').val(), totalPages);
        if (typeof window[loaderName] === 'function') window[loaderName](page);
    };

    function renderCompactPagination(selector, totalPages, currentPage, loaderName) {
        totalPages = Math.max(1, Number(totalPages || 1));
        currentPage = clampPage(currentPage, totalPages);
        var prevPage = clampPage(currentPage - 1, totalPages);
        var nextPage = clampPage(currentPage + 1, totalPages);
        var prevDisabled = currentPage <= 1 ? ' disabled' : '';
        var nextDisabled = currentPage >= totalPages ? ' disabled' : '';
        var html = ''
            + '<div class="pagination-status">Trang <b>' + currentPage + '</b> / ' + totalPages + '</div>'
            + '<button type="button" class="pagination-nav" onclick="' + loaderName + '(' + prevPage + ')"' + prevDisabled + '><i class="fa-solid fa-chevron-left"></i><span>Trước</span></button>'
            + '<button type="button" class="active page-current" onclick="' + loaderName + '(' + currentPage + ')">' + currentPage + '</button>'
            + '<button type="button" class="pagination-nav" onclick="' + loaderName + '(' + nextPage + ')"' + nextDisabled + '><span>Sau</span><i class="fa-solid fa-chevron-right"></i></button>'
            + "<div class=\"pagination-jump\"><span>Đi tới</span><input type=\"number\" class=\"pagination-jump-input\" min=\"1\" max=\"" + totalPages + "\" value=\"" + currentPage + "\" onkeydown=\"if(event.key==='Enter') adminGoPage(this, '" + loaderName + "')\"><button type=\"button\" class=\"pagination-go\" onclick=\"adminGoPage(this, '" + loaderName + "')\">Đi</button></div>";
        $(selector)
            .attr('data-current-page', currentPage)
            .attr('data-total-pages', totalPages)
            .html(html);
    }
    function removeGiftcodeItem(id) {
        delete giftcodeItems[id];
        updateJsonPreview();
    }
    function removeMilestoneItem(id) {
        delete milestoneItems[id];
        updateMilestonePreview();
    }

    function loadOverview() {
        $.post("admin_api.php", { action: 'get_overview' }, function(r) {
            if(r.status !== 'success') {
                $('#topRechargeList, #recentOrderList, #recentGmLogList').html('<div class="text-danger fw-bold py-3">'+escapeHtml(r.message || 'Không tải được dữ liệu.')+'</div>');
                return;
            }

            var s = r.stats || {};
            $('#statTotalAccounts').text(formatNumber(s.total_accounts));
            $('#statTotalRecharge').text(formatMoney(s.total_recharge));
            $('#statTodayRecharge').text(formatMoney(s.today_recharge));
            $('#statPaidOrders').text(formatNumber(s.paid_orders));
            $('#statPendingOrders').text(formatNumber(s.pending_orders));
            $('#statTotalXu').text(formatNumber(s.total_xu));
            $('#statVipTotal').html(formatNumber(s.vip_total) + '<small class="d-block text-muted fw-bold mt-1">Còn ' + formatNumber(s.vip_unused) + ' mã chưa dùng</small>');
            $('#statGiftcodeTotal').html(formatNumber(s.giftcode_total) + '<small class="d-block text-muted fw-bold mt-1">' + formatNumber(s.giftcode_public) + ' mã đang hiện</small>');

            var topHtml = '';
            if(!r.top_recharge || r.top_recharge.length === 0) topHtml = panelEmpty('Chưa có tài khoản Donate.', 'fa-ranking-star');
            else $.each(r.top_recharge, function(i, row) {
                topHtml += '<div class="overview-row"><div><span class="text-dark">'+escapeHtml(row.account)+'</span><small>S'+escapeHtml(row.server_id || '-')+' · '+formatNumber(row.orders)+' lượt Donate đã xác nhận</small></div><b class="text-warning">'+formatMoney(row.total_money)+'</b></div>';
            });
            $('#topRechargeList').html(topHtml);

            var orderHtml = '';
            if(!r.recent_orders || r.recent_orders.length === 0) orderHtml = panelEmpty('Chưa có Donate thành công.', 'fa-receipt');
            else $.each(r.recent_orders, function(i, row) {
                var paidTime = row.pay_time || row.time || '';
                orderHtml += '<div class="overview-row"><div><span class="text-dark">'+escapeHtml(row.account)+'</span><small>S'+escapeHtml(row.server_id || '-')+' · '+escapeHtml(row.pay_type || '-')+' - '+escapeHtml(paidTime)+'</small></div><b class="text-success">'+formatMoney(row.money)+'</b></div>';
            });
            $('#recentOrderList').html(orderHtml);

            var logHtml = '';
            if(!r.recent_logs || r.recent_logs.length === 0) logHtml = panelEmpty('Chưa có hoạt động GM.', 'fa-clock-rotate-left');
            else $.each(r.recent_logs, function(i, row) {
                logHtml += '<div class="overview-row"><div><span class="text-dark">'+escapeHtml(row.role_name || row.player_account || row.account_name || 'Không xác định')+'</span><small>S'+escapeHtml(row.server_id || '-')+' · TK '+escapeHtml(row.player_account || '-')+' · UID '+escapeHtml(row.role_id || row.target_role_id || '-')+' · '+escapeHtml(row.action)+'</small></div><span class="text-muted small fw-bold">'+escapeHtml(row.created_at)+'</span></div>';
            });
            $('#recentGmLogList').html(logHtml);

            // Render Health Status
            var h = r.health || {};
            function setHealthBadge(el, status, okLabel, errLabel) {
                if(status) {
                    $(el).html('<span class="text-success"><i class="fa-solid fa-circle-check me-1"></i>' + (okLabel || 'Tốt') + '</span>');
                } else {
                    $(el).html('<span class="text-danger"><i class="fa-solid fa-circle-xmark me-1"></i>' + (errLabel || 'Lỗi') + '</span>');
                }
            }
            setHealthBadge('#healthGameDb', h.game_db);
            setHealthBadge('#healthWebDb', h.web_db);
            setHealthBadge('#healthGd', h.gd_extension, 'Đã bật', 'Chưa bật');
            setHealthBadge('#healthRedis', h.redis, 'Kết nối OK', 'Lỗi kết nối');
            
            if(h.images_writable) {
                $('#healthUploads').removeClass('bg-secondary bg-danger').addClass('bg-success').html('<i class="fa-solid fa-circle-check me-1"></i>Có quyền ghi (Writable)');
            } else {
                $('#healthUploads').removeClass('bg-secondary bg-success').addClass('bg-danger').html('<i class="fa-solid fa-triangle-exclamation me-1"></i>Không thể ghi (Not Writable)');
            }
        }, 'json');
    }

    function loadAuditLogs(page) {
        page = page || 1;
        var search = $('#auditLogSearchInput').val() || '';
        var actionFilter = $('#auditLogActionInput').val() || '';
        $('#auditLogTableBody').html(tableLoadingRow(6, 'Đang tải nhật ký admin...'));
        var serverFilter = $('#auditLogServerFilter').val() || '';
        $.post("admin_api.php", { action: 'get_audit_logs', page: page, search: search, action_filter: actionFilter, server_filter: serverFilter }, function(r) {
            if(r.status !== 'success') {
                $('#auditLogTableBody').html(tableErrorRow(6, r.message || 'Không tải được nhật ký admin.'));
                $('#auditLogPagination').empty();
                return;
            }
            var rows = r.data || [];
            var html = '';
            if(rows.length === 0) {
                html = tableEmptyRow(6, 'Chưa có nhật ký phù hợp.', 'fa-shield-halved');
            } else {
                $.each(rows, function(i, row) {
                    var details = row.details ? escapeHtml(row.details) : '<span class="text-muted">-</span>';
                    var serverText = row.server_id ? ('S' + row.server_id + ' · ' + (row.server_name || '')) : 'Không gắn server';
                    var targetHtml = '<div class="fw-black text-primary">' + escapeHtml(row.role_name || 'Không xác định nhân vật') + '</div>'
                        + '<div class="small text-muted">UID: <code>' + escapeHtml(row.role_id || row.target || '-') + '</code></div>'
                        + '<div class="small text-muted">Tài khoản người chơi: <b>' + escapeHtml(row.player_account || '-') + '</b></div>'
                        + '<div class="small text-muted">' + escapeHtml(row.identity_label || '') + '</div>'
                        + '<span class="badge bg-info bg-opacity-10 text-info border border-info rounded-pill mt-1">' + escapeHtml(serverText) + '</span>';
                    html += '<tr>'
                        + '<td class="text-start"><div class="fw-bold text-dark">'+escapeHtml(row.created_at)+'</div><div class="small text-muted">ID '+escapeHtml(row.id)+'</div></td>'
                        + '<td><span class="badge bg-primary bg-opacity-10 text-primary border border-primary rounded-pill px-3 py-2">'+escapeHtml(row.admin_account || '-')+'</span></td>'
                        + '<td><code>'+escapeHtml(row.action || '-')+'</code></td>'
                        + '<td class="text-start">'+targetHtml+'</td>'
                        + '<td class="text-start"><div style="max-width:320px; white-space:normal; word-break:break-word;">'+details+'</div></td>'
                        + '<td><code>'+escapeHtml(row.ip || '-')+'</code></td>'
                        + '</tr>';
                });
            }
            $('#auditLogTableBody').html(html);
            initTooltips('#auditLogTableBody');

            renderCompactPagination('#auditLogPagination', r.total_pages, r.current_page, 'loadAuditLogs');
        }, 'json');
    }

    var monitorLogState = { period: 'today', dateFrom: '', dateTo: '', loading: false, quickStatus: '', pendingPage: null };

    function monitorDateValue(date) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function initMonitorDateInputs() {
        var today = new Date();
        var first = new Date(today.getFullYear(), today.getMonth(), 1);
        if (!$('#monitorDateFrom').val()) $('#monitorDateFrom').val(monitorDateValue(first));
        if (!$('#monitorDateTo').val()) $('#monitorDateTo').val(monitorDateValue(today));
    }

    function monitorLogPayload(page) {
        var payload = {
            action: 'get_monitor_logs', page: page || 1, period: monitorLogState.period, quick_status: monitorLogState.quickStatus,
            source_filter: $('#monitorSourceFilter').val() || '', status_filter: $('#monitorStatusFilter').val() || '',
            level_filter: $('#monitorLevelFilter').val() || '', server_filter: $('#monitorServerFilter').val() || '', search: $('#monitorSearchInput').val() || ''
        };
        if (monitorLogState.period === 'custom') {
            payload.date_from = monitorLogState.dateFrom;
            payload.date_to = monitorLogState.dateTo;
        }
        return payload;
    }

    function setMonitorLogPeriod(period) {
        if (['today', '7days', '30days', 'all', 'custom'].indexOf(period) === -1) period = 'today';
        monitorLogState.period = period;
        $('.log-period-btn[data-log-scope="monitor"]').removeClass('active').filter('[data-period="' + period + '"]').addClass('active');
        $('#monitorCustomRange').prop('hidden', period !== 'custom');
        if (period === 'custom') { initMonitorDateInputs(); return; }
        monitorLogState.dateFrom = ''; monitorLogState.dateTo = '';
        loadMonitorLogs(1);
    }

    function renderMonitorStats(response) {
        var summary = response.summary || {};
        var range = response.range || {};
        $('#monitorRangeLabel').text(range.label || 'Khoảng đang xem');
        $('#monitorLogRefreshedAt').html('<i class="fa-regular fa-clock"></i> Cập nhật ' + escapeHtml(response.refreshed_at || new Date().toLocaleTimeString('vi-VN')));
        $('#monitorStatTotal').text(formatNumber(summary.total || 0));
        $('#monitorStatSuccess').text(formatNumber(summary.success_count || 0));
        $('#monitorStatWarning').text(formatNumber(summary.warning_count || 0));
        $('#monitorStatError').text(formatNumber(summary.error_count || 0));
        var sourceLabels = [['SePay', summary.sepay_count], ['WebShop', summary.webshop_count], ['GM', summary.gm_count], ['Login', summary.login_count], ['Hệ thống', summary.system_count]];
        var chips = '';
        $.each(sourceLabels, function(_, item) { if (Number(item[1] || 0) > 0) chips += '<span class="log-source-chip"><b>' + escapeHtml(item[0]) + '</b><strong>' + formatNumber(item[1]) + '</strong></span>'; });
        $('#monitorSourceSummary').html(chips || '<span class="log-source-chip">Không có dữ liệu nguồn trong khoảng này.</span>');
    }

    function monitorDetailHtml(row) {
        var detail = String(row.details || '').trim();
        var id = 'monitor-' + String(row.event_id || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!detail) return '<span class="text-muted fst-italic">Không có chi tiết</span>';
        return '<div class="log-detail-wrap"><div class="log-detail-text" data-monitor-detail="' + escapeHtml(id) + '">' + escapeHtml(detail) + '</div><button type="button" class="log-detail-toggle" data-monitor-toggle="' + escapeHtml(id) + '">Xem thêm</button></div>';
    }

    function monitorBadge(type, value) {
        var map = {
            source: {
                sepay: ['SePay', 'bg-info bg-opacity-10 text-info border-info'],
                webshop: ['WebShop', 'bg-warning bg-opacity-10 text-warning border-warning'],
                gm: ['GM', 'bg-danger bg-opacity-10 text-danger border-danger'],
                login: ['Login', 'bg-warning bg-opacity-10 text-warning border-warning'],
                system: ['System', 'bg-secondary bg-opacity-10 text-secondary border-secondary']
            },
            status: {
                success: ['Thành công', 'bg-success bg-opacity-10 text-success border-success'],
                failed: ['Thất bại', 'bg-danger bg-opacity-10 text-danger border-danger'],
                ignored: ['Bỏ qua / Hoàn Xu', 'bg-secondary bg-opacity-10 text-secondary border-secondary'],
                paid: ['Đã thanh toán', 'bg-success bg-opacity-10 text-success border-success'],
                refunded: ['Đã hoàn Xu', 'bg-secondary bg-opacity-10 text-secondary border-secondary']
            },
            level: {
                info: ['Info', 'bg-primary bg-opacity-10 text-primary border-primary'],
                warning: ['Warning', 'bg-warning bg-opacity-10 text-warning border-warning'],
                error: ['Error', 'bg-danger bg-opacity-10 text-danger border-danger']
            }
        };
        var item = map[type] && map[type][value] ? map[type][value] : [value || '-', 'bg-light text-muted border-secondary'];
        return '<span class="badge border rounded-pill px-3 py-2 '+item[1]+'">'+escapeHtml(item[0])+'</span>';
    }

    function loadMonitorLogs(page) {
        page = page || 1;
        if (monitorLogState.loading) { monitorLogState.pendingPage=page; return; }
        monitorLogState.pendingPage=null;
        monitorLogState.loading = true;
        var payload = monitorLogPayload(page);
        $('#monitorLogTableBody').html(tableLoadingRow(5, 'Đang tải log giám sát...'));
        $.post("admin_api.php", payload, function(r) {
            if(r.status !== 'success') {
                $('#monitorLogTableBody').html(tableErrorRow(5, r.message || 'Không tải được log giám sát.'));
                $('#monitorLogPagination').empty();
                return;
            }
            renderMonitorStats(r);
            if(typeof renderSepayFinancial==='function')renderSepayFinancial(r.financial);
            var rows = r.data || [];
            var html = '';
            if(rows.length === 0) {
                html = tableEmptyRow(5, 'Chưa có log phù hợp.', 'fa-satellite-dish');
            } else {
                $.each(rows, function(i, row) {
                    var details = monitorDetailHtml(row);
                    var serverText = row.server_id ? ('S' + row.server_id + ' · ' + (row.server_name || '')) : 'Không gắn server';
                    var identityHtml = '<div class="log-account-name">' + escapeHtml(row.account_name || '-') + '</div>'
                        + '<div class="log-account-meta">' + escapeHtml(serverText) + (row.ip ? ' · ' + escapeHtml(row.ip) : '') + '</div>';
                    if (row.role_id || row.role_name || row.player_account) {
                        identityHtml += '<div class="small mt-1"><b class="text-primary">' + escapeHtml(row.role_name || 'Không xác định tên') + '</b>'
                            + ' · UID <code>' + escapeHtml(row.role_id || '-') + '</code>'
                            + (row.player_account ? ' · TK ' + escapeHtml(row.player_account) : '') + '</div><div class="small text-muted">' + escapeHtml(row.identity_label || '') + '</div>';
                    }
                    html += '<tr>'
                        + '<td class="text-start log-time-cell"><div class="fw-bold text-dark">'+escapeHtml(row.created_at || '-')+'</div><div class="small text-muted">'+escapeHtml(row.event_id || '')+'</div></td>'
                        + '<td><div class="log-badge-stack">'+monitorBadge('source', row.source)+monitorBadge('status', row.status)+monitorBadge('level', row.level)+'</div></td>'
                        + '<td class="text-start">'+identityHtml+'</td>'
                        + '<td class="text-start"><code class="log-action-code">'+escapeHtml(row.action || '-')+'</code><div class="log-message-title">'+escapeHtml(row.message || '-')+'</div></td>'
                        + '<td class="text-start">'+details+'</td>'
                        + '</tr>';
                });
            }
            $('#monitorLogTableBody').html(html);
            initTooltips('#monitorLogTableBody');

            renderCompactPagination('#monitorLogPagination', r.total_pages, r.current_page, 'loadMonitorLogs');
        }, 'json').fail(function(){ $('#monitorLogTableBody').html(tableErrorRow(5,'Mất kết nối tải log. Vui lòng thử lại.')); }).always(function(){
            monitorLogState.loading = false;
            if(monitorLogState.pendingPage!==null){var next=monitorLogState.pendingPage;monitorLogState.pendingPage=null;loadMonitorLogs(next);}
        });
    }

    var userListRequestNo=0;
    function loadUsers(page) {
        page = page || 1;
        var kw = $('#searchInput').val();
        var requestNo=++userListRequestNo;
        $('#userTableBody').html(tableLoadingRow(5, 'Đang tải người chơi...'));
        $.post("admin_api.php", { action: 'get_users_list', page: page, search: kw, sort_by: userSortBy, sort_dir: userSortDir, account_filter: $('#accountFilter').val() || 'all' }, function(r) {
            if(requestNo!==userListRequestNo)return;
            if(r.status === 'success') {
                var html = '';
            if(r.data.length === 0) html = tableEmptyRow(5, 'Không tìm thấy người chơi phù hợp.', 'fa-users-slash');
                else {
                    $.each(r.data, function(i, u) {
                        var accountName = u.AccountName || '';
                        var safeAccount = jsString(accountName);
                        var safeXu = Number(u.xu || 0);
                        var safeRecharge = Number(u.recharge_total || 0);
                        var serverId = String(u.server_id || '');
                        var serverName = String(u.server_name || 'Không rõ server');
                        var serverBadge = '<span class="badge bg-info bg-opacity-10 text-info border border-info rounded-pill">S' + escapeHtml(serverId || '-') + ' · ' + escapeHtml(serverName) + '</span>';
                        var vipStr = (Number(u.vip_level) > 0) ? '<span class="badge bg-primary px-2 py-2 rounded-pill">VIP '+escapeHtml(u.vip_level)+'</span>' : '<span class="badge bg-secondary text-light px-2 py-2 rounded-pill">Không</span>';
                        if (u.is_banned == 1) vipStr += ' <span class="badge bg-danger px-2 py-2 rounded-pill"><i class="fa-solid fa-ban me-1"></i>Bị khóa</span>';
                        var charHtml = u.role_id ? ('<div class="fw-black text-primary">'+escapeHtml(u.role_name)+'</div><div class="small fw-bold text-muted mt-1">UID: <code class="text-danger bg-danger bg-opacity-10 px-1 rounded">'+escapeHtml(u.role_id)+'</code> <i class="fa-regular fa-copy ms-1 text-primary" style="cursor:pointer;" onclick="copyText(\''+jsString(u.role_id)+'\')" title="Sao chép UID"></i></div>') : '<span class="small fw-bold text-muted">Chưa tạo nhân vật</span>';

                        html += '<tr><td><div class="fw-black fs-6 text-dark">' + escapeHtml(accountName) + '</div><div class="mt-1">' + serverBadge + '</div><div class="text-muted small fw-bold mt-1">ID WebGM ' + escapeHtml(u.Uin) + '</div></td><td><span class="text-warning fw-black fs-6">' + safeXu.toLocaleString() + ' Xu</span></td><td>' + charHtml + '</td><td>' + vipStr + '</td><td><button class="btn btn-sm btn-primary fw-bold px-3 rounded-3" onclick="openPlayerActionModal(\''+safeAccount+'\', \''+jsString(u.Uin)+'\', \''+jsString(u.role_name || '')+'\', \''+jsString(serverId)+'\', \''+jsString(serverName)+'\', '+safeXu+', '+safeRecharge+')" '+(r.can_manage === false ? ' disabled' : '')+' title="Thao tác theo server đăng nhập admin"><i class="fa-solid fa-list-check me-1"></i> Chọn chức năng</button></td></tr>';
                    });
                }
            $('#userTableBody').html(html);
            initTooltips('#userTableBody');
                updateUserSortStatus();
                renderCompactPagination('#userPagination', r.total_pages, r.current_page, 'loadUsers');
            } else {$('#userTableBody').html(tableErrorRow(5,r.message||'Chưa tải được danh sách.'));}
        }, 'json');
    }

    var authCodeCache = [];
    var authCodeSearchTimer = null;
    var authCodeRequest = null;

    function loadAuthCodes(search) {
        var keyword = (typeof search === 'undefined') ? ($('#authCodeSearchInput').val() || '') : search;
        if (authCodeRequest && authCodeRequest.readyState !== 4) {
            authCodeRequest.abort();
        }
        $('#authCodeSearchStatus').html(keyword ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang lọc realtime...' : 'Gõ để lọc realtime, không cần bấm tìm.');
        $('#authCodeTableBody').html(tableLoadingRow(5, 'Đang lọc mã ủy quyền...'));
        authCodeRequest = $.post("admin_api.php", { action: 'get_auth_codes', search: keyword }, function(r) {
            if(r.status !== 'success') {
                $('#authCodeSearchStatus').html('<span class="text-danger">Không tải được dữ liệu.</span>');
                $('#authCodeTableBody').html(tableErrorRow(5, r.message || 'Không tải được mã ủy quyền.'));
                return;
            }

            authCodeCache = r.data || [];
            var html = '';
            if(authCodeCache.length === 0) {
                var emptyText = keyword ? 'Không tìm thấy mã ủy quyền phù hợp.' : 'Chưa có mã nào.';
                html = tableEmptyRow(5, emptyText, 'fa-ticket');
            } else {
                $.each(authCodeCache, function(i, v) {
                    var cls = (Number(v.is_used) === 1) ? 'used' : '';
                    var stt = Number(v.is_active) === 0
                        ? '<span class="badge bg-danger px-2 py-2 rounded-pill">Đã thu hồi</span>'
                        : (Number(v.is_used) === 1)
                        ? '<span class="badge bg-secondary px-2 py-2 rounded-pill">Đã dùng</span>'
                        : '<span class="badge bg-success px-2 py-2 rounded-pill shadow-sm">Sẵn sàng</span>';
                    var usr = '<span class="text-muted fw-bold">Chưa ủy quyền</span>';
                    if (Number(v.is_used) === 1 && v.used_by_account) {
                        var roleIdDisplay = (v.char_info && v.char_info.role_id)
                            ? ('<code class="text-danger bg-danger bg-opacity-10 px-1 rounded">' + escapeHtml(v.char_info.role_id) + '</code>')
                            : '<span class="text-muted fw-bold">Chưa tạo nhân vật</span>';
                        var roleName = (v.char_info && v.char_info.name) ? v.char_info.name : 'Chưa tạo nhân vật';
                        usr = '<div class="text-start d-inline-block fw-bold" style="font-size:13px; line-height: 1.6;">'
                            + '<span class="text-muted">Tài khoản:</span> <b class="text-dark">'+escapeHtml(v.used_by_account)+'</b><br>'
                            + '<span class="text-muted">Máy chủ:</span> <b>'+escapeHtml(v.used_server_id ? 'S' + v.used_server_id : 'Không xác định')+'</b><br>'
                            + '<span class="text-muted">Nhân vật:</span> <span class="text-primary">'+escapeHtml(roleName)+'</span><br>'
                            + '<span class="text-muted">UID:</span> '+roleIdDisplay
                            + '</div>';
                    }
                    html += '<tr class="'+cls+'"><td><span class="copy-code" onclick="copyText(\''+jsString(v.code)+'\')" title="Bấm để sao chép">'+escapeHtml(v.code)+'</span><div class="small text-muted fw-bold mt-1">ID '+escapeHtml(v.id)+'</div></td><td><span class="badge bg-warning text-dark px-2 py-2 rounded-pill shadow-sm">VIP '+escapeHtml(v.vip_type)+'</span></td><td>'+stt+'</td><td>'+usr+'</td>';
                    html += '<td><div class="btn-group shadow-sm rounded-3"><button class="btn btn-sm btn-light border text-primary fw-bold px-3" onclick="editAuthCodeAccount('+Number(v.id)+')" title="Sửa tài khoản ủy quyền"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-light border text-danger fw-bold px-3" onclick="deleteAuthCode('+Number(v.id)+')" title="Xóa mã"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
                });
            }
            $('#authCodeTableBody').html(html);
            initTooltips('#authCodeTableBody');
            $('#authCodeSearchStatus').text(keyword ? ('Đang hiển thị kết quả cho: ' + keyword) : 'Gõ để lọc realtime, không cần bấm tìm.');
        }, 'json');
    }

    function editAuthCodeAccount(id) {
        var row = authCodeCache.find(function(item){ return Number(item.id) === Number(id); });
        if(!row) return;
        Swal.fire({
            title: 'Sửa tài khoản ủy quyền',
            html: '<div class="text-start small fw-bold text-muted mb-2">Mã: <code>'+escapeHtml(row.code)+'</code><br>Để trống tài khoản nếu muốn gỡ ủy quyền và đưa mã về trạng thái sẵn sàng.</div>',
            input: 'text',
            inputValue: row.used_by_account || '',
            inputPlaceholder: 'Nhập tài khoản hoặc ID tài khoản',
            showCancelButton: true,
            confirmButtonText: 'Lưu',
            cancelButtonText: 'Hủy',
            showLoaderOnConfirm: true,
            preConfirm: function(account) {
                return $.post("admin_api.php", { action: 'update_auth_code_account', id: id, account: account || '' }, null, 'json')
                    .then(function(r) {
                        if(r.status !== 'success') {
                            Swal.showValidationMessage(r.message || 'Không lưu được tài khoản ủy quyền.');
                            return false;
                        }
                        return r;
                    }, function() {
                        Swal.showValidationMessage('Không kết nối được server.');
                        return false;
                    });
            },
            allowOutsideClick: function() { return !Swal.isLoading(); }
        }).then(function(result) {
            if(result.isConfirmed && result.value) {
                appToast('success', 'Đã lưu', result.value.message);
                loadAuthCodes();
                loadOverview();
            }
        });
    }

    function deleteAuthCode(id) {
        appConfirmDanger({ title: 'Thu hồi quyền?', text: 'Hành động này sẽ xóa mã và tước quyền VIP của user nếu mã đã dùng.', confirmText: 'Xóa luôn' }).then((result) => {
            if (result.isConfirmed) {
                $.post("admin_api.php", { action: 'delete_auth_code', id: id }, function(r) {
                    if(r.status==='success') { appToast('success', 'Thành công', r.message); loadAuthCodes(); loadOverview(); } 
                    else Swal.fire('Lỗi!', r.message, 'error');
                }, 'json');
            }
        });
    }

    var vipVoucherCache = [];

    function loadVipVouchers() {
        $('#vipVoucherTableBody').html(tableLoadingRow(6, 'Đang tải voucher VIP...'));
        $.post("admin_api.php", { action: 'get_vip_vouchers' }, function(r) {
            if(r.status !== 'success') {
                $('#vipVoucherTableBody').html(tableErrorRow(6, r.message || 'Không tải được voucher VIP.'));
                return;
            }
            vipVoucherCache = r.data || [];
            var html = '';
            if(vipVoucherCache.length === 0) html = tableEmptyRow(6, 'Chưa có voucher VIP.', 'fa-tags');
            else $.each(vipVoucherCache, function(i, v) {
                var status = Number(v.is_active) === 1 ? '<span class="badge bg-success rounded-pill px-3 py-2">Đang bật</span>' : '<span class="badge bg-secondary rounded-pill px-3 py-2">Đã tắt</span>';
                var toggleText = Number(v.is_active) === 1 ? 'Tắt' : 'Bật';
                var uses = formatNumber(v.used_count) + ' / ' + (Number(v.max_uses) > 0 ? formatNumber(v.max_uses) : 'Không giới hạn');
                var expires = v.expires_at ? escapeHtml(v.expires_at) : '<span class="text-muted">Không giới hạn</span>';
                var note = v.note ? '<div class="small text-muted fw-bold mt-1">'+escapeHtml(v.note)+'</div>' : '';
                html += '<tr><td class="text-start"><span class="copy-code" onclick="copyText(\''+jsString(v.code)+'\')" title="Bấm để sao chép">'+escapeHtml(v.code)+'</span>'+note+'</td><td class="fw-black text-success">'+formatMoney(v.discount_amount)+'</td><td>'+uses+'</td><td>'+expires+'</td><td>'+status+'</td><td><div class="btn-group"><button class="btn btn-sm btn-light border fw-bold text-primary" onclick="editVipVoucher('+Number(v.id)+')" title="Sửa voucher"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-light border fw-bold text-warning" onclick="toggleVipVoucher('+Number(v.id)+', '+(Number(v.is_active) === 1 ? 0 : 1)+')" title="'+toggleText+' voucher">'+toggleText+'</button><button class="btn btn-sm btn-light border fw-bold text-danger" onclick="deleteVipVoucher('+Number(v.id)+')" title="Xóa voucher"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
            });
            $('#vipVoucherTableBody').html(html);
            initTooltips('#vipVoucherTableBody');
        }, 'json');
    }

    function resetVipVoucherForm() {
        $('#vipVoucherForm')[0].reset();
        $('#vip_voucher_id').val('');
        $('#vip_voucher_active').val('1');
    }

    function editVipVoucher(id) {
        var v = vipVoucherCache.find(function(row){ return Number(row.id) === Number(id); });
        if(!v) return;
        $('#vip_voucher_id').val(v.id);
        $('#vip_voucher_code').val(v.code);
        $('#vip_voucher_discount').val(v.discount_amount);
        $('#vip_voucher_max_uses').val(v.max_uses);
        $('#vip_voucher_active').val(Number(v.is_active) === 1 ? '1' : '0');
        $('#vip_voucher_note').val(v.note || '');
        $('#vip_voucher_expires').val(v.expires_at ? String(v.expires_at).replace(' ', 'T').slice(0, 16) : '');
        $('.menu-btn[data-tab="tab-vip"]').trigger('click');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleVipVoucher(id, value) {
        $.post("admin_api.php", { action: 'toggle_vip_voucher', id: id, value: value }, function(r) {
            if(r.status === 'success') loadVipVouchers();
            else Swal.fire('Lỗi!', r.message, 'error');
        }, 'json');
    }

    function deleteVipVoucher(id) {
        appConfirmDanger({ title:'Xóa voucher VIP?', text:'Voucher sẽ không thể tiếp tục sử dụng sau khi xóa.', confirmText:'Xóa voucher' }).then(function(result){
            if(!result.isConfirmed) return;
            $.post("admin_api.php", { action: 'delete_vip_voucher', id: id }, function(r) {
                if(r.status === 'success') { appToast('success', 'Đã xóa', r.message); loadVipVouchers(); }
                else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });
    }

    function taiMaQuaTang() {
        $('#giftcodeTableBody').html(tableLoadingRow(5, 'Đang tải mã quà tặng...'));
        $.post("admin_api.php", { action: 'get_giftcodes' }, function(r) {
            if(r.status === 'success') {
                giftcodeCache = r.data || [];
                var html = '';
                if(r.data.length === 0) html = tableEmptyRow(5, 'Chưa có mã quà tặng nào.', 'fa-gift');
                else $.each(r.data, function(i, gc) {
                    var stt = (gc.hide == 1) ? '<span class="badge bg-primary px-2 py-2 rounded-pill">Hiển thị</span>' : '<span class="badge bg-secondary px-2 py-2 rounded-pill">Ẩn</span>';
                    var daHetLuot = (Number(gc.max_uses) > 0 && Number(gc.used_count) >= Number(gc.max_uses)) ? '<br><span class="badge bg-danger mt-1 px-2 py-1 rounded-pill">Hết lượt</span>' : '';
                    
                    var rw = rewardSummaryHtml(gc.reward_items, 'Giftcode ' + (gc.code || ''));
                    stt += '<div class="small text-muted mt-2">Hết hạn: '+escapeHtml(gc.expire_at || gc.expires_at || 'Không giới hạn')+(gc.expire_at||gc.expires_at?' GMT+7':'')+'</div>';

                    html += '<tr><td><span class="copy-code" onclick="copyText(\''+jsString(gc.code)+'\')">'+escapeHtml(gc.code)+'</span></td>';
                    html += '<td class="fw-bold text-dark">'+escapeHtml(gc.used_count)+' / '+escapeHtml(gc.max_uses)+daHetLuot+'</td><td>'+stt+'</td><td>'+rw+'</td>';
                    html += '<td><button class="btn btn-sm btn-outline-primary border-2 rounded-3 me-1" onclick="suaMaQuaTang('+Number(gc.id)+')" title="Sửa giftcode"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger border-2 rounded-3 me-1" onclick="xoaMaQuaTang('+Number(gc.id)+')" title="Tắt giftcode, giữ lịch sử"><i class="fa-solid fa-ban"></i></button><button class="btn btn-sm btn-outline-dark border-2 rounded-3" onclick="xoaVinhVienMaQuaTang('+Number(gc.id)+')" title="Xóa vĩnh viễn giftcode"><i class="fa-solid fa-trash-can"></i></button></td></tr>';
                });
                $('#giftcodeTableBody').html(html);
                initTooltips('#giftcodeTableBody');
            }
        }, 'json');
    }

    function suaMaQuaTang(id) {
        var gc = giftcodeCache.find(function(row){ return Number(row.id) === Number(id); });
        if(!gc) return;
        var used = Number(gc.used_count || 0);
        var editItems = rewardItemsFromJson(gc.reward_items);
        var expires = gc.expire_at || gc.expires_at || '';
        expires = expires ? String(expires).replace(' ', 'T').slice(0, 16) : '';
        var historyText = used > 0 ? '<div class="alert alert-warning text-start small mb-3">Mã đã có '+used+' lượt nhận. Bạn có thể sửa mã và danh sách quà cho các lượt nhận mới; lịch sử và thư đã giao vẫn giữ nguyên.</div>' : '';
        var itemOptions = $('#builder_item').html() || '<option value=""></option>';
        function renderEditItems() {
            var $box = $('#gc_edit_item_preview');
            if (!$box.length) return;
            $box.empty();
            var keys = Object.keys(editItems);
            if (keys.length === 0) {
                $box.html('<span class="text-muted fw-bold">Chưa thêm vật phẩm...</span>');
                return;
            }
            $.each(editItems, function(itemId, amount) {
                $box.append('<div class="d-inline-block position-relative me-1 mb-1">'+rewardCardHtml(itemId, amount)+'<button type="button" class="btn btn-sm btn-danger rounded-circle position-absolute top-0 end-0" style="width:24px;height:24px;padding:0;transform:translate(35%,-35%)" data-gc-edit-remove="'+escapeHtml(itemId)+'" title="Xóa item"><i class="fa-solid fa-xmark"></i></button></div>');
            });
        }
        Swal.fire({
            title: 'Sửa giftcode ' + escapeHtml(gc.code || ''),
            width: 820,
            html: historyText + '<div class="text-start">' +
                '<label class="fw-bold mb-1">Mã giftcode</label><input id="gc_edit_code" class="form-control mb-3 text-uppercase" value="'+escapeHtml(gc.code || '')+'">' +
                '<label class="fw-bold mb-1">Thêm vật phẩm</label><div class="row g-2 mb-3"><div class="col-md-7"><select id="gc_edit_item" class="form-select" style="width:100%">'+itemOptions+'</select></div><div class="col-md-3"><input id="gc_edit_amount" type="number" min="1" max="999999" class="form-control" value="1" aria-label="Số lượng"></div><div class="col-md-2"><button type="button" id="gc_edit_add" class="btn btn-success w-100"><i class="fa-solid fa-plus"></i> Thêm</button></div></div>' +
                '<label class="fw-bold mb-1">Danh sách quà</label><div id="gc_edit_item_preview" class="item-list-builder mb-3 shadow-sm"></div>' +
                '<div class="small text-muted mb-3">Bấm dấu X trên từng thẻ để xóa item. Thêm lại cùng ID sẽ cộng số lượng.</div>' +
                '<div class="row g-2"><div class="col-md-4"><label class="fw-bold mb-1">Giới hạn lượt (0 = không giới hạn)</label><input id="gc_edit_max" type="number" min="0" max="2147483647" class="form-control" value="'+Number(gc.max_uses || 0)+'"></div>' +
                '<div class="col-md-4"><label class="fw-bold mb-1">Hiển thị công khai</label><select id="gc_edit_hide" class="form-select"><option value="1" '+(Number(gc.hide)===1?'selected':'')+'>Có</option><option value="0" '+(Number(gc.hide)!==1?'selected':'')+'>Không</option></select></div>' +
                '<div class="col-md-4"><label class="fw-bold mb-1">Trạng thái</label><select id="gc_edit_active" class="form-select"><option value="1" '+(Number(gc.is_active)!==0?'selected':'')+'>Đang bật</option><option value="0" '+(Number(gc.is_active)===0?'selected':'')+'>Tạm tắt</option></select></div></div>' +
                '<label class="fw-bold mb-1 mt-3">Hạn dùng (để trống = vĩnh viễn)</label><input id="gc_edit_expire" type="datetime-local" class="form-control" value="'+escapeHtml(expires)+'"></div>',
            showCancelButton: true,
            confirmButtonText: 'Lưu thay đổi',
            cancelButtonText: 'Hủy',
            showLoaderOnConfirm: true,
            didOpen: function() {
                var $select = $('#gc_edit_item');
                if ($.fn.select2) $select.select2({ theme: 'bootstrap-5', dropdownParent: $('.swal2-popup'), width: '100%', placeholder: '-- Gõ ID hoặc tên vật phẩm --', allowClear: true, language: { noResults: function() { return 'Không tìm thấy'; } } });
                $('#gc_edit_add').on('click', function() {
                    var itemId = rewardKeyToId(String($select.val() || '').trim());
                    var amount = Math.floor(Number($('#gc_edit_amount').val() || 0));
                    if (!itemId || !/^\d+$/.test(itemId) || amount < 1 || amount > 999999) {
                        Swal.showValidationMessage('Chọn item và số lượng hợp lệ trước khi thêm.');
                        return;
                    }
                    editItems[itemId] = Math.min(999999, Number(editItems[itemId] || 0) + amount);
                    renderEditItems();
                    $('#gc_edit_amount').val(1);
                    $select.val(null).trigger('change');
                    Swal.resetValidationMessage();
                });
                $('#gc_edit_item_preview').on('click', '[data-gc-edit-remove]', function() {
                    delete editItems[String($(this).attr('data-gc-edit-remove') || '')];
                    renderEditItems();
                });
                renderEditItems();
            },
            preConfirm: function() {
                var code = String($('#gc_edit_code').val() || '').trim().toUpperCase();
                if(!/^[A-Z0-9_-]{2,80}$/.test(code)) { Swal.showValidationMessage('Mã không hợp lệ.'); return false; }
                if (Object.keys(editItems).length === 0) { Swal.showValidationMessage('Giftcode phải có ít nhất 1 vật phẩm.'); return false; }
                return $.post('admin_api.php', { action:'update_giftcode', id:id, code:code, items_json:JSON.stringify(editItems), max_uses:Math.max(0, Number($('#gc_edit_max').val() || 0)), hide:$('#gc_edit_hide').val(), is_active:$('#gc_edit_active').val(), expire_at:$('#gc_edit_expire').val() }, null, 'json').then(function(r){ if(r.status !== 'success') { Swal.showValidationMessage(r.message || 'Không lưu được giftcode.'); return false; } return r; }).catch(function(){ Swal.showValidationMessage('Không kết nối được máy chủ.'); return false; });
            }
        }).then(function(result){ if(result.isConfirmed && result.value) { appToast('success', 'Đã cập nhật', result.value.message || 'Giftcode đã được lưu.'); taiMaQuaTang(); loadOverview(); } });
    }

    function xoaMaQuaTang(id) {
        appConfirmDanger({ title: 'Tắt mã quà tặng?', text: 'Dừng lượt nhận mới, giữ lịch sử và tiếp tục giao các đơn quà đã ghi nhận.', confirmText: 'Tắt mã' }).then((result) => {
            if (result.isConfirmed) {
                $.post("admin_api.php", { action: 'delete_giftcode', id: id }, function(r) {
                    if(r.status==='success') { appToast('success', 'Đã tắt mã', r.message); taiMaQuaTang(); loadOverview(); } 
                    else Swal.fire('Lỗi!', r.message, 'error');
                }, 'json');
            }
        });
    }

    function xoaVinhVienMaQuaTang(id) {
        var gc = giftcodeCache.find(function(row){ return Number(row.id) === Number(id); });
        if (!gc) return;
        var code = String(gc.code || gc.giftcode || '').trim().toUpperCase();
        if (!code) return Swal.fire('Không thể xóa', 'Giftcode không có mã xác nhận hợp lệ.', 'error');
        Swal.fire({
            title: 'Xóa vĩnh viễn giftcode?',
            html: '<div class="text-start"><div class="fw-bold text-danger mb-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>Thao tác này xóa dòng giftcode khỏi hệ thống.</div><div class="text-muted fw-bold mb-3">Lịch sử nhận và đơn quà đã ghi nhận vẫn được giữ. Nhập lại mã để xác nhận:</div><code class="d-block bg-light border rounded-3 p-2 text-center fw-black">' + escapeHtml(code) + '</code></div>',
            input: 'text',
            inputPlaceholder: 'Nhập lại mã giftcode',
            inputAttributes: { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' },
            showCancelButton: true,
            confirmButtonColor: '#991b1b',
            confirmButtonText: 'Xóa vĩnh viễn',
            cancelButtonText: 'Hủy',
            reverseButtons: true,
            focusCancel: true,
            showLoaderOnConfirm: true,
            preConfirm: function(value) {
                if (String(value || '').trim().toUpperCase() !== code) {
                    Swal.showValidationMessage('Mã xác nhận không khớp.');
                    return false;
                }
                return $.post('admin_api.php', { action: 'hard_delete_giftcode', id: id, confirm_code: code }, null, 'json').then(function(r) {
                    if (r.status !== 'success') { Swal.showValidationMessage(r.message || 'Không xóa được giftcode.'); return false; }
                    return r;
                }).catch(function() { Swal.showValidationMessage('Không kết nối được máy chủ.'); return false; });
            }
        }).then(function(result) {
            if (result.isConfirmed && result.value) { appToast('success', 'Đã xóa', result.value.message || 'Giftcode đã được xóa vĩnh viễn.'); taiMaQuaTang(); loadOverview(); }
        });
    }

    $(document).ready(function() {
        loadOverview();
        loadUsers(1); 
        loadSettings();
        initAdminSelects();
        
        $('#auditLogSearchForm').on('submit', function(e){
            e.preventDefault();
            loadAuditLogs(1);
            return false;
        });
        $('#monitorLogSearchForm').on('submit', function(e){
            e.preventDefault();
            loadMonitorLogs(1);
            return false;
        });
        $(document).on('click', '.log-period-btn[data-log-scope="monitor"]', function(){ setMonitorLogPeriod(String($(this).data('period') || 'today')); });
        $('#monitorApplyCustom').on('click', function(){
            monitorLogState.dateFrom = String($('#monitorDateFrom').val() || '');
            monitorLogState.dateTo = String($('#monitorDateTo').val() || '');
            if (!monitorLogState.dateFrom || !monitorLogState.dateTo) return Swal.fire('Thiếu ngày', 'Vui lòng chọn đủ khoảng thời gian.', 'warning');
            loadMonitorLogs(1);
        });
        $('#monitorResetFilters').on('click', function(){
            $('#monitorSourceFilter,#monitorStatusFilter,#monitorLevelFilter,#monitorServerFilter').val('');
            $('#monitorSearchInput').val('');
            monitorLogState.quickStatus='';$('.monitor-status-tab').attr('aria-pressed','false').filter('[data-log-status=""]').attr('aria-pressed','true');
            setMonitorLogPeriod('today');
        });
        $(document).on('click', '.log-detail-toggle', function(){
            var id = String($(this).attr('data-monitor-toggle') || '');
            var $detail = $('.log-detail-text[data-monitor-detail="' + id + '"]');
            var expanded = $detail.toggleClass('is-expanded').hasClass('is-expanded');
            $(this).text(expanded ? 'Thu gọn' : 'Xem thêm');
        });

        $('#btnAddItem').click(function(){
            var id = $('#builder_item').val(); var amt = parseInt($('#builder_amount').val());
            if(!id || !amt || amt<1) return;
            giftcodeItems[id] = giftcodeItems[id] ? giftcodeItems[id] + amt : amt;
            updateJsonPreview(); $('#builder_amount').val(1); $('#builder_item').val(null).trigger('change');
        });
        
        $('.setting-toggle').on('change', function(){
            var key = $(this).data('key');
            var value = $(this).is(':checked') ? 1 : 0;
            $.post("admin_api.php", { action: 'update_setting', key: key, value: value }, function(r) {
                if(r.status !== 'success') Swal.fire('Lỗi!', r.message, 'error');
                else appToast('success', 'Đã cập nhật cấu hình', r.message || 'Cấu hình đã được lưu.');
            }, 'json');
        });
        $('#textSettingsForm').on('submit', function(e){
            e.preventDefault();
            var inputs = $('.text-setting-input').toArray();
            if(inputs.length === 0) return;
            appLoading('Đang lưu cấu hình...');
            var chain = $.Deferred().resolve().promise();
            $.each(inputs, function(_, input){
                var $input = $(input);
                chain = chain.then(function(){
                    return $.post("admin_api.php", {
                        action: 'update_text_setting',
                        key: $input.data('key'),
                        value: $input.val()
                    }, null, 'json').then(function(r){
                        if(r.status !== 'success') {
                            return $.Deferred().reject(r.message || 'Không lưu được cấu hình.').promise();
                        }
                        return r;
                    }, function(){
                        return $.Deferred().reject('Không kết nối được server.').promise();
                    });
                });
            });
            chain.then(function(){
                Swal.close();
                appToast('success', 'Đã lưu cấu hình', 'Điểm danh, Donate, ngân hàng và link tải game đã được cập nhật.');
                loadSettings();
            }, function(message){
                Swal.fire('Lỗi!', message, 'error');
            });
        });

        function convertImageFileToPng(file) {
            return new Promise(function(resolve, reject){
                if (!window.FileReader || !window.Image || !document.createElement('canvas').toBlob) {
                    reject(new Error('Trình duyệt không hỗ trợ chuyển ảnh sang PNG.'));
                    return;
                }
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var img = new Image();
                    img.onload = function() {
                        var canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        var ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob(function(blob) {
                            if (!blob) {
                                reject(new Error('Không chuyển được logo sang PNG.'));
                                return;
                            }
                            resolve(blob);
                        }, 'image/png');
                    };
                    img.onerror = function() {
                        reject(new Error('Không đọc được file logo.'));
                    };
                    img.src = ev.target.result;
                };
                reader.onerror = function() {
                    reject(new Error('Không đọc được file upload.'));
                };
                reader.readAsDataURL(file);
            });
        }

        function submitConvertedSiteImage(form, formData, imageType) {
            $.ajax({
                url: 'admin_api.php',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                dataType: 'json'
            }).done(function(r){
                if (r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Đã upload ảnh', r.message || 'Ảnh giao diện đã được cập nhật.');
                    var url = r.url || '';
                    var cssUrl = r.css_url || url;
                    if (imageType === 'bg') {
                        $('#siteBgPreview').attr('src', url);
                        document.documentElement.style.setProperty('--site-bg-image', "url('" + cssUrl + "')");
                    } else {
                        $('#siteLogoPreview').attr('src', url);
                        $('.brand img').attr('src', url);
                        $('link[rel="icon"]').attr('href', url);
                    }
                    form.reset();
                } else {
                    Swal.fire('Lỗi!', r.message || 'Upload ảnh thất bại.', 'error');
                }
            }).fail(function(){
                Swal.fire('Lỗi!', 'Không kết nối được server.', 'error');
            });
        }

        $('.site-image-upload-form').on('submit', function(e){
            e.preventDefault();
            var form = this;
            var formData = new FormData(form);
            var imageType = formData.get('image_type');
            var fileInput = $(form).find('input[type="file"]')[0];
            if (!fileInput || !fileInput.files || !fileInput.files.length) {
                Swal.fire('Lỗi!', 'Vui lòng chọn file ảnh.', 'error');
                return false;
            }
            appLoading('Đang upload ảnh...');
            if (imageType === 'logo' && fileInput.files[0].type !== 'image/png') {
                appLoading('Đang chuyển logo sang PNG...');
                convertImageFileToPng(fileInput.files[0]).then(function(blob){
                    formData.set('image_file', blob, 'logo.png');
                    appLoading('Đang upload logo...');
                    submitConvertedSiteImage(form, formData, imageType);
                }).catch(function(err){
                    Swal.fire('Lỗi!', err.message || 'Không chuyển được logo sang PNG.', 'error');
                });
                return false;
            }
            $.ajax({
                url: 'admin_api.php',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                dataType: 'json'
            }).done(function(r){
                if (r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Đã upload ảnh', r.message || 'Ảnh giao diện đã được cập nhật.');
                    var url = r.url || '';
                    var cssUrl = r.css_url || url;
                    if (imageType === 'bg') {
                        $('#siteBgPreview').attr('src', url);
                        document.documentElement.style.setProperty('--site-bg-image', "url('" + cssUrl + "')");
                    } else {
                        $('#siteLogoPreview').attr('src', url);
                        $('.brand img').attr('src', url);
                        $('link[rel="icon"]').attr('href', url);
                    }
                    form.reset();
                } else {
                    Swal.fire('Lỗi!', r.message || 'Upload ảnh thất bại.', 'error');
                }
            }).fail(function(){
                Swal.fire('Lỗi!', 'Không kết nối được server.', 'error');
            });
            return false;
        });

        $('#authCodeSearchForm').on('submit', function(e){
            e.preventDefault();
            loadAuthCodes($('#authCodeSearchInput').val());
            return false;
        });
        $('#authCodeSearchInput').on('input', function(){
            clearTimeout(authCodeSearchTimer);
            authCodeSearchTimer = setTimeout(function(){
                loadAuthCodes($('#authCodeSearchInput').val());
            }, 180);
        });
        $('#btnClearAuthCodeSearch').on('click', function(){
            clearTimeout(authCodeSearchTimer);
            $('#authCodeSearchInput').val('');
            loadAuthCodes('');
            $('#authCodeSearchInput').focus();
        });

        $('#shop_item_select').on('change', function(){
            var text = $(this).find('option:selected').text();
            if(!text) return;
            var cleanName = cleanSelectedItemName(text);
            var $name = $('#shop_item_name');
            if($name.attr('data-auto-name') !== '0' || !$name.val()) {
                $name.val(cleanName).attr('data-auto-name', '1');
            }
        });
        $('#shop_item_name').on('input', function(){ $(this).attr('data-auto-name', '0'); });
        $('#shop_image_url').on('input change', function(){ updateShopImagePreview(this.value); });

        $('#webshopForm').submit(function(e){
            e.preventDefault();
            $('#shop_is_active_value').val($('#shop_is_active').is(':checked') ? 1 : 0);
            if ($('#shop_product_mode').val()==='bundle' && !shopBundleItems.length) return Swal.fire('Gói trống','Thêm ít nhất một item.','warning');
            $('#shop_reward_items').val(JSON.stringify(shopBundleItems));
            appLoading('Đang lưu Webshop...');
            $.post("admin_api.php", $(this).serialize(), function(r) {
                if(r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Đã lưu', r.message);
                    var selectedKey = String($('#shop_item_select').val() || '');
                    var imageUrl = String($('#shop_image_url').val() || '');
                    if (selectedKey && imageUrl && $('#shop_product_mode').val()!=='bundle') setAdminItemIcon(selectedKey, imageUrl);
                    bootstrap.Modal.getOrCreateInstance(document.getElementById('webshopEditModal')).hide();
                    resetWebshopForm();
                    loadWebshopItems();
                    if ($('#tab-item-icons').hasClass('active')) loadItemIcons();
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });

        $('#icon_item_select').on('change', function(){
            var selectedKey = String($(this).val() || '');
            var text = $(this).find('option:selected').text();
            var cleanName = cleanSelectedItemName(text);
            var $name = $('#icon_item_name');
            if($name.attr('data-auto-name') !== '0' || !$name.val()) {
                $name.val(cleanName).attr('data-auto-name', '1');
            }
            var iconUrl = selectedKey ? getAdminItemIcon(selectedKey) : '';
            $('#icon_image_url').val(iconUrl);
            updateIconImagePreview(iconUrl);
        });
        $('#icon_item_name').on('input', function(){ $(this).attr('data-auto-name', '0'); });
        $('#icon_image_url').on('input change', function(){ updateIconImagePreview(this.value); });
        $('#itemIconForm').submit(function(e){
            e.preventDefault();
            appLoading('Đang lưu icon item...');
            $.post("admin_api.php", $(this).serialize(), function(r) {
                if(r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Đã lưu', r.message);
                    var selectedKey = String(r.item_id || $('#icon_item_select').val() || '');
                    var imageUrl = String(r.image_url || $('#icon_image_url').val() || '');
                    if (selectedKey && imageUrl) setAdminItemIcon(selectedKey, imageUrl);
                    loadItemIcons();
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });

        $('#btnAddMilestoneItem').click(function(){
            var id = $('#milestone_builder_item').val();
            var amt = parseInt($('#milestone_builder_amount').val(), 10);
            if(!id || !amt || amt < 1) return;
            milestoneItems[id] = milestoneItems[id] ? milestoneItems[id] + amt : amt;
            updateMilestonePreview();
            $('#milestone_builder_amount').val(1);
            $('#milestone_builder_item').val(null).trigger('change');
        });

        $('#milestoneForm').submit(function(e){
            e.preventDefault();
            if(Object.keys(milestoneItems).length === 0) {
                Swal.fire('Cảnh báo', 'Chưa thêm quà cho mốc Donate.', 'warning');
                return;
            }
            updateMilestonePreview();
            $('#milestone_is_active_value').val($('#milestone_is_active').is(':checked') ? 1 : 0);
            appLoading('Đang lưu mốc Donate...');
            $.post("admin_api.php", $(this).serialize(), function(r) {
                if(r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Đã lưu', r.message);
                    bootstrap.Modal.getOrCreateInstance(document.getElementById('donateMilestoneModal')).hide();
                    resetMilestoneForm();
                    loadRechargeMilestones();
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });

        $('#refreshLuckyWheelHistory').on('click',loadLuckyWheelHistory);

        $('.ajax-form').submit(function(e) {
            e.preventDefault(); var $form = $(this);
            var action = $form.find('input[name="action"]').val();
            
            if(action === 'create_giftcode' && Object.keys(giftcodeItems).length === 0) { Swal.fire('Cảnh báo', 'Chưa thêm vật phẩm vào mã quà tặng!', 'warning'); return; }
            if($form.hasClass('form-no-reset')) return; 

            appLoading('Đang xử lý...');
            
            $.post("admin_api.php", $form.serialize(), function(r) {
                if(r.status === 'success') {
                    Swal.close();
                    appToast('success', 'Thành công', r.message);
                    
                    if(action === 'create_auth_code') { loadAuthCodes(); loadOverview(); }
                    if(action === 'save_vip_voucher') { resetVipVoucherForm(); loadVipVouchers(); }
                    if(action === 'create_giftcode') { giftcodeItems = {}; updateJsonPreview(); taiMaQuaTang(); loadOverview(); }
                    if(action === 'set_user_vip' || action === 'change_password' || action === 'update_xu') { 
                        loadUsers($('#userPagination .active').text() || 1); 
                        loadOverview();
                        $('#vipModal, #pwdModal, #xuModal').modal('hide'); 
                    }
                    
                    $form[0].reset(); $form.find('.select2-custom').val(null).trigger('change'); 
                } else Swal.fire('Lỗi!', r.message, 'error');
            }, 'json');
        });
        $('#adminMobileMenuToggle').on('click', function(){
            setAdminMobileMenu(!$('body').hasClass('admin-menu-open'));
        });
        $('#adminMobileMenuBackdrop').on('click', function(){
            setAdminMobileMenu(false);
        });
        $('#adminSidebarMenu .menu-btn').on('click', function(){
            if (window.matchMedia('(max-width: 768px)').matches) setAdminMobileMenu(false);
        });
        $(document).on('keydown', function(e){
            if (e.key === 'Escape') setAdminMobileMenu(false);
        });
        
        // Smart Search Filters
        $(document).on('input', '#webshopSearchFilter', function() {
            var query = $(this).val().toLowerCase().trim();
            $('#webshopTableBody tr').each(function() {
                var text = $(this).text().toLowerCase();
                if (text.indexOf(query) !== -1 || $(this).hasClass('ui-skeleton-row')) {
                    $(this).show();
                } else {
                    $(this).hide();
                }
            });
        });
        $(document).on('input', '#milestonesSearchFilter', function() {
            var query = $(this).val().toLowerCase().trim();
            $('#milestoneTableBody tr').each(function() {
                var text = $(this).text().toLowerCase();
                if (text.indexOf(query) !== -1 || $(this).hasClass('ui-skeleton-row')) {
                    $(this).show();
                } else {
                    $(this).hide();
                }
            });
        });
        $(document).on('input', '#itemIconSearchFilter', function() {
            renderItemIconRows();
        });

        initTooltips(document);
    });
