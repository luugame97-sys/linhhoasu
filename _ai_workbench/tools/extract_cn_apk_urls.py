from __future__ import annotations

import re
import zipfile
from pathlib import Path


APK = Path(r"C:\Users\vandu\Desktop\lhs-APK_1_1743135825.apk")
OUT = Path(__file__).resolve().parents[1] / "temp" / "cn_apk_urls_20260831.txt"
PATTERNS = (
    re.compile(rb"https?://[^\x00\"' <>]{4,300}"),
    re.compile(rb"(?:[A-Za-z0-9_-]+\.)+(?:com|cn|net|cc|fun)(?:/[^\x00\"' <>]{0,240})?"),
)


def main() -> None:
    found: set[str] = set()
    with zipfile.ZipFile(APK, "r") as archive:
        for member in archive.infolist():
            if not member.filename.endswith((".dex", ".xml", ".json", "config", "keyInfo")):
                continue
            data = archive.read(member)
            for pattern in PATTERNS:
                for match in pattern.findall(data):
                    value = match.decode("utf-8", "ignore").strip("\x00")
                    if len(value) >= 5:
                        found.add(f"{member.filename}\t{value}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(sorted(found)) + "\n", encoding="utf-8")
    print(f"wrote {len(found)} candidates to {OUT}")
    for line in sorted(found):
        low = line.lower()
        if any(key in low for key in ("lhs", "guangyou", "ccjh", "update", "resource", "game")):
            print(line)


if __name__ == "__main__":
    main()
