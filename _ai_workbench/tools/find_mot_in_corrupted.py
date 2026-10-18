import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find("上Một场")
if idx != -1:
    print("Found '上Một场' at:")
    start = max(0, idx - 80)
    end = min(len(js_content), idx + 10)
    print(repr(js_content[start:end]))
