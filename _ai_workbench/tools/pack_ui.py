import os
import shutil
import json
import paramiko

def pack_ui():
    mapping_file = r"i:\Linhhoasu\server\server\UI_Translate\mapping.json"
    translated_dir = r"i:\Linhhoasu\server\server\__bak\img"
    
    with open(mapping_file, "r", encoding="utf-8") as f:
        mapping = json.load(f)
        
    copied = []
    
    for root, dirs, files in os.walk(translated_dir):
        for file in files:
            if file.endswith(".png"):
                if file in mapping:
                    target_path = mapping[file]
                    source_path = os.path.join(root, file)
                    shutil.copy2(source_path, target_path)
                    
                    # Convert to forward slash
                    fwd = target_path.replace("\\", "/")
                    # Extract after assets
                    parts = fwd.split("/update/resource/assets/")
                    if len(parts) > 1:
                        rel_path = parts[1]
                        remote_path = f"/linhhoasu/webgame/game/update/resource/assets/{rel_path}"
                        copied.append((source_path, remote_path))
                
    print(f"Copied {len(copied)} images to local game folders.")
    
    with open(r"i:\Linhhoasu\server\server\_ai_workbench\tools\upload_list.json", "w") as f:
        json.dump(copied, f)

if __name__ == "__main__":
    pack_ui()
