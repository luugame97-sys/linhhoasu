"""Post-release source/health audit and read-only verification of unresolved pools."""
import hashlib
import json
import shlex
import sys
from pathlib import Path
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];REL=WB/'temp/reward_release_20260905'
sys.stdout.reconfigure(encoding='utf-8')
release=json.loads((REL/'deploy_20260905_063510.json').read_text(encoding='utf-8'))
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
    hashes={relative:run(ssh,'sha256sum '+shlex.quote('/linhhoasu/lhs/newServer/'+relative)).split()[0] for relative in release['files']}
    assert hashes==release['installedHashes']
    source=(WB/'tools/audit_all_usable_items_20260905.js').read_text(encoding='utf-8')
    source=source.replace("  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });",'')
    source=source.replace("  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\\n`);","  console.log('FINAL_FIXTURE='+JSON.stringify(payload));")
    wrapper="process.env.NODE_ENV='audit';process.env.LOG_DIR='';process.env.LHS_APP_ROOT='/linhhoasu/lhs/newServer';process.env.LHS_CONFIG_PATH='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin';process.env.LHS_LANG_PATH='/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin';const Module=require('module');const m=new Module('/linhhoasu/_ai_workbench/tools/final_audit.js',module);m.filename='/linhhoasu/_ai_workbench/tools/final_audit.js';m._compile("+json.dumps(source)+",m.filename);"
    output=execute(ssh,wrapper)
    fixture=json.loads(output.split('FINAL_FIXTURE=',1)[1].splitlines()[0])
    (REL/'production_final_fixture.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    result={'hashesMatch':True,'installedHashes':hashes,'pm2':pm2_state(ssh),'health':[health(ssh,9200),health(ssh,9201)],
      'ready':{str(p):run(ssh,f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{p}/ready").strip() for p in [8080,8083]},
      'fixtureSummary':fixture['summary'],'fixtureTimestamp':fixture['generatedAt']}
    logs=run(ssh,"pm2 jlist | node -e "+shlex.quote("let x='';process.stdin.on('data',d=>x+=d).on('end',()=>{const fs=require('fs');console.log(JSON.stringify(JSON.parse(x).filter(p=>['lhs-s1001','lhs-s1002'].includes(p.name)).map(p=>({name:p.name,errors:fs.existsSync(p.pm2_env.pm_err_log_path)?fs.readFileSync(p.pm2_env.pm_err_log_path,'utf8').split('\\n').slice(-15).map(s=>s.replace(/(token|password|secret)=\\S+/gi,'$1=[REDACTED]')):[]}))))});"))
    result['recentErrorLogs']=json.loads(logs)
finally:ssh.close()
(REL/'postdeploy_final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
