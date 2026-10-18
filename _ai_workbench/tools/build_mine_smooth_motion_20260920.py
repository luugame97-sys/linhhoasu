"""Scoped native Mine presentation patch with exact anchors, no network."""
from pathlib import Path
import hashlib
import json

WB = Path(__file__).resolve().parents[1]
BASE = WB / 'temp/mine_fix_20260920/baseline_v2'
OUT = WB / 'temp/mine_motion_callback_20260920'
OUT.mkdir(parents=True, exist_ok=True)
source = (BASE / 'main.min_drop100.js').read_bytes().decode('utf-8')
anchors = []

def replace_once(old, new, name):
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{name}: expected one anchor, got {count}')
    source = source.replace(old, new, 1)
    anchors.append(name)

def replace_nth(old, new, name, nth):
    global source
    positions=[]; start=0
    while True:
        k=source.find(old,start)
        if k<0: break
        positions.append(k); start=k+len(old)
    if len(positions) <= nth:
        raise RuntimeError(f'{name}: occurrence {nth} missing; total={len(positions)}')
    k=positions[nth]
    source=source[:k]+new+source[k+len(old):]
    anchors.append(name)

helper = (WB / 'tools/mine_smooth_motion_20260920.js').read_text(encoding='utf-8')
replace_once('!function(v){', '!function(v){\n' + helper + '\n', 'closure helpers')
replace_once('this.observe(E.Mine_Dig_Block_Update,function(t,n,a,e){',
    'this.observe(E.Mine_Dig_Block_Update,function(t,n,a,e){if(e&&[0,55,-1].indexOf(e.itemId)>=0){lhsMineSmoothMove(D,t,n,a,e);return}', 'normal move route')
replace_once('a.OnClose=function(){Y.MineModel.setPanel(null);',
    'a.OnClose=function(){this._lhsMineRpcSeq=(this._lhsMineRpcSeq||0)+1;this._lhsMineRpcPending=false;lhsMineCancelMotion(this);Y.MineModel.setPanel(null);', 'close cleanup')
replace_once('a.afterDigBlock=function(){this.setGlobalMaskState(!1),this.hideRushEff(),this.stopShake(this.contentGr),Y.MineModel.getAutoDig()&&Y.MineModel.delayAutoDig(800)}',
    'a.afterDigBlock=function(){this.setGlobalMaskState(!1),this.hideRushEff(),this.stopShake(this.contentGr),Y.MineModel.getAutoDig()&&Y.MineModel.delayAutoDig(160)}', 'auto idle gap')
replace_once('a.onTouchEnd=function(t){var e=Y.MineModel.checkItemSelectIdx()',
    'a.onTouchEnd=function(t){if(this._lhsMotionBusy)return;var e=Y.MineModel.checkItemSelectIdx()', 'single animation')

wrapper = '''function(name,loop){
  var self=this, role=this._player;
  this._mineMotionSeq=(this._mineMotionSeq||0)+1;
  var seq=this._mineMotionSeq;
  if(this._mineMotionFinish)this._mineMotionFinish();
  var resolve,done=false,promise=new Promise(function(r){resolve=r});
  var finish=function(){if(done)return;done=true;if(self._mineMotionFinish===finish)self._mineMotionFinish=null;resolve()};
  this._mineMotionFinish=finish;
  if(!role)finish();
  else try{role.setEntityAnimtion(0,name,loop,function(){if(self._mineMotionSeq===seq)finish()})}catch(error){finish();console.error('[MineMotion] animation unavailable',error)}
  return{waitPlayEnd:function(){return promise}};
}'''
replace_once('f.setEntityAnimtion=function(t,e){return this._player.setEntityAnimtion(0,t,e)}',
    'f.setEntityAnimtion=' + wrapper, 'Mine callback lifecycle')
replace_once('f.$onRemoveFromStage=function(){HUe.prototype.$onRemoveFromStage.call(this),Y.MessageCenter.removeAll(this),y.ins().removeAll(this),this._player.Dispose(),this._player=null}',
    'f.$onRemoveFromStage=function(){this._mineMotionSeq=(this._mineMotionSeq||0)+1;this._mineMotionFinish&&this._mineMotionFinish();HUe.prototype.$onRemoveFromStage.call(this);Y.MessageCenter.removeAll(this);y.ins().removeAll(this);if(this._player){this._player.stopAll();this._player.Dispose()}this._player=null}', 'Mine dispose waiter')
replace_nth('this._player.setLoadCallBack(function(){var t=yht[103][0];e._player.setEntityAnimtion(0,t,!0)})',
    'this._player.setLoadCallBack(function(){if(!e._player||e._mineMotionFinish)return;var t=yht[103][0];e.setEntityAnimtion(t,!0)})', 'loaded idle does not interrupt motion', 1)

replace_once('f.sendDigBlock=function(t,e,i,n){var d,c=this;',
    'f.sendDigBlock=function(t,e,i,n){var d,c=this;if(this._lhsMineRpcPending)return;var lhsRpcPanel=this._bindPanel,lhsRpcSeq=(this._lhsMineRpcSeq||0)+1;this._lhsMineRpcSeq=lhsRpcSeq;var lhsSentAt=Date.now();', 'RPC one in flight')
replace_once('this.Rpc(2801,d={meter:t,col:e,itemId:i,path:n},function(t){var e,i;',
    'this._lhsMineRpcPending=true,this.Rpc(2801,d={meter:t,col:e,itemId:i,path:n},function(t){if(c._bindPanel!==lhsRpcPanel||c._lhsMineRpcSeq!==lhsRpcSeq)return;c._lhsMineRpcPending=false;'
    'if(!t||(t.result!=null&&Number(t.result)!==0)||!Array.isArray(t.blockMap)||!Array.isArray(t.events)){lhsMineRpcFailure(c);return}'
    'if((c._lhsMineRpcSamples||0)<6){c._lhsMineRpcSamples=(c._lhsMineRpcSamples||0)+1;console.debug("[MineMotion] ack rpcMs="+(Date.now()-lhsSentAt))}var e,i;', 'reject before mutation')
replace_once('A.ins().dispatch(E.Mine_Dig_Block_Update,t,a,n,d)})):this._bindPanel',
    'A.ins().dispatch(E.Mine_Dig_Block_Update,t,a,n,d)},function(){if(c._bindPanel!==lhsRpcPanel||c._lhsMineRpcSeq!==lhsRpcSeq)return;c._lhsMineRpcPending=false;lhsMineRpcFailure(c)})):this._bindPanel', 'RPC timeout cleanup')

payload = source.encode('utf-8')
(OUT / 'main.min_drop100.js').write_bytes(payload)
index = (BASE / 'index.html').read_bytes()
marker = b'20260920_mine_smooth_v5'
index = index.replace(b'20260920_server_open_time_v1', marker)
(OUT / 'index.html').write_bytes(index)
report = {'anchors':anchors,'mainSha':hashlib.sha256(payload).hexdigest(),
          'mainBytes':len(payload),'marker':marker.decode(),'sourceSha':hashlib.sha256((BASE/'main.min_drop100.js').read_bytes()).hexdigest()}
(OUT/'build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report))
