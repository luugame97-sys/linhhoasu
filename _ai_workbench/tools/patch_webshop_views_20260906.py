"""Mechanical, exact-block transformations of current PHP/JS runtime candidate."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'temp/webshop_upgrade_20260906/candidate'
def replace(file,old,new):
 p=ROOT/file;s=p.read_text(encoding='utf-8');assert s.count(old)==1,(file,old[:70],s.count(old));p.write_text(s.replace(old,new),encoding='utf-8')
p=ROOT/'api/user_api.php';s=p.read_text(encoding='utf-8');a=s.index("    case 'buy_shop_item':");b=s.index("    case 'claim_recharge_milestone':",a)
s=s[:a]+'''    case 'buy_shop_item':
        require_login();
        require_api_rate('buy_shop_item',10,60);
        if(!web_setting_enabled('webshop_enabled'))api_exit('error','Webshop đang tạm đóng.');
        $role_error='';$role=hk_default_session_role($role_error);
        if(!$role)api_exit('error',$role_error);
        try {
            $result=lhs_shop_purchase($conn_web,(string)$_SESSION['username'],(string)$_SESSION['server_id'],$role,
                isset($_POST['shop_item_id'])?(int)$_POST['shop_item_id']:0,
                isset($_POST['quantity'])?$_POST['quantity']:1,
                isset($_POST['request_key'])?$_POST['request_key']:'');
            api_exit('success',$result['delivered']?'Đã giao toàn bộ vật phẩm. Vui lòng kiểm tra thư.':'Xu đã được giữ cho đơn này; đang chờ xác nhận giao. Bấm kiểm tra lại đơn, không mua đơn mới.',$result);
        } catch(InvalidArgumentException $e) { api_exit('error',$e->getMessage()); }
        catch(Exception $e) { api_log_error('buy_shop_item',$e);api_exit('error','Chưa xác định kết quả đơn. Giữ nguyên mã giao dịch và bấm lại để đối soát; không tạo đơn mới.'); }
        break;

    case 'retry_webshop_order':
        require_login();require_api_rate('retry_webshop_order',10,60);
        $role_error='';$role=hk_default_session_role($role_error);if(!$role)api_exit('error',$role_error);
        try{
            $stmt=$conn_web->prepare('SELECT * FROM webshop_orders WHERE id=? AND account_name=? AND server_id=? LIMIT 1');
            $stmt->execute(array((int)$_POST['order_id'],$_SESSION['username'],$_SESSION['server_id']));$order=$stmt->fetch(PDO::FETCH_ASSOC);
            if(!$order||(string)$order['role_id']!==(string)gm_role_id($role))api_exit('error','Đơn không thuộc nhân vật này.');
            $result=lhs_shop_dispatch($conn_web,$order,$role);
            api_exit('success',$result['delivered']?'Đã giao đủ vật phẩm của đơn.':'Đơn còn chờ giao; không trừ thêm Xu.',$result);
        }catch(Exception $e){api_log_error('retry_webshop_order',$e);api_exit('error','Đơn vẫn được giữ để đối soát, chưa trừ thêm Xu.');}
        break;

'''+s[b:];p.write_text(s,encoding='utf-8')
replace('api/user_api.php',"    if ($status === 'paid') return 'Đã thanh toán';","    if ($status === 'paid') return 'Đã thanh toán';\n    if ($status === 'pending_delivery') return 'Đang chờ giao';")
replace('api/user_api.php',"        'received_amount' => $received_amount,","        'received_amount' => $received_amount,\n        'reward_items' => !empty($row['reward_snapshot']) ? json_decode($row['reward_snapshot'],true) : array(),")
replace('api/user_api.php','o.quantity, o.unit_price, o.total_price, o.status,','o.quantity, o.unit_price, o.total_price, o.status, o.reward_snapshot,')
# Move the existing form intact into a Bootstrap modal, preserving IDs/upload.
p=ROOT/'admin/index.php';s=p.read_text(encoding='utf-8');a=s.index('                        <div class="admin-section-box mb-4">',s.index('id="tab-webshop-admin"'));b=s.index('                        <div class="d-flex justify-content-between align-items-center mb-3',a)
block=s[a:b];form=block[block.index('<form id="webshopForm">'):block.index('</form>')+7]
s=s[:a]+'''                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <button type="button" class="btn btn-primary fw-bold" onclick="openNewWebshopItem()"><i class="fa-solid fa-plus me-1"></i>Thêm item / gói</button>
                            <a class="btn btn-outline-secondary" href="item_catalog.php" target="_blank" rel="noopener">Tra ảnh &amp; bộ thời trang ẩn</a>
                        </div>
'''+s[b:]
modal='''<div class="modal fade" id="webshopEditModal" tabindex="-1" aria-labelledby="webshopEditTitle" aria-hidden="true">
 <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">
 <div class="modal-header"><h5 class="modal-title" id="webshopEditTitle">Sửa Webshop</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
 <div class="modal-body">'''+form+'''</div></div></div></div>
'''
s=s.replace('    <div class="modal fade" id="playerActionModal"',modal+'    <div class="modal fade" id="playerActionModal"',1)
s=s.replace('<div class="row g-3">\n                                    <div class="col-lg-5">','''<div class="row g-3">
                                    <div class="col-12"><label class="fw-bold" for="shop_product_mode">Loại mặt hàng</label><select id="shop_product_mode" name="product_mode" class="form-select"><option value="single">Một item</option><option value="bundle">Gói nhiều item — nhận tất cả</option></select></div>
                                    <div class="col-12" id="shopBundleEditor" hidden>
                                      <input type="hidden" name="reward_items" id="shop_reward_items">
                                      <div class="input-group mb-2"><select id="shop_fashion_template" class="form-select"><option value="">Chọn nhanh bộ thời trang ẩn…</option></select><button type="button" class="btn btn-outline-primary" onclick="applyFashionBundle()">Thêm đủ bộ</button></div>
                                      <div class="row g-2 mb-2"><div class="col-md-7"><select id="shop_bundle_item" class="form-select select2-custom" style="width:100%"><option value=""></option><?php echo getTxtOptionsAdmin('gmitem.txt','item_'); ?></select></div><div class="col-md-2"><input id="shop_bundle_amount" type="number" min="1" value="1" class="form-control" aria-label="Số lượng item trong gói"></div><div class="col-md-3"><button type="button" class="btn btn-primary w-100" onclick="addShopBundleItem()">Thêm vào gói</button></div></div>
                                      <div id="shopBundleRows" class="border rounded p-2"></div><div class="form-text">Tối đa 20 ID khác nhau. Giá Xu là giá cả gói; mua N gói nhận N lần toàn bộ danh sách.</div>
                                    </div>
                                    <div class="col-lg-5" id="shopSingleItemField">''',1)
s=s.replace('<input type="number" name="item_amount" id="shop_item_amount"','<input type="number" name="item_amount" id="shop_item_amount"',1)
s=s.replace("$('.select2-custom').select2({ theme: 'bootstrap-5', width: '100%', language: { noResults: function() { return \"Không tìm thấy\"; } } });","initAdminSelects();")
s=s.replace('id="webshopSearchFilter" placeholder="Tìm vật phẩm (tên, ID)..."','id="milestoneSearchFilter" placeholder="Tìm mốc..."',1) if False else s
# Fix duplicate filter ID only in the later milestone block.
dup=s.rfind('id="webshopSearchFilter"');first=s.find('id="webshopSearchFilter"')
if dup!=first:s=s[:dup]+s[dup:].replace('id="webshopSearchFilter"','id="milestoneSearchFilter"',1)
p.write_text(s,encoding='utf-8')
replace('index.php',"$shop_image = !empty($shop['image_url']) ? $shop['image_url'] : (isset($item_images[$shop_item_id]) ? $item_images[$shop_item_id] : '');","$shop_image = lhs_shop_image_url($shop_item_id,isset($shop['image_url'])?$shop['image_url']:'');\n                                $shop_rewards = lhs_shop_public_rewards($shop);\n                                $shop_is_bundle = !empty($shop['reward_items']);")
replace('index.php',"<?php echo htmlspecialchars(json_encode($shop_image), ENT_QUOTES, 'UTF-8'); ?>)","<?php echo htmlspecialchars(json_encode($shop_image), ENT_QUOTES, 'UTF-8'); ?>, <?php echo htmlspecialchars(json_encode($shop_rewards), ENT_QUOTES, 'UTF-8'); ?>, <?php echo $shop_is_bundle?'true':'false'; ?>)")
replace('index.php','<div class="shop-amount-badge">SL: <?php echo htmlspecialchars(webshop_format_int($item_amount), ENT_QUOTES, \'UTF-8\'); ?> cái</div>','<div class="shop-amount-badge"><?php echo $shop_is_bundle ? (count($shop_rewards).\' loại item · nhận tất cả\') : (\'SL: \'.htmlspecialchars(webshop_format_int($item_amount),ENT_QUOTES,\'UTF-8\').\' cái\'); ?></div>')
replace('index.php','<input type="hidden" name="shop_item_id" id="modal_shop_item_id">','<input type="hidden" name="shop_item_id" id="modal_shop_item_id"><input type="hidden" name="request_key" id="modal_shop_request_key"><div id="modal_shop_rewards" class="mb-3"></div>')
replace('index.php','<span>Tổng Donate</span>','<span>Tổng Xu thanh toán</span>')
print('PHP views and buy/retry routes patched')
