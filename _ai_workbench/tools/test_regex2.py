import sys
import re
sys.stdout.reconfigure(encoding="utf-8")
text = 'this.descTxt.text="上一场 JSON 约 "+Math.ceil(i.length/1024)+" KB，未填入输入框（避免卡顿）。可点「跑战斗数据」选本地文件 / 剪贴板粘贴，或直接点「开战」用缓存。"'
matches = re.findall(r'("([^"]*[\u4e00-\u9fa5]+[^"]*)")', text)
for m in matches:
    print("Match:", m[0])
