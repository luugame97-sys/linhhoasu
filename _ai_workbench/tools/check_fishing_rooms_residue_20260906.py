"""Read-only final process/session/rank residue check for the new QA prefix."""
import json,sys
import paramiko
from release_fishing_rooms_20260906 import WB,ROOT,run
from verify_room_qa_redis_20260906 import SCRIPT
def main():
 sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  redis=json.loads(run(s,'node -',SCRIPT.replace('session:qa_room_*','session:qafroomv2_*').replace("'p_qa_room_*'","'qafroomv2_*'"),timeout=30))
  for v in redis.values():assert not v['sessionKeys'] and not v['ranks']['arena'] and not v['ranks']['tower']
  process_script="const fs=require('fs'),out=[];for(const p of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){try{const args=fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0');if(args[1]&&args[1].endsWith('/qa_fishing_rooms_v2_20260906.js'))out.push(Number(p));}catch{}}console.log(JSON.stringify(out));"
  processes=json.loads(run(s,'node -',process_script));assert not processes
  report={'result':'PASS','redis':redis,'qaProcesses':processes};(ROOT/'residue-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
 finally:s.close()
if __name__=='__main__':main()
