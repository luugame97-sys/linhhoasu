import sys
import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

# find where LanguageConfig is populated
matches = re.finditer(r"LanguageConfig", js_content)
for m in matches:
    idx = m.start()
    print("MATCH at", idx)
    print(js_content[max(0, idx - 100):min(len(js_content), idx + 100)])
    print("-" * 50)
