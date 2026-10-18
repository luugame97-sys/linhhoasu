bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin.bak"
import zlib
with open(bin_file, "rb") as f:
    raw = f.read()
idx = raw.find(b"x\x9c")
decompressed = zlib.decompress(raw[idx:])

pos = 2
length_array = 0
shift = 0
while True:
    b = decompressed[pos]
    pos += 1
    length_array |= (b & 0x7f) << shift
    if not (b & 0x80): break
    shift += 7

strings = []
for _ in range(length_array):
    length = 0
    shift = 0
    while True:
        b = decompressed[pos]
        pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80): break
        shift += 7
    s_bytes = decompressed[pos:pos+length]
    strings.append(s_bytes.decode("utf-8", errors="ignore"))
    pos += length
    
words = ["主线", "洞府", "仙盟", "挑战", "活动", "渡劫", "超值豪礼"]
for i, s in enumerate(strings):
    if s in words:
        print(f"Exact match found: CFG_{i}={s}")
