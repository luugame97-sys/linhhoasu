import sys
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

pos = 2242672
start = max(0, pos - 500)
end = min(len(js_content), pos + 200)
print(js_content[start:end])
