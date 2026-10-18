import urllib.request

urls = [
    "http://103.116.104.165:81/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin",
    "http://103.116.104.165:81/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin"
]

for url in urls:
    try:
        req = urllib.request.Request(url, method="HEAD")
        response = urllib.request.urlopen(req)
        print(f"{url} -> Status: {response.status}, Length: {response.headers.get('Content-Length')}")
    except Exception as e:
        print(f"{url} -> {e}")
