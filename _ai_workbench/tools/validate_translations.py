import re

def validate_translations():
    original_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt"
    translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    
    # Read originals
    originals = {}
    with open(original_txt, "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line:
                key, val = line.strip("\n").split("=", 1)
                originals[key] = val
                
    # Read translations
    translations = {}
    with open(translated_txt, "r", encoding="utf-8") as f:
        for line in f:
            if "=" in line:
                key, val = line.strip("\n").split("=", 1)
                translations[key] = val
                
    # Also read JS file to see how JS strings are enclosed
    js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
    with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
        js_content = f.read()
        
    errors = []
    warnings = []
    
    # We will find where each original JS string is in the JS file and check its delimiters.
    # Note: A string might appear multiple times with different delimiters, but usually it's consistent.
    
    for key, trans in translations.items():
        if not trans.strip() or key not in originals:
            continue
            
        orig = originals[key]
        
        # 1. HTML tag checks (common in Egret config)
        orig_tags = re.findall(r'<[^>]+>', orig)
        if orig_tags:
            trans_tags = re.findall(r'<[^>]+>', trans)
            if len(orig_tags) != len(trans_tags):
                warnings.append(f"{key}: Tag count mismatch. Orig tags: {orig_tags}, Trans tags: {trans_tags}")
                
        # Check for malformed tags in translation like <font color=#123456
        if '<' in trans and '>' not in trans[trans.find('<'):]:
            errors.append(f"{key}: Malformed HTML tag (missing closing '>'): {trans}")
            
        # 2. JS specific checks
        if key.startswith("JS_"):
            # Check for real newlines (just in case they slipped in)
            if "\n" in trans or "\r" in trans:
                errors.append(f"{key}: Contains REAL newline characters. Must use \\n instead.")
                
            # Check for unescaped quotes
            orig_un = orig.replace("\\n", "\n").replace("\\r", "\r")
            
            # Find the string in JS content to see its delimiter
            idx = js_content.find(orig_un)
            if idx > 0:
                delimiter = js_content[idx-1]
                if delimiter in ['"', "'", "`"]:
                    # Check if the translated string contains this delimiter UNESCAPED
                    # regex to find unescaped delimiter
                    pattern = r'(?<!\\)' + delimiter
                    if re.search(pattern, trans):
                        errors.append(f"{key}: Contains unescaped delimiter {delimiter} which will break JS syntax! Trans: {trans}")
                else:
                    warnings.append(f"{key}: Could not determine delimiter, character before was {delimiter}")
                    
    print(f"Validation complete. Checked {len(translations)} entries.")
    print(f"Errors found: {len(errors)}")
    for e in errors[:20]:
        print("ERROR:", e)
        
    print(f"\nWarnings found: {len(warnings)}")
    for w in warnings[:20]:
        print("WARN:", w)

if __name__ == "__main__":
    validate_translations()
