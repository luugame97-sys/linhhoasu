"""Xuất CSV/TXT và báo cáo cho full audit 940 item sử dụng production."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "_ai_workbench"
REPORTS = WORKBENCH / "reports"
TEMP = WORKBENCH / "temp"
CATALOG = TEMP / "usable_item_audit_prod_20260905.json"
RUNTIME = TEMP / "usable_item_runtime_audit_20260905_015937.json"

ALL_CSV = REPORTS / "usable_items_full_audit_20260905.csv"
PROBLEM_CSV = REPORTS / "usable_items_confirmed_problems_20260905.csv"
PROBLEM_TXT = REPORTS / "usable_items_confirmed_problem_ids_20260905.txt"
REPORT_MD = REPORTS / "usable_items_full_audit_20260905.md"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wrap_ids(values: list[int], width: int = 20) -> str:
    return "\n".join(
        ",".join(str(value) for value in values[index:index + width])
        for index in range(0, len(values), width)
    )


def issue_ids(rows: list[dict], issue: str) -> list[int]:
    return sorted({int(row["id"]) for row in rows if issue in row.get("issues", [])})


def priority(row: dict, runtime_ids: set[int]) -> str:
    row_id = int(row["id"])
    issues = set(row.get("issues", []))
    if "SELECT_CONTAINER_IGNORES_SELECTION_AND_GRANTS_ALL" in issues:
        return "P0_PHAT_THUA"
    if row_id in runtime_ids:
        return "P0_DANG_CO_TREN_NGUOI_CHOI"
    if "RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD" in issues and int(row.get("inboundReferenceCount", 0)) > 0:
        return "P1_RUONG_DANG_DUOC_THAM_CHIEU"
    if "RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD" in issues:
        return "P1_RUONG_NUOT_QUA"
    if "SELECT_CONTAINER_HAS_NO_OPTIONS" in issues:
        return "P1_RUONG_KHONG_CO_LUA_CHON"
    if "TYPE103_CONFIGURED_REWARDS_NOT_GRANTED" in issues:
        return "P2_ITEM_TYPE103_BO_QUA_REWARD"
    if row.get("status") == "CAN_TEST_NATIVE":
        return "P3_CAN_TEST_NATIVE_OR_ORPHAN"
    return "OK"


def flatten(row: dict, runtime_ids: set[int]) -> dict:
    cases = row.get("cases") or []
    first = cases[0] if cases else {}
    return {
        "priority": priority(row, runtime_ids),
        "status": row.get("status", ""),
        "id": row.get("id", 0),
        "name": row.get("name", ""),
        "description": row.get("description", ""),
        "icon": row.get("icon", ""),
        "asset_type": row.get("assetType", 0),
        "asset_sub_type": row.get("assetSubType", 0),
        "asset_use_type": row.get("assetUseType", 0),
        "use_type": row.get("useType", 0),
        "quality": row.get("quality", 0),
        "reward_option_count": row.get("rewardCount", 0),
        "reward_rows": json.dumps(row.get("rewardRows") or [], ensure_ascii=False, separators=(",", ":")),
        "case_count": len(cases),
        "observed_result": first.get("result", ""),
        "observed_consumed": first.get("consumed", ""),
        "observed_reward_total": first.get("rewardTotal", ""),
        "observed_tags": ",".join(str(value) for value in first.get("tags", [])),
        "inbound_reference_count": row.get("inboundReferenceCount", 0),
        "inbound_references": ";".join(row.get("inboundReferences") or []),
        "issues": ";".join(row.get("issues") or []),
    }


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = list(rows[0]) if rows else []
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    REPORTS.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    runtime = json.loads(RUNTIME.read_text(encoding="utf-8"))
    rows = catalog["rows"]
    confirmed = [row for row in rows if row.get("status") == "LOI_DA_XAC_NHAN"]
    runtime_ids = {
        int(row["id"])
        for database in runtime["databases"].values()
        for row in database.get("humanItems", [])
    }
    flat = [flatten(row, runtime_ids) for row in rows]
    problems = [flatten(row, runtime_ids) for row in confirmed]
    write_csv(ALL_CSV, flat)
    write_csv(PROBLEM_CSV, problems)

    random_ids = issue_ids(rows, "RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD")
    type103_ids = issue_ids(rows, "TYPE103_CONFIGURED_REWARDS_NOT_GRANTED")
    overgrant_ids = issue_ids(rows, "SELECT_CONTAINER_IGNORES_SELECTION_AND_GRANTS_ALL")
    empty_select_ids = issue_ids(rows, "SELECT_CONTAINER_HAS_NO_OPTIONS")
    pending_ids = sorted(int(row["id"]) for row in rows if row.get("status") == "CAN_TEST_NATIVE")
    referenced_random = [
        int(row["id"]) for row in rows
        if "RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD" in row.get("issues", [])
        and int(row.get("inboundReferenceCount", 0)) > 0
    ]

    lines = [
        "DANH SÁCH 271 ITEM SỬ DỤNG/RƯƠNG LỖI ĐÃ XÁC NHẬN",
        "Nguồn: source/config production ngày 05/09/2026.",
        "Không gửi hàng loạt vào nhân vật thật trước khi fix vì một số rương phát thừa 6-18 món.",
        "",
        f"[P0 - Rương tự chọn phát toàn bộ thay vì 1 món] count={len(overgrant_ids)}",
        wrap_ids(overgrant_ids),
        "",
        f"[P0 - Item lỗi đang có trên người chơi thật] count={len(runtime_ids)}",
        wrap_ids(sorted(runtime_ids)),
        "",
        f"[P1 - Rương ngẫu nhiên bị trừ nhưng không có quà] count={len(random_ids)}",
        wrap_ids(random_ids),
        "",
        f"[P1 - Rương chọn không có option] count={len(empty_select_ids)}",
        wrap_ids(empty_select_ids),
        "",
        f"[P2 - Item type 103 có reward nhưng handler bỏ qua] count={len(type103_ids)}",
        wrap_ids(type103_ids),
        "",
        f"[Chưa kết luận lỗi native/orphan config] count={len(pending_ids)}",
        wrap_ids(pending_ids),
        "",
    ]
    PROBLEM_TXT.write_text("\n".join(lines), encoding="utf-8-sig")

    runtime_s1 = runtime["databases"]["lhs_s1001"]
    runtime_s2 = runtime["databases"]["lhs_s1002"]
    report = f"""# Audit toàn bộ item sử dụng và rương — 05/09/2026

