import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from deep_translator import GoogleTranslator
import time
import re

def translate_file():
    input_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    output_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt"

    # Read original
    with open(input_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Read already translated
    already_translated = {}
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            for line in f:
                if "=" in line:
                    key, val = line.strip("\n").split("=", 1)
                    already_translated[key] = val

    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    translator = GoogleTranslator(source='zh-CN', target='vi')

    out_lines = []
    to_translate_indices = []
    to_translate_texts = []
    
    for i, line in enumerate(lines):
        line = line.strip("\n")
        out_lines.append(line)
        if not line or line.startswith("#") or line.startswith("[") or "=" not in line:
            continue
            
        key, val = line.split("=", 1)
        if key in already_translated:
            # We already have it, use it
            out_lines[i] = f"{key}={already_translated[key]}"
        elif chinese_pattern.search(val):
            to_translate_indices.append(i)
            to_translate_texts.append(val.replace("\\n", "\n").replace("\\r", "\r"))

    print(f"Total strings remaining to translate: {len(to_translate_texts)}", flush=True)
    if len(to_translate_texts) == 0:
        # Just write what we have
        with open(output_file, "w", encoding="utf-8") as f:
            for line in out_lines:
                f.write(line + "\n")
        print("Done.", flush=True)
        return
        
    batches = []
    current_batch_indices = []
    current_batch_text = ""
    
    for idx, text in zip(to_translate_indices, to_translate_texts):
        separator = " \n| "
        if len(current_batch_text) + len(text) + len(separator) > 4000:
            batches.append((current_batch_indices, current_batch_text))
            current_batch_indices = [idx]
            current_batch_text = text
        else:
            current_batch_indices.append(idx)
            if current_batch_text:
                current_batch_text += separator + text
            else:
                current_batch_text = text
                
    if current_batch_text:
        batches.append((current_batch_indices, current_batch_text))

    print(f"Total batches: {len(batches)}", flush=True)

    for i, (indices, batch_text) in enumerate(batches):
        success = False
        for attempt in range(3):
            try:
                res = translator.translate(batch_text)
                if res:
                    res_split = res.split("\n| ")
                    if len(res_split) == len(indices):
                        for idx, trans in zip(indices, res_split):
                            key, _ = out_lines[idx].split("=", 1)
                            safe_val = trans.strip().replace("\n", "\\n").replace("\r", "\\r")
                            out_lines[idx] = f"{key}={safe_val}"
                        success = True
                        break
                    else:
                        success = False
                        break
            except Exception as e:
                time.sleep(2)
                
        if not success:
            for idx in indices:
                key, val = out_lines[idx].split("=", 1)
                try:
                    r = translator.translate(val.replace("\\n", "\n"))
                    if r:
                        out_lines[idx] = f"{key}={r.replace(chr(10), '\\n')}"
                except:
                    pass
                    
        print(f"Done batch {i+1}/{len(batches)}", flush=True)
        # Progressively save
        with open(output_file, "w", encoding="utf-8") as f:
            for line in out_lines:
                f.write(line + "\n")
        time.sleep(1)

    print("Translation completed.", flush=True)

if __name__ == "__main__":
    translate_file()
