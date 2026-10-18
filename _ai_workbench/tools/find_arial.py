import sys
import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

# Find all Arial
matches = re.finditer(r"Arial", js_content)
for m in matches:
    idx = m.start()
    print("Found Arial at", idx)
    print(js_content[max(0, idx - 50):min(len(js_content), idx + 50)])
