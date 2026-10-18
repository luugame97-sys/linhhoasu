import re

file_path = r'i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js'
out_path = r'i:\Linhhoasu\server\server\client_text.txt'

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]+')

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

strings = re.findall(r'"([^"]*[\u4e00-\u9fa5]+[^"]*)"|\'([^\']*[\u4e00-\u9fa5]+[^\']*)\'|`([^`]*[\u4e00-\u9fa5]+[^`]*)`', content)

extracted = set()
for match in strings:
    for s in match:
        if s and chinese_pattern.search(s):
            extracted.add(s)

with open(out_path, 'w', encoding='utf-8') as out:
    for s in sorted(extracted):
        out.write(s + '\n')

print(f'Extracted {len(extracted)} strings.')
