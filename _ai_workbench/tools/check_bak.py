import sys
sys.stdout.reconfigure(encoding="utf-8")
js_bak = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_bak, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()
    
print("Has 'Chạy':", "Chạy" in js_content)
print("Has 'Một':", "Một" in js_content)
print("Has '上一场':", "上一场" in js_content)
