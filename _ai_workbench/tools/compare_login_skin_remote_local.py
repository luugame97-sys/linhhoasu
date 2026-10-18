"""Decode and compare login/start skins from production and local GameEUI."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECODER = ROOT / "_ai_workbench/tools/decode_bin_manifest.py"
FILES = {
    "production": ROOT / "_ai_workbench/temp/client_core_audit_20260902/update/resource/assets/cfg/gameEui_18e11b8e.bin",
    "local": ROOT / "linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin",
}


def load_decoder():
    spec = importlib.util.spec_from_file_location("bin_decoder", DECODER)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def main() -> None:
    decoder = load_decoder()
    data = {name: decoder.decode(path.read_bytes())["value"] for name, path in FILES.items()}
    keys = sorted(set(data["production"]) | set(data["local"]))
    selected = [key for key in keys if any(token in key.lower() for token in (
        "login", "start", "loading", "regist", "account", "serverui", "userlogin"))]
    rows = []
    for key in selected:
        a = data["production"].get(key)
        b = data["local"].get(key)
        if a == b:
            continue
        rows.append({"skin": key, "production": a, "local": b})
    result = {
        "productionSkinCount": len(data["production"]),
        "localSkinCount": len(data["local"]),
        "selectedLoginSkins": selected,
        "differentLoginSkins": rows,
    }
    out = ROOT / "_ai_workbench/temp/login_skin_remote_local_diff_20260902.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"productionSkinCount": result["productionSkinCount"],
                      "localSkinCount": result["localSkinCount"],
                      "selectedCount": len(selected), "differentCount": len(rows),
                      "differentNames": [row["skin"] for row in rows]}, ensure_ascii=False, indent=2))
    print(f"OUT={out}")


if __name__ == "__main__":
    main()
