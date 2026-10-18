import sys
import re
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith("JS_17="):
            js17 = line[6:]
            break

print("Contains 'function':", "function" in js17)
print("Contains 'this':", "this" in js17)
print("Contains 'return':", "return" in js17)
print("Contains 'Math':", "Math" in js17)
print("Contains 'var ':", "var " in js17)
