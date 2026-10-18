"""Create the approved execution plan, excluding the WebGM admin account."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "temp" / "baozi_penalty_plan_20260901.json"
OUT = ROOT / "temp" / "baozi_penalty_execute_plan_20260901.json"
EXCLUDED = {"vanduc97"}


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = [row for row in source["rows"] if str(row.get("accountId", "")).lower() not in EXCLUDED]
    if len(rows) != 35:
        raise SystemExit(f"Expected 35 approved targets after exclusion, got {len(rows)}")
    summary = {
        "offenderCount": len(rows),
        "totalBugBaozi": sum(int(row["bugBaozi"]) for row in rows),
        "totalItemDeductPlanned": sum(int(row["itemDeduct"]) for row in rows),
        "totalDiamondDeductPlanned": sum(int(row["diamondDeduct"]) for row in rows),
        "totalUncompensatedBaoziPlanned": sum(int(row["uncompensatedBaozi"]) for row in rows),
    }
    output = {
        "approvedExecutionPlan": True,
        "sourcePlan": str(SOURCE),
        "sourceAudit": source.get("sourceAudit"),
        "sourceGeneratedAt": source.get("sourceGeneratedAt"),
        "contract": source.get("contract"),
        "policy": source.get("policy"),
        "excludedAccounts": sorted(EXCLUDED),
        "summary": summary,
        "rows": rows,
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "summary": summary, "excluded": sorted(EXCLUDED)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
