// Player UI helpers and AJAX flow.
(function() {
    try { document.cookie = "lhs_is_popup=; path=/; max-age=0;"; } catch(e){}
    if (window.self !== window.top) {
        document.documentElement.classList.add('is-iframe-popup');
        if (document.body) document.body.classList.add('is-iframe-popup');
    }
})();

var LHS_GIFTCODE_NOTICE_KEY = 'lhs_public_giftcode_notice_v1';
function lhsGiftcodeStatusFromCards() {
    var hasUnclaimed = false;
    $('.gc-card[data-giftcode]').each(function() {
        if (!$(this).hasClass('gc-claimed') && $(this).attr('aria-disabled') !== 'true') hasUnclaimed = true;
    });
    var source = (typeof publicGiftcodeStatus === 'object' && publicGiftcodeStatus) || {};
    return {
        revision: Number(source.revision || 0),
        hasUnclaimed: hasUnclaimed
    };
}
function publishGiftcodeStatus() {
    var status = lhsGiftcodeStatusFromCards();
    var payload = { type: 'lhs-giftcode-status', revision: status.revision, hasUnclaimed: status.hasUnclaimed };
    try { localStorage.setItem(LHS_GIFTCODE_NOTICE_KEY, JSON.stringify(payload)); } catch (e) {}
    if (window.parent && window.parent !== window) {
        try { window.parent.postMessage(payload, window.location.origin); } catch (e) {}
    }
}
function openGiftcodeTabFromQuery() {
    var tab = '';
    try { tab = new URLSearchParams(window.location.search).get('tab') || ''; } catch (e) {}
    if (tab !== 'tab-giftcode') return;
    window.setTimeout(function() {
        var menu = document.querySelector('.menu-btn[data-tab="tab-giftcode"]');
        if (menu) menu.click();
    }, 80);
}
$(function() {
    publishGiftcodeStatus();
    openGiftcodeTabFromQuery();
});

(function() {
    var originalSwalFire = Swal.fire;
    Swal.fire = function() {
        var args = arguments;
        if (args.length > 0) {
            var msg = '';
            if (typeof args[0] === 'object' && args[0] !== null) {
                msg = args[0].text || args[0].html || args[0].title || '';
            } else if (args.length >= 2) {
                msg = String(args[1]);
            }
            var isTimeout = false;
            if (typeof args[0] === 'object' && args[0] !== null) {
                if (args[0].login_required) isTimeout = true;
            }
            if (typeof msg === 'string' && (/phi\u00ean\s+\u0111\u0103ng\s+nh\u1eadp/i.test(msg) || /login_required/i.test(msg) || /phi\u00ean\s+l\u00e0m\s+vi\xecc\s+\u0111\u00e3\s+h\u1ebft\s+h\u1ea1n/i.test(msg))) {
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
})()

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
function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
}
function formatVnNumber(value) {
    var raw = String(value == null ? 0 : value).trim();
    if (/^\d+$/.test(raw) && raw.length > 15) {
        raw = raw.replace(/^0+(?=\d)/, '');
        return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    return Number(value || 0).toLocaleString('vi-VN');
}
function escapeHtml(value) { return $('<div>').text(value == null ? '' : value).html(); }
if (typeof currentXuWeb === 'undefined') var currentXuWeb = 0;
function cleanTransferTag(value, fallback) {
    var tag = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    return tag || fallback;
}
function updateCoinsDisplay(coinsCount) {
    coinsCount = Math.max(0, parseInt(coinsCount, 10) || 0);
    var formattedCoins = formatVnNumber(coinsCount);
    $('.xu-val-header').text(formattedCoins);
    $('.xu-val-profile').text(formattedCoins);
}
function setCurrentXuWeb(coinsCount) {
    currentXuWeb = Math.max(0, parseInt(coinsCount, 10) || 0);
    updateCoinsDisplay(currentXuWeb);
}
function handleWalletStatus(coinsCount) {
    var newXu = Math.max(0, parseInt(coinsCount, 10) || 0);
    if (newXu > currentXuWeb) {
        var addedXu = newXu - currentXuWeb;
        setCurrentXuWeb(newXu);
        triggerConfetti();
        appToast('success', 'Donate Xu th\u00e0nh c\u00f4ng', 'V\u00ed Web +' + formatVnNumber(addedXu) + ' Xu.');
        return;
    }
    setCurrentXuWeb(newXu);
}

var rechargeStatusState = { loaded: false, loading: false, lastRequestAt: 0 };
function renderRechargeCardState($card, state) {
    var percent = Math.max(0, Math.min(100, parseInt(state.percent, 10) || 0));
    var id = parseInt(state.id, 10) || 0;
    var total = Math.max(0, parseInt(state.total, 10) || 0);
    var need = Math.max(1, parseInt(state.need_amount, 10) || parseInt($card.attr('data-recharge-need'), 10) || 1);
    var claimed = state.claimed === true;
    var ready = state.ready === true;
    var pending = state.pending === true;
    var deliveryId = parseInt(state.delivery_id, 10) || 0;
    var fingerprint = [total, percent, claimed ? 1 : 0, ready ? 1 : 0, String(state.claim_period || ''), pending ? 1 : 0, deliveryId].join('|');

    $card.find('.milestone-progress > span').css('width', percent + '%');
    $card.attr('data-recharge-state', fingerprint);
    $card.removeClass('is-claimed is-ready').addClass(claimed ? 'is-claimed' : (ready ? 'is-ready' : ''));

    var footerHtml;
    if (claimed) {
        footerHtml = '<span class="badge bg-secondary rounded-pill px-3 py-2"><i class="fa-solid fa-check me-1"></i> Đã nhận</span>';
    } else if (pending && deliveryId > 0) {
        footerHtml = '<button type="button" class="btn btn-outline-warning fw-bold" data-reward-retry data-kind="recharge" data-delivery-id="' + deliveryId + '">Gửi lại quà đang chờ</button>';
    } else if (ready) {
        footerHtml = '<form class="ajax-form form-no-reset recharge-claim-form">'
            + '<input type="hidden" name="action" value="claim_recharge_milestone">'
            + '<input type="hidden" name="milestone_id" value="' + id + '">'
            + '<button type="button" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#10b981,#059669)" onclick="submitAjax(this)">Nhận quà</button>'
            + '</form>';
    } else {
        footerHtml = '<div><div class="fw-black text-warning">' + percent + '%</div><div class="small text-muted fw-bold">Chưa đủ mốc</div></div>';
    }
    $card.find('.recharge-card-footer').html(footerHtml);
}

function applyRechargeStatusSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.milestones)) return;
    var totals = snapshot.totals || {};
    Object.keys(totals).forEach(function(period) {
        var total = Math.max(0, parseInt(totals[period], 10) || 0);
        $('.recharge-period-total[data-recharge-period-total="' + period + '"]').text('Đã Donate: ' + formatVnNumber(total) + ' VNĐ');
    });
    var states = {};
    snapshot.milestones.forEach(function(state) { states[String(state.id)] = state; });
    $('[data-recharge-card]').each(function() {
        var $card = $(this);
        var state = states[String($card.attr('data-milestone-id') || '')];
        if (!state) return;
        if (String(state.period_type || '') !== String($card.attr('data-recharge-period') || '')) return;
        var percent = Math.max(0, Math.min(100, parseInt(state.percent, 10) || 0));
        var total = Math.max(0, parseInt(state.total, 10) || 0);
        var fingerprint = [total, percent, state.claimed === true ? 1 : 0, state.ready === true ? 1 : 0, String(state.claim_period || ''), state.pending === true ? 1 : 0, parseInt(state.delivery_id, 10) || 0].join('|');
        if ($card.attr('data-recharge-state') !== fingerprint) renderRechargeCardState($card, state);
    });
    rechargeStatusState.loaded = true;
}

