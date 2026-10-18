from pathlib import Path
from skin_incident_remote import connect, run

target = Path('_ai_workbench/temp/feature_day1_20261005/valhalla')
target.mkdir(parents=True, exist_ok=True)
with connect() as client:
    with client.open_sftp() as sftp:
        sftp.get('/linhhoasu/lhs/newServer/src/handlers/valhalla.js', str(target / 'valhalla.live.js'))
    print(run(client, 'cd /linhhoasu/lhs/newServer && node -', "const c=require('./src/services/ConfigService');console.log(JSON.stringify(c.get('ValhallaFieldConfig')));"))
