with open("_ai_workbench/temp/language_cn.json", "rb") as f:
    data = f.read()

pos = 2
length_array = 0
shift = 0
while True:
    b = data[pos]
    pos += 1
    length_array |= (b & 0x7f) << shift
    if not (b & 0x80):
        break
    shift += 7

strings_1 = []
for _ in range(length_array):
    length = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    s_bytes = data[pos:pos+length]
    strings_1.append(s_bytes.decode("utf-8", errors="ignore"))
    pos += length

print(f"Read {len(strings_1)} strings from first array.")
print(f"Remaining bytes: {len(data) - pos}")
if pos < len(data):
    print(f"Next 16 bytes: {data[pos:pos+16].hex()}")