function refreshRechargeStatus(force) {
    if (!$('#tab-rewards').hasClass('active') || document.hidden || rechargeStatusState.loading) return;
    var now = Date.now();
    if (!force && now - rechargeStatusState.lastRequestAt < 15000) return;
    rechargeStatusState.loading = true;
    rechargeStatusState.lastRequestAt = now;
    $.post('api/user_api.php', { action: 'get_recharge_status' }, function(response) {
        if (response && response.status === 'success') applyRechargeStatusSnapshot(response.recharge);
    }, 'json').always(function() {
        rechargeStatusState.loading = false;
    });
}
function renderLinkedPhoneBox(maskedPhone) {
    $('#phoneSecurityBox').html(
        '<h5 class="fw-black text-primary mb-2"><i class="fa-solid fa-phone me-2"></i>Số điện thoại bảo mật (Mật khẩu cấp 2)</h5>'
        + '<div class="d-flex align-items-center gap-3">'
        + '<div class="fs-1 text-success"><i class="fa-solid fa-circle-check"></i></div>'
        + '<div>'
        + '<div class="fw-bold text-dark fs-6">Đã liên kết bảo mật thành công</div>'
        + '<div class="text-muted fw-bold small mt-1">Số điện thoại liên kết: <strong class="text-primary fs-5" id="linkedPhoneMasked">' + escapeHtml(maskedPhone || '') + '</strong></div>'
        + '<div class="small text-muted mt-1 font-italic">Dùng số điện thoại này để khôi phục mật khẩu nếu bị quên.</div>'
        + '</div></div>'
    );
}
function updateVipBanner(level) {
    level = Math.max(0, parseInt(level, 10) || 0);
    var visualLevel = level >= 2 ? 2 : level;
    var $banner = $('.vip-card-banner').first();
    $banner.removeClass('vip-level-0 vip-level-1 vip-level-2').addClass('vip-level-' + visualLevel).attr('data-vip-level', level);
    $banner.find('h3').first().text(level > 0 ? '\u0110\u1eb6C QUY\u1ec0N VIP ' + level : 'T\u00c0I KHO\u1ea2N TH\u01af\u1edcNG');
}
function appLoading(title) {
    Swal.fire({
        title: title || '\u0110ang x\u1eed l\u00fd...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: function(){ Swal.showLoading(); }
    });
}
function appConfirmDanger(message) {
    return Swal.fire({
        title: 'X\u00e1c nh\u1eadn thao t\u00e1c',
        html: '<div class="text-start"><div class="fw-bold text-danger mb-2"><i class="fa-solid fa-triangle-exclamation me-1"></i> Vui l\u00f2ng ki\u1ec3m tra k\u1ef9 tr\u01b0\u1edbc khi ti\u1ebfp t\u1ee5c.</div><div class="text-muted fw-bold">'+String(message || '')+'</div></div>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'X\u00e1c nh\u1eadn',
        cancelButtonText: 'H\u1ee7y',
        confirmButtonColor: '#ef4444',
        reverseButtons: true,
        focusCancel: true
    });
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
function showModalById(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) bootstrap.Modal.getOrCreateInstance(el).show();
    else if (typeof $ !== 'undefined' && $(el).modal) $(el).modal('show');
}
function setPlayerMobileMenu(open) {
    $('body').toggleClass('player-menu-open', !!open);
    $('#playerMobileMenuToggle').attr('aria-expanded', open ? 'true' : 'false');
}
function hasPaymentBankConfig() {
    return String(vietqrBank || '').trim() !== '' && String(vietqrAccount || '').trim() !== '' && String(vietqrAccountName || '').trim() !== '';
}
function updatePaymentBankText(scope) {
    $('#' + scope + 'BankText').text(vietqrBank || 'Ch\u01b0a c\u1ea5u h\u00ecnh');
    $('#' + scope + 'BankAccountText').text(vietqrAccount || 'Ch\u01b0a c\u1ea5u h\u00ecnh');
    $('#' + scope + 'BankAccountNameText').text(vietqrAccountName || 'Ch\u01b0a c\u1ea5u h\u00ecnh');
}
function updateTopupQr() {
    var amount = parseInt($('#topupAmountInput').val(), 10);
    if (!amount || amount < 1000) amount = 1000;
    var tag = cleanTransferTag(sepayTopupTag, 'LHS');
    var content = 'DONATE ' + tag + ' S' + topupServer + ' ' + topupAccount + ' ' + amount;
    updatePaymentBankText('topup');
    $('#topupAmountText').text(formatVnNumber(amount));
    $('#topupContentText').text(content);
    if (!hasPaymentBankConfig()) {
        $('#topupQrImage').removeAttr('src').attr('alt', 'Ch\u01b0a c\u1ea5u h\u00ecnh ng\u00e2n h\u00e0ng');
        return;
    }
    var url = 'https://img.vietqr.io/image/' + encodeURIComponent(vietqrBank + '-' + vietqrAccount) + '-compact2.jpg?amount=' + amount + '&addInfo=' + encodeURIComponent(content) + '&accountName=' + encodeURIComponent(vietqrAccountName);
    $('#topupQrImage').attr('src', url).attr('alt', 'QR Donate Xu');
}
function updateVipQr() {
    var amount = Math.max(1000, vipBaseAmount - vipVoucherDiscount);
    var tag = cleanTransferTag(sepayVipTag, 'LHSVIP');
    var content = 'DONATE ' + tag + ' S' + topupServer + ' ' + topupAccount + (vipVoucherCode ? ' ' + vipVoucherCode : '');
    updatePaymentBankText('vip');
    $('#vipPayAmountText').text(formatVnNumber(amount));
    $('#vipTransferContent').text(content);
    if (!hasPaymentBankConfig()) {
        $('#vipQrImage').removeAttr('src').attr('alt', 'Ch\u01b0a c\u1ea5u h\u00ecnh ng\u00e2n h\u00e0ng');
        return;
    }
    var url = 'https://img.vietqr.io/image/' + encodeURIComponent(vietqrBank + '-' + vietqrAccount) + '-compact2.jpg?amount=' + amount + '&addInfo=' + encodeURIComponent(content) + '&accountName=' + encodeURIComponent(vietqrAccountName);
    $('#vipQrImage').attr('src', url).attr('alt', 'QR VIP');
}
function resetVipVoucher() {
    vipVoucherCode = '';
    vipVoucherDiscount = 0;
    $('#vipVoucherStatus').removeClass('alert-success').addClass('alert-light').html('S\u1ed1 ti\u1ec1n c\u1ea7n chuy\u1ec3n: <span class="text-danger" id="vipPayAmountText">'+formatVnNumber(vipBaseAmount)+'</span> VN\u0110');
    updateVipQr();
}
function applyVipVoucher() {
    var code = String($('#vipVoucherCode').val() || '').trim().toUpperCase();
    $('#vipVoucherCode').val(code);
    if (!code) { resetVipVoucher(); return; }
    appLoading('\u0110ang ki\u1ec3m tra m\u00e3 gi\u1ea3m gi\u00e1...');
    $.post('api/user_api.php', { action: 'check_vip_voucher', voucher_code: code }, function(r) {
        if (r.status === 'success') {
            vipVoucherCode = r.code || '';
            vipVoucherDiscount = Number(r.discount_amount || 0);
            updateVipQr();
            $('#vipVoucherStatus').removeClass('alert-light').addClass('alert-success').html('\u0110\u00e3 gi\u1ea3m <span class="text-danger fw-black">'+formatVnNumber(vipVoucherDiscount)+'</span> VN\u0110. S\u1ed1 ti\u1ec1n c\u1ea7n chuy\u1ec3n: <span class="text-danger fw-black" id="vipPayAmountText">'+formatVnNumber(r.final_amount)+'</span> VN\u0110');
            Swal.close();
            appToast('success', '\u0110\u00e3 \u00e1p m\u00e3', r.message || '\u0110\u00e3 \u00e1p m\u00e3 gi\u1ea3m gi\u00e1.');
        } else {
            resetVipVoucher();
            Swal.fire('Th\u1ea5t b\u1ea1i', r.message || 'M\u00e3 gi\u1ea3m gi\u00e1 kh\u00f4ng h\u1ee3p l\u1ec7.', 'error');
        }
    }, 'json').fail(function(){
        resetVipVoucher();
        Swal.fire('L\u1ed7i m\u1ea1ng', 'Kh\u00f4ng th\u1ec3 ki\u1ec3m tra m\u00e3 gi\u1ea3m gi\u00e1.', 'error');
    });
}
function applyFeatureVisibility() {
    if (!featureVip) { $('.menu-btn[data-tab="tab-vip"]').remove(); $('#tab-vip').remove(); }
    if (!featureGm) { $('.menu-btn[data-tab="tab-gm"]').remove(); $('#tab-gm').remove(); }
}
function chonMaQuaTang(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    $('#inputMaQuaTang').val(code).trigger('input').focus();
    $('.gc-card').removeClass('gc-selected');
    $('.gc-card').filter(function(){ return String($(this).attr('data-giftcode') || '').toUpperCase() === code; }).addClass('gc-selected');
}
function markGiftcodeClaimed(code, usedCount, maxUses) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    var card = $('.gc-card').filter(function(){ return String($(this).attr('data-giftcode') || '').toUpperCase() === code; });
    if (!card.length) return;
    card.addClass('gc-claimed').removeClass('gc-selected').removeAttr('onclick').attr('aria-disabled', 'true');
    card.find('.giftcode-status-slot').html('<span class="badge bg-secondary py-2 px-3 rounded-pill shadow-sm"><i class="fa-solid fa-check"></i> Đã nhận</span>');
    if (typeof usedCount !== 'undefined' && typeof maxUses !== 'undefined') {
        card.find('.giftcode-uses-text').text(formatVnNumber(usedCount) + '/' + formatVnNumber(maxUses));
    }
    publishGiftcodeStatus();
}

