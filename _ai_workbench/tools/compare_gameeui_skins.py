from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DECODER = ROOT / "_ai_workbench/tools/decode_bin_manifest.py"
FILES = {
    "local": ROOT / "linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/assets/cfg/gameEui_29fcdea7.bin",
}
SKINS = (
    "PowerSavingModePanelSkin", "GuideMaskSkin", "GuideHandSkin", "CloudCompSkin",
    "LoadingLayerSkin", "MainPanelSkin", "MainPanelNewSkin", "CommonWindowBgSkin",
    "CommonMaskSkin", "ClickCloseTipLayerSkin", "ItemIconSkin",
)


def load_decoder():
    spec = importlib.util.spec_from_file_location("bin_decoder", DECODER)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def norm(value):
    if isinstance(value, dict):
        return {str(k): norm(v) for k, v in value.items()}
    if isinstance(value, list):
        return [norm(v) for v in value]
    return value


def main() -> None:
    decoder = load_decoder()
    all_data = {}
    out: list[str] = []
    for name, path in FILES.items():
        decoded = decoder.decode(path.read_bytes())["value"]
        all_data[name] = decoded
        out.append(f"### {name} {path} skins={len(decoded)}")
        for skin in SKINS:
            if skin not in decoded:
                out.append(f"MISSING {skin}")
                continue
            value = norm(decoded[skin])
            out.append(f"SKIN {skin}")
            out.append(json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:12000])

    out.append("### DIFF_SELECTED")
    local = all_data.get("local", {})
    cn = all_data.get("cn", {})
    for skin in SKINS:
        if skin not in local or skin not in cn:
            continue
        a = norm(local[skin]); b = norm(cn[skin])
        if a != b:
            out.append(f"CHANGED {skin}")
            out.append("LOCAL=" + json.dumps(a, ensure_ascii=False, separators=(",", ":"))[:16000])
            out.append("CN=" + json.dumps(b, ensure_ascii=False, separators=(",", ":"))[:16000])
    out.append(f"KEYS local={len(local)} cn={len(cn)} local_only={len(set(local)-set(cn))} cn_only={len(set(cn)-set(local))}")
    for key in sorted(set(local) ^ set(cn)):
        if any(token.lower() in key.lower() for token in ("mask", "loading", "guide", "cloud", "power", "main")):
            out.append(("LOCAL_ONLY " if key in local else "CN_ONLY ") + key)

    target = ROOT / "_ai_workbench/temp/gameeui_skin_compare_20260831.txt"
    target.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
