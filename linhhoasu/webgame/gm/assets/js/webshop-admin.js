/* Scoped Webshop editor; use the existing Bootstrap modal and Select2. */
var shopBundleItems = [];
var shopFashionTemplates = [];
function initAdminSelects() {
    $('.select2-custom').each(function () {
        if ($(this).hasClass('select2-hidden-accessible')) return;
        var modal = $(this).closest('.modal');
        $(this).select2({ theme:'bootstrap-5', width:'100%', dropdownParent:modal.length?modal:$(document.body), language:{noResults:function(){return 'Không tìm thấy';}} });
    });
}
function openNewWebshopItem() {
    resetWebshopForm();
    $('#webshopEditTitle').text('Thêm item / gói mới');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('webshopEditModal')).show();
}
function updateShopProductMode() {
    var bundle = $('#shop_product_mode').val() === 'bundle';
    $('#shopBundleEditor').prop('hidden',!bundle);
    $('#shopSingleItemField').toggle(!bundle);
    $('#shop_item_select').prop('required',!bundle);
    $('#shop_item_amount').prop('readonly',bundle);
    if(bundle) $('#shop_item_amount').val(1);
    renderShopBundle();
}
function renderShopBundle() {
    $('#shop_reward_items').val(JSON.stringify(shopBundleItems));
    var html='';
    shopBundleItems.forEach(function(row,index){
        html+='<div class="d-flex align-items-center gap-2 py-2 border-bottom"><img width="40" height="40" loading="lazy" src="../api/item_icon.php?id='+row.id+'" alt=""><div class="flex-grow-1"><strong>'+escapeHtml(getAdminItemName(String(row.id),'Item '+row.id))+'</strong><div class="small text-muted">ID '+row.id+' · ×'+formatNumber(row.amount)+'</div></div><button type="button" class="btn btn-sm btn-outline-danger" data-remove-bundle="'+index+'" aria-label="Bỏ item khỏi gói">Bỏ</button></div>';
    });
    $('#shopBundleRows').html(html||'<span class="text-muted">Chưa có item. Thêm từng món hoặc chọn bộ thời trang.</span>');
}
function addShopBundleItem() {
    var id=Number(rewardKeyToId($('#shop_bundle_item').val())),amount=Number($('#shop_bundle_amount').val());
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(amount)||amount<1)return Swal.fire('Chưa hợp lệ','Chọn item và số lượng nguyên dương.','warning');
    var old=shopBundleItems.find(function(r){return r.id===id;});
    if(!old&&shopBundleItems.length>=20)return Swal.fire('Tối đa 20 ID','Hãy gộp số lượng cho item trùng.','warning');
    if(old){if(!Number.isSafeInteger(old.amount+amount))return;old.amount+=amount;}else shopBundleItems.push({id:id,amount:amount});
    renderShopBundle();
}
function applyFashionBundle() {
    var row=shopFashionTemplates.find(function(r){return r.key===$('#shop_fashion_template').val();});
    if(!row)return;
    shopBundleItems=row.reward_items.map(function(r){return{id:r.id,amount:r.amount};});
    $('#shop_product_mode').val('bundle');$('#shop_item_name').val(row.name+(row.color?' · cấp/màu '+row.color:'')).attr('data-auto-name','0');
    $('#shop_image_url').val('api/item_icon.php?id='+(row.boxId||row.parts[0].id));
    updateShopImagePreview($('#shop_image_url').val());updateShopProductMode();
}
$(function(){
    initAdminSelects();
    $('#webshopEditModal').on('shown.bs.modal',function(){initAdminSelects();});
    $('#shop_product_mode').on('change',updateShopProductMode);
    $('#shopBundleRows').on('click','[data-remove-bundle]',function(){shopBundleItems.splice(Number($(this).data('remove-bundle')),1);renderShopBundle();});
    $.getJSON('../assets/item/hidden_fashion_sets.json',function(doc){
        shopFashionTemplates=doc.sets||[];
        shopFashionTemplates.forEach(function(row){$('<option>').val(row.key).text(row.name+' · bộ '+row.id+' · cấp/màu '+row.color+' · '+row.parts.length+' item').appendTo('#shop_fashion_template');});
    });
});
