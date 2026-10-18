import os
import shutil

def pack_js():
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"
    js_bak = js_file + ".bak"
    
    if os.path.exists(js_bak):
        shutil.copy2(js_bak, js_file)
        
    import re
    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
        js_content = f.read()
        
    js_strings = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")|(\'([^\']*[\u4e00-\u9fa5]+[^\']*)\')|(`([^`]*[\u4e00-\u9fa5]+[^`]*)`)', js_content)
    
    # extracted maps the inner text to the delimiter used
    # Note: A string might be used with different delimiters, we'll store the last one
    extracted = {}
    for match in js_strings:
        if match[0]:
            if chinese_pattern.search(match[1]):
                extracted[match[1]] = '"'
        elif match[2]:
            if chinese_pattern.search(match[3]):
                extracted[match[3]] = "'"
        elif match[4]:
            if chinese_pattern.search(match[5]):
                extracted[match[5]] = "`"
                
    js_originals = {}
    for i, s in enumerate(sorted(extracted.keys())):
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
    for key, orig in js_originals.items():
        if key in js_translations and js_translations[key].strip():
            trans = js_translations[key]
            if orig != trans:
                delimiter = extracted[orig]
                
                # IMPORTANT: We replace the string INCLUDING the delimiters to ensure safety!
                orig_full = delimiter + orig + delimiter
                
                # Escape the delimiter inside the translated string
                if delimiter == '"':
                    safe_trans = trans.replace('"', '\\"')
                elif delimiter == "'":
                    safe_trans = trans.replace("'", "\\'")
                elif delimiter == "`":
                    safe_trans = trans.replace("`", "\\`")
                else:
                    safe_trans = trans
                    
                trans_full = delimiter + safe_trans + delimiter
                
                if orig_full in js_content:
                    js_content = js_content.replace(orig_full, trans_full)
                    count += 1
                else:
                    # fallback to replacing just the inner part if not found with delimiter
                    # but we should escape it first
                    js_content = js_content.replace(orig, safe_trans)
                    count += 1
                
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Replaced {count} unique JS strings with proper escaping in {js_file}")

if __name__ == "__main__":
    pack_js()
