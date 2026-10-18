from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VERSIONS = {
    "base_bak": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js.bak",
    "freeze_fix": ROOT / "_ai_workbench/backups/game_freeze_fix_20260829_004839/webgame_main.min_a6195824.js",
    "guard0": ROOT / "_ai_workbench/backups/client_input_freeze_before_20260831_013602/main.min_a6195824.js",
    "guard1": ROOT / "_ai_workbench/backups/artifact_item_sync_before_20260831_092100/main.min_a6195824.js",
    "guard2": ROOT / "_ai_workbench/backups/client_rpc_terminal_before_20260831_081840/main.min_a6195824.js",
    "guard3": ROOT / "_ai_workbench/backups/land_steal_popup_before_20260831_100500/main.min_a6195824.js",
    "guard4": ROOT / "_ai_workbench/backups/move_team_log_throttle_before_20260831_102000/main.min_a6195824.js",
    "guard5": ROOT / "_ai_workbench/backups/power_saving_touch_before_20260831_110000/main.min_a6195824.js",
    "guard6": ROOT / "_ai_workbench/backups/power_save_stage_capture_before_20260831_120000/main.min_a6195824.js",
    "guard7": ROOT / "_ai_workbench/backups/disable_web_power_save_before_20260831_130000/main.min_a6195824.js",
    "guard8": ROOT / "_ai_workbench/backups/disable_web_time_guide_before_20260831_140000/main.min_a6195824.js",
    "guard9": ROOT / "_ai_workbench/backups/stage_touch_recovery_before_20260831_160000/main.min_a6195824.js",
    "guard22": ROOT / "_ai_workbench/backups/touch_diag_guard23_pre_20260831_144556/main.min_a6195824.js",
    "current": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
}

MARKERS = (
    "TouchTrace", "TouchRecovery", "HitProbe", "TouchDiag", "TouchState",
    "_lhsActiveTracks", "disposedFastPath", "lhsLandDone", "lhsMineDone",
    "spine waitPlayEnd timeout fallback", "cloud hide timeout fallback",
    "completion callback fallback", "RepeatRpc", "GuideMask",
    "register.html?inviteCode=", "GetRandomAccount",
)


def one_line(text: str, anchor: str, radius: int = 180) -> str:
    pos = text.find(anchor)
    if pos < 0:
        return "MISSING"
    return text[max(0, pos - radius):pos + radius].replace("\n", " ").encode(
        "ascii", "backslashreplace"
    ).decode("ascii")


def main() -> None:
    out: list[str] = []
    for name, path in VERSIONS.items():
        if not path.is_file():
            out.append(f"{name}\tMISSING\t{path}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        out.append(f"{name}\tbytes={path.stat().st_size}\tchars={len(text)}\t{path}")
        for marker in MARKERS:
            out.append(f"  {marker}\t{text.count(marker)}")
        for anchor in (
            "(a=bht.prototype).createChildren=function(){",
            "TPt.waitPlayEnd=function",
            "l.checkFullScreenDialog=function",
            "l.showCloud=function",
        ):
            out.append(f"  SNIP {anchor}\t{one_line(text, anchor)}")
    target = ROOT / "_ai_workbench/temp/client_version_inventory_20260831.txt"
    target.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
