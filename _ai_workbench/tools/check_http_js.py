import urllib.request

url = "http://103.116.104.165:81/js/main.min_a6195824.js"
try:
    req = urllib.request.Request(url, method="HEAD")
    response = urllib.request.urlopen(req)
    print(f"JS Length: {response.headers.get('Content-Length')}")
except Exception as e:
    print(e)