function transactionStatusBadge(status, label) {
    var cls = 'bg-secondary';
    if (status === 'success') cls = 'bg-success';
    else if (status === 'failed') cls = 'bg-danger';
    else if (status === 'ignored') cls = 'bg-warning text-dark';
    return '<span class="badge rounded-pill '+cls+' px-3 py-2">'+escapeHtml(label || status || '-')+'</span>';
}

function clampPublicPage(page, totalPages) {
    totalPages = Math.max(1, Number(totalPages || 1));
    page = parseInt(page, 10);
    if (!page || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    return page;
}

window.playerGoPage = function(input, loaderName) {
    var $box = $(input).closest('.pagination-box');
    var totalPages = Number($box.attr('data-total-pages') || 1);
    var page = clampPublicPage($box.find('.pagination-jump-input').val(), totalPages);
    if (typeof window[loaderName] === 'function') window[loaderName](page);
};

function renderPlayerPagination(selector, totalPages, currentPage, loaderName) {
    totalPages = Math.max(1, Number(totalPages || 1));
    currentPage = clampPublicPage(currentPage, totalPages);
    if (totalPages <= 1) {
        $(selector).empty();
        return;
    }
    var prevPage = clampPublicPage(currentPage - 1, totalPages);
    var nextPage = clampPublicPage(currentPage + 1, totalPages);
    var prevDisabled = currentPage <= 1 ? ' disabled' : '';
    var nextDisabled = currentPage >= totalPages ? ' disabled' : '';
    var html = ''
        + '<div class="pagination-status">Trang <b>' + currentPage + '</b> / ' + totalPages + '</div>'
        + '<button type="button" class="pagination-nav" onclick="' + loaderName + '(' + prevPage + ')"' + prevDisabled + '><i class="fa-solid fa-chevron-left"></i><span>Trước</span></button>'
        + '<button type="button" class="active page-current" onclick="' + loaderName + '(' + currentPage + ')">' + currentPage + '</button>'
        + '<button type="button" class="pagination-nav" onclick="' + loaderName + '(' + nextPage + ')"' + nextDisabled + '><span>Sau</span><i class="fa-solid fa-chevron-right"></i></button>'
        + "<div class=\"pagination-jump\"><span>Đi tới</span><input type=\"number\" class=\"pagination-jump-input\" min=\"1\" max=\"" + totalPages + "\" value=\"" + currentPage + "\" onkeydown=\"if(event.key==='Enter') playerGoPage(this, '" + loaderName + "')\"><button type=\"button\" class=\"pagination-go\" onclick=\"playerGoPage(this, '" + loaderName + "')\">Đi</button></div>";
    $(selector)
        .attr('data-current-page', currentPage)
        .attr('data-total-pages', totalPages)
        .html(html);
}

function renderTransactionPagination(totalPages, currentPage) {
    renderPlayerPagination('#transactionHistoryPagination', totalPages, currentPage, 'loadTransactionHistory');
}
function loadTransactionHistory(page) {
    page = page || 1;
    $('#transactionHistoryBody').html('<tr><td colspan="6" class="text-center text-muted fw-bold py-4"><i class="fa-solid fa-spinner fa-spin me-1"></i> Đang tải lịch sử...</td></tr>');
    $.post('api/user_api.php', { action: 'get_my_transactions', page: page }, function(r) {
        if (r.status !== 'success') {
            $('#transactionHistoryBody').html('<tr><td colspan="6" class="text-center text-danger fw-bold py-4">'+escapeHtml(r.message || 'Không tải được lịch sử Donate.')+'</td></tr>');
            $('#transactionHistoryPagination').empty();
            return;
        }
        var rows = r.data || [];
        if (!rows.length) {
            $('#transactionHistoryBody').html('<tr><td colspan="6" class="text-center text-muted fw-bold py-4">Chưa có Donate nào.</td></tr>');
            $('#transactionHistoryPagination').empty();
            return;
        }
        var html = '';
        $.each(rows, function(_, row) {
            var amount = Number(row.amount || 0);
            var amountText = amount > 0 ? formatVnNumber(amount) + ' VNĐ' : '-';
            var serverText = row.server_id ? ('<div class="small text-muted">S' + escapeHtml(row.server_id) + '</div>') : '';
            var content = row.content ? '<div class="small text-muted mt-1">'+escapeHtml(row.content)+'</div>' : '';
            html += '<tr>'
                + '<td class="fw-bold text-dark">'+escapeHtml(row.created_at || '-')+'</td>'
                + '<td><div class="fw-black text-info">'+escapeHtml(row.action_label || row.action || '-')+'</div>'+serverText+'</td>'
                + '<td class="fw-black text-warning">'+amountText+'</td>'
                + '<td>'+transactionStatusBadge(row.status, row.status_label)+'</td>'
                + '<td class="text-start"><div class="fw-bold">'+escapeHtml(row.message || '-')+'</div>'+content+'</td>'
                + '<td><code>'+escapeHtml(row.tran_id || row.id || '-')+'</code></td>'
                + '</tr>';
        });
        $('#transactionHistoryBody').html(html);
        renderTransactionPagination(r.total_pages, r.current_page);
    }, 'json').fail(function() {
        $('#transactionHistoryBody').html('<tr><td colspan="6" class="text-center text-danger fw-bold py-4">Không kết nối được API lịch sử Donate.</td></tr>');
        $('#transactionHistoryPagination').empty();
    });
}

var spendHistoryState = {
    period: 'today',
    dateFrom: '',
    dateTo: '',
    statusFilter: 'all',
    loaded: false,
    loading: false
};

function formatVnDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? (match[3] + '/' + match[2] + '/' + match[1]) : String(value || '-');
}

