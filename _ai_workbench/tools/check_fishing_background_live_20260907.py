"""Read-only source/hash and process verification; no account or reward operations."""
import hashlib,json
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import hashes,pm2,ready

ROOT=WB/'temp/fishing_background_audit_20260907'
FILES=['linhhoasu/webgame/game/js/main.min_a6195824.js','linhhoasu/webgame/game/index.html',
       'linhhoasu/webgame/game/js/lhs-item-quantity-v1.js']+['linhhoasu/lhs/newServer/src/'+r for r in [
       'handlers/fish.js','handlers/basic.js','handlers/raid.js','net/WSServer.js',
       'services/FishingAutoService.js','services/FishingRoomService.js','services/FishingEventService.js','services/FishingGameplayService.js']]
if __name__=='__main__':
    ROOT.mkdir(exist_ok=True);s=connect()
    try:
        remote=hashes(s,['/'+p for p in FILES]);rows=[]
        for rel in FILES:
            local=hashlib.sha256((WB.parent/rel).read_bytes()).hexdigest()
            rows.append({'file':rel,'local':local,'remote':remote['/'+rel],'match':local==remote['/'+rel]})
        index=next(r for r in rows if r['file'].endswith('index.html'))
        with s.open_sftp() as f:
            with f.open('/'+index['file'],'rb') as h:served=h.read()
        local_index=(WB.parent/index['file']).read_bytes()
        index['sameTextAfterCRLFNormalization']=served.replace(b'\r\n',b'\n')==local_index.replace(b'\r\n',b'\n')
        result={'at':datetime.now(timezone.utc).isoformat(),'readOnly':True,'files':rows,'ready':ready(s),'pm2':pm2(s)}
        (ROOT/'live-hashes.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({'at':result['at'],'files':len(rows),'matched':sum(r['match'] for r in rows),'indexSameAfterLineEndings':index['sameTextAfterCRLFNormalization'],'ready':result['ready'],'readOnly':True}))
    finally:s.close()
