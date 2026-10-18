import sys
from pathlib import Path
import json
import re

root = Path("i:/Linhhoasu/server/server")

print("=== 1. SEARCHING FOR GemLevelConfig OR Gem in all json / js ===")
for p in root.rglob("*GemLevel*.json"):
    print("Found:", p)

print("=== 2. SEARCHING FOR SwordLevel in all json / js ===")
for p in root.rglob("*SwordLevel*.json"):
    print("Found:", p)

print("=== 3. SEARCHING FOR GEM LEVEL > 10 IN SCRIPTS ===")
for p in (root / "linhhoasu").rglob("*.js"):
    if "node_modules" in p.parts:
        continue
    try:
        content = p.read_text(encoding='utf-8', errors='ignore')
        if "GemLevelConfig" in content or "SwordLevelConfig" in content:
            print("Found config ref in JS:", p)
    except Exception:
        pass
