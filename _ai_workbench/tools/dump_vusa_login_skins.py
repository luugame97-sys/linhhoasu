from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("d", ROOT / "_ai_workbench/tools/decode_bin_manifest.py")
m = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(m)
src = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/raw/update/resource/assets/cfg/gameEui_18e11b8e.bin"
data = m.decode(src.read_bytes())["value"]
out = ROOT / "_ai_workbench/temp/vusa_login_skins_20260902.json"
out.write_text(json.dumps({k: data.get(k) for k in ("LoginAnimUISkin", "LoginAnimUINewSkin", "LoginUISkin", "LoginUINewSkin")}, ensure_ascii=False, indent=2), encoding="utf-8")
print(out)
