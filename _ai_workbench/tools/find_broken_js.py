import os

js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()
    
# Find all occurrences of real newlines in strings
lines = js_content.split('\n')
print(f"Number of lines in JS file: {len(lines)}")
for i, line in enumerate(lines[:10]):
    if "Ngày" in line:
        print(f"Found 'Ngày' on line {i}")
