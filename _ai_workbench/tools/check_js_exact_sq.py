import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()

words = ["主线", "洞府", "仙盟", "挑战", "活动", "渡劫"]
for w in words:
    matches = re.findall(f"'[^\']*{w}[^\']*'", js_content)
    print(f"--- {w} ---")
    for m in matches[:5]:
        if len(m) < 20:
            print(m)
