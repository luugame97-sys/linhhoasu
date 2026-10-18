import os
import sys
import re
import urllib.request
import urllib.parse
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

def translate_text(text):
    if not text.strip():
        return text
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q={urllib.parse.quote(text)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                res = json.loads(response.read().decode('utf-8'))
                return "".join([x[0] for x in res[0]])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("429 rate limit, sleeping 5s...", flush=True)
                time.sleep(5)
            else:
                time.sleep(2)
        except Exception as e:
            time.sleep(2)
    return text # fallback to original if completely fails

def main():
    input_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    output_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt"

    with open(input_file, "r", encoding="utf-8") as f:
        lines = f.readlines()

    already_translated = {}
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            for line in f:
                if "=" in line:
                    key, val = line.strip("\n").split("=", 1)
                    already_translated[key] = val

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
        if key in already_translated:
            out_lines[i] = f"{key}={already_translated[key]}"
        elif chinese_pattern.search(val):
            to_translate_indices.append(i)
            to_translate_texts.append(val.replace("\\n", "\n").replace("\\r", "\r"))

    print(f"To translate: {len(to_translate_texts)}", flush=True)
    if len(to_translate_texts) == 0:
        with open(output_file, "w", encoding="utf-8") as f:
            for line in out_lines:
                f.write(line + "\n")
        return
    
    batch_size = 20
    batches = []
    for i in range(0, len(to_translate_texts), batch_size):
        b_indices = to_translate_indices[i:i+batch_size]
        b_texts = to_translate_texts[i:i+batch_size]
        batches.append((b_indices, b_texts))
        
    print(f"Total batches: {len(batches)}", flush=True)

    for i, (indices, b_texts) in enumerate(batches):
        combined = " | ".join(b_texts)
        res = translate_text(combined)
        
        success = False
        if res:
            parts = res.split(" | ")
            if len(parts) == len(indices):
                for idx, trans in zip(indices, parts):
                    key, _ = out_lines[idx].split("=", 1)
                    safe_val = trans.strip().replace("\n", "\\n").replace("\r", "\\r")
                    out_lines[idx] = f"{key}={safe_val}"
                success = True
                
        if not success:
            for idx, text in zip(indices, b_texts):
                r = translate_text(text)
                key, _ = out_lines[idx].split("=", 1)
                safe_val = r.strip().replace("\n", "\\n").replace("\r", "\\r")
                out_lines[idx] = f"{key}={safe_val}"
                
        if (i + 1) % 10 == 0:
            print(f"Done {i+1}/{len(batches)}", flush=True)
            with open(output_file, "w", encoding="utf-8") as f:
                for line in out_lines:
                    f.write(line + "\n")
                    
        time.sleep(0.5)

    # Final save
    with open(output_file, "w", encoding="utf-8") as f:
        for line in out_lines:
            f.write(line + "\n")

    print("Done!", flush=True)

if __name__ == "__main__":
    main()
