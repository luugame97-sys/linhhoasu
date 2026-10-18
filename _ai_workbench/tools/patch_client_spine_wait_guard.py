"""Make Track.waitPlayEnd settle on interrupt/dispose and pathological timeout."""
from __future__ import annotations

import hashlib
import os
import shutil
from datetime import datetime, timezone

ROOT = r'I:\Linhhoasu\server\server'
MAIN = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js')
INDEX = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'index.html')
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = os.path.join(ROOT, '_ai_workbench', 'backups', f'client_spine_wait_before_{stamp}')


def read(path):
    with open(path, 'rb') as stream:
        return stream.read()


def write(path, data):
    with open(path, 'wb') as stream:
        stream.write(data)


def sha(data):
    return hashlib.sha256(data).hexdigest()


main_raw = read(MAIN)
index_raw = read(INDEX)
text = main_raw.decode('utf-8')
old = 'TPt.waitPlayEnd=function(){var e=this;return new Promise(function(t){return e.once(1,t)})}'
new = (
    'TPt.waitPlayEnd=function(){var e=this;return new Promise(function(t){var i=!1,n=function(){'
    'i||(i=!0,clearTimeout(a),e.off(1,n),e.off(4,n),e.off(6,n),t())},'
    'a=setTimeout(function(){console.warn("[LHS] spine waitPlayEnd timeout fallback"),n()},15e3);'
    'e.on(1,n),e.on(4,n),e.on(6,n)})}'
)
if text.count(old) != 1:
    raise RuntimeError(f'waitPlayEnd anchor count={text.count(old)}')
text = text.replace(old, new, 1)
main_payload = text.encode('utf-8')
old_marker = b'20260830_freeze_guard3'
new_marker = b'20260830_freeze_guard4'
if index_raw.count(old_marker) < 1:
    raise RuntimeError('freeze_guard3 cache marker missing')
index_payload = index_raw.replace(old_marker, new_marker)
os.makedirs(BACKUP, exist_ok=True)
shutil.copy2(MAIN, os.path.join(BACKUP, 'main.min_a6195824.js'))
shutil.copy2(INDEX, os.path.join(BACKUP, 'index.html'))
write(MAIN, main_payload)
write(INDEX, index_payload)
print('MAIN_BEFORE', sha(main_raw))
print('MAIN_AFTER', sha(main_payload))
print('INDEX_BEFORE', sha(index_raw))
print('INDEX_AFTER', sha(index_payload))
print('BACKUP', BACKUP)
