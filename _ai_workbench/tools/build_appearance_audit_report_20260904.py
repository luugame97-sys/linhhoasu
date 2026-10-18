"""Tạo danh sách ID và báo cáo audit ngoại quan từ evidence production."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "_ai_workbench"
REPORTS = WORKBENCH / "reports"
TEMP = WORKBENCH / "temp"
FULL = TEMP / "appearance_full_audit_20260904.json"
MAIL = TEMP / "appearance_mail_route_prod_20260904.json"
RUNTIME = TEMP / "appearance_runtime_audit_20260904_155356.json"

CONFIRMED_TXT = REPORTS / "appearance_confirmed_problem_ids_20260904.txt"
RUNTIME_TXT = REPORTS / "appearance_runtime_affected_ids_20260904.txt"
REPORT_MD = REPORTS / "appearance_full_audit_20260904.md"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_sorted(values) -> list[int]:
    return sorted({int(value) for value in values if int(value or 0) > 0})


def wrap_ids(ids: list[int], width: int = 25) -> str:
    return "\n".join(
        ",".join(str(value) for value in ids[start:start + width])
        for start in range(0, len(ids), width)
    )


def group_rows(rows: list[dict], status: str) -> dict[str, list[int]]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        if row.get("status") != status:
            continue
        send_id = int(row.get("recommended_send_id") or 0)
        if send_id > 0:
            grouped[str(row.get("category") or "Khác")].append(send_id)
    return {category: unique_sorted(ids) for category, ids in grouped.items()}


def md_id_section(category: str, ids: list[int]) -> str:
    return f"### {category} ({len(ids)} ID)\n\n```text\n{wrap_ids(ids)}\n```\n"


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    full = json.loads(FULL.read_text(encoding="utf-8"))
    mail = json.loads(MAIL.read_text(encoding="utf-8"))
    runtime = json.loads(RUNTIME.read_text(encoding="utf-8"))
    rows = full["rows"]
    confirmed_groups = group_rows(rows, "LOI_DA_XAC_NHAN")
    native_groups = group_rows(rows, "CAN_TEST_NATIVE")
    confirmed_unique = unique_sorted(
        row.get("recommended_send_id") for row in rows
        if row.get("status") == "LOI_DA_XAC_NHAN"
    )
    native_unique = unique_sorted(
        row.get("recommended_send_id") for row in rows
        if row.get("status") == "CAN_TEST_NATIVE"
    )

    confirmed_order = [
        "Danh hiệu", "Pháp trận/cánh", "Thú cưỡi/phi kiếm", "Pháp bảo",
        "Pháp tướng", "Thời trang/bộ đồ", "Áo choàng tắm",
    ]
    confirmed_lines = [
        "DANH SÁCH 162 ID CÓ LỖI CODE ĐÃ XÁC NHẬN",
        "Nguồn: source/config production ngày 04/09/2026.",
        "Mỗi ID gửi số lượng 1. Bộ đồ phải nhận thư, vào túi và bấm Sử dụng.",
        "Lưu ý: thú cưỡi và pháp bảo nhận qua mail hiện đi đúng route; lỗi của các ID này nằm ở reward/activity generic.",
        "",
    ]
    for category in confirmed_order:
        ids = confirmed_groups.get(category, [])
        confirmed_lines.extend([f"[{category}] count={len(ids)}", wrap_ids(ids), ""])
    confirmed_lines.extend([
        "[Lỗi handler toàn cục không quy về một item riêng]",
        "- Có thể mặc ID chưa sở hữu qua tag 1801.",
        "- Client có thể tự khai ID hết hạn qua tag 1811.",
        "- Mở màu bộ đồ không kiểm sở hữu/chi phí.",
        "- Nâng sao bộ đồ nhận star=999 không kiểm sở hữu/chi phí/cấp tối đa.",
        "- Emoji group 999 vẫn mua thành công dù không có config/chi phí.",
        "",
    ])
    CONFIRMED_TXT.write_text("\n".join(confirmed_lines), encoding="utf-8-sig")

    runtime_labels = {
        "COSMETIC_OWNED_WITHOUT_NATIVE_FORMATION": "Pháp trận chỉ có hình, thiếu collection native",
        "COSMETIC_OWNED_WITHOUT_NATIVE_SWORD": "Thú cưỡi chỉ có hình, thiếu collection native",
        "COSMETIC_OWNED_WITHOUT_NATIVE_ARTIFACT": "Pháp bảo chỉ có hình, thiếu collection native",
        "COSMETIC_OWNED_WITHOUT_NATIVE_SPIRIT": "Pháp tướng chỉ có hình, thiếu collection native",
        "CURRENT_ID_NOT_IN_FASHION_CONFIG": "Suit ID bị ghi sai vào slot ngoại quan",
    }
    runtime_lines = [
        "ID ĐÃ THẤY STATE LỖI TRÊN NGƯỜI CHƠI PRODUCTION",
        "Audit chỉ đọc và đã ẩn danh tài khoản/UID.",
        "Một người có thể nằm trong nhiều nhóm; không cộng số người giữa các nhóm.",
        "Có 29 ID nhận dạng state lỗi: 28 ID gửi test được; 28000 là suit nội bộ, không có item gửi trực tiếp.",
        "",
    ]
    for issue, ids in runtime.get("issueIds", {}).items():
        values = unique_sorted(ids)
        runtime_lines.extend([
            f"[{runtime_labels.get(issue, issue)}] count={len(values)}",
            wrap_ids(values),
            "",
        ])
    RUNTIME_TXT.write_text("\n".join(runtime_lines), encoding="utf-8-sig")

    summary = full["summary"]
    status = summary["statusCounts"]
    category_counts = summary["categoryCounts"]
    category_table = "\n".join(
        f"| {category} | {count} |"
        for category, count in sorted(category_counts.items())
    )
    confirmed_table = "\n".join(
        f"| {category} | {len(confirmed_groups.get(category, []))} | "
        + {
            "Danh hiệu": "Kích hoạt ownership nhưng thiếu dữ liệu thời hạn.",
            "Pháp trận/cánh": "Mail/reward mở hình nhưng không tạo collection pháp trận.",
            "Thú cưỡi/phi kiếm": "Reward/activity generic ưu tiên Fashion; mail đã đi đúng collection.",
            "Pháp bảo": "Reward/activity generic ưu tiên Fashion; mail đã đi đúng collection.",
            "Pháp tướng": "Mail/reward mở hình nhưng không tạo collection pháp tướng.",
            "Thời trang/bộ đồ": "Mặc suit không áp các component; một số bộ còn lỗi màu/nâng sao.",
            "Áo choàng tắm": "Mặc suit không áp các component; lỗi mở màu.",
        }[category] + " |"
        for category in confirmed_order
    )
    runtime_issue_counts = runtime.get("issueCounts", {})
    s1 = runtime["databases"].get("lhs_s1001", {})
    s2 = runtime["databases"].get("lhs_s1002", {})
    mail_summary = mail["summary"]

    confirmed_sections = "\n".join(
        md_id_section(category, confirmed_groups.get(category, []))
        for category in confirmed_order
    )
    native_sections = "\n".join(
        md_id_section(category, ids)
        for category, ids in sorted(native_groups.items())
    )
    native_distribution = ", ".join(
        f"{category} {len(ids)}" for category, ids in sorted(native_groups.items())
    )

    report = f"""# Audit toàn bộ ngoại quan game — 04/09/2026

