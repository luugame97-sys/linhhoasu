import os
import re

def fix_all_quotes():
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    
    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    # MUST MATCH export_txt.py exactly to get the exact JS_i order!
    js_strings = re.findall(r'"([^"]*[\u4e00-\u9fa5]+[^"]*)"|\'([^\']*[\u4e00-\u9fa5]+[^\']*)\'|`([^`]*[\u4e00-\u9fa5]+[^`]*)`', content)
    extracted = set()
    for match in js_strings:
        for s in match:
            if s and chinese_pattern.search(s):
                extracted.add(s)
                
    js_originals = {}
    for i, s in enumerate(sorted(extracted)):
        js_originals[f"JS_{i}"] = s
                
    translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt"
    with open(translated_txt, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    out_lines = []
    fixed_count = 0
    for line in lines:
        clean = line.strip("\n")
        if clean.startswith("JS_") and "=" in clean:
            key, val = clean.split("=", 1)
            if key in js_originals:
                orig = js_originals[key]
                # Try to guess delimiter based on original string in file
                # If original has NO quotes, and is wrapped in " in file
                delim = '"' # We assume most problematic ones are "
                if '"'+orig+'"' in content: delim = '"'
                elif "'"+orig+"'" in content: delim = "'"
                
                # Check if val contains inner delim
                if delim in val:
                    val = val.replace(delim, "'" if delim == '"' else '"')
                    fixed_count += 1
            out_lines.append(f"{key}={val}\n")
        else:
            out_lines.append(line)
            
    with open(translated_txt, "w", encoding="utf-8") as f:
        f.writelines(out_lines)
        
    print(f"Fixed {fixed_count} JS translation quotes!")

if __name__ == "__main__":
    fix_all_quotes()
