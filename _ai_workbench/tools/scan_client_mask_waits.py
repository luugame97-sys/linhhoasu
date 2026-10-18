"""Inventory client mask=true assignments near async animation waits."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
SOURCE = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_a6195824.js"
OUT = ROOT / "_ai_workbench" / "temp" / "mask_wait_inventory.json"
source = SOURCE.read_text(encoding="utf-8")
rows = []
for match in re.finditer(r"(?:[A-Za-z_$][\w$]*\.)?(?:mask|Mask|maskGr|globalMask|maskGroup|doorMask|clickMask)\.visible=!0", source):
    start = max(0, match.start() - 900)
    end = min(len(source), match.end() + 1700)
    context = source[start:end]
    if "waitPlayEnd" not in context and "Rpc(" not in context and "this.Rpc(" not in context:
        continue
    rows.append({
        "offset": match.start(),
        "assignment": match.group(0),
        "hasAnimationWait": "waitPlayEnd" in context,
        "hasRpc": "Rpc(" in context,
        "hasVisibleFalse": ".visible=!1" in context,
        "hasTimeout": "setTimeout" in context or "doTimer" in context,
        "context": context,
    })
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"source": str(SOURCE), "count": len(rows), "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"source": str(SOURCE), "count": len(rows), "withWait": sum(r["hasAnimationWait"] for r in rows), "withRpc": sum(r["hasRpc"] for r in rows), "withoutTimeout": sum(not r["hasTimeout"] for r in rows), "output": str(OUT)}, ensure_ascii=False, indent=2))
