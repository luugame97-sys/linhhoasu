import sys
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\egret.min_7d668222.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find("default_fontFamily")
if idx != -1:
    start = max(0, idx - 100)
    end = min(len(js_content), idx + 100)
    print(js_content[start:end])
