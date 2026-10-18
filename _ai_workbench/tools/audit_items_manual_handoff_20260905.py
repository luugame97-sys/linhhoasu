"""Read-only deployed-source audit; no client actions, account creation or gameplay writes."""
import hashlib,json,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health,pm2_state
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer'
sys.stdout.reconfigure(encoding='utf-8')
old=json.loads((WB/'temp/reward_release_20260905/deploy_20260905_063510.json').read_text(encoding='utf-8'))
latest=json.loads((WB/'temp/items_corrected_deploy_20260905_074307.json').read_text(encoding='utf-8'))
expected={**old['installedHashes'],**latest['after']}
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 hashes={f:run(ssh,'sha256sum '+shlex.quote(APP+'/'+f)).split()[0] for f in expected}
 assert hashes==expected,'production drift'
 source=(WB/'tools/audit_all_usable_items_20260905.js').read_text(encoding='utf-8')
 source=source.replace("  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });",'')
 source=source.replace("  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\\n`);","  console.log('ITEMS_FINAL='+JSON.stringify(payload));")
 wrapper="process.env.NODE_ENV='audit';process.env.LOG_DIR='';process.env.LHS_APP_ROOT='/linhhoasu/lhs/newServer';process.env.LHS_CONFIG_PATH='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';process.env.LHS_LANG_PATH='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';const Module=require('module');const m=new Module('/linhhoasu/_ai_workbench/tools/manual_handoff.js',module);m.filename='/linhhoasu/_ai_workbench/tools/manual_handoff.js';m._compile("+json.dumps(source)+",m.filename);"
 output=execute(ssh,wrapper);audit=json.loads(output.split('ITEMS_FINAL=',1)[1].splitlines()[0])
 result={'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':hashes,'expectedHashesMatch':True,'health':[health(ssh,9200),health(ssh,9201)],'pm2':pm2_state(ssh),'auditSummary':audit['summary'],
 'ready':{str(p):run(ssh,f"curl -s --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready") for p in [8080,8083]}}
 # Compare only the deployed touched files; preserve unrelated local drift.
 result['localHashesMatch']=all(hashlib.sha256((WB.parent/'linhhoasu/lhs/newServer'/f).read_bytes()).hexdigest()==h for f,h in latest['after'].items())
 (WB/'temp/items_manual_handoff_fixture_20260905.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 (WB/'temp/items_manual_handoff_health_20260905.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in result.items() if k!='sourceHashes'},ensure_ascii=False))
finally:ssh.close()
