from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "local_current": ROOT / "linhhoasu/webgame/game/index.html",
    "local_guard9": ROOT / "_ai_workbench/backups/stage_touch_recovery_before_20260831_160000/index.html",
    "local_original": ROOT / "linhhoasu/webgame/game/index.html_bak",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/cn-index.html",
}


def scripts(text: str) -> list[str]:
    return re.findall(r"<script[^>]*>(.*?)</script>", text, flags=re.I | re.S)


def main() -> None:
    rows: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        rows.append(f"### {name} bytes={path.stat().st_size} scripts={len(scripts(text))}")
        for idx, script in enumerate(scripts(text)):
            digest = hashlib.sha256(script.encode()).hexdigest()[:16]
            rows.append(f"SCRIPT {idx} len={len(script)} sha={digest}")
            for term in (
                "XMLHttpRequest", "fetch", "rewriteRuntimeUrl", "installLhs",
                "Touch", "alpha", "web-popup", "backendHost", "translationVersion",
                "loadSingleScript", "JS_URL_PREFIX", "RES_URL_PREFIX", "egret.runEgret",
            ):
                if term in script:
                    rows.append(f"  {term}={script.count(term)}")
            rows.append(script[:800].encode("ascii", "backslashreplace").decode("ascii"))
    out = ROOT / "_ai_workbench/temp/index_loader_compare_20260831.txt"
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
