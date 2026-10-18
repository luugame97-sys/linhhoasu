import hashlib
import re
from pathlib import Path
import requests

base = 'http://103.116.105.154:81'
text = requests.get(base + '/?v=verify_20260830_1820', timeout=20).text
print('index_len=', len(text))
print('cache_tokens=', re.findall(r'(?:freeze_guard|fate_point_fix)[^\'\" ]*', text))
pairs = [
    ('/js/main.min_a6195824.js', 'linhhoasu/webgame/game/js/main.min_a6195824.js'),
    ('/js/start.min_52ac8d58.js', 'linhhoasu/webgame/game/js/start.min_52ac8d58.js'),
    ('/update/resource/assets/excel/config_e5ac72c2.bin', 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'),
    ('/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin', 'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'),
    ('/update/resource/assets/cfg/gameEui_18e11b8e.bin', 'linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin'),
]
for url, local in pairs:
    remote = requests.get(base + url + '?v=verify_20260830_1820', timeout=30).content
    local_bytes = Path(local).read_bytes()
    print(url, len(remote), hashlib.sha256(remote).hexdigest(), hashlib.sha256(local_bytes).hexdigest(), remote == local_bytes)