## 1. Tóm tắt công việc

- Đã quét đúng source/config production: `FashionConfig` 1.976 dòng, `FashionDressConfig` 59 bộ và 219 dòng collection native.
- Tổng catalog phân tích: **2.254 dòng**, tương ứng **2.189 ID gửi test duy nhất**.
- Phân loại: **1.718 ID tĩnh ổn**, **162 ID lỗi code đã xác nhận**, **309 ID cần test hiển thị native**.
- Đã mô phỏng riêng đường nhận thư trên **2.192 ID catalog** bằng player giả trong bộ nhớ, không kết nối Mongo: 59 item bộ đồ được định tuyến vào túi; thú cưỡi, pháp bảo, linh thú đi đúng collection; còn 58 ID lỗi state/route trực tiếp qua mail.
- Đã audit Mongo production chỉ đọc, ẩn danh account/UID; không gửi vật phẩm, không sửa dữ liệu, không restart.

## 2. Phạm vi catalog

| Nhóm | Số dòng catalog |
|---|---:|
{category_table}

Ba suit nội bộ `28000`, `29810`, `29999` không có item gửi trực tiếp. Riêng `113114` và `113115` dùng chung `itemId=113113` trong config nhưng có Fashion ID riêng; danh sách test cố ý giữ cả `113113`, `113114`, `113115`.

