import os
import re

root_dir = r'i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource'
pattern = re.compile(r'提示'.encode('utf-8'))
found_files = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    for filename in filenames:
        if filename.endswith('.json') or filename.endswith('.txt') or filename.endswith('.zip') or filename.endswith('.bin'):
            file_path = os.path.join(dirpath, filename)
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                    if pattern.search(content):
                        found_files.append(file_path)
            except Exception as e:
                pass

for f in found_files[:20]:
    print(f)
print(f'Total files found: {len(found_files)}')
