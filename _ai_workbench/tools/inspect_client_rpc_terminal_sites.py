"""Extract bounded contexts for RPC/UI input locks targeted by phase 2."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
OUTPUT = ROOT / "_ai_workbench/temp/client_rpc_terminal_sites.json"
TEXT_OUTPUT = ROOT / "_ai_workbench/temp/client_rpc_terminal_sites.txt"
TARGET_TAGS = (1700, 1780, 3300, 3302, 3311, 3901)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    source = source_path.read_text(encoding="utf-8")
    tag_pattern = "|".join(str(tag) for tag in TARGET_TAGS)
    rows: list[dict[str, object]] = []
    for match in re.finditer(rf"Rpc\(({tag_pattern})(?=,)", source):
        start = max(0, match.start() - 4200)
        end = min(len(source), match.end() + 5200)
        context = source[start:end]
        class_names = re.findall(r't\([^,=]+=[^,=]+,"([^"]+)"\)', source[max(0, start - 12000):match.start()])
        rows.append(
            {
                "tag": int(match.group(1)),
                "offset": match.start(),
                "nearestClass": class_names[-1] if class_names else None,
                "hasGlobalMask": "globalMask" in context,
                "hasMaskGr": "maskGr" in context,
                "hasBlockFlag": "_blockFlag" in context,
                "hasSpineEvent": "e_hit" in context,
                "context": context,
            }
        )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps({"source": str(source_path), "rows": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    rendered: list[str] = []
    for row in rows:
        rendered.append(
            f"===== tag={row['tag']} offset={row['offset']} class={row['nearestClass']} "
            f"globalMask={row['hasGlobalMask']} maskGr={row['hasMaskGr']} "
            f"block={row['hasBlockFlag']} spine={row['hasSpineEvent']} ====="
        )
        pretty = str(row["context"]).replace(";", ";\n").replace("},", "},\n")
        rendered.append(pretty)
    TEXT_OUTPUT.write_text("\n".join(rendered), encoding="utf-8")
    print(
        json.dumps(
            {"source": str(source_path), "count": len(rows), "json": str(OUTPUT), "text": str(TEXT_OUTPUT)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