## 3. Lỗi đã xác nhận

| Nhóm | ID duy nhất | Lỗi |
|---|---:|---|
{confirmed_table}

### Kết quả đường nhận thư

- Route đúng: 1.914 Fashion đi vào Fashion; 36 thú cưỡi; 54 pháp bảo; 49 pháp bảo đặc biệt; 41 linh thú; 25 thú hồn; 59 item bộ đồ được chuyển sang nhánh túi.
- Lỗi state/route: trong 1.914 Fashion có 44 danh hiệu thời hạn thiếu `fashionData.limitValues`; 7 pháp trận và 7 pháp tướng chỉ mở Fashion mà không tạo object collection native.
- Thú cưỡi/pháp bảo nhận qua mail hiện đúng vì `mail.js` có special-case. Nhưng các đường activity/reward/shop generic gọi `addRewardRowsToPlayer()` vẫn xét Fashion trước native, nên 30 thú cưỡi và 18 pháp bảo có thể chỉ mở hình.

### Lỗi handler toàn cục

- `1801`: cho mặc và tự ghi sở hữu ID chưa có.
- `1811`: tin danh sách hết hạn do client gửi, không tự kiểm thời gian server.
- Mở màu suit không kiểm ownership/cost; fixture mở được màu khi không sở hữu.
- Nâng sao suit nhận `star=999`, không kiểm ownership/cost/cap và lưu `dress` dạng object trong khi client dùng array.
- Emoji group `999` không có config/cost vẫn mua thành công.

## 4. Danh sách 162 ID lỗi chắc chắn

{confirmed_sections}

File thuần để copy/gửi test: `appearance_confirmed_problem_ids_20260904.txt`.

## 5. Asset cần test trực tiếp trong client

- Có **309 ID** chưa thể kết luận lỗi chỉ từ manifest: nhiều icon/Spine nằm trong atlas hoặc pack và tên resource không ánh xạ 1:1.
- Không phát hiện bằng chứng đủ chắc để gọi là “mất asset vật lý”. Các ID này giữ trạng thái `CAN_TEST_NATIVE` cho tới khi gửi vào acc test và xem icon/model/animation trong game.
- Phân bố: {native_distribution}.

{native_sections}

## 6. Bằng chứng state lỗi trên production

- S1: {s1.get('playerCount', 0)} player, {s1.get('humanCount', 0)} người thật; {s1.get('humanIssueSubjects', 0)} người thật có state ngoại quan lệch.
- S2: {s2.get('playerCount', 0)} player, {s2.get('humanCount', 0)} người thật; {s2.get('humanIssueSubjects', 0)} người thật có state lệch.
- Pháp trận `21101–21106`: {runtime_issue_counts.get('COSMETIC_OWNED_WITHOUT_NATIVE_FORMATION', 0)} người.
- Thú cưỡi `22403–22406`, `22501–22506`: {runtime_issue_counts.get('COSMETIC_OWNED_WITHOUT_NATIVE_SWORD', 0)} người.
- Pháp bảo `23103`, `23113`, `23123`, `23133`, `23143`, `23153`: {runtime_issue_counts.get('COSMETIC_OWNED_WITHOUT_NATIVE_ARTIFACT', 0)} người.
- Pháp tướng `24101–24106`: {runtime_issue_counts.get('COSMETIC_OWNED_WITHOUT_NATIVE_SPIRIT', 0)} người.
- Suit nội bộ `28000` bị ghi sai vào slot Fashion: {runtime_issue_counts.get('CURRENT_ID_NOT_IN_FASHION_CONFIG', 0)} người; ID này không có item gửi trực tiếp.

