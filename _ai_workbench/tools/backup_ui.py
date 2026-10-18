import os
import shutil

dir_translate = r"i:\Linhhoasu\server\server\UI_Translate"
dir_backup = r"i:\Linhhoasu\server\server\UI_Translate_Backup"

if os.path.exists(dir_translate):
    if os.path.exists(dir_backup):
        shutil.rmtree(dir_backup)
    os.rename(dir_translate, dir_backup)
    print("Renamed existing UI_Translate to UI_Translate_Backup")
else:
    print("UI_Translate not found.")
