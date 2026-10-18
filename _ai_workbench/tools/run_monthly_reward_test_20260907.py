"""Execute native reward-amount fixture in the previously validated staging tree."""
import json,shlex
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT,APP
from release_donate_service_20260907 import STAGE
ssh=connect()
try:
    with ssh.open_sftp()as f:
        f.put(str(WB/'tools/test_donate_monthly_rewards_20260907.js'),STAGE+'/tools/test_monthly.js')
        f.put(str(ROOT/'monthly-extension.json'),STAGE+'/monthly-extension.json')
    command='NODE_PATH='+APP+'/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH='+STAGE+'/server.bin timeout 30s node '+STAGE+'/tools/test_monthly.js '+STAGE+'/app '+STAGE+'/monthly-extension.json'
    result=json.loads(run(ssh,command));(ROOT/'monthly-reward-test.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:ssh.close()
