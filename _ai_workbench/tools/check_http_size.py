import urllib.request

url = "http://103.116.104.165:81/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin"
req = urllib.request.Request(url, method="HEAD")
try:
    response = urllib.request.urlopen(req)
    print("Content-Length:", response.headers.get('Content-Length'))
except Exception as e:
    print(e)
