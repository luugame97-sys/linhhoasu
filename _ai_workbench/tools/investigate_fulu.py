import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()

assets = [
    "sp_ui_hulu_01", "sp_ui_hulu_02", "sp_ui_hulu_03", "sp_ui_hulu_04", "sp_ui_hulu_05", "sp_ui_hulu_06",
    "sp_ui_tianjiangfulu_clfm", "sp_ui_tianjiangfulu_eltf", "sp_ui_tianjiangfulu_flsq",
    "sp_ui_tianjiangfulu_hmcs", "sp_ui_tianjiangfulu_sjpa", "sp_ui_tianjiangfulu_sykt",
    "sp_ui_tianjiangfulu_wflm", "sp_ui_tianjiangfulu_yffs", "sp_ui_tianjiangfulu_qh",
    "effect_gourdDrop_mp3", "effect_gourdShake_mp3", "effect_gourdColourChange_mp3",
    "icon_232", "icon_233"
]

print("=== CHECKING ASSETS ON VPS ===")
for asset in assets:
    # search in /linhhoasu/webgame/game/
    cmd = f"find /linhhoasu/webgame/game/ -name '*{asset}*' | head -n 3"
    res = run(ssh, cmd).strip()
    if res:
        print(f"FOUND: {asset} -> {res.splitlines()[0]}")
    else:
        print(f"MISSING: {asset} NOT FOUND in /linhhoasu/webgame/game/")

ssh.close()