function localDateValue(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

function initializeSpendDateInputs() {
    var today = new Date();
    var first = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!$('#spendDateFrom').val()) $('#spendDateFrom').val(localDateValue(first));
    if (!$('#spendDateTo').val()) $('#spendDateTo').val(localDateValue(today));
}

function webshopSpendStatusBadge(status, label) {
    var cls = 'bg-secondary';
    var icon = 'fa-circle-question';
    if (status === 'paid') { cls = 'bg-success'; icon = 'fa-circle-check'; }
    else if (status === 'refunded') { cls = 'bg-warning text-dark'; icon = 'fa-rotate-left'; }
    else if (status === 'failed') { cls = 'bg-danger'; icon = 'fa-circle-xmark'; }
    return '<span class="badge rounded-pill ' + cls + ' px-3 py-2"><i class="fa-solid ' + icon + ' me-1"></i>' + escapeHtml(label || status || '-') + '</span>';
}

function spendItemImage(row) {
    var imageUrl = resolveItemImageUrl(row.image_url || '');
    if (!imageUrl) return '<span class="spend-item-fallback"><i class="fa-solid fa-box-open"></i></span>';
    return '<img src="' + escapeHtml(imageUrl) + '" alt="" onerror="this.parentNode.innerHTML=\'<span class=&quot;spend-item-fallback&quot;><i class=&quot;fa-solid fa-box-open&quot;></i></span>\'">';
}

function renderSpendSummary(response) {
    var summary = response.summary || {};
    var today = response.today || {};
    $('#spendSummaryNet').text(formatVnNumber(summary.net_spend || 0) + ' Xu');
    $('#spendSummaryOrders').text(formatVnNumber(summary.order_count || 0));
    $('#spendSummaryPackages').text(formatVnNumber(summary.paid_packages || 0) + ' gói đã mua');
    $('#spendSummaryToday').text(formatVnNumber(today.net_spend || 0) + ' Xu');
    $('#spendSummaryTodayOrders').text(formatVnNumber(today.order_count || 0) + ' đơn hôm nay');
    $('#spendSummaryRefund').text(formatVnNumber(summary.refunded_spend || 0) + ' Xu');
    $('#spendSummaryFailed').text(formatVnNumber(summary.failed_count || 0) + ' đơn thất bại');
    $('#spendRangeLabel').text('Đang xem: ' + ((response.range && response.range.label) || 'Khoảng đã chọn'));
}

function renderSpendDailyChart(rows) {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) {
        $('#spendDailyChart').html('<div class="text-muted fw-bold py-3">Chưa có dữ liệu theo ngày trong khoảng này.</div>');
        return;
    }
    var chartRows = rows.slice().reverse().slice(-31);
    var maxSpend = 0;
    $.each(chartRows, function(_, row) { maxSpend = Math.max(maxSpend, Number(row.net_spend || 0)); });
    var html = '<div class="spend-chart-bars">';
    $.each(chartRows, function(_, row) {
        var spend = Number(row.net_spend || 0);
        var width = maxSpend > 0 ? Math.max(2, Math.round(spend * 100 / maxSpend)) : 0;
        html += '<div class="spend-chart-row">'
            + '<div class="spend-chart-date">' + escapeHtml(formatVnDate(row.date)) + '</div>'
            + '<div class="spend-chart-track"><span style="width:' + width + '%"></span></div>'
            + '<div class="spend-chart-value"><b>' + formatVnNumber(row.net_spend || 0) + ' Xu</b><small>' + formatVnNumber(row.order_count || 0) + ' đơn</small></div>'
            + '</div>';
    });
    html += '</div>';
    $('#spendDailyChart').html(html);
}

function renderSpendHistoryPagination(totalPages, currentPage) {
    renderPlayerPagination('#spendHistoryPagination', totalPages, currentPage, 'loadWebshopSpendHistory');
}

function loadWebshopSpendHistory(page) {
    if (spendHistoryState.loading) return;
    page = page || 1;
    spendHistoryState.loading = true;
    $('#spendHistoryBody').html('<tr><td colspan="7" class="text-center text-muted fw-bold py-4"><i class="fa-solid fa-spinner fa-spin me-1"></i> Đang tải lịch sử tiêu Xu...</td></tr>');
    var payload = {
        action: 'get_my_webshop_spend_history',
        page: page,
        period: spendHistoryState.period,
        status_filter: spendHistoryState.statusFilter
    };
    if (spendHistoryState.period === 'custom') {
        payload.date_from = spendHistoryState.dateFrom;
        payload.date_to = spendHistoryState.dateTo;
    }
    $.post('api/user_api.php', payload, function(response) {
        if (response.status !== 'success') {
            $('#spendHistoryBody').html('<tr><td colspan="7" class="text-center text-danger fw-bold py-4">' + escapeHtml(response.message || 'Không tải được lịch sử tiêu Xu.') + '</td></tr>');
            $('#spendHistoryPagination').empty();
            return;
        }
        spendHistoryState.loaded = true;
        renderSpendSummary(response);
        renderSpendDailyChart(response.daily || []);
        var rows = response.data || [];
        if (!rows.length) {
            $('#spendHistoryBody').html('<tr><td colspan="7" class="text-center text-muted fw-bold py-4">Không có đơn Webshop trong khoảng đã chọn.</td></tr>');
            $('#spendHistoryPagination').empty();
            return;
        }
        var html = '';
        $.each(rows, function(_, row) {
            html += '<tr>'
                + '<td><div class="fw-bold text-dark">' + escapeHtml(row.created_at || '-') + '</div></td>'
                + '<td><div class="spend-item-cell"><span class="spend-item-thumb">' + spendItemImage(row) + '</span><span><b>' + escapeHtml(row.item_name || ('Vật phẩm ID ' + (row.item_id || '-'))) + '</b><small>ID ' + escapeHtml(row.item_id || '-') + '</small></span></div></td>'
                + '<td><div class="fw-black">' + formatVnNumber(row.quantity || 0) + ' gói</div><div class="small text-muted fw-bold">' + (row.reward_items&&row.reward_items.length ? row.reward_items.map(function(x){return '#'+Number(x.item_id)+' ×'+formatVnNumber(x.amount);}).join(', ') : 'Nhận '+formatVnNumber(row.received_amount||0)) + '</div></td>'
                + '<td class="fw-bold text-primary">' + formatVnNumber(row.unit_price || 0) + ' Xu</td>'
                + '<td class="fw-black text-danger">' + formatVnNumber(row.total_price || 0) + ' Xu</td>'
                + '<td>' + webshopSpendStatusBadge(row.status, row.status_label) + '</td>'
                + '<td><code>#' + escapeHtml(row.id || '-') + '</code>' + (row.status==='pending_delivery'?'<button type="button" class="btn btn-sm btn-outline-primary d-block" onclick="retryWebshopOrder('+Number(row.id)+')">Gửi lại đơn</button>':'') + '</td>'
                + '</tr>';
        });
        $('#spendHistoryBody').html(html);
        renderSpendHistoryPagination(response.total_pages, response.current_page);
    }, 'json').fail(function() {
        $('#spendHistoryBody').html('<tr><td colspan="7" class="text-center text-danger fw-bold py-4">Không kết nối được API lịch sử tiêu Xu.</td></tr>');
        $('#spendHistoryPagination').empty();
    }).always(function() {
        spendHistoryState.loading = false;
    });
}

