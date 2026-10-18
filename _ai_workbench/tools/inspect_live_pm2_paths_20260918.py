import json
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,'_ai_workbench/temp/pydeps')
from snapshot_web_multiserver_20260906 import connect,run
s=connect()
try:
    cmd="pm2 jlist | node -e 'let x=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"));console.log(JSON.stringify(x.filter(p=>/^lhs-s100[1-4]$/.test(p.name)).map(p=>({name:p.name,cwd:p.pm2_env.pm_cwd,exec:p.pm2_env.pm_exec_path,config:p.pm2_env.pm_config}))))'"
    print(run(s,cmd))
    print(run(s,'find /linhhoasu -maxdepth 5 -name ecosystem.config.js -type f -print'))
finally:s.close()
