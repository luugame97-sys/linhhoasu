import re

with open("i:/Linhhoasu/server/server/client_text_all.txt", "r", encoding="utf-8") as f:
    lines = [line.strip("\n") for line in f]

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

cn_count = sum(1 for line in lines if chinese_pattern.search(line))
print(f"Total lines: {len(lines)}, Lines with Chinese: {cn_count}")
