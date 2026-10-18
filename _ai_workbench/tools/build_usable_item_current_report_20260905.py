"""Build the current read-only usable-item audit report and ID inventories."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "_ai_workbench"
REPORTS = WORKBENCH / "reports"
TEMP = WORKBENCH / "temp"
AUDIT = TEMP / "usable_item_audit_prod_20260905.json"
RUNTIME = TEMP / "usable_item_runtime_audit_20260905_054552.json"
REPORT_MD = REPORTS / "usable_items_current_audit_20260905.md"
REPORT_HTML = REPORTS / "usable_items_current_audit_20260905.html"
CSV_PATH = REPORTS / "usable_items_need_fix_current_20260905.csv"
TXT_PATH = REPORTS / "usable_items_need_fix_current_20260905.txt"
PENDING_TXT = REPORTS / "usable_items_pending_native_current_20260905.txt"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def first_case(row: dict) -> dict:
    cases = row.get("cases") or []
    return cases[0] if cases else {}


def category(row: dict) -> str:
    row_id = int(row.get("id", 0))
    use_type = int(row.get("useType", 0))
    if row_id in (90021, 90022):
        return "P1_THIEU_OPTION"
    if use_type == 102:
        return "P1_RUONG_CHUA_CO_POOL"
    if use_type == 103:
        return "P2_DAN_CHUA_HOAN_THIEN"
    return "P3_CAN_TEST_NATIVE_OR_ORPHAN"


def compact(text: object) -> str:
    return str(text or "").replace("\r", " ").replace("\n", " ").strip()


def csv_row(row: dict) -> dict:
    case = first_case(row)
    return {
        "priority": category(row),
        "status": row.get("status", ""),
        "id": int(row.get("id", 0)),
        "name": compact(row.get("name")),
        "description": compact(row.get("description")),
        "icon": compact(row.get("icon")),
        "asset_type": int(row.get("assetType", 0)),
        "asset_use_type": int(row.get("assetUseType", 0)),
        "use_type": int(row.get("useType", 0)),
        "quality": int(row.get("quality", 0)),
        "observed_result": case.get("result", ""),
        "observed_consumed": case.get("consumed", ""),
        "issues": ";".join(row.get("issues") or []),
    }


def md_table(rows: list[dict], include_result: bool = True) -> list[str]:
    output = ["| ID | Tên item | Icon | Trạng thái |", "|---:|---|---|---|"]
    for row in rows:
        case = first_case(row)
        state = "Từ chối, không trừ item" if include_result and case.get("result") != 0 else "; ".join(row.get("issues") or [])
        output.append(
            f"| `{int(row['id'])}` | {compact(row.get('name')) or '(không có tên AssetsConfig)'} "
            f"| `{compact(row.get('icon')) or '-'} ` | {state} |"
        )
    return output


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    runtime = json.loads(RUNTIME.read_text(encoding="utf-8"))
    rows = list(audit.get("rows") or [])
    confirmed = sorted((row for row in rows if row.get("status") == "LOI_DA_XAC_NHAN"), key=lambda row: int(row["id"]))
    pending = sorted((row for row in rows if row.get("status") == "CAN_TEST_NATIVE"), key=lambda row: int(row["id"]))
    random_boxes = [row for row in confirmed if int(row.get("useType", 0)) == 102]
    pills = [row for row in confirmed if int(row.get("useType", 0)) == 103]
    missing_options = [row for row in confirmed if int(row.get("id", 0)) in (90021, 90022)]
    listed = confirmed + pending

    assert len(rows) == 940
    assert len(confirmed) == 263
    assert len(random_boxes) == 111
    assert len(pills) == 150
    assert len(missing_options) == 2
    assert len(pending) == 5
    assert len({int(row["id"]) for row in listed}) == 268
    assert all(first_case(row).get("consumed", 0) == 0 for row in confirmed)

    flat = [csv_row(row) for row in sorted(listed, key=lambda row: int(row["id"]))]
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(flat[0]))
        writer.writeheader()
        writer.writerows(flat)

    txt_lines = [
        "DANH SÁCH ITEM CẦN FIX HIỆN TẠI — 05/09/2026",
        "",
        "263 lỗi/chức năng chưa hoàn thiện chắc chắn; tất cả đang fail-closed, không trừ item.",
        "5 item cần kiểm tra native/orphan riêng.",
        "",
    ]
    for row in sorted(confirmed, key=lambda row: int(row["id"])):
        txt_lines.append(f"{int(row['id'])}\t{compact(row.get('name'))}\t{category(row)}")
    TXT_PATH.write_text("\n".join(txt_lines) + "\n", encoding="utf-8")
    PENDING_TXT.write_text(
        "\n".join(f"{int(row['id'])}\t{compact(row.get('name'))}\t{';'.join(row.get('issues') or [])}" for row in pending) + "\n",
        encoding="utf-8",
    )

    db1 = runtime["databases"]["lhs_s1001"]
    db2 = runtime["databases"]["lhs_s1002"]
    lines = [
        "# Audit toàn bộ item/rương hiện tại — 05/09/2026",
        "",
        "> Audit này chạy lại trực tiếp trên source/config production hiện hành. Chỉ đọc source/config/MongoDB; không sửa người chơi, không phát quà và không restart server.",
        "",
        "## 1. Kết luận",
        "",
        "- Đã quét đủ **940/940** item có `AssetsUseConfig`.",
        "- **263 ID cần fix chắc chắn**: 111 rương chưa có pool chuẩn, 150 đan thưởng tức thời chưa hoàn thiện cap/ngày, 2 rương thiếu lựa chọn.",
        "- Cả 263 ID hiện được chặn trước consume: bấm dùng trả lỗi và **không trừ item**. Đây là bảo vệ an toàn, không phải đã phục hồi tính năng.",
        "- **672 ID qua fixture hiện tại**; kết quả này chỉ chứng minh handler/state fixture, chưa thay cho kiểm hình và thao tác native trong game.",
        "- **5 ID cần kiểm tra riêng**: 1 luồng client đặc biệt và 4 orphan thiếu `AssetsConfig`.",
        "",
        "| Nhóm | Số lượng | Trạng thái hiện tại |",
        "|---|---:|---|",
        "| Rương type 102 chưa có pool xác thực | 111 | Bị chặn, không trừ rương |",
        "| Đan type 103 có reward | 150 | Bị chặn, không trừ đan |",
        "| Rương tự chọn thiếu option | 2 | Bị chặn, không trừ rương |",
        "| Cần test native/orphan | 5 | Chưa kết luận lỗi gameplay |",
        "| Qua fixture hiện tại | 672 | Chưa đồng nghĩa 100% native OK |",
        "",
        "## 2. 111 rương chưa có pool chuẩn",
        "",
        "Các rương này trước đây có nguy cơ bị trừ mà không có quà. Hiện server trả `ITEM_REWARD_POOL_UNVERIFIED` trước khi consume. Cần khôi phục đúng pool, tỷ lệ và duplicate conversion từ nguồn gốc trước khi mở lại.",
        "",
        *md_table(random_boxes),
        "",
        "## 3. 150 đan type 103 chưa hoàn thiện",
        "",
        "Các item này có `rewards` nhưng cần triển khai đúng bộ đếm dùng chung `-802/-804`, reset ngày và cộng giới hạn đặc quyền. Hiện trả `ITEM_PILL_PENDING_VERIFICATION` và không trừ đan.",
        "",
        *md_table(pills),
        "",
        "## 4. Hai rương thiếu lựa chọn",
        "",
        *md_table(missing_options),
        "",
        "`90021/90022` có `AssetsUseConfig.rewards=[]`; catalog Elf hiện không có lựa chọn phẩm chất 2/3 tương ứng. Không nên tự nâng lên phẩm chất 4.",
        "",
        "## 5. Năm item cần kiểm tra native/orphan",
        "",
        *md_table(pending, include_result=False),
        "",
        "- `227` là luồng client đặc biệt type 108, không dùng tag 1300 như item thường.",
        "- `94355–94358` có `AssetsUseConfig` nhưng thiếu `AssetsConfig`, nên cần xác minh client/config gốc trước khi sửa.",
        "",
        "## 6. Ảnh hưởng người chơi hiện tại",
        "",
        f"- S1: {db1['humanCount']} người thật; {db1['affectedHumans']} người đang giữ item thuộc nhóm cần fix, tổng `100139 ×823`.",
        f"- S2: {db2['humanCount']} người thật; {db2['affectedHumans']} người bị ảnh hưởng, không thấy item lỗi đang giữ.",
        "- Không thấy mail chưa nhận hoặc GiftCode active chứa 263 ID này.",
        "- Không tự phát bù: tồn kho chưa mở không phải giao dịch mất quà; cần ledger cụ thể nếu xử lý lịch sử.",
        "",
        "## 7. File bằng chứng và danh sách",
        "",
        f"- JSON production: `_ai_workbench/temp/{AUDIT.name}` — SHA-256 `{sha256(AUDIT)}`.",
        f"- Runtime Mongo read-only: `_ai_workbench/temp/{RUNTIME.name}` — SHA-256 `{sha256(RUNTIME)}`.",
        f"- CSV 268 dòng (263 cần fix + 5 pending): `_ai_workbench/reports/{CSV_PATH.name}`.",
        f"- TXT 263 ID cần fix: `_ai_workbench/reports/{TXT_PATH.name}`.",
        f"- TXT 5 pending: `_ai_workbench/reports/{PENDING_TXT.name}`.",
        "",
        "## 8. Thứ tự fix đề xuất",
        "",
        "1. `100139` vì đang có 823 rương trên 3 người thật; khôi phục đúng mảnh huyết mạch, không phát nguyên huyết mạch.",
        "2. Rương được event/shop tham chiếu nhiều: `412`, `413`, `94401`, `94416`, `94801`, `94802`.",
        "3. Các họ random native: Elf/Curios/Orb/Linh Trục/ArtifactSoul; mỗi họ cần contract riêng và relog.",
        "4. Hoàn thiện 150 đan với cap chung/ngày và đặc quyền, rồi mới bỏ chặn.",
        "5. Xác minh nguồn gốc `90021/90022`, `227`, `94355–94358` trước khi thay config.",
        "",
        f"> Tạo báo cáo lúc {datetime.now().astimezone().isoformat(timespec='seconds')}.",
    ]
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "audit": str(AUDIT),
        "runtime": str(RUNTIME),
        "report": str(REPORT_MD),
        "csv": str(CSV_PATH),
        "txt": str(TXT_PATH),
        "pending": str(PENDING_TXT),
        "counts": {"rows": 940, "confirmed": 263, "randomBoxes": 111, "pills": 150, "missingOptions": 2, "pending": 5, "fixturePass": 672},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
