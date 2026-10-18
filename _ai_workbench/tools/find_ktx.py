import sys
import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find(".ktx")
if idx != -1:
    print(js_content[max(0, idx - 100):min(len(js_content), idx + 100)])
else:
    print("ktx not found in main.js")
