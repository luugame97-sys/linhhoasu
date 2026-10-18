import sys

def fix_translation():
    file_path = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    content = content.replace('"Chạy dữ liệu chiến đấu"', "'Chạy dữ liệu chiến đấu'")
    content = content.replace('"khai chiến"', "'khai chiến'")
    content = content.replace('bấm "Chạy', "bấm 'Chạy")
    content = content.replace('nhấn "khai', "nhấn 'khai")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("Fixed translation file!")

fix_translation()
