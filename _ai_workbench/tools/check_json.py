import json

file_path = r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
with open(file_path, "rb") as f:
    raw = f.read()

try:
    data = json.loads(raw.decode('utf-8'))
    print("JSON parse successful. Keys:", list(data.keys())[:10])
except Exception as e:
    print("JSON parse failed:", e)
