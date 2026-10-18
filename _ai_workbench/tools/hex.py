with open("language_cn.json", "rb") as f:
    data = f.read(64)
    for i, b in enumerate(data):
        print(f"{i:02d}: {b:02x} {chr(b) if 32 <= b < 127 else '.'}")
