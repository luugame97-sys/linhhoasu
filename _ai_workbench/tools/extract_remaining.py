import os
import shutil
import json

def extract_remaining():
    assets_dir = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets"
    output_dir = r"i:\Linhhoasu\server\server\UI_Translate_Remaining"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    mapping = {}
    count = 0
    
    for root, dirs, files in os.walk(assets_dir):
        # Skip lang_cn because those were already extracted
        if "lang_cn" not in root.split(os.sep):
            for file in files:
                if file.endswith(".png"):
                    full_path = os.path.join(root, file)
                    out_path = os.path.join(output_dir, file)
                    
                    if file not in mapping:
                        mapping[file] = full_path
                        shutil.copy2(full_path, out_path)
                        count += 1
                        
    mapping_file = os.path.join(output_dir, "mapping_remaining.json")
    with open(mapping_file, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=4, ensure_ascii=False)
        
    print(f"Successfully extracted {count} remaining images to {output_dir}")

if __name__ == "__main__":
    extract_remaining()
