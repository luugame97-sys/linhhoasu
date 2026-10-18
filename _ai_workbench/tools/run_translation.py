import os
import sys

# Force UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

from deep_translator import GoogleTranslator
import time
import re

def translate_file():
    input_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    output_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt"

    with open(input_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    translator = GoogleTranslator(source='zh-CN', target='vi')

    out_lines = []
    
    for i, line in enumerate(lines):
        line = line.strip("\n")
        out_lines.append(line)
        if not line or line.startswith("#") or line.startswith("[") or "=" not in line:
            continue
            
        key, val = line.split("=", 1)
        if chinese_pattern.search(val):
            # Needs translation
            val_un_escaped = val.replace("\\n", "\n").replace("\\r", "\r")
            
            # Simple retry mechanism
            for _ in range(3):
                try:
                    res = translator.translate(val_un_escaped)
                    if res:
                        safe_val = res.replace("\n", "\\n").replace("\r", "\\r")
                        out_lines[i] = f"{key}={safe_val}"
                    break
                except Exception as e:
                    time.sleep(1)
                    
            if i % 100 == 0:
                print(f"Translated {i}/{len(lines)} lines...")

    with open(output_file, "w", encoding="utf-8") as f:
        for line in out_lines:
            f.write(line + "\n")

    print("Translation completed.")

if __name__ == "__main__":
    translate_file()
