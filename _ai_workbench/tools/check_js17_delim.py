import os
import re

js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()
    
js_strings = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")|(\'([^\']*[\u4e00-\u9fa5]+[^\']*)\')|(`([^`]*[\u4e00-\u9fa5]+[^`]*)`)', js_content)

extracted = set()
delim_map = {}
for match in js_strings:
    if match[0] and chinese_pattern.search(match[1]): 
        extracted.add(match[1])
        delim_map[match[1]] = '"'
    elif match[2] and chinese_pattern.search(match[3]): 
        extracted.add(match[3])
        delim_map[match[3]] = "'"
    elif match[4] and chinese_pattern.search(match[5]): 
        extracted.add(match[5])
        delim_map[match[5]] = "`"
            
js_originals = {}
for i, s in enumerate(sorted(extracted)):
    js_originals[f"JS_{i}"] = s
    
s = js_originals["JS_17"]
print(f"JS_17 delim is {delim_map[s]}")
