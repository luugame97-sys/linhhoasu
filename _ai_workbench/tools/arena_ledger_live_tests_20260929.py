import sys,json,shlex
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8');sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
APP='/linhhoasu/lhs/newServer'
STAGE='/linhhoasu/_ai_workbench/backups/arena_ledger_hardening_20260929_003556/tests'
files=['test-competitions-v3.js','test-arena-recovery-v3.js','test-zero-sum-score-v1.js','test-arena-settlement.js']
ssh=connect()
try:
    run(ssh,'mkdir -p '+STAGE)
    with ssh.open_sftp() as sftp:
        for name in files:
            sftp.put(str(ROOT/'linhhoasu/lhs/newServer/scripts'/name),STAGE+'/'+name)
        sftp.put(str(ROOT/'_ai_workbench/tools/test_arena_ledger_save_boundary_20260929.js'),STAGE+'/save-test.js')
    results={}
    for name in files+['save-test.js']:
        # Compile against the real app path for relative src/config resolution;
        # only the absent RAM test helper is routed to staging.
        code="""const fs=require('fs'),Module=require('module');
let networks=0;const deny=()=>{networks++;throw Error('NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
const app=process.env.COMPETITION_APP;
const log=require.resolve(app+'/src/logger');require.cache[log]={id:log,filename:log,loaded:true,exports:{warn(){},info(){},error(){},debug(){}}};
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,...a){if(r==='./test-competitions-v3')return STAGE+'/test-competitions-v3.js';return resolve.call(this,r,p,...a);};
const name=NAME,file=app+'/scripts/'+name,m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(app+'/scripts');process.mainModule=m;m._compile(fs.readFileSync(STAGE+'/'+name,'utf8'),file);
process.on('exit',()=>{if(networks){console.error('NETWORK_ATTEMPTS='+networks);process.exitCode=1;}});
""".replace('STAGE',json.dumps(STAGE)).replace('NAME',json.dumps(name))
        output=run(ssh,'COMPETITION_APP='+APP+' node -',code)
        print(name,output.strip(),flush=True);results[name]=output
    (ROOT/'_ai_workbench/temp/arena_ledger_live_preflight_20260929/live-tests.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
finally:ssh.close()
