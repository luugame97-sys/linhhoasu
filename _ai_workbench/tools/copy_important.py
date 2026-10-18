import os
import shutil

src = r"i:\Linhhoasu\server\server\UI_Translate_Remaining"
dst = r"i:\Linhhoasu\server\server\UI_Can_Dich_Nhanh"
if not os.path.exists(dst):
    os.makedirs(dst)
    
keywords = ["main_de86", "mainIcon", "main_btn", "activity", "huodong", "dujie", "btn_"]

for file in os.listdir(src):
    if file.endswith(".png"):
        lower = file.lower()
        if any(k in lower for k in keywords):
            shutil.copy2(os.path.join(src, file), os.path.join(dst, file))
            
print(f"Copied important UI files to {dst}")