function selectSpendHistoryPeriod(period) {
    spendHistoryState.period = period;
    $('.spend-period-btn').removeClass('active').filter('[data-period="' + period + '"]').addClass('active');
    $('#spendCustomRange').prop('hidden', period !== 'custom');
    if (period === 'custom') {
        initializeSpendDateInputs();
        return;
    }
    spendHistoryState.dateFrom = '';
    spendHistoryState.dateTo = '';
    loadWebshopSpendHistory(1);
}

var rechargeEventStatusState = { loaded: false, loading: false, lastRequestAt: 0 };
function renderRechargeEventTierState($tier, state) {
    var total = Math.max(0, parseInt(state.total || 0, 10) || 0);
    var need = Math.max(1, parseInt($tier.attr('data-event-need') || 0, 10) || 1);
    var percent = Math.max(0, Math.min(100, parseInt(state.percent || Math.floor(total * 100 / need), 10) || 0));
    var claimed = state.claimed === true, pending = state.pending === true, ready = state.ready === true;
    $tier.removeClass('is-claimed is-ready').addClass(claimed ? 'is-claimed' : (ready ? 'is-ready' : ''));
    $tier.find('.recharge-event-progress > span').css('width', percent + '%');
    var footer = $tier.find('[data-event-tier-footer]');
    var html = '';
    if (claimed) html = '<span class="badge bg-secondary rounded-pill px-3 py-2"><i class="fa-solid fa-check me-1"></i>Đã nhận</span>';
    else if (pending && String(state.server_id) !== String(topupServer)) html = '<span class="small fw-bold text-warning">Quà đang chờ tại S' + escapeHtml(state.server_id) + '</span>';
    else if (pending && Number(state.delivery_id || 0) > 0) html = '<button type="button" class="btn btn-outline-warning fw-bold" data-reward-retry data-kind="recharge_event" data-delivery-id="' + Number(state.delivery_id) + '">Gửi lại quà đang chờ</button>';
    else if (ready) html = '<form class="ajax-form form-no-reset"><input type="hidden" name="action" value="claim_recharge_event_milestone"><input type="hidden" name="event_id" value="' + Number(state.event_id || 0) + '"><input type="hidden" name="tier_id" value="' + Number(state.tier_id || 0) + '"><button type="button" class="btn-custom text-white px-4" style="background:linear-gradient(135deg,#ef4444,#b91c1c)" onclick="submitAjax(this)">Nhận quà</button></form>';
    else html = '<div class="small fw-bold text-muted">' + (state.active ? ('Còn thiếu ' + formatVnNumber(Math.max(0, need - total)) + 'đ') : escapeHtml(state.status_label || 'Sự kiện không mở nhận quà')) + '</div>';
    footer.html(html);
}
function applyRechargeEventStatusSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.events)) return;
    $('[data-event-card-root]').each(function() {
        var id = Number($(this).attr('data-event-id'));
        if (!snapshot.events.some(function(e) { return Number(e.id) === id; })) {
            $(this).find('[data-event-status]').text('Sự kiện đã đóng');
            $(this).find('[data-event-tier-footer]').text('Sự kiện đã đóng');
        }
    });
    snapshot.events.forEach(function(event) {
        var $root = $('[data-event-card-root][data-event-id="' + Number(event.id || 0) + '"]');
        if (!$root.length) return;
        $root.find('[data-event-total]').text(formatVnNumber(event.total || 0));
        var label = !event.enabled ? 'Tạm đóng' : (event.starts_at > snapshot.now ? 'Sắp diễn ra' : (event.active ? 'Đang diễn ra' : 'Đã kết thúc'));
        $root.find('[data-event-status]').text(label).removeClass('bg-success bg-secondary').addClass(event.active ? 'bg-success' : 'bg-secondary');
        (event.tiers || []).forEach(function(tier) {
            var state = $.extend({}, tier, { event_id: event.id, tier_id: tier.id, total: event.total, active: event.active, status_label: label });
            renderRechargeEventTierState($root.find('[data-event-tier][data-event-tier-id="' + Number(tier.id || 0) + '"]'), state);
        });
    });
    rechargeEventStatusState.loaded = true;
}
function refreshRechargeEventStatus(force) {
    if (!$('#tab-recharge-events').hasClass('active') || document.hidden || rechargeEventStatusState.loading || (window.lhsWebContext && window.lhsWebContext.isExpired())) return;
    var now = Date.now();
    if (!force && now - rechargeEventStatusState.lastRequestAt < 15000) return;
    rechargeEventStatusState.loading = true; rechargeEventStatusState.lastRequestAt = now;
    $.post('api/user_api.php', { action: 'get_recharge_event_status' }, function(response) {
        if (window.lhsWebContext && window.lhsWebContext.handleResponse(response)) return;
        if (response && response.status === 'success') applyRechargeEventStatusSnapshot(response.recharge_events);
    }, 'json').always(function() { rechargeEventStatusState.loading = false; });
}
function maybeOpenRechargeEventPopup() {
    var modal = document.getElementById('rechargeEventPopupModal');
    if (!modal || typeof bootstrap === 'undefined' || !bootstrap.Modal) return;
    var entry = modal.querySelector('.recharge-event-popup-entry');
    if (!entry) return;
    setTimeout(function(){ bootstrap.Modal.getOrCreateInstance(modal).show(); }, 450);
}

var pendingRewardsState = { loading: false, retrying: {} };
function loadPendingRewards() {
    if (pendingRewardsState.loading || (window.lhsWebContext && window.lhsWebContext.isExpired())) return;
    pendingRewardsState.loading = true;
    $.post('api/user_api.php', { action: 'get_pending_rewards' }, function(response) {
        if (window.lhsWebContext && window.lhsWebContext.handleResponse(response)) return;
        if (!response || response.status !== 'success') {
            $('#pendingRewardsPanel').prop('hidden', false);
            $('#pendingRewardsList').text((response && response.message) || 'Chưa tải được danh sách quà đang chờ. Bấm Làm mới để kiểm tra.');
            return;
        }
        var rows = Array.isArray(response.data) ? response.data : [];
        $('#pendingRewardsPanel').prop('hidden', rows.length === 0);
        var html = '';
        rows.forEach(function(row) {
            var id = parseInt(row.delivery_id, 10) || 0;
            if (id < 1 || ['giftcode', 'recharge', 'recharge_event'].indexOf(row.kind) === -1) return;
            html += '<div class="d-flex align-items-center justify-content-between gap-3 py-2 border-top">'
                + '<div><strong>' + escapeHtml(row.label || (row.kind === 'giftcode' ? 'Mã quà tặng' : (row.kind === 'recharge_event' ? 'Sự kiện nạp' : 'Mốc Donate'))) + '</strong>'
                + '<div class="small">#' + id + ' · ' + escapeHtml(row.created_at || '') + '</div>'
                + '<div class="small">' + escapeHtml(row.message || 'Đã ghi nhận quyền nhận; đang chờ xác nhận giao quà.') + '</div></div>'
                + '<button type="button" class="btn btn-sm btn-outline-dark flex-shrink-0" data-reward-retry data-kind="' + row.kind + '" data-delivery-id="' + id + '"' + (pendingRewardsState.retrying[id] ? ' disabled' : '') + '>Gửi lại quà</button></div>';
        });
        $('#pendingRewardsList').html(html);
    }, 'json').fail(function() {
        if (window.lhsWebContext && window.lhsWebContext.isExpired()) return;
        $('#pendingRewardsPanel').prop('hidden', false);
        $('#pendingRewardsList').text('Chưa kết nối được danh sách quà đang chờ. Bấm Làm mới để kiểm tra; hệ thống không tự gửi lại.');
    }).always(function() { pendingRewardsState.loading = false; });
}

