with open("language_cn.json", "rb") as f:
    data = f.read()

# read the array length
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
print(f"Total entries: {length_array}")

strings = []
while pos < len(data):
    length = 0
    shift = 0
    while True:
        if pos >= len(data):
            break
        b = data[pos]
        pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    if pos >= len(data) and length == 0:
        break
    
    s_bytes = data[pos:pos+length]
    try:
        s = s_bytes.decode("utf-8")
        strings.append(s)
    except:
        strings.append("<INVALID_UTF8>")
    pos += length

with open("i:/Linhhoasu/server/server/client_text_all.txt", "w", encoding="utf-8") as out:
    for i, s in enumerate(strings):
        out.write(s + "\n")

print(f"Extracted {len(strings)} strings successfully.")