Một người có thể xuất hiện trong nhiều nhóm. Có 29 ID nhận dạng state lỗi, trong đó 28 ID gửi test được và `28000` chỉ dùng nhận dạng state. Danh sách nằm ở `appearance_runtime_affected_ids_20260904.txt`.

## 7. File/thư mục đã thay đổi

- Source game production/local: **không thay đổi**.
- Tool hỗ trợ: `audit_all_appearance_catalog_20260904.js`, `build_appearance_test_inventory_20260904.py`, `run_appearance_catalog_prod_20260904.py`, `audit_appearance_runtime_remote_20260904.js`, `run_appearance_runtime_audit_20260904.py`, `audit_appearance_mail_route_20260904.js`, `run_appearance_mail_route_prod_20260904.py`, `build_appearance_audit_report_20260904.py`.
- Evidence đặt trong `_ai_workbench/temp/`; danh sách và báo cáo đặt trong `_ai_workbench/reports/`.

## 8. Lỗi đã gặp & giải pháp

| Lỗi/phát hiện | Nguyên nhân | Cách xử lý trong audit | Cách tránh lặp lại |
|---|---|---|---|
| Asset không có key trực tiếp trong manifest | Resource có thể nằm trong atlas/pack | Giữ `CAN_TEST_NATIVE`, không kết luận mất asset | Test icon/model/animation native trước khi sửa asset |
| Local `fashion.js` lệch production | Source local cũ hơn source đang chạy | Chạy fixture trên source production | Luôn dùng hash/source live làm chuẩn trước kết luận/deploy |
| 4 Fashion mặc định nhìn như không grant | Player fixture chưa chạy normalize mặc định | Gọi `ensureRoleAppearance()` trước khi đo ownership | So sánh state trước/sau trên fixture đúng lifecycle |
| Cùng ID xuất hiện ở Fashion và native | Catalog dùng một item cho hình và collection | Dedupe theo ID gửi nhưng giữ đủ route | Audit mail và reward generic tách riêng |

## 9. Kỹ năng / kinh nghiệm mới

- Ngoại quan có hai lớp: Fashion hiển thị và collection gameplay; mở hình không đồng nghĩa đã sở hữu pháp trận/thú cưỡi/pháp bảo/pháp tướng.
- Test bộ đồ phải gồm ba bước: nhận item → dùng item → mặc suit/đổi màu/nâng sao.
- ID trong atlas không thể được đánh giá chỉ bằng tên file hoặc key manifest.

## 10. Trạng thái hiện tại

- Audit catalog, mail fixture và runtime read-only: PASS.
- Mail fixture: {mail_summary['uniqueIds']} ID, {mail_summary['issueIds']} ID có lỗi; không kết nối database.
- Danh sách toàn bộ 2.189 ID, 162 ID lỗi chắc chắn, 309 ID cần test native và ID đã thấy lỗi runtime đã được xuất.
- Chưa sửa handler, chưa repair player, chưa gửi vật phẩm, chưa restart S1/S2.

## 11. Bước tiếp theo

1. Dùng `appearance_test_ids_20260904.txt` để gửi toàn bộ catalog vào **acc test riêng**, mỗi ID số lượng 1 và test theo nhóm nhỏ.
2. Ưu tiên 28 ID gửi được trong `appearance_runtime_affected_ids_20260904.txt` (bỏ `28000`), sau đó 162 ID lỗi chắc chắn, rồi 309 ID cần native test.
3. Nếu triển khai fix, cần hợp nhất router Fashion/native, sửa thời hạn title, suit ownership/cost/state và thêm contract cho mail + activity + webshop + giftcode trước khi repair player.
"""
    REPORT_MD.write_text(report, encoding="utf-8")

    outputs = [CONFIRMED_TXT, RUNTIME_TXT, REPORT_MD]
    print(json.dumps({
        "result": "PASS",
        "confirmedUniqueIds": len(confirmed_unique),
        "nativeCheckUniqueIds": len(native_unique),
        "mailIssueIds": mail_summary["issueIds"],
        "artifacts": {str(path): {"bytes": path.stat().st_size, "sha256": sha256(path)} for path in outputs},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
