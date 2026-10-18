import zlib
import json

file_path = r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
with open(file_path, "rb") as f:
    raw = f.read()

idx = raw.find(b'x\x9c')
if idx != -1:
    print(f"Found zlib header at offset {idx}")
    try:
        decompressed = zlib.decompress(raw[idx:])
        print("Decompressed size:", len(decompressed))
        with open("language_cn.json", "wb") as fout:
            fout.write(decompressed)
        # try json parse
        data = json.loads(decompressed.decode('utf-8'))
        print("Keys:", list(data.keys())[:10])
    except Exception as e:
        print("Failed:", e)
