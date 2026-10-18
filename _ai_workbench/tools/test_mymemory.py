from deep_translator import MyMemoryTranslator
try:
    res = MyMemoryTranslator(source='zh-CN', target='vi-VN').translate("你好世界")
    print(res)
except Exception as e:
    print(e)
