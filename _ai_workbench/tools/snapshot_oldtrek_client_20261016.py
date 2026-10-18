"""Read live client and event tables; no production writes."""
import hashlib
import json
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_full_audit_20261016'
NODE = r'''const fs=require('fs'),cfg=require('./src/services/ConfigService');const names=['OldTrekCommonEventConfig','OldTrekMiniGameConfig','OldTrekMiniGame1Config','OldTrekMiniGame2Config','OldTrekMiniGame3Config','OldTrekMiniGame2MapConfig','OldTrekEventDiceConfig','OldTrekAttrConfig','OldTrekDestinationConfig'];const live=Object.fromEntries(names.map(n=>[n,cfg.get(n)]));const client=cfg.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin'));const language=cfg.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;const langIds=new Set(Object.values(live.OldTrekCommonEventConfig).flatMap(r=>[r.eventDesc,r.bannerName,r.bannerSubName,...(r.choices||[]).map(x=>x[1])]).filter(Boolean));console.log(JSON.stringify({server:live,client:Object.fromEntries(names.map(n=>[n,client[n]])),language:Object.fromEntries([...langIds].map(id=>[id,language[id]]))}));'''

with connect() as client:
    OUT.mkdir(parents=True, exist_ok=True)
    sftp = client.open_sftp()
    hashes = {}
    for name in ['index.html','js/main.min_drop200.js','js/lhs-oldtrek-errors-v1.js','js/lhs-oldtrek-minigames-v1.js']:
        data = sftp.open('/linhhoasu/webgame/game/'+name,'rb').read()
        local = OUT/'baseline'/name
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    raw = run(client,'cd /linhhoasu/lhs/newServer && node -',NODE)
    tables = json.loads(next(x for x in reversed(raw.splitlines()) if x.startswith('{')))
    (OUT/'tables.json').write_text(json.dumps(tables,ensure_ascii=False),encoding='utf-8')
    (OUT/'baseline_hashes.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'hashes':hashes,'tableParity':{k:tables['server'][k]==tables['client'].get(k) for k in tables['server']},'event151':tables['client']['OldTrekCommonEventConfig']['151'],'language151':{str(k):tables['language'].get(str(k)) for k in [30111338,30111339,30113542,30113543,30113544]}}))
