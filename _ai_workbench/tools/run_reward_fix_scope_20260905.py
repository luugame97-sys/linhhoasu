"""Run production read-only planning probes via stdin, without remote uploads."""
import json
import sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute

WB = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
prior=json.loads((WB/'temp/items_recheck_production_fixture_20260905.json').read_text(encoding='utf-8'))
blocked=[r['id'] for r in prior['rows'] if r['status']=='LOI_DA_XAC_NHAN']
source=(WB/'tools/inspect_reward_fix_scope_20260905.js').read_text(encoding='utf-8')
script=r"""
process.env.NODE_ENV='audit';process.env.LOG_DIR='';
const fs=require('fs'),Module=require('module');const log=console.log;console.log=()=>{};
for(const name of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','renameSync','createWriteStream'])fs[name]=()=>{throw new Error('READ_ONLY_GUARD:'+name);};
const name='/linhhoasu/_ai_workbench/tools/inspect_reward_fix_scope_20260905.js';
const m=new Module(name,module);m.filename=name;m.paths=Module._nodeModulePaths('/linhhoasu/lhs/newServer');m._compile(SOURCE,name);
m.exports(BLOCKED).then(data=>{log('REWARD_SCOPE='+JSON.stringify(data));process.exit(0);}).catch(error=>{console.error(error.stack);process.exit(1);});
""".replace('SOURCE',json.dumps(source)).replace('BLOCKED',json.dumps(blocked))
ssh=paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
    output=execute(ssh,script)
finally:
    ssh.close()
data=json.loads(output.split('REWARD_SCOPE=',1)[1].splitlines()[0])
target=WB/'temp/reward_fix_scope_20260905.json'
target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'evidence':str(target),'summary':data['summary'],'runtime':data['runtime'],'probes':data['probes']},ensure_ascii=False))
