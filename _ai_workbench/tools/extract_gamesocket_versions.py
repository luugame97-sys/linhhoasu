from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "base": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js.bak",
    "pre_freeze": ROOT / "_ai_workbench/backups/game_freeze_fix_20260829_004839/webgame_main.min_a6195824.js",
    "pre_guard1": ROOT / "_ai_workbench/backups/client_input_freeze_before_20260831_013602/main.min_a6195824.js",
    "guard22": ROOT / "_ai_workbench/backups/touch_diag_guard23_pre_20260831_144556/main.min_a6195824.js",
    "current": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js",
}


def between(text: str, starts: tuple[str, ...], ends: tuple[str, ...]) -> str:
    start = -1
    marker = ""
    for item in starts:
        pos = text.find(item)
        if pos >= 0 and (start < 0 or pos < start):
            start, marker = pos, item
    if start < 0:
        return "MISSING"
    finish = len(text)
    for item in ends:
        pos = text.find(item, start + len(marker))
        if pos >= 0:
            finish = min(finish, pos)
    return text[start:finish]


def main() -> None:
    out: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        # Function names are minifier-dependent, so use stable field anchors.
        block = between(
            text,
            ("this._msgUid=0,this._resListenerMap=",),
            ("function zRt", "function RBt", "t(zRt", "t(RBt"),
        )
        if block == "MISSING":
            # Include a bounded neighborhood around the first _msgUid as a fallback.
            pos = text.find("_msgUid=0")
            block = text[max(0, pos - 500):pos + 16000] if pos >= 0 else "MISSING"
        safe = block.encode("ascii", "backslashreplace").decode("ascii")
        out.append(f"### {name} {path} bytes={path.stat().st_size} block_len={len(block)}")
        out.append(safe[:24000])
    target = ROOT / "_ai_workbench/temp/gamesocket_versions_20260831.txt"
    target.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
