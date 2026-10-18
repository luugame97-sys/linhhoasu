with open(r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js", "rb") as f:
    raw = f.read()

try:
    text = raw.decode('gbk')
    if "提示" in text:
        print("Found '提示' in GBK encoding!")
except Exception as e:
    print(e)
