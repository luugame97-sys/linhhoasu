from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")
old = (
    'n.Rpc(1230,t,function(t){t.rewardInfo&&Er.Open(t.rewardInfo),'
    'n.addRecords(e,1),A.ins().dispatch(E.Recharge_Info_Update,e),'
    'n.reportTWCustomPay({payid:e,orderId:"",payType:"",cpOrderId:"",'
    'currency:"USD",price:"",productId:""})})'
)
new = (
    'n.Rpc(1230,t,function(t){t&&0===t.result&&('
    't.rewardInfo&&Er.Open(t.rewardInfo),'
    'n.addRecords(e,1),A.ins().dispatch(E.Recharge_Info_Update,e),'
    'n.reportTWCustomPay({payid:e,orderId:"",payType:"",cpOrderId:"",'
    'currency:"USD",price:"",productId:""}))})'
)
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one token-purchase callback, found {count}")
updated = text.replace(old, new)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(updated, encoding="utf-8")
print({"result": "ok", "replacements": count, "bytes_before": len(text.encode()), "bytes_after": len(updated.encode())})

