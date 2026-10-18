"""Selected live source baseline only. Does not modify runtime or local source."""
import hashlib
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from snapshot_web_multiserver_20260906 import connect, run

WB=Path(__file__).resolve().parents[1]
OUT=WB/'backups/competitions_fix_20260917'
FILES=['src/handlers/arena.js','src/handlers/cross-rival.js','src/app.js',
 'src/services/CrossServerEventService.js','src/services/CrossEventSettlementService.js',
 'src/services/ArenaReadModelService.js','src/services/ArenaSettlementService.js',
 'src/db/models/CrossEventEntry.js','src/db/models/CrossEventSettlement.js',
 'src/config/crossServerEventSchedule.json']
targets={p:'/linhhoasu/lhs/newServer/'+p for p in FILES}
targets.update({'client/index.html':'/linhhoasu/webgame/game/index.html','client/js/lhs-arena-v1.js':'/linhhoasu/webgame/game/js/lhs-arena-v1.js'})
extend='--extend' in sys.argv
if extend:
    extras=['ecosystem.config.js'] if '--config' in sys.argv else ['src/handlers/basic.js']
    targets={p:'/linhhoasu/lhs/newServer/'+p for p in extras}
    result=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
else:
    assert not OUT.exists(), 'BASELINE_ALREADY_EXISTS'
    OUT.mkdir(parents=True)
    result={'files':{},'localComparison':{}}
s=connect()
try:
    with s.open_sftp() as f:
        for rel,remote in targets.items():
            assert remote not in result['files'], 'TARGET_ALREADY_BACKED_UP'
            with f.open(remote,'rb') as h: data=h.read()
            dest=OUT/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
            digest=hashlib.sha256(data).hexdigest();result['files'][remote]=digest
            local=WB.parent/('linhhoasu/webgame/game/'+rel[7:] if rel.startswith('client/') else 'linhhoasu/lhs/newServer/'+rel)
            result['localComparison'][rel]=local.exists() and hashlib.sha256(local.read_bytes()).hexdigest()==digest
    (OUT/'manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))
finally:s.close()
