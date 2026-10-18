"""Prepare a local candidate that swaps only login_bg/login_bg_tw mapping."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "linhhoasu/webgame/game/js/start.min_52ac8d58.js"
OUT_DIR = ROOT / "_ai_workbench/temp/login_tw_swap_candidate_20260902"
TARGET = OUT_DIR / "start.min_52ac8d58.js"
OLD = 'r=d.inChina?"login_bg":"login_bg_tw"'
NEW = 'r=d.inChina?"login_bg_tw":"login_bg"'


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    count = source.count(OLD)
    if count != 1:
        raise RuntimeError(f"Expected exactly one login mapping, found {count}")
    candidate = source.replace(OLD, NEW)
    if OLD in candidate or NEW not in candidate:
        raise RuntimeError("Swap marker validation failed")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(candidate, encoding="utf-8", newline="")
    print(f"SOURCE={SOURCE}")
    print(f"TARGET={TARGET}")
    print(f"REPLACEMENTS={count}")
    print(f"BYTES={TARGET.stat().st_size}")


if __name__ == "__main__":
    main()
