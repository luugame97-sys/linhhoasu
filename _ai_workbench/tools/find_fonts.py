import sys
import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

# Find all fontFamily="something" or fontFamily:'something'
matches = re.findall(r'fontFamily\s*=\s*(["\'])(.*?)\1', js_content)
fonts = set([m[1] for m in matches])

matches2 = re.findall(r'fontFamily:\s*(["\'])(.*?)\1', js_content)
fonts.update([m[1] for m in matches2])

print("Found font families:", fonts)
