from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VERSIONS = {
    "base": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js.bak",
    "pre_freeze": ROOT / "_ai_workbench/backups/game_freeze_fix_20260829_004839/webgame_main.min_a6195824.js",
    "pre_guard1": ROOT / "_ai_workbench/backups/client_input_freeze_before_20260831_013602/main.min_a6195824.js",
    "pre_guard2": ROOT / "_ai_workbench/backups/client_rpc_terminal_before_20260831_081840/main.min_a6195824.js",
    "pre_guard3": ROOT / "_ai_workbench/backups/land_steal_popup_before_20260831_100500/main.min_a6195824.js",
    "pre_guard4": ROOT / "_ai_workbench/backups/move_team_log_throttle_before_20260831_102000/main.min_a6195824.js",
    "pre_guard5": ROOT / "_ai_workbench/backups/power_saving_touch_before_20260831_110000/main.min_a6195824.js",
    "pre_guard6": ROOT / "_ai_workbench/backups/power_save_stage_capture_before_20260831_120000/main.min_a6195824.js",
    "pre_guard7": ROOT / "_ai_workbench/backups/disable_web_power_save_before_20260831_130000/main.min_a6195824.js",
    "pre_guard8": ROOT / "_ai_workbench/backups/disable_web_time_guide_before_20260831_140000/main.min_a6195824.js",
    "pre_guard10": ROOT / "_ai_workbench/backups/stage_touch_recovery_before_20260831_160000/main.min_a6195824.js",
    "pre_guard23": ROOT / "_ai_workbench/backups/touch_diag_guard23_pre_20260831_144556/main.min_a6195824.js",
    "current": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js",
}


def extract(text: str, left: str, right: str) -> str:
    start = text.find(left)
    if start < 0:
        return ""
    end = text.find(right, start)
    return text[start : end if end >= 0 else len(text)]


def main() -> None:
    rows = []
    for name, path in VERSIONS.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        touch = extract(text, "(a=bht.prototype).createChildren=function(){", "bht.idleTouchTime=0,")
        wait = extract(text, "TPt.waitPlayEnd=function", "},TPt.waitLoopStart=function")
        cloud = extract(text, "l.showCloud=function", "l.setCallbackAndObj=function")
        view = extract(text, "l.checkFullScreenDialog=function", "l.closeEasy=function")
        def digest(value: str) -> str:
            return hashlib.sha256(value.encode()).hexdigest()[:16] if value else "MISSING"
        flags = {
            "capture": "this,!0" in touch,
            "trace": "TouchTrace" in touch,
            "recovery": "TouchRecovery" in touch,
            "manual_tap": "dispatchEventWith(egret.TouchEvent.TOUCH_TAP" in touch,
            "alpha_recovery": "I.UI_Main.alpha=1" in touch,
            "wait_timeout": "setTimeout" in wait,
            "wait_disposed": "e.disposed" in wait,
            "cloud_timeout": "cloud hide timeout fallback" in cloud,
            "active_tracks": "_lhsActiveTracks" in text,
        }
        rows.append(f"{name}\tbytes={path.stat().st_size}\ttouch_len={len(touch)}\ttouch_sha={digest(touch)}\twait_sha={digest(wait)}\tcloud_sha={digest(cloud)}\tview_sha={digest(view)}\t" + ",".join(f"{k}={int(v)}" for k,v in flags.items()))
    out = ROOT / "_ai_workbench/temp/client_touch_version_summary_20260831.txt"
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
