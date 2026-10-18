import urllib.request
import hashlib

sha = lambda b: hashlib.sha256(b).hexdigest()

html = urllib.request.urlopen('http://103.116.105.154:81/index.html').read().decode('utf-8')
print('index.html size:', len(html))
for line in html.splitlines():
    if 'main.min_drop100' in line or 'cn_main' in line:
        print(' ', line.strip())

js = urllib.request.urlopen('http://103.116.105.154:81/js/main.min_drop100.js?v=20260929_pet_release_v5').read().decode('utf-8')
print('main.min_drop100.js size:', len(js))
print('has getOutHead fallback:', 'pDt.getOutHead=function(t){var e="head_"+t;' in js)
print('has tab 10 fallback:', 'common_bm_quality_10_264c3006.png' in js)
