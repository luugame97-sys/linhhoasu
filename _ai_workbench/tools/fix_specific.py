with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

out = []
for line in lines:
    if line.startswith("JS_"):
        if "KB" in line and "Chạy" in line:
            line = line.replace('Có thể bấm "Chạy dữ liệu chiến đấu"', "Có thể bấm 'Chạy dữ liệu chiến đấu'")
            line = line.replace('trực tiếp nhấn "khai chiến"', "trực tiếp nhấn 'khai chiến'")
        # Also let's generally replace unescaped quotes!
        # But wait, it's safer to just replace this specific one because it's the one causing SyntaxError!
    out.append(line)
    
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt", "w", encoding="utf-8") as f:
    f.writelines(out)
