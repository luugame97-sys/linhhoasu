from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "base_local": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js.bak",
    "guard9": ROOT / "_ai_workbench/backups/stage_touch_recovery_before_20260831_160000/main.min_a6195824.js",
    "guard22": ROOT / "_ai_workbench/backups/touch_diag_guard23_pre_20260831_144556/main.min_a6195824.js",
    "current": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js",
}

TERMS = (
    "TouchTrace", "TouchRecovery", "TouchDiag", "TouchState", "HitProbe",
    "_lhs", "setTimeout", "dispatchEventWith", "TOUCH_BEGIN", "TOUCH_TAP",
    "alpha=0", "alpha=1", "touchEnabled=!1", "touchEnabled=!0",
    "touchChildren=!1", "touchChildren=!0", "waitPlayEnd", "cloud hide",
    "RPC timeout", "_resListenerErrorMap", "_lhsRpcTimerMap", "nativeSend",
    "GuideUtil.Start", "timeGuideCheck", "PowerSavingModePanel",
)


def main() -> None:
    lines: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        lines.append(f"### {name}\tbytes={path.stat().st_size}\tchars={len(text)}")
        for term in TERMS:
            lines.append(f"{term}\t{text.count(term)}")
        # All string literals added by the local guards are useful to review.
        strings = sorted(set(re.findall(r"[\"']([^\"']{3,120})[\"']", text)))
        selected = [s for s in strings if any(k.lower() in s.lower() for k in ("lhs", "touch", "timeout", "mask", "cloud", "rpc"))]
        lines.append("SELECTED_STRINGS")
        lines.extend("  " + s.encode("ascii", "backslashreplace").decode("ascii") for s in selected[:300])
    target = ROOT / "_ai_workbench/temp/client_runtime_marker_compare_20260831.txt"
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
