import sys
import re
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
js_strings = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")|(\'([^\']*[\u4e00-\u9fa5]+[^\']*)\')|(`([^`]*[\u4e00-\u9fa5]+[^`]*)`)', js_content)

extracted = set()
for match in js_strings:
    if match[0]:
        if chinese_pattern.search(match[1]):
            extracted.add(match[1])

js_originals = {}
for i, s in enumerate(sorted(extracted)):
    if "上一场 JSON 约" in s:
        print(f"JS_{i} = {s}")
