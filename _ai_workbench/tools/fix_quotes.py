import os
import re

def fix_quotes():
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
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
                delim = delimiter_map[orig]
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
    fix_quotes()
