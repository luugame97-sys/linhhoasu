"""Static inventory of Spine waitPlayEnd call sites in the served client bundle."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
SOURCE = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_a6195824.js"
OUT = ROOT / "_ai_workbench" / "temp" / "waitplay_inventory.json"

source = SOURCE.read_text(encoding="utf-8")
call_re = re.compile(r"(?:\.waitPlayEnd\(\)|\.waitPlayEnd\?)")
function_re = re.compile(r"(?:[A-Za-z_$][\w$]*\.)?(?:prototype\.)?[A-Za-z_$][\w$]*=function\(")
rows = []
for index, match in enumerate(call_re.finditer(source), 1):
    start = match.start()
    before = source[max(0, start - 1600) : start]
    after = source[start : min(len(source), start + 1000)]
    functions = list(function_re.finditer(before))
    owner = functions[-1].group(0) if functions else "<unknown>"
    context = before[-700:] + after[:500]
    # The most useful static signal for this incident is the animation loop flag
    # immediately before a wait.  A Track waiting for a non-loop animation should
    # normally settle on complete; a loop has no terminal complete event.
    loop_matches = re.findall(
        r"(?:setAnimation|setAnimtion|play)\([^;\n]{0,220}?(?:,|\()!0\)",
        before[-420:],
    )
    loop_nearby = bool(loop_matches)
    terms = {
        term: len(re.findall(re.escape(term), context, flags=re.IGNORECASE))
        for term in (
            "mask", "globalMask", "touchEnabled", "touchChildren", "queue", "AsyncQueue",
            "Promise.all", "visible=!1", "visible=!0", "isAnim", "isPlaying", "next()",
            "t()", "callback", "OnClose", "stopAll", "removeFromParent", "for("
        )
    }
    score = sum(terms.values()) + (8 if loop_nearby else 0)
    rows.append({"ordinal": index, "offset": start, "owner": owner, "score": score, "loopNearby": loop_nearby, "loopMatches": loop_matches[-4:], "terms": terms, "context": context})

summary = {
    "source": str(SOURCE),
    "length": len(source),
    "waitPlayEndCalls": len(rows),
    "waitPlayEndHasDisposedFastPath": "waitPlayEnd=function(){if" in source,
    "waitPlayEndRegistersAfterDisposedWithoutFastPath": "waitPlayEnd=function(){var e=this;return new Promise" in source and "if(e.disposed)" not in source[source.find("waitPlayEnd=function"):source.find("waitLoopStart=function")],
    "owners": Counter(row["owner"] for row in rows),
    "highRisk": sorted(rows, key=lambda row: (-row["score"], row["offset"]))[:80],
    "loopNearby": [row for row in rows if row["loopNearby"]],
}
summary["owners"] = dict(summary["owners"].most_common())
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"source": str(SOURCE), "waitPlayEndCalls": len(rows), "output": str(OUT), "top": summary["highRisk"][:12]}, ensure_ascii=False, indent=2))
