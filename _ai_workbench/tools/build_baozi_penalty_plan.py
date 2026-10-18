"""Build a deterministic, local-only punishment plan from a read-only audit."""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "temp" / "fortune_package_audit" / "fortune_package_totals_20260901_122019.json"
OUT = ROOT / "temp" / "baozi_penalty_plan_20260901.json"

PENALTIES = (
    (1_000, 1_800, "dưới 1.000 Bánh bao → khóa 30 phút"),
    (5_000, 3_600, "dưới 5.000 Bánh bao → khóa 1 giờ"),
    (10_000, 10_800, "dưới 10.000 Bánh bao → khóa 3 giờ"),
    (20_000, 18_000, "dưới 20.000 Bánh bao → khóa 5 giờ"),
    (50_000, 36_000, "dưới 50.000 Bánh bao → khóa 10 giờ"),
    (100_000, 86_400, "dưới 100.000 Bánh bao → khóa 24 giờ"),
    (300_000, 259_200, "dưới 300.000 Bánh bao → khóa 3 ngày"),
)


def penalty_for(account: str, baozi: int) -> tuple[int, str]:
    if account == "zerovip28n":
        return 2_592_000, "zerovip28n → khóa 30 ngày theo chỉ định riêng"
    for upper, seconds, label in PENALTIES:
        if baozi < upper:
            return seconds, label
    raise ValueError(f"Chưa có chính sách cho {account}: {baozi} Bánh bao")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    source = json.loads(AUDIT.read_text(encoding="utf-8"))
    audit = source["audit"]
    rows = []
    for row in audit["rows"]:
        bug_baozi = int(row.get("minimumExcessBaozi") or 0)
        if bug_baozi <= 0:
            continue
        account = str(row.get("accountId") or "").strip().lower()
        if not account:
            raise ValueError(f"Thiếu account mapping cho {row.get('userId')}")
        seconds, tier = penalty_for(account, bug_baozi)
        item_have = max(0, int(row.get("currentBaoziBalance") or 0))
        diamond_have = max(0, int(row.get("currentDiamondBalance") or 0))
        item_deduct = min(bug_baozi, item_have)
        diamond_need = max(0, bug_baozi - item_deduct)
        diamond_deduct = min(diamond_need, diamond_have)
        uncompensated = max(0, diamond_need - diamond_deduct)
        rows.append({
            "accountId": account,
            "userId": str(row.get("userId") or ""),
            "playerId": str(row.get("playerId") or ""),
            "roleName": str(row.get("name") or ""),
            "bugClaims": max(0, int(row.get("minimumExcessClaims") or 0)),
            "bugBaozi": bug_baozi,
            "itemBefore": item_have,
            "diamondBefore": diamond_have,
            "itemDeduct": item_deduct,
            "diamondDeduct": diamond_deduct,
            "uncompensatedBaozi": uncompensated,
            "penaltySeconds": seconds,
            "penaltyLabel": tier,
            "scope": "both",
            "reason": "Lợi dụng bug Bánh bao sự kiện.",
            "code": "FORTUNE_BAOZI_EXPLOIT",
        })
    rows.sort(key=lambda r: (-r["bugBaozi"], r["accountId"]))
    output = {
        "readOnlyPlan": True,
        "sourceAudit": str(AUDIT),
        "sourceGeneratedAt": audit.get("generatedAt"),
        "contract": audit.get("contract"),
        "policy": {
            "valuation": "1 Bánh bao = 1 Nguyên bảo",
            "deduction": "Trừ Bánh bao hiện có trước; thiếu bao nhiêu thì trừ Nguyên bảo bấy nhiêu; không cho số âm.",
            "banScope": "game + webgm",
            "title": "Thiên Đạo Ban Lệnh",
        },
        "summary": {
            "offenderCount": len(rows),
            "totalBugBaozi": sum(r["bugBaozi"] for r in rows),
            "totalItemDeduct": sum(r["itemDeduct"] for r in rows),
            "totalDiamondDeduct": sum(r["diamondDeduct"] for r in rows),
            "totalUncompensatedBaozi": sum(r["uncompensatedBaozi"] for r in rows),
            "penaltySecondsByTier": {},
        },
        "rows": rows,
    }
    for row in rows:
        key = row["penaltyLabel"]
        output["summary"]["penaltySecondsByTier"][key] = output["summary"]["penaltySecondsByTier"].get(key, 0) + 1
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
