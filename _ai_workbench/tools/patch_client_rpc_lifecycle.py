"""Patch minified GameSocket callbacks with deterministic lifecycle guards."""
from __future__ import annotations

import hashlib
import os
import shutil
from datetime import datetime, timezone


ROOT = r'I:\Linhhoasu\server\server'
MAIN = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'js', 'main.min_a6195824.js')
INDEX = os.path.join(ROOT, 'linhhoasu', 'webgame', 'game', 'index.html')
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
BACKUP = os.path.join(ROOT, '_ai_workbench', 'backups', f'client_rpc_lifecycle_before_{stamp}')


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

constructor_old = (
    'function jRt(){this._msgUid=0,this._resListenerMap={},this._resListenerErrorMap={},'
    'this._socketStatus=4,this.recvPack=new egret.ByteArray,this.m_RpcReqHandlerDict={},this.m_ReLoginTimer=0}'
)
constructor_new = (
    'function jRt(){this._msgUid=0,this._resListenerMap={},this._resListenerErrorMap={},'
    'this._lhsRpcTimerMap={},this._lhsRpcTimeoutMs=2e4,this._socketStatus=4,'
    'this.recvPack=new egret.ByteArray,this.m_RpcReqHandlerDict={},this.m_ReLoginTimer=0}'
)
text = replace_once(text, constructor_old, constructor_new, 'GameSocket constructor')

rpc_old = (
    'l.Rpc=function(t,e,i,n,a){this.localNetMsgLog(t,e=e||{},1);var s=i||a?++this._msgUid:0;'
    'return this.send(this.Pack(t,e,s),1==t),i&&(this._resListenerMap[s]=function(t){return i.call(n,t)}),'
    'a&&(this._resListenerErrorMap[s]=function(t){return a.call(n,t)}),!0}'
)
rpc_new = (
    'l.Rpc=function(t,e,i,n,a){this.localNetMsgLog(t,e=e||{},1);var s=i||a?++this._msgUid:0,o=this;'
    'if(s){i&&(this._resListenerMap[s]=function(t){return i.call(n,t)}),'
    'a&&(this._resListenerErrorMap[s]=function(t){return a.call(n,t)}),'
    'this._lhsRpcTimerMap[s]=setTimeout(function(){var e=o._resListenerErrorMap[s];'
    'delete o._resListenerMap[s],delete o._resListenerErrorMap[s],delete o._lhsRpcTimerMap[s],'
    'console.warn("[LHS] RPC timeout tag="+t+" msgUid="+s),e&&e.call(n,{result:-1,timeout:!0,tag:t})},this._lhsRpcTimeoutMs)}'
    'try{if(!this.send(this.Pack(t,e,s),1==t)){var r=this._resListenerErrorMap[s];'
    'return s&&(clearTimeout(this._lhsRpcTimerMap[s]),delete this._lhsRpcTimerMap[s],delete this._resListenerMap[s],delete this._resListenerErrorMap[s]),'
    'r&&r.call(n,{result:-1,disconnected:!0,tag:t}),!1}}catch(l){var h=this._resListenerErrorMap[s];'
    'return s&&(clearTimeout(this._lhsRpcTimerMap[s]),delete this._lhsRpcTimerMap[s],delete this._resListenerMap[s],delete this._resListenerErrorMap[s]),'
    'h&&h.call(n,{result:-1,sendError:!0,tag:t}),console.error(l),!1}return!0}'
)
text = replace_once(text, rpc_old, rpc_new, 'GameSocket Rpc')

read_old = (
    'a.msgUid?((n=this._resListenerMap[a.msgUid])&&(delete this._resListenerMap[a.msgUid],'
    'a.data&&(this.localNetMsgLog(a.tag,a.data,3),n(a.data))),(i=this._resListenerErrorMap[a.msgUid])&&'
    '(delete this._resListenerErrorMap[a.msgUid],a.data||i(a.err)))'
)
read_new = (
    'a.msgUid?(clearTimeout(this._lhsRpcTimerMap[a.msgUid]),delete this._lhsRpcTimerMap[a.msgUid],'
    '(n=this._resListenerMap[a.msgUid]),(i=this._resListenerErrorMap[a.msgUid]),'
    'delete this._resListenerMap[a.msgUid],delete this._resListenerErrorMap[a.msgUid],'
    'null!=a.err?i&&i(a.err):n&&(this.localNetMsgLog(a.tag,a.data,3),n(a.data)))'
)
text = replace_once(text, read_old, read_new, 'GameSocket read dispatch')

close_old = (
    'l.onSocketClose=function(){console.log("與伺服器的連線 斷開！"+this._host);this._socketStatus;'
    'this.updateStatus(4),this._onClosed&&this._onClosed(),T.mOtherLogin||(Y.OnSocketClose(),'
    'A.ins().dispatch(Od.SOCKET_CLOSE),Y.PlayerInfoModel&&(Y.PlayerInfoModel.isConnected=!1),'
    'klt.Instance.readyEnterGame&&(this.m_ReLoginTimer=egret.getTimer(),y.ins().doTimer(5e3,0,this.reLogin,this)))}'
)
close_new = (
    'l.onSocketClose=function(){console.log("與伺服器的連線 斷開！"+this._host);var t=this;'
    'Object.keys(this._lhsRpcTimerMap||{}).forEach(function(e){clearTimeout(t._lhsRpcTimerMap[e]);'
    'var i=t._resListenerErrorMap[e];delete t._lhsRpcTimerMap[e],delete t._resListenerMap[e],delete t._resListenerErrorMap[e],'
    'i&&i({result:-1,disconnected:!0})}),this._socketStatus;this.updateStatus(4),this._onClosed&&this._onClosed(),'
    'T.mOtherLogin||(Y.OnSocketClose(),A.ins().dispatch(Od.SOCKET_CLOSE),Y.PlayerInfoModel&&(Y.PlayerInfoModel.isConnected=!1),'
    'klt.Instance.readyEnterGame&&(this.m_ReLoginTimer=egret.getTimer(),y.ins().doTimer(5e3,0,this.reLogin,this)))}'
)
text = replace_once(text, close_old, close_new, 'GameSocket close cleanup')

main_payload = text.encode('utf-8')
old_version = b'20260830_freeze_guard1'
new_version = b'20260830_freeze_guard2'
if index_raw.count(old_version) < 1:
    raise RuntimeError('index cache marker missing')
index_payload = index_raw.replace(old_version, new_version)

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
