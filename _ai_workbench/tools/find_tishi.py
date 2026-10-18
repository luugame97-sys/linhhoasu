with open(r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js", "r", encoding="utf-8") as f:
    text = f.read()
if "提示" in text:
    print("Found literal '提示'")
if r"\u63d0\u793a" in text.lower():
    print("Found escaped '\\u63d0\\u793a'")
