import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')
sftp = c.open_sftp()

with sftp.file('/linhhoasu/webgame/gm/assets/js/index.js', 'r') as f:
    js_content = f.read().decode('utf-8')

extra_js = """

// ==================== GIFTCODE & SERVER/ROLE SYNC ====================

function submitGiftcodeWithConfirmation(btn) {
    var form = $(btn).closest('form');
    var code = $('#inputMaQuaTang').val().trim().toUpperCase();
    if (!code) {
        Swal.fire('Thiếu thông tin', 'Vui lòng nhập mã quà tặng.', 'warning');
        return;
    }
    var roleSelect = $('#giftcode_role_select');
    var roleId = roleSelect.length ? roleSelect.val() : $('#hidden_giftcode_role_id').val();
    if (!roleId) {
        Swal.fire('Chưa có nhân vật', 'Tài khoản chưa có nhân vật ở máy chủ này. Vui lòng vào game tạo nhân vật hoặc đổi sang máy chủ đang chơi.', 'warning');
        return;
    }
    var roleName = '';
    if (roleSelect.is('select') && roleSelect.find('option:selected').length) {
        roleName = roleSelect.find('option:selected').text().trim();
    } else {
        roleName = $('#active_role_display_name').text().trim() || 'Nhân vật hiện tại';
    }
    var serverName = $('#active_server_display_name').text().trim() || 'Máy chủ hiện tại';

    $('#hidden_giftcode_role_id').val(roleId);

    Swal.fire({
        title: 'Xác nhận đổi quà',
        html: '<p class="mb-2">Bạn có chắc chắn muốn nhận mã quà <b>' + code + '</b> cho:</p>' +
              '<div class="p-3 bg-light rounded text-start border mb-3">' +
              '<div><i class="fa-solid fa-server text-primary me-2"></i><b>Máy chủ:</b> ' + serverName + '</div>' +
              '<div class="mt-1"><i class="fa-solid fa-user-check text-success me-2"></i><b>Nhân vật:</b> ' + roleName + '</div>' +
              '</div>' +
              '<div class="alert alert-warning py-2 mb-0 small text-start border-0 fw-bold">' +
              '<i class="fa-solid fa-triangle-exclamation me-1 text-warning"></i> ' +
              'Mỗi tài khoản nhận 1 lần/mã/server. Nếu cùng server có nhiều nhân vật, quà chỉ gửi vào nhân vật được chọn ở trên.' +
              '</div>',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="fa-solid fa-gift me-1"></i> Đồng ý đổi quà',
        cancelButtonText: 'Hủy'
    }).then(function(res) {
        if (res.isConfirmed) {
            executeForm(form, btn);
        }
    });
}

// Khi người chơi đổi nhân vật nhận quà trong select dropdown
$(document).on('change', '#giftcode_role_select', function() {
    var rid = $(this).val();
    $('#hidden_giftcode_role_id').val(rid);
    $.post('api/user_api.php', {
        action: 'switch_role',
        role_id: rid,
        csrf_token: $('meta[name="csrf-token"]').attr('content'),
        web_context_token: $('meta[name="web-context-token"]').attr('content')
    }, function(res) {
        if (res.status === 'success') {
            appToast('success', 'Đã chọn nhân vật', res.message || 'Đã cập nhật nhân vật nhận quà.');
        }
    }, 'json');
});

// Chuyển đổi máy chủ từ modal chọn máy chủ
$(document).on('click', '.switch-server-btn', function() {
    var sid = $(this).data('server-id');
    if (!sid) return;
    var $btn = $(this);
    $btn.prop('disabled', true);
    $.post('api/user_api.php', {
        action: 'switch_server',
        server_id: sid,
        csrf_token: $('meta[name="csrf-token"]').attr('content'),
        web_context_token: $('meta[name="web-context-token"]').attr('content')
    }, function(res) {
        if (res.status === 'success') {
            try {
                localStorage.setItem('lhs_selected_server_id', String(sid));
            } catch (e) {}
            var currentTab = $('.main-tab-pane.active').attr('id') || 'tab-giftcode';
            var url = new URL(window.location.href);
            url.searchParams.set('server_id', String(sid));
            url.searchParams.set('tab', currentTab);
            window.location.href = url.href;
        } else {
            Swal.fire('Lỗi', res.message || 'Không thể đổi máy chủ.', 'error');
            $btn.prop('disabled', false);
        }
    }, 'json').fail(function() {
        Swal.fire('Lỗi mạng', 'Không thể kết nối máy chủ để đổi server.', 'error');
        $btn.prop('disabled', false);
    });
});
"""

js_content = js_content + extra_js

with sftp.file('/linhhoasu/webgame/gm/assets/js/index.js', 'w') as f:
    f.write(js_content.encode('utf-8'))

sftp.close()
c.close()
print("gm/assets/js/index.js patched successfully!")
