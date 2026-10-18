import os
import sys
import re
import urllib.request
import urllib.parse
import json
import time
import concurrent.futures

sys.stdout.reconfigure(encoding='utf-8')

def translate_text(text):
    if not text.strip():
        return text
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q={urllib.parse.quote(text)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                res = json.loads(response.read().decode('utf-8'))
                return "".join([x[0] for x in res[0]])
        except Exception as e:
            time.sleep(1)
    return None

def process_batch(batch_tuple):
    indices, text_batch = batch_tuple
    combined = " | ".join(text_batch)
    res = translate_text(combined)
    if res:
        parts = res.split(" | ")
        if len(parts) == len(indices):
            return indices, parts
    
    # Fallback to single translations
    results = []
    for t in text_batch:
        r = translate_text(t)
        results.append(r if r else t)
    return indices, results

def main():
    input_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    output_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt"

    with open(input_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

    out_lines = []
    to_translate_indices = []
    to_translate_texts = []
    
    for i, line in enumerate(lines):
        line = line.strip("\n")
        out_lines.append(line)
        if not line or line.startswith("#") or line.startswith("[") or "=" not in line:
            continue
            
        key, val = line.split("=", 1)
        if chinese_pattern.search(val):
            to_translate_indices.append(i)
            to_translate_texts.append(val.replace("\\n", "\n").replace("\\r", "\r"))

    print(f"To translate: {len(to_translate_texts)}")
    
    batch_size = 10
    batches = []
    for i in range(0, len(to_translate_texts), batch_size):
        b_indices = to_translate_indices[i:i+batch_size]
        b_texts = to_translate_texts[i:i+batch_size]
        batches.append((b_indices, b_texts))
        
    print(f"Total batches: {len(batches)}")

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(process_batch, b): b for b in batches}
        for future in concurrent.futures.as_completed(futures):
            indices, translated = future.result()
            for idx, trans in zip(indices, translated):
                key, _ = out_lines[idx].split("=", 1)
                safe_val = trans.strip().replace("\n", "\\n").replace("\r", "\\r")
                out_lines[idx] = f"{key}={safe_val}"
            
            completed += 1
            if completed % 50 == 0:
                print(f"Progress: {completed}/{len(batches)} batches...", flush=True)

    with open(output_file, "w", encoding="utf-8") as f:
        for line in out_lines:
            f.write(line + "\n")

    print("Done!")

if __name__ == "__main__":
    main()
