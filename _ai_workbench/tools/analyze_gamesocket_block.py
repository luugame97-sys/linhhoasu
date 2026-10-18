from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "base": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js.bak",
    "pre_freeze": ROOT / "_ai_workbench/backups/client_input_freeze_before_20260831_013602/main.min_a6195824.js",
    "current": ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js",
}


def get_block(text: str) -> str:
    pos = text.find("_msgUid=0")
    if pos < 0:
        return ""
    end = text.find(",t(", pos)
    # The first ,t( after the GameSocket methods is the class export. If a
    # minifier changes that boundary, cap the scan to a safe window.
    if end < 0 or end > pos + 50000:
        end = min(len(text), pos + 50000)
    return text[pos:end]


def main() -> None:
    output: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        block = get_block(text)
        output.append(f"### {name} bytes={path.stat().st_size} block={len(block)}")
        methods = list(re.finditer(r"(?:^|,)l\.([A-Za-z_$][\w$]*)=", block))
        for idx, match in enumerate(methods):
            finish = methods[idx + 1].start() if idx + 1 < len(methods) else len(block)
            body = block[match.start():finish]
            method = match.group(1)
            digest = hashlib.sha256(body.encode()).hexdigest()[:12]
            output.append(f"METHOD {method} len={len(body)} sha={digest}")
            if method in {
                "newSocket", "connectError", "connect", "close", "sendPack", "Rpc",
                "Pack", "Unpack", "send", "onSocketConnected", "onSocketRead",
                "AddHandler", "onSocketClose", "reLogin", "onStatusChanged",
            }:
                output.append(body.encode("ascii", "backslashreplace").decode("ascii")[:12000])
    target = ROOT / "_ai_workbench/temp/gamesocket_methods_20260831.txt"
    target.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
