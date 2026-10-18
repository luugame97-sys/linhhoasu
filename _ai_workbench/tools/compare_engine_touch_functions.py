from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "local_egret": ROOT / "linhhoasu/webgame/game/js/egret.min_7d668222.js",
    "cn_egret": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/egret.min_24c1a01e.js",
    "local_egretex": ROOT / "linhhoasu/webgame/game/js/egretex.min_37b3ee13.js",
    "cn_egretex": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/egretex.min_37b3ee13.js",
}

ANCHORS = (
    "t.$hitTest=function",
    "c.dispatchTouchEvent=function",
    "e.findTarget=function",
    "t.$setTouchEnabled=function",
    "t.$setTouchChildren=function",
    "t.connect=function",
    "t.connectByUrl=function",
    "t._setSocket=function",
    "t.send=function",
    "t._bindEvent=function",
)


def extract(text: str, anchor: str) -> str:
    pos = text.find(anchor)
    if pos < 0:
        return ""
    # A minified method normally ends at the next ',<identifier>=' marker.
    match = re.search(r",[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*=", text[pos + len(anchor):])
    end = pos + len(anchor) + match.start() if match else min(len(text), pos + 5000)
    return text[pos:end]


def main() -> None:
    rows: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        rows.append(f"### {name} bytes={path.stat().st_size}")
        for anchor in ANCHORS:
            value = extract(text, anchor)
            digest = hashlib.sha256(value.encode()).hexdigest()[:16] if value else "MISSING"
            rows.append(f"{anchor}\tlen={len(value)}\tsha={digest}")
            if value:
                rows.append(value[:4000].encode("ascii", "backslashreplace").decode("ascii"))
    out = ROOT / "_ai_workbench/temp/engine_touch_function_compare_20260831.txt"
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
