import zlib
import json

file_path = r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
with open(file_path, "rb") as f:
    raw = f.read()

try:
    decompressed = zlib.decompress(raw)
    print("Zlib decompression successful. Size:", len(decompressed))
    try:
        data = json.loads(decompressed.decode('utf-8'))
        print("JSON parse successful. Keys:", list(data.keys())[:10])
    except Exception as e:
        print("JSON parse failed:", e)
        with open('temp_unzipped.bin', 'wb') as f_out:
            f_out.write(decompressed)
except zlib.error:
    print("Not a zlib compressed file.")
