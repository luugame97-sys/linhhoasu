import sys
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\start.min_52ac8d58.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

idx = js_content.find("checkCompressedTextureInternalFormat")
if idx != -1:
    print(js_content[max(0, idx - 150):min(len(js_content), idx + 200)])