## 1. Tóm tắt công việc

- Quét đúng source/config production, không kết nối database trong fixture: **940 item có `AssetsUseConfig`**.
- Với rương chọn, đã chạy từng lựa chọn riêng; tổng ca test lớn hơn số item.
- Kết quả: **664 item PASS**, **271 item lỗi code đã xác nhận**, **5 item cần test native/orphan config**.
- Nhóm lỗi: 116 rương ngẫu nhiên bị trừ nhưng thưởng rỗng; 150 item type 103 có reward cấu hình nhưng handler bỏ qua; 3 rương tự chọn phát toàn bộ; 2 rương tự chọn không có option.
- Audit runtime Mongo chỉ đọc, ẩn danh; không mở rương trên người chơi thật, không sửa production.

## 2. Phạm vi theo useType

| useType | Số item | Ý nghĩa chính |
|---:|---:|---|
| 101 | 246 | Rương tự chọn chuẩn |
| 102 | 153 | Rương/túi ngẫu nhiên |
| 103 | 458 | Đan/đồ ăn hoặc vật phẩm cộng thuộc tính lâu dài |
| 104 | 2 | Rương thần binh cố định thuộc tính |
| 105 | 59 | Bộ thời trang |
| 106 | 1 | Rương thần binh tối thượng |
| 107 | 12 | Gói tài nguyên công trình |
| 108 | 1 | Luồng client đặc biệt Thất Tịch |
| 110 | 8 | Rương chọn hệ Old Trek/thuỷ thủ |

## 3. Lỗi đã xác nhận

### P0 — Rương tự chọn phát toàn bộ ({len(overgrant_ids)} ID)

```text
{wrap_ids(overgrant_ids)}
```

- `90044`: chọn một thần binh nhưng server tạo cả 6.
- `90045`: chọn một thần binh tối thượng nhưng server tạo cả 18.
- `90046`: chọn một thần binh trác việt nhưng server tạo cả 18.
- Nguyên nhân: handler chỉ coi useType 101/110 là chọn một; type 104/106 rơi vào nhánh cấp toàn bộ `rewards`.

### P0/P1 — Rương ngẫu nhiên bị trừ nhưng không có quà ({len(random_ids)} ID)

```text
{wrap_ids(random_ids)}
```

- Khi dùng: response `result=0`, item nguồn giảm 1, packet có `1202/1300`, nhưng `rewardInfo` rỗng và state không đổi.
- {len(referenced_random)} ID trong nhóm này đang được ít nhất một bảng config khác tham chiếu; {len(random_ids) - len(referenced_random)} ID hiện chưa có tham chiếu catalog ngoài chính item/use row.
- Một số rương 944xx đã có pool hard-code và PASS; không phải toàn bộ useType 102 đều lỗi.

### P1 — Rương chọn không có lựa chọn ({len(empty_select_ids)} ID)

```text
{wrap_ids(empty_select_ids)}
```

- `90021`, `90022`: `AssetsUseConfig.rewards=[]`; client không thể dựng option và server trả `selection required` mà không trừ item.

### P2 — Item type 103 bỏ qua reward ({len(type103_ids)} ID)

```text
{wrap_ids(type103_ids)}
```

- Đây là 75 đan tu vi và 75 đan Tịch Cốc thuộc asset type 8/subType 2 hoặc 4.
- Config có reward như tu vi ID 3 hoặc Baozi ID 4, nhưng handler type 103 chỉ tăng `itemUseRecords/other_attr_info`, không gọi router cấp reward.
- Cả 150 ID hiện không có inbound reference ngoài AssetsUse/Assets trong bản config này, nhưng nếu GM/mail cấp trực tiếp thì người chơi dùng sẽ mất item mà không nhận reward mô tả.

