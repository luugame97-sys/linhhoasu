/* Keep a tab bound to the account/server that rendered it. Never replay a rejected request. */
(function(window, document, $) {
    'use strict';
    var context = $('meta[name="lhs-web-context"]').attr('content') || '';
    var csrf = $('meta[name="csrf-token"]').attr('content') || '';
    var expired = false;
    var prompt = null;
    var originalFire = window.Swal && window.Swal.fire;
    var originalClose = window.Swal && window.Swal.close;

    function handleResponse(response) {
        if (!response || !(response.context_changed || response.reload_required || response.login_required)) return false;
        expired = true;
        if (!prompt && originalFire) {
            prompt = originalFire.call(window.Swal, {
                title: 'Cần tải lại trang',
                text: 'Tài khoản hoặc máy chủ của phiên này đã thay đổi, hoặc phiên đã hết hạn. Yêu cầu vừa gửi chưa được thực hiện. Tải lại và kiểm tra đúng máy chủ trước khi thao tác tiếp.',
                icon: 'warning', confirmButtonText: 'Tải lại trang',
                allowOutsideClick: false, allowEscapeKey: false
            }).then(function() { window.location.reload(); });
        }
        return true;
    }

    window.lhsWebContext = {
        isExpired: function() { return expired; },
        handleResponse: handleResponse
    };
    if (originalFire) {
        window.Swal.fire = function() {
            if (expired && prompt) return prompt;
            return originalFire.apply(window.Swal, arguments);
        };
    }
    if (originalClose) {
        window.Swal.close = function() {
            if (expired) return;
            return originalClose.apply(window.Swal, arguments);
        };
    }

    $.ajaxPrefilter(function(options, originalOptions, xhr) {
        var target = document.createElement('a');
        target.href = options.url;
        if (target.protocol !== window.location.protocol || target.host !== window.location.host
            || !/\/(?:api\/user_api|admin\/admin_api)\.php$/.test(target.pathname)) return;
        if (expired) { xhr.abort('web_context_changed'); return; }
        xhr.setRequestHeader('X-CSRF-Token', csrf);
        xhr.setRequestHeader('X-LHS-Context', context);
        // Registered before per-action callbacks, so a stale response cannot look like a normal retry.
        xhr.done(handleResponse);
        xhr.fail(function(failed) { handleResponse(failed.responseJSON); });
    });
})(window, document, jQuery);
