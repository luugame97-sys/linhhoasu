import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find("Chạy")
if idx != -1:
    print("Found 'Chạy' in BAK at context:")
    start = max(0, idx - 100)
    end = min(len(js_content), idx + 100)
    print(repr(js_content[start:end]))
else:
    print("Not found in BAK.")
