import sys
import re
sys.stdout.reconfigure(encoding="utf-8")
text = '"上一场 JSON 约 "'
matches = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")', text)
print("Matches:", matches)
