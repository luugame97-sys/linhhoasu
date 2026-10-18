import os
import shutil
import re

def pack_js():
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
    js_bak = js_file + ".bak"
    
    if os.path.exists(js_bak):
        shutil.copy2(js_bak, js_file)
        
    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
        js_content = f.read()
        
    js_strings = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")|(\'([^\']*[\u4e00-\u9fa5]+[^\']*)\')|(`([^`]*[\u4e00-\u9fa5]+[^`]*)`)', js_content)
    
    extracted = set()
    delimiter_map = {}
    for match in js_strings:
        if match[0]:
            if chinese_pattern.search(match[1]):
                extracted.add(match[1])
                delimiter_map[match[1]] = '"'
        elif match[2]:
            if chinese_pattern.search(match[3]):
                extracted.add(match[3])
                delimiter_map[match[3]] = "'"
        elif match[4]:
            if chinese_pattern.search(match[5]):
                extracted.add(match[5])
                delimiter_map[match[5]] = "`"
                
    js_originals = {}
    for i, s in enumerate(sorted(extracted)):
        js_originals[f"JS_{i}"] = s
                
    translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    js_translations = {}
    with open(translated_txt, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip("\n")
            if line.startswith("JS_") and "=" in line:
                key, val = line.split("=", 1)
                js_translations[key] = val
                
    count = 0
    sorted_items = sorted(js_originals.items(), key=lambda x: len(x[1]), reverse=True)
    
    for key, orig in sorted_items:
        if key in js_translations and js_translations[key].strip():
            trans = js_translations[key]
            if orig != trans:
                delimiter = delimiter_map[orig]
                orig_full = delimiter + orig + delimiter
                trans_full = delimiter + trans + delimiter
                
                if orig_full in js_content:
                    js_content = js_content.replace(orig_full, trans_full)
                    count += 1
                else:
                    print(f"Warning: Exact string not found: {key}")
                
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Replaced {count} unique JS strings with strict full-string matching and NO ESCAPING in {js_file}")

if __name__ == "__main__":
    pack_js()
