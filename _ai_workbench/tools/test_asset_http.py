import urllib.request

urls = [
    'http://103.116.105.154:81/index.html',
    'http://103.116.105.154:81/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin',
    'http://103.116.105.154:81/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin',
    'http://103.116.105.154:81/js/main.min_drop100.js?v=20260929_pet_release_v5'
]

for u in urls:
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
    res = urllib.request.urlopen(req, timeout=5)
    name = u.split('/')[-1]
    print(f'{res.status} OK: {name} ({len(res.read())} bytes)')
