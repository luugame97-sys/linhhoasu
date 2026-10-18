/* Admin management UI: identity preview, one server context and financial summaries. */
(function(window,$){
    'use strict';
    $.ajaxPrefilter(function(options,original,xhr){
        var target=new URL(options.url,window.location.href);
        if(target.origin===window.location.origin && /\/admin\/admin_api\.php$/.test(target.pathname))xhr.setRequestHeader('X-LHS-Admin-UI','20260907');
    });
    var resolving=null,timer=null,version=0,roles=[],resolvedText='',selected=null;
    function stale(){return window.lhsWebContext&&window.lhsWebContext.isExpired();}
    function showRole(){
        if(!selected){$('#gmResolvedTarget').text('Chọn một nhân vật từ kết quả nhận diện.');return;}
        $('#gmResolvedTarget').text('Nhận: '+selected.role_name+' · TK '+selected.account_id+' · UID '+selected.role_id+' · S'+selected.server_id).attr('class','small mt-2 fw-bold text-success');
    }
    function resolve(){
        var text=String($('#gm_target_uid').val()||'').trim(),requestVersion=++version;
        selected=null;roles=[];resolvedText='';$('#gmResolvedSelect').empty().prop('hidden',true);
        if(resolving&&resolving.readyState!==4)resolving.abort();
        if(!text){$('#gmResolvedTarget').text('Nhập tài khoản, UID hoặc tên nhân vật.');return;}
        $('#gmResolvedTarget').attr('class','small mt-2 text-muted').text('Đang nhận diện trên máy chủ đã chọn…');
        resolving=$.post('admin_api.php',{action:'resolve_player_target',query:text},null,'json').done(function(r){
            if(requestVersion!==version||text!==String($('#gm_target_uid').val()||'').trim())return;
            if(r.status!=='success'){$('#gmResolvedTarget').text(r.message||'Chưa nhận diện được.');return;}
            resolvedText=text;roles=r.roles||[];
            if(roles.length===1){selected=roles[0];showRole();}
            else if(roles.length>1){
                var select=$('#gmResolvedSelect').prop('hidden',false).append($('<option>').val('').text('Có nhiều kết quả — chọn đúng nhân vật'));
                roles.forEach(function(role,i){select.append($('<option>').val(String(i)).text(role.role_name+' · '+role.account_id+' · '+role.role_id));});
                $('#gmResolvedTarget').text('Có '+roles.length+' nhân vật phù hợp; không tự gửi khi chưa chọn.');
            }else $('#gmResolvedTarget').text('Không tìm thấy. Dùng đúng tài khoản, UID hoặc tên đầy đủ của nhân vật.');
        }).fail(function(xhr,status){if(status!=='abort'&&requestVersion===version)$('#gmResolvedTarget').text('Mất kết nối nhận diện. Thử nhập lại.');});
    }
    window.lhsAdminTarget=function(){
        if(stale()||!selected||resolvedText!==String($('#gm_target_uid').val()||'').trim())return null;
        return{role_id:selected.role_id,query:resolvedText,label:selected.role_name+' · '+selected.account_id+' · S'+selected.server_id};
    };
    $('#gm_target_uid').on('input',function(){selected=null;version++;clearTimeout(timer);timer=setTimeout(resolve,450);});
    $('#gmResolvedSelect').on('change',function(){var key=$(this).val();selected=key!==''?roles[Number(key)]:null;showRole();});
    $('#adminServerSwitch').on('change',function(){
        var select=$(this),old=String(select.attr('data-current')),next=String(select.val());
        if(next===old||stale())return;
        Swal.fire({title:'Đổi máy chủ quản trị?',text:'Trang sẽ tải lại. Mọi thao tác sau đó dùng máy chủ vừa chọn; các tab cũ cần tải lại.',icon:'question',showCancelButton:true,confirmButtonText:'Đổi máy chủ',cancelButtonText:'Hủy'}).then(function(r){
            if(!r.isConfirmed){select.val(old);return;}
            select.prop('disabled',true);
            $.post('admin_api.php',{action:'switch_admin_server',server_id:next},null,'json').done(function(result){
                if(result.status==='success'){window.location.reload();return;}
                select.val(old).prop('disabled',false);Swal.fire('Chưa đổi máy chủ',result.message||'Vui lòng thử lại.','warning');
            }).fail(function(){select.val(old).prop('disabled',false);Swal.fire('Chưa xác định kết quả','Tải lại trang để kiểm tra máy chủ hiện tại trước khi thao tác.','warning');});
        });
    });
    $('.monitor-status-tab').on('click',function(){
        var status=String($(this).attr('data-log-status')||'');
        monitorLogState.quickStatus=status;monitorLogState.pendingPage=1;
        $('#monitorStatusFilter,#monitorLevelFilter').val('');
        $('.monitor-status-tab').attr('aria-pressed','false');$(this).attr('aria-pressed','true');
        loadMonitorLogs(1);
        var table=document.getElementById('monitorLogTableBody');if(table)table.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    });
    $('#monitorSourceFilter,#monitorStatusFilter,#monitorLevelFilter,#monitorServerFilter').on('change',function(){loadMonitorLogs(1);});
    window.renderSepayFinancial=function(financial){
        var box=$('#sepayFinancialSummary');
        if(!financial){box.prop('hidden',true).empty();return;}
        box.prop('hidden',false);
        if(!financial.available){box.text(financial.message);return;}
        var period=financial.period||{},life=financial.lifetime||{},html='<div class="fw-bold mb-2">'+escapeHtml(financial.account?'Tài khoản '+financial.account:'Tổng SePay')+' · '+escapeHtml(financial.server_id?'S'+financial.server_id:'Tất cả máy chủ')+'</div><div class="sepay-money-grid">';
        [['Tổng đã nạp (toàn thời gian)',life.total,life.count],['Đã nạp trong khoảng đang xem',period.total,period.count],['Donate Xu / VIP trong khoảng',null,null]].forEach(function(row){
            html+='<div class="sepay-money-card"><small>'+row[0]+'</small><strong>'+(row[1]===null?formatNumber(period.topup||0)+' / '+formatNumber(period.vip||0):formatNumber(row[1]||0))+' đ</strong>'+(row[2]===null?'':'<small>'+formatNumber(row[2]||0)+' giao dịch</small>')+'</div>';
        });
        html+='</div><div class="small text-muted mt-2">'+escapeHtml(financial.basis)+'</div><details class="sepay-details"><summary>Chi tiết giao dịch đã nạp (tối đa50 gần nhất trong khoảng)</summary><div class="table-responsive"><table class="table"><thead><tr><th>Thời gian</th><th>Tài khoản / server</th><th>Số tiền</th><th>Loại</th><th>Mã giao dịch</th></tr></thead><tbody>';
        (financial.details||[]).forEach(function(r){html+='<tr><td>'+escapeHtml(r.created_at)+'</td><td>'+escapeHtml(r.account_name)+' · S'+escapeHtml(r.server_id)+'</td><td>'+formatNumber(r.amount)+' đ</td><td>'+escapeHtml(r.action==='vip'?'VIP':'Donate Xu')+'</td><td>'+escapeHtml(r.tran_id)+'</td></tr>';});
        box.html(html+'</tbody></table></div></details>');
    };
})(window,jQuery);
