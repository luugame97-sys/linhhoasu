"""Execute a SELECT/find-only anonymous production audit through stdin."""
import json,sys
from pathlib import Path
import paramiko
def execute(ssh, command, source):
    stdin,stdout,stderr=ssh.exec_command(command,timeout=60)
    stdin.write(source);stdin.channel.shutdown_write()
    data=stdout.read();stderr.read()
    if stdout.channel.recv_exit_status():raise RuntimeError('Read-only Mongo audit failed; raw output suppressed')
    return data

WB=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]).resolve()
sys.stdout.reconfigure(encoding='utf-8')
fixture=json.loads((OUT/'fixture.json').read_text(encoding='utf-8'))
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
paths=[r['remote'] for k,r in manifest['files'].items() if k in ['app/src/handlers/mail.js','app/src/handlers/activity.js','app/src/handlers/recharge.js','app/src/services/RewardGrantService.js','app/src/services/RoleAppearanceService.js','server.bin','client.bin','web/user_api.php','web/config.redacted.php']]
payload={'ids':fixture['catalogIds'],'cash':[p for p in fixture['purchases'] if p['route']=='cash' and p.get('success')], 'sourcePaths':paths}
source=(WB/'tools/audit_fashion_channels_runtime_20260905.js').read_text(encoding='utf-8').replace('__AUDIT_INPUT__',json.dumps(payload,ensure_ascii=False))
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
    data=json.loads(execute(ssh,'node -',source))
finally:ssh.close()
data['sourceUnchanged']=all(data['sourceHashes'][p]==next(r['sha256'] for r in manifest['files'].values() if r['remote']==p) for p in paths)
(OUT/'runtime.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'readOnly':True,'sourceUnchanged':data['sourceUnchanged'],'generatedAt':data['generatedAt'],'dbs':{k:{**{f:v[f] for f in ['humanPlayers','fashionBagHumans','fashionBagRows','fashionBagUnownedRows','bagTotals','unopenedSuitBoxes','checkedHumanMails']},'overlapMissingRows':len(v['overlapMissing']),'claimedFashionNotOwned':len(v['claimedFashionNotOwned']),'packageRecords':len(v['purchaseRows'])} for k,v in data['dbs'].items()}},ensure_ascii=False))
