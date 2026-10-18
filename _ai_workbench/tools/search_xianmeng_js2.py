import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

matches = re.findall(r'[^"]*仙盟[^"]*', js_content)
for m in matches[:10]:
    if len(m) < 20:
        print(m)
