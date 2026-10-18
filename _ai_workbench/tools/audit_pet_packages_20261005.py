from pathlib import Path
from skin_incident_remote import connect, run

JS = r"""
const fs = require('fs'), crypto = require('crypto');
const c = require('./src/services/ConfigService');
console.log(JSON.stringify({packages:[4000004,4000103].map(id=>({shop:c.get('ShopConfig')[id],pay:c.get('PayConfig')[id]})),hashes:Object.fromEntries(['src/services/ConfigService.js','src/services/RechargeRewardResolver.js','src/handlers/recharge.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))}));
"""
with connect() as client:
    print(run(client, 'cd /linhhoasu/lhs/newServer && node -', JS))
    target = Path('_ai_workbench/temp/pet_package_unlimited_20261005')
    target.mkdir(parents=True, exist_ok=True)
    with client.open_sftp() as sftp:
        sftp.get('/linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js', str(target / 'RechargeRewardResolver.live.js'))
