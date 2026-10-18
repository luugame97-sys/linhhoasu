import sys
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

if "Microsoft YaHei" in js_content:
    print("Microsoft YaHei is in local JS!")
if "gothich" in js_content:
    print("gothich is in local JS!")
