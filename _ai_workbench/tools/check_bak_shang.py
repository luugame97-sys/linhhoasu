import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

print("Has '上一场 JSON 约':", "上一场 JSON 约" in js_content)
print("Has '上一场 JSON Hẹn':", "上一场 JSON Hẹn" in js_content)
