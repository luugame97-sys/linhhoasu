import urllib.request

url = "http://103.116.104.165:81/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin"
try:
    req = urllib.request.Request(url, method="GET")
    response = urllib.request.urlopen(req)
    print("Status:", response.status)
    print("Content-Length:", response.headers.get('Content-Length'))
    print("Content-Type:", response.headers.get('Content-Type'))
except Exception as e:
    print(e)
