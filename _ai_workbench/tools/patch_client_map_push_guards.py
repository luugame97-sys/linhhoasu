"""Guard idle-map push handlers against packets arriving during map teardown."""
from __future__ import annotations

import hashlib
import os
import shutil
from datetime import datetime, timezone

ROOT = r'I:\Linhhoasu\server\server'
MAIN = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js')
INDEX = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'index.html')
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = os.path.join(ROOT, '_ai_workbench', 'backups', f'client_map_push_before_{stamp}')


def read(path):
    with open(path, 'rb') as stream: return stream.read()
def write(path, data):
    with open(path, 'wb') as stream: stream.write(data)
def sha(data): return hashlib.sha256(data).hexdigest()
def replace_once(text, old, new, label):
    if text.count(old) != 1: raise RuntimeError(f'{label}: anchor count={text.count(old)}')
    return text.replace(old, new, 1)


main_raw = read(MAIN); index_raw = read(INDEX); text = main_raw.decode('utf-8')
open_old = 'Lze=qKe.prototype).otherOpenBox=function(t){var e,i,n,a,s=this,o=t.id,r=Y.RaidMgr.mMapRaid.GetEntity(o);'
open_new = (
    'Lze=qKe.prototype).otherOpenBox=function(t){var e,i,n,a,s=this,o=t.id,l=Y.RaidMgr.mMapRaid;'
    'if(!l||!l.GetEntity)return;var r=l.GetEntity(o);'
)
text = replace_once(text, open_old, open_new, 'otherOpenBox map guard')

speed_old = (
    'Lze.otherOpenSpeedUp=function(t){var e=Y.RaidMgr.mMapRaid.GetEntity(t.id);'
    'null!=e&&(e.m_Model.SetSpeedup(t.speedUp),t.speedUp&&""==e.targetHandle&&Y.RaidMgr.mMapRaid.GetMoveTeamByHandle(t.id).StopMove(!0))}'
)
speed_new = (
    'Lze.otherOpenSpeedUp=function(t){var e=Y.RaidMgr.mMapRaid;if(e&&e.GetEntity){var i=e.GetEntity(t.id);'
    'null!=i&&(i.m_Model.SetSpeedup(t.speedUp),t.speedUp&&""==i.targetHandle&&e.GetMoveTeamByHandle(t.id).StopMove(!0))}}'
)
text = replace_once(text, speed_old, speed_new, 'otherOpenSpeedUp map guard')
main_payload = text.encode('utf-8')
old_marker = b'20260830_freeze_guard4'; new_marker = b'20260830_freeze_guard5'
if index_raw.count(old_marker) < 1: raise RuntimeError('freeze_guard4 marker missing')
index_payload = index_raw.replace(old_marker, new_marker)
os.makedirs(BACKUP, exist_ok=True)
shutil.copy2(MAIN, os.path.join(BACKUP, 'main.min_a6195824.js')); shutil.copy2(INDEX, os.path.join(BACKUP, 'index.html'))
write(MAIN, main_payload); write(INDEX, index_payload)
print('MAIN_BEFORE', sha(main_raw)); print('MAIN_AFTER', sha(main_payload)); print('INDEX_BEFORE', sha(index_raw)); print('INDEX_AFTER', sha(index_payload)); print('BACKUP', BACKUP)