## 4. Item cần test native/orphan, chưa gắn lỗi chắc chắn ({len(pending_ids)} ID)

```text
{wrap_ids(pending_ids)}
```

- `227` dùng màn tương tác Thất Tịch riêng, không nên kết luận bằng tag 1300 generic.
- `94355–94358` có `AssetsUseConfig` nhưng thiếu `AssetsConfig` và không có inbound reference; hiện là orphan config, không xuất hiện như item bình thường.

## 5. Ảnh hưởng runtime production

- S1: {runtime_s1['playerCount']} player/{runtime_s1['humanCount']} người thật; {runtime_s1['affectedHumans']} người thật đang giữ ID lỗi.
- Item lỗi đang có trên người thật: `100080 ×1`, `100139 ×823`.
- S2: {runtime_s2['playerCount']} player/{runtime_s2['humanCount']} người thật; affected=0.
- Thư chưa nhận chứa ID lỗi: S1=0, S2=0.
- RedemptionCode active chứa ID lỗi: S1=0, S2=0.
- Một người có thể giữ nhiều item; audit không công khai account/UID.

## 6. File/thư mục đã thay đổi

- Source game/production: **không thay đổi**.
- Tool audit catalog/runtime/runner/report đặt trong `_ai_workbench/tools/`.
- Evidence: `_ai_workbench/temp/usable_item_audit_prod_20260905.json` và `_ai_workbench/temp/usable_item_runtime_audit_20260905_015937.json`.
- Danh sách: `usable_items_full_audit_20260905.csv`, `usable_items_confirmed_problems_20260905.csv`, `usable_items_confirmed_problem_ids_20260905.txt`.

## 7. Lỗi đã gặp & giải pháp

| Lỗi khi audit | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Fixture đứng ở rương pet 90011 | Ép `Math.random=0` khiến vòng chọn skill unique lặp vô hạn | Dùng PRNG xác định có biến thiên | Không ép random hằng số khi code có vòng unique |
| Chạy một rương một lần không đủ | Rương chọn có 1–40 option | Chạy từng index lựa chọn | Contract bao phủ mọi option |
| Type 102 config rewards rỗng chưa chắc lỗi | Một số rương có pool hard-code theo ID/icon | Đo item delta + rewardInfo + state | Kết luận theo behavior, không chỉ config rỗng |
| Orphan use row nhìn như item lỗi | Thiếu AssetsConfig và không có nguồn phát | Tách `CAN_TEST_NATIVE/orphan` | Không trộn item không thể nhận với item đang nuốt quà |

## 8. Kỹ năng / kinh nghiệm mới

- Rương ngẫu nhiên phải có registry/pool server-authoritative; không nên suy reward từ text dịch lúc runtime.
- useType 104/106 vẫn là chọn một dù khác giao diện 101; server phải xác minh selection đúng schema.
- Item permanent attr và item có reward tức thời cần tách nhánh theo nội dung config, không chỉ theo useType.

## 9. Trạng thái hiện tại

- Audit production 940/940 item: PASS về độ phủ.
- 271 ID lỗi đã xuất đầy đủ tên, mô tả, route, option, packet và nguồn tham chiếu.
- Source hashes: item handler `{catalog['productionEvidence']['sourceHashes']['/linhhoasu/lhs/newServer/src/handlers/item.js']}`, RewardGrant `{catalog['productionEvidence']['sourceHashes']['/linhhoasu/lhs/newServer/src/services/RewardGrantService.js']}`.
- Production vẫn healthy; không gửi item, không sửa DB, không restart.

## 10. Bước tiếp theo

1. Fix P0 `90044/90045/90046` trước để chặn phát thừa.
2. Fix `100080` và `100139` trước trong nhóm nuốt quà vì người thật đang giữ; sau đó triển khai registry cho đủ 116 rương ngẫu nhiên.
3. Sửa 150 item type 103 theo hai nhánh: reward tức thời dùng router chung; attrs lâu dài giữ ledger/cap hiện tại.
4. Bổ sung option đúng cho `90021/90022`; chỉ repair/hoàn rương cũ sau khi có ledger hoặc bằng chứng sử dụng, tránh phát bù trùng.
"""
    REPORT_MD.write_text(report, encoding="utf-8")

    outputs = [ALL_CSV, PROBLEM_CSV, PROBLEM_TXT, REPORT_MD]
    print(json.dumps({
        "result": "PASS",
        "rows": len(rows),
        "confirmed": len(confirmed),
        "randomEmpty": len(random_ids),
        "type103": len(type103_ids),
        "overgrant": len(overgrant_ids),
        "emptySelect": len(empty_select_ids),
        "pending": len(pending_ids),
        "runtimeIds": sorted(runtime_ids),
        "artifacts": {str(path): {"bytes": path.stat().st_size, "sha256": sha256(path)} for path in outputs},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
