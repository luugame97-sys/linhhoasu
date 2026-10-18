import os
from pathlib import Path

wb = Path(r'i:/Linhhoasu/server/server/_ai_workbench')
matches = []

for root, dirs, files in os.walk(wb):
    for f in files:
        if f.endswith(('.md', '.json', '.txt', '.js', '.py')):
            fp = Path(root) / f
            try:
                txt = fp.read_text(encoding='utf-8', errors='ignore')
                if '898' in txt:
                    for line_no, line in enumerate(txt.splitlines(), 1):
                        if '898' in line:
                            matches.append((str(fp.relative_to(wb)), line_no, line.strip()[:150]))
            except Exception:
                pass

print(f"Total matches: {len(matches)}")
for m in matches[:30]:
    print(f"{m[0]}:{m[1]} -> {m[2]}")
