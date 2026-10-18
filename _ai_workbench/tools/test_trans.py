from deep_translator import GoogleTranslator

translator = GoogleTranslator(source='zh-CN', target='vi')
print(translator.translate("你好，世界"))