function retryPendingReward(button) {
    if (window.lhsWebContext && window.lhsWebContext.isExpired()) return;
    var id = parseInt($(button).attr('data-delivery-id'), 10) || 0;
    var kind = String($(button).attr('data-kind') || '');
    if (id < 1 || ['giftcode', 'recharge', 'recharge_event'].indexOf(kind) === -1 || pendingRewardsState.retrying[id]) return;
    pendingRewardsState.retrying[id] = true;
    $('[data-reward-retry][data-delivery-id="' + id + '"]').prop('disabled', true);
    $.post('api/user_api.php', { action: kind === 'giftcode' ? 'submit_giftcode' : (kind === 'recharge_event' ? 'claim_recharge_event_milestone' : 'claim_recharge_milestone'), delivery_id: id }, function(response) {
        if (window.lhsWebContext && window.lhsWebContext.handleResponse(response)) return;
        if (response && response.status === 'success') {
            appToast(response.pending ? 'warning' : 'success', response.pending ? 'Vẫn đang chờ xác nhận' : 'Đã giao quà', response.message || 'Đã cập nhật đơn quà.');
            if (response.delivered && kind === 'giftcode' && response.code_claimed) markGiftcodeClaimed(response.code_claimed, response.used_count, response.max_uses);
        } else {
            Swal.fire('Chưa gửi được quà', (response && response.message) || 'Vui lòng kiểm tra lại sau.', 'warning');
        }
        loadPendingRewards();
        refreshRechargeStatus(true); refreshRechargeEventStatus(true);
    }, 'json').fail(function() {
        if (window.lhsWebContext && window.lhsWebContext.isExpired()) return;
        Swal.fire('Chưa xác nhận được giao quà', 'Đơn quà được giữ lại. Hãy làm mới danh sách trước khi quyết định gửi lại.', 'warning');
        loadPendingRewards();
    }).always(function() {
        delete pendingRewardsState.retrying[id];
        if (!(window.lhsWebContext && window.lhsWebContext.isExpired())) $('[data-reward-retry][data-delivery-id="' + id + '"]').prop('disabled', false);
    });
}

