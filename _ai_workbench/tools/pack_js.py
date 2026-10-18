import os
import shutil

def pack_js():
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
    
    # Actually, we need to extract the original strings again to match them properly
    import re
    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    js_strings = re.findall(r'"([^"]*[\u4e00-\u9fa5]+[^"]*)"|\'([^\']*[\u4e00-\u9fa5]+[^\']*)\'|`([^`]*[\u4e00-\u9fa5]+[^`]*)`', content)
    extracted = set()
    for match in js_strings:
        for s in match:
            if s and chinese_pattern.search(s):
                extracted.add(s)
                
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
                js_translations[key] = val.replace("\\n", "\n").replace("\\r", "\r")
                
    if not os.path.exists(js_file + ".bak"):
        shutil.copy2(js_file, js_file + ".bak")
        
    js_content = content
    count = 0
    for key, orig in js_originals.items():
        if key in js_translations and js_translations[key].strip():
            trans = js_translations[key]
            if orig != trans:
                js_content = js_content.replace(orig, trans)
                count += 1
                
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Replaced {count} unique JS strings in {js_file}")

if __name__ == "__main__":
    pack_js()
