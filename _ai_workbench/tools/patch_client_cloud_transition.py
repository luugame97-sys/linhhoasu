"""Add one-shot timeout guards to the client cloud transition promises."""
from __future__ import annotations

import hashlib
import os
import shutil
from datetime import datetime, timezone


ROOT = r'I:\Linhhoasu\server\server'
MAIN = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js')
INDEX = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'index.html')
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = os.path.join(ROOT, '_ai_workbench', 'backups', f'client_cloud_before_{stamp}')


def read(path):
    with open(path, 'rb') as stream:
        return stream.read()


def write(path, data):
    with open(path, 'wb') as stream:
        stream.write(data)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


main_raw = read(MAIN)
index_raw = read(INDEX)
text = main_raw.decode('utf-8')

show_old = (
    'Cwt.prototype.setData=function(){var t=Ad.createAsyncSpine("sp_ui_yunwuzhuanchang");'
    'return this.contentGt.addChild(t),t.horizontalCenter=0,t.verticalCenter=0,'
    '(this.spine=t).setAnimation(0,"a_1",!1).waitPlayEnd().then(function(){t.setAnimation(0,"a_2",!0)})}'
)
show_new = (
    'Cwt.prototype.setData=function(){var t=Ad.createAsyncSpine("sp_ui_yunwuzhuanchang");'
    'return this.contentGt.addChild(t),t.horizontalCenter=0,t.verticalCenter=0,this.spine=t,'
    'new Promise(function(e){var i=!1,n=function(){i||(i=!0,clearTimeout(a),t.setAnimation(0,"a_2",!0),e())},'
    'a=setTimeout(function(){console.warn("[LHS] cloud show timeout fallback"),n()},2500);'
    'try{t.setAnimation(0,"a_1",!1).waitPlayEnd().then(n,n)}catch(s){console.error(s),n()}})}'
)
text = replace_once(text, show_old, show_new, 'cloud show transition')

hide_old = (
    'l.hideCloud=function(t,e){var i,n=this,a=this.cloudComp;this.cloudComp&&(i=function(){'
    'n.cloudComp.spine.setAnimation(0,"a_3",!1).waitPlayEnd().then(function(){t&&t.apply(e),nc.removeFromParent(a)}),'
    'n.cloudComp=null},null==this.cloudHoldingPromise?i():this.cloudHoldingPromise.then(function(){i()}))}'
)
hide_new = (
    'l.hideCloud=function(t,e){var i,n=this,a=this.cloudComp;this.cloudComp&&(i=function(){var s=!1,o=function(){'
    's||(s=!0,clearTimeout(r),t&&t.apply(e),nc.removeFromParent(a))},r=setTimeout(function(){console.warn("[LHS] cloud hide timeout fallback"),o()},2500);'
    'try{n.cloudComp.spine.setAnimation(0,"a_3",!1).waitPlayEnd().then(o,o)}catch(l){console.error(l),o()}n.cloudComp=null},'
    'null==this.cloudHoldingPromise?i():this.cloudHoldingPromise.then(function(){i()},function(){i()}))}'
)
text = replace_once(text, hide_old, hide_new, 'cloud hide transition')

main_payload = text.encode('utf-8')
old_marker = b'20260830_freeze_guard2'
new_marker = b'20260830_freeze_guard3'
if index_raw.count(old_marker) < 1:
    raise RuntimeError('freeze_guard2 cache marker missing')
index_payload = index_raw.replace(old_marker, new_marker)

os.makedirs(BACKUP, exist_ok=True)
shutil.copy2(MAIN, os.path.join(BACKUP, 'main.min_a6195824.js'))
shutil.copy2(INDEX, os.path.join(BACKUP, 'index.html'))
write(MAIN, main_payload)
write(INDEX, index_payload)

print('MAIN_BEFORE', digest(main_raw))
print('MAIN_AFTER', digest(main_payload))
print('INDEX_BEFORE', digest(index_raw))
print('INDEX_AFTER', digest(index_payload))
print('BACKUP', BACKUP)
