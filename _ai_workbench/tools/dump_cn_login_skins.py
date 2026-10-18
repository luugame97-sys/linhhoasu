from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECODER = ROOT / "_ai_workbench/tools/decode_bin_manifest.py"
SOURCE = ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/assets/cfg/gameEui_18e11b8e.bin"
spec = importlib.util.spec_from_file_location("decoder", DECODER)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
data = module.decode(SOURCE.read_bytes())["value"]
out = ROOT / "_ai_workbench/temp/cn_origin_login_skins_20260902.json"
out.write_text(json.dumps({key: data.get(key) for key in ("LoginAnimUISkin", "LoginAnimUINewSkin", "LoginUISkin", "LoginUINewSkin")}, ensure_ascii=False, indent=2), encoding="utf-8")
print(out)
