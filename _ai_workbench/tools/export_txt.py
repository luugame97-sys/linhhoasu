import re

# Read strings from language_cn.json
with open("language_cn.json", "rb") as f:
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
    except:
        s = "<INVALID_UTF8>"
    strings.append(s)
    pos += length

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

with open("i:/Linhhoasu/server/server/LinhHoaSu_Translate.txt", "w", encoding="utf-8") as out:
    out.write("# HƯỚNG DẪN DỊCH:\n")
    out.write("# Chỉ dịch phần chữ ở BÊN PHẢI dấu '='.\n")
    out.write("# KHÔNG sửa mã số ở bên trái dấu '='.\n")
    out.write("# Nếu có ký tự '\\n' (xuống dòng), hãy giữ nguyên '\\n' ở bản dịch.\n")
    out.write("# Ví dụ: CFG_1=元宝 -> CFG_1=Kim Nguyên Bảo\n")
    out.write("=========================================\n\n")
    
    out.write("[CONFIG_STRINGS]\n")
    for i, s in enumerate(strings):
        if chinese_pattern.search(s):
            # Escape newlines to make sure each entry stays on one line
            safe_s = s.replace("\n", "\\n").replace("\r", "\\r")
            out.write(f"CFG_{i}={safe_s}\n")
    
    out.write("\n[JS_STRINGS]\n")
    with open(r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js", 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    js_strings = re.findall(r'"([^"]*[\u4e00-\u9fa5]+[^"]*)"|\'([^\']*[\u4e00-\u9fa5]+[^\']*)\'|`([^`]*[\u4e00-\u9fa5]+[^`]*)`', content)
    extracted = set()
    for match in js_strings:
        for s in match:
            if s and chinese_pattern.search(s):
                extracted.add(s)
                
    for i, s in enumerate(sorted(extracted)):
        safe_s = s.replace("\n", "\\n").replace("\r", "\\r")
        out.write(f"JS_{i}={safe_s}\n")

print(f"Exported to LinhHoaSu_Translate.txt")