$('.menu-btn').on('click', function(){
    var tab = $(this).data('tab');
    $('.menu-btn').removeClass('active');
    $(this).addClass('active');
    $('.main-tab-pane').removeClass('active');
    $('#' + tab).addClass('active');
    if (tab === 'tab-transactions') loadTransactionHistory(1);
    if (tab === 'tab-spend-history') loadWebshopSpendHistory(1);
    if (tab === 'tab-rewards') refreshRechargeStatus(true);
    if (tab === 'tab-recharge-events') refreshRechargeEventStatus(true);
    if (tab === 'tab-webshop') setTimeout(function(){ if (typeof updateShopNavArrows === 'function') updateShopNavArrows(); }, 60);
    initSelect2();
});
function initSelect2(){ $('.select2-custom').select2({ theme:'bootstrap-5', width:'100%', language:{ noResults:function(){ return 'Kh\u00f4ng t\u00ecm th\u1ea5y'; } } }); }
function submitAjax(btn, confirmMsg){
    var form = $(btn).closest('form');
    if ($(btn).prop('disabled')) return;
    if (confirmMsg) {
        appConfirmDanger(confirmMsg).then(function(r){ if (r.isConfirmed) executeForm(form, btn); });
    } else executeForm(form, btn);
}
function executeForm(form, btn){
    if (window.lhsWebContext && window.lhsWebContext.isExpired()) return;
    var $btn = $(btn || form.find('button[type="button"]').get(0));
    var oldHtml = $btn.length ? $btn.html() : '';
    var actionType = form.find('input[name="action"]').val();
    var keepButtonDisabled = false;
    if ($btn.length) $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-1"></i> \u0110ang x\u1eed l\u00fd...');
    appLoading('\u0110ang x\u1eed l\u00fd y\u00eau c\u1ea7u...');
    $.post('api/user_api.php', form.serialize(), function(r){
        if (window.lhsWebContext && window.lhsWebContext.handleResponse(r)) return;
        if (r.status === 'success') {
            Swal.close();
            appToast(r.pending ? 'warning' : 'success', r.pending ? 'Đã ghi nhận, đang chờ giao' : 'Thành công', r.message || 'Thao tác thành công.');
            if (!r.pending && ['activate_vip','buy_shop_item','claim_recharge_milestone','claim_recharge_event_milestone','claim_daily_checkin','send_gm_action'].indexOf(actionType) !== -1) triggerConfetti();
            if (typeof r.xu_web !== 'undefined') setCurrentXuWeb(r.xu_web);
            if ((actionType === 'submit_giftcode' || actionType === 'claim_recharge_milestone' || actionType === 'claim_recharge_event_milestone') && r.pending) {
                keepButtonDisabled = actionType === 'claim_recharge_milestone' || actionType === 'claim_recharge_event_milestone';
                $btn.text('Đang chờ giao — xem phía trên');
                if (actionType === 'submit_giftcode') $('#inputMaQuaTang').val('');
                loadPendingRewards();
                refreshRechargeStatus(true); refreshRechargeEventStatus(true);
                return;
            }
            if(actionType==='buy_shop_item' && r.delivered && activeShopItem){try{sessionStorage.removeItem(activeShopItem.requestStorage);}catch(e){} $('#modal_shop_request_key').val('');var modal=document.getElementById('shopBuyModal');bootstrap.Modal.getOrCreateInstance(modal).hide();}
            if(actionType==='buy_shop_item' && r.pending){$('#modalShopForm .shop-buy-submit').text('Kiểm tra lại đơn (không trừ thêm Xu)');}
            if (actionType === 'link_phone') {
                renderLinkedPhoneBox(r.phone_masked || '');
                return;
            }
            if (actionType === 'activate_vip' && typeof r.vip_level !== 'undefined') {
                currentVipLevel = parseInt(r.vip_level, 10) || currentVipLevel;
                updateVipBanner(currentVipLevel);
            }
            if (actionType === 'claim_recharge_milestone') {
                keepButtonDisabled = true;
                form.find('button').prop('disabled', true).removeClass('btn-custom').addClass('btn btn-secondary').text('Đã nhận');
                refreshRechargeStatus(true);
                loadPendingRewards();
            }
            if (actionType === 'claim_recharge_event_milestone') {
                keepButtonDisabled = true;
                form.find('button').prop('disabled', true).removeClass('btn-custom').addClass('btn btn-secondary').text('Đã nhận');
                refreshRechargeEventStatus(true);
                loadPendingRewards();
            }
            if (actionType === 'claim_daily_checkin') {
                keepButtonDisabled = true;
                form.find('button').prop('disabled', true).removeClass('btn-custom').addClass('btn btn-secondary').html('<i class="fa-solid fa-circle-check me-2"></i> Đã điểm danh hôm nay');
                $('.daily-checkin-status').text('Hôm nay tài khoản đã nhận quà điểm danh trên toàn bộ máy chủ.');
            }
            if (actionType === 'submit_giftcode' && r.delivered === true) {
                var claimedCode = String(r.code_claimed || form.find('[name="giftcode"]').val() || '').trim().toUpperCase();
                markGiftcodeClaimed(claimedCode, r.used_count, r.max_uses);
                $('#inputMaQuaTang').val('');
                loadPendingRewards();
            }
            if (actionType === 'change_password') {
                var modalEl = document.getElementById('passwordModal');
                if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getOrCreateInstance(modalEl).hide();
                setTimeout(function(){
                    $.post('api/user_api.php', { action: 'logout' }, function(){ location.href = 'login.php'; });
                }, 1000);
                return;
            }
            if (!form.hasClass('form-no-reset') && actionType !== 'submit_giftcode' && actionType !== 'claim_daily_checkin') form[0].reset();
        } else {
            Swal.fire('Th\u1ea5t b\u1ea1i', r.message || 'Kh\u00f4ng th\u1ec3 th\u1ef1c hi\u1ec7n thao t\u00e1c.', 'error');
            if (actionType === 'submit_giftcode' || actionType === 'claim_recharge_milestone' || actionType === 'claim_recharge_event_milestone') loadPendingRewards();
        }
    }, 'json').fail(function(){
        Swal.fire('L\u1ed7i m\u1ea1ng', 'Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i API m\u00e1y ch\u1ee7.', 'error');
        if (actionType === 'submit_giftcode' || actionType === 'claim_recharge_milestone' || actionType === 'claim_recharge_event_milestone') loadPendingRewards();
    }).always(function(){
        if ($btn.length && !keepButtonDisabled && !(window.lhsWebContext && window.lhsWebContext.isExpired())) {
            $btn.prop('disabled', false).html(oldHtml);
        }
    });
}
function checkUserStatus(){
    if (document.hidden || (window.lhsWebContext && window.lhsWebContext.isExpired())) return;
    $.post('api/user_api.php', { action:'check_vip_status' }, function(r){
        if (r.status === 'success') {
            $('#connectionStatusIndicator span.status-pulse-dot').removeClass('bg-danger').addClass('bg-success');
            $('#connectionStatusText').removeClass('text-danger').addClass('text-success').text('Tr\u1ef1c tuy\u1ebfn');
            if (r.vip_level > currentVipLevel) {
                currentVipLevel = r.vip_level;
                triggerConfetti();
                appToast('success', 'Donate VIP th\u00e0nh c\u00f4ng', 'H\u1ec7 th\u1ed1ng \u0111\u00e3 x\u00e1c nh\u1eadn Donate.');
                updateVipBanner(currentVipLevel);
            } else if (typeof r.vip_level !== 'undefined' && Number(r.vip_level) !== currentVipLevel) {
                currentVipLevel = Number(r.vip_level) || 0;
                updateVipBanner(currentVipLevel);
            }
            if (typeof r.xu_web !== 'undefined') handleWalletStatus(r.xu_web);
        }
    }, 'json').fail(function(){
        $('#connectionStatusIndicator span.status-pulse-dot').removeClass('bg-success').addClass('bg-danger');
        $('#connectionStatusText').removeClass('text-success').addClass('text-danger').text('Ngo\u1ea1i tuy\u1ebfn');
    });
}
$(function(){
    applyFeatureVisibility();
    updateVipBanner(currentVipLevel);
    initSelect2();
    initTooltips(document);
    updateTopupQr();
    updateVipQr();
    $('.topup-preset').on('click', function(){ $('#topupAmountInput').val($(this).data('amount')); updateTopupQr(); });
    $('#topupAmountInput').on('input change', updateTopupQr);
    $('#btnApplyVipVoucher').on('click', applyVipVoucher);
    $('#playerMobileMenuToggle').on('click', function(){ setPlayerMobileMenu(!$('body').hasClass('player-menu-open')); });
    $('#playerMobileMenuClose').on('click', function(){ setPlayerMobileMenu(false); });
    $('#playerMobileMenuBackdrop').on('click', function(){ setPlayerMobileMenu(false); });
    $('#playerSidebarMenu .menu-btn').on('click', function(){ if (window.matchMedia('(max-width: 768px)').matches || $('body').hasClass('player-menu-open')) setPlayerMobileMenu(false); });
    $(document).on('keydown', function(e){ if (e.key === 'Escape') setPlayerMobileMenu(false); });
    $('#vipVoucherCode').on('input', function(){ this.value = this.value.toUpperCase(); if (!this.value.trim()) resetVipVoucher(); });
    $('#vipVoucherCode').on('keypress', function(e){ if (e.which === 13) { e.preventDefault(); applyVipVoucher(); } });
    $(document).on('click', '.spend-period-btn', function(){ selectSpendHistoryPeriod(String($(this).data('period') || 'today')); });
    $('#spendStatusFilter').on('change', function(){ spendHistoryState.statusFilter = String(this.value || 'all'); loadWebshopSpendHistory(1); });
    $('#spendHistoryRefresh').on('click', function(){ loadWebshopSpendHistory(1); });
    $('#pendingRewardsRefresh').on('click', loadPendingRewards);
    $(document).on('click', '[data-reward-retry]', function(){ retryPendingReward(this); });
    $('#spendApplyCustom').on('click', function(){
        spendHistoryState.dateFrom = String($('#spendDateFrom').val() || '');
        spendHistoryState.dateTo = String($('#spendDateTo').val() || '');
        if (!spendHistoryState.dateFrom || !spendHistoryState.dateTo) {
            Swal.fire('Thiếu khoảng ngày', 'Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.', 'warning');
            return;
        }
        loadWebshopSpendHistory(1);
    });
    $(document).on('keydown', '.gc-card:not(.gc-claimed)', function(e){
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        chonMaQuaTang($(this).attr('data-giftcode'));
    });
    $(document).on('input change', '.shop-quantity', function(){
        var qty = parseInt($(this).val(), 10);
        var price = parseInt($(this).data('price'), 10);
        if (!qty || qty < 1) qty = 1;
        $(this).closest('form').find('.shop-total').text(formatVnNumber(qty * price) + ' Xu');
    });
    checkUserStatus();
    loadPendingRewards();
    setInterval(checkUserStatus, 5000);
    refreshRechargeStatus(false);
    refreshRechargeEventStatus(false);
    maybeOpenRechargeEventPopup();
    $(document).on('click', '[data-open-event-tab]', function() { $('.menu-btn[data-tab="tab-recharge-events"]').trigger('click'); });
    setInterval(function(){ refreshRechargeStatus(false); }, 15000);
    setInterval(function(){ refreshRechargeEventStatus(false); }, 15000);
    document.addEventListener('visibilitychange', function(){
        if (!document.hidden) { checkUserStatus(); refreshRechargeStatus(true); refreshRechargeEventStatus(true); loadPendingRewards(); }
    });
});


function resolveItemImageUrl(url) {
    if (!url) return '';
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0 || url.indexOf('/') === 0) return url;
    return url;
}

function openRewardDetailModal(trigger) {
    var $source = $(trigger);
    var title = $source.attr('data-title') || 'Thông tin vật phẩm';
    var items = [];
    try {
        items = JSON.parse($source.attr('data-rewards') || '[]');
    } catch(e) {
        items = [];
    }
    var fallback = $('link[rel="icon"]').attr('href') || 'assets/images/logo.png';
    var html = '';
    if (!items.length) {
        html = '<div class="text-muted fw-bold text-center py-4">Chưa có dữ liệu vật phẩm.</div>';
    } else {
        $.each(items, function(i, item) {
            var img = resolveItemImageUrl(item.image || fallback);
            html += '<div class="reward-detail-item">'
                + '<button type="button" class="reward-detail-thumb" title="' + escapeHtml(item.name || '') + '">'
                + '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(item.name || '') + '" onerror="this.src=\'' + escapeHtml(fallback) + '\'">'
                + '</button>'
                + '<div class="min-w-0">'
                + '<div class="reward-detail-name">' + escapeHtml(item.name || ('Vật phẩm ID ' + (item.id || ''))) + '</div>'
                + '<div class="reward-detail-meta">ID ' + escapeHtml(item.id || '-') + ' | Số lượng ' + formatVnNumber(item.amount || 1) + '</div>'
                + '</div>'
                + '<div class="reward-detail-qty">x' + formatVnNumber(item.amount || 1) + '</div>'
                + '</div>';
        });
    }
    $('#rewardDetailTitle').text(title);
    $('#rewardDetailList').html(html);
    showModalById('rewardDetailModal');
}

