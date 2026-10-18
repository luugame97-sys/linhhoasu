import sys
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\egret.min_7d668222.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find("default_fontFamily")
if idx != -1:
    print("Found default_fontFamily in egret.min")
    print(js_content[max(0, idx - 50):min(len(js_content), idx + 50)])
else:
    print("Not found in egret.min")
