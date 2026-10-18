import zlib
import re
import os
import shutil

def write_varint(val):
    out = bytearray()
    while True:
        b = val & 0x7f
        val >>= 7
        if val:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return out

def pack_config():
    original_bin = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
    with open(original_bin, "rb") as f:
        raw_original = f.read()

    idx = raw_original.find(b"x\x9c")
    if idx == -1:
        print("Cannot find zlib header")
        return
        
    header = raw_original[:idx]
    zlib_data = raw_original[idx:]
    
    decompressed = zlib.decompress(zlib_data)
    
    pos = 2
    length_array = 0
    shift = 0
    while True:
        b = decompressed[pos]
        pos += 1
        length_array |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7

    strings = []
    for _ in range(length_array):
        length = 0
        shift = 0
        while True:
            b = decompressed[pos]
            pos += 1
            length |= (b & 0x7f) << shift
            if not (b & 0x80):
                break
            shift += 7
        s_bytes = decompressed[pos:pos+length]
        strings.append(s_bytes.decode("utf-8", errors="ignore"))
        pos += length
        
    remaining_bytes = decompressed[pos:]
    print(f"Parsed {len(strings)} strings. Remaining bytes: {len(remaining_bytes)}")
    
    translations = {}
    trans_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
    with open(trans_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip("\n")
        if line.startswith("CFG_") and "=" in line:
            key, val = line.split("=", 1)
            try:
                cfg_idx = int(key.replace("CFG_", ""))
                translations[cfg_idx] = val.replace("\\n", "\n").replace("\\r", "\r")
            except:
                pass
                
    count = 0
    for i in range(length_array):
        if i in translations and translations[i].strip():
            strings[i] = translations[i]
            count += 1
            
    print(f"Applied {count} strings to the pool.")
    
    new_data = bytearray()
    new_data.extend([0x00, 0x02])
    new_data.extend(write_varint(length_array))
    
    for s in strings:
        s_bytes = s.encode("utf-8")
        new_data.extend(write_varint(len(s_bytes)))
        new_data.extend(s_bytes)
        
    new_data.extend(remaining_bytes)
    
    new_zlib = zlib.compress(new_data)
    print(f"New decompressed size: {len(new_data)} (Old: {len(decompressed)})")
    print(f"New zlib size: {len(new_zlib)} (Old: {len(zlib_data)})")
    
    output_bin = original_bin
    if not os.path.exists(original_bin + ".bak"):
        with open(original_bin + ".bak", "wb") as f:
            f.write(raw_original)
            
    with open(output_bin, "wb") as f:
        f.write(header)
        f.write(new_zlib)
        
    print(f"Successfully packed {output_bin}")

if __name__ == "__main__":
    pack_config()