var activeShopItem = null;
function openShopBuyModal(id, name, price, amount, imageUrl, rewards, isBundle) {
    activeShopItem = { id: id, name: name, price: String(price), amount: String(amount), imageUrl: imageUrl, rewards:rewards||[], isBundle:!!isBundle };
    $('#modal_shop_item_id').val(id);
    $('#modal_shop_name').text(name);
    $('#modal_shop_price_label').text(formatVnNumber(price) + ' Xu / ' + formatVnNumber(amount) + ' cái');
    $('#modal_shop_unit_price').text(formatVnNumber(price) + ' Xu');
    $('#modal_shop_amount_badge').text('x' + formatVnNumber(amount));
    $('#modal_shop_qty').val(1);
    $('#modalShopForm .shop-buy-submit').text('Xác nhận nhận').prop('disabled',false);
    if(activeShopItem.isBundle){$('#modal_shop_price_label').text(formatVnNumber(price)+' Xu / gói');$('#modal_shop_amount_badge').text(activeShopItem.rewards.length+' loại item');}
    ensureShopRequestKey();renderShopRewards();
    
    var imgHtml = imageUrl ? '<img src="' + escapeHtml(resolveItemImageUrl(imageUrl)) + '" alt="' + escapeHtml(name) + '">' : '<i class="fa-solid fa-box-open text-primary fs-3"></i>';
    $('#modal_shop_img').html(imgHtml);
    
    updateModalShopTotal();
    showModalById('shopBuyModal');
}

function adjustModalQty(delta) {
    var input = $('#modal_shop_qty');
    var val = parseInt(input.val(), 10) || 1;
    val = Math.max(1, val + delta);
    input.val(val);
    updateModalShopTotal();
}

function updateModalShopTotal() {
    if (!activeShopItem) return;
    var qty = parseInt($('#modal_shop_qty').val(), 10) || 1;
    var priceRaw = String(activeShopItem.price || '0');
    var total;
    if (/^\d+$/.test(priceRaw) && typeof BigInt === 'function') {
        try { total = (BigInt(qty) * BigInt(priceRaw)).toString(); } catch (e) { total = qty * Number(priceRaw); }
    } else {
        total = qty * Number(priceRaw);
    }
    $('#modal_shop_total').text(formatVnNumber(total) + ' Xu');
    ensureShopRequestKey();renderShopRewards();
}

function submitModalShopBuy() {
    var btn = $('#modalShopForm').find('.shop-buy-submit');
    submitAjax(btn.get(0), 'Xác nhận nhận vật phẩm bằng Xu Web?');
}

var shopPageSize = 20;
var shopCurrentPage = 1;
var shopSearchQuery = "";
var shopCategory = "all";

function filterAndPaginateShop() {
    var items = $('#webshopGrid .shop-item-wrapper');
    var filtered = [];
    
    items.each(function() {
        var name = $(this).data('name') || '';
        var category = $(this).data('category') || 'other';
        if (name.indexOf(shopSearchQuery.toLowerCase()) !== -1 && (shopCategory === 'all' || category === shopCategory)) {
            filtered.push(this);
        } else {
            $(this).hide();
        }
    });
    
    $('#shopFilteredCount').text(filtered.length);
    $('#shopTotalCount').text(items.length);
    
    var totalPages = Math.ceil(filtered.length / shopPageSize) || 1;
    if (shopCurrentPage > totalPages) shopCurrentPage = totalPages;
    
    var start = (shopCurrentPage - 1) * shopPageSize;
    var end = start + shopPageSize;
    
    items.hide();
    $(filtered).slice(start, end).show();
    
    renderPlayerPagination('#shopPagination', totalPages, shopCurrentPage, 'setShopPage');
}

function setShopPage(page) {
    shopCurrentPage = page;
    filterAndPaginateShop();
}

$(document).on('input', '#shopSearchInput', function() {
    shopSearchQuery = $(this).val().trim();
    shopCurrentPage = 1;
    filterAndPaginateShop();
});

$(document).on('click', '.shop-filter-btn', function() {
    shopCategory = String($(this).data('shop-category') || 'all');
    $('.shop-filter-btn').removeClass('active');
    $(this).addClass('active');
    shopCurrentPage = 1;
    filterAndPaginateShop();
});

var updateShopNavArrows = function() {};

function initShopCategoryNav() {
    var $filter = $('#shopCategoryFilter');
    var $prevBtn = $('#shopNavPrev');
    var $nextBtn = $('#shopNavNext');

    if (!$filter.length) return;
    var filterEl = $filter[0];

    updateShopNavArrows = function() {
        if (!filterEl) return;
        var scrollLeft = filterEl.scrollLeft;
        var maxScroll = filterEl.scrollWidth - filterEl.clientWidth;

        if (maxScroll <= 4) {
            $prevBtn.addClass('is-disabled').prop('disabled', true);
            $nextBtn.addClass('is-disabled').prop('disabled', true);
        } else {
            if (scrollLeft <= 4) {
                $prevBtn.addClass('is-disabled').prop('disabled', true);
            } else {
                $prevBtn.removeClass('is-disabled').prop('disabled', false);
            }

            if (scrollLeft >= maxScroll - 4) {
                $nextBtn.addClass('is-disabled').prop('disabled', true);
            } else {
                $nextBtn.removeClass('is-disabled').prop('disabled', false);
            }
        }
    };

    $prevBtn.on('click', function(e) {
        e.preventDefault();
        filterEl.scrollBy({ left: -260, behavior: 'smooth' });
    });

    $nextBtn.on('click', function(e) {
        e.preventDefault();
        filterEl.scrollBy({ left: 260, behavior: 'smooth' });
    });

    // Lăn chuột ngang (Mouse Wheel)
    $filter.on('wheel', function(e) {
        var raw = e.originalEvent;
        if (raw && raw.deltaY !== 0) {
            e.preventDefault();
            filterEl.scrollLeft += raw.deltaY * 0.9;
            updateShopNavArrows();
        }
    });

    // Kéo thả chuột (Mouse Drag to Scroll)
    var isDown = false;
    var startX = 0;
    var startScrollLeft = 0;
    var hasMoved = false;

    $filter.on('mousedown', function(e) {
        if (e.which !== 1) return;
        isDown = true;
        $filter.addClass('is-dragging');
        startX = e.pageX - filterEl.offsetLeft;
        startScrollLeft = filterEl.scrollLeft;
        hasMoved = false;
    });

    $(document).on('mouseup mouseleave', function() {
        if (isDown) {
            isDown = false;
            $filter.removeClass('is-dragging');
            setTimeout(function() { hasMoved = false; }, 60);
        }
    });

    $filter.on('mousemove', function(e) {
        if (!isDown) return;
        var x = e.pageX - filterEl.offsetLeft;
        var walk = (x - startX) * 1.4;
        if (Math.abs(walk) > 4) {
            hasMoved = true;
        }
        filterEl.scrollLeft = startScrollLeft - walk;
        updateShopNavArrows();
    });

    // Chặn click nhầm vào tab khi vừa drag chuột
    $filter.on('click', '.shop-filter-btn', function(e) {
        if (hasMoved) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return false;
        }
    });

    $filter.on('scroll', updateShopNavArrows);
    $(window).on('resize', updateShopNavArrows);
    updateShopNavArrows();
}

// Run filter on document ready
$(function() {
    if ($('#webshopGrid').length) {
        filterAndPaginateShop();
        initShopCategoryNav();
    }
    $('#modal_shop_qty').on('input change', updateModalShopTotal);
});

