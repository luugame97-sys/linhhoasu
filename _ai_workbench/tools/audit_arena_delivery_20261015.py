import json
from pathlib import Path
from skin_incident_remote import connect,run
from audit_s5_competition_rewards_20260925 import SCRIPT
OUT=Path(__file__).resolve().parents[1]/'temp/arena_delivery_audit_20261015'
with connect() as c:
    OUT.mkdir(parents=True,exist_ok=True)
    s=c.open_sftp()
    try:
        for name in ['ArenaSettlementService','ArenaRankService','GameDayService']:
            try:s.get('/linhhoasu/lhs/newServer/src/services/'+name+'.js',str(OUT/(name+'.js')))
            except FileNotFoundError:pass
        s.get('/linhhoasu/lhs/newServer/src/app.js',str(OUT/'app.js'))
    finally:s.close()
    raw=run(c,'cd /linhhoasu/lhs/newServer && node -',SCRIPT.replace('100[1-5]','100[1-8]'))
    data=json.loads(raw.split('REWARD_AUDIT_JSON=')[-1]);(OUT/'live.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'at':data['at'],'processes':data['processes'],'servers':[{'sid':x['serverId'],'latest':[{k:v for k,v in a.items() if k!='top'} for a in x['arenaLatest']],'logs':x['logs']} for x in data['servers']]},ensure_ascii=False))
