from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("decoder", ROOT / "_ai_workbench/tools/decode_bin_manifest.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
source = ROOT / "_ai_workbench/temp/client_core_audit_20260902/update/resource/assets/cfg/gameEui_18e11b8e.bin"
data = module.decode(source.read_bytes())["value"]
keys = [key for key in data if any(token in key.lower() for token in ("login", "start", "loading", "regist", "account", "serverui", "userlogin"))]
target = ROOT / "_ai_workbench/temp/login_skins_production_20260902.json"
target.write_text(json.dumps({key: data[key] for key in keys}, ensure_ascii=False, indent=2), encoding="utf-8")
print(target)
