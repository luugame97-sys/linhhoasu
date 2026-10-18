"""Inspect only rows/processes created by the withdrawn room QA. No cleanup by default."""
import json,sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,pm2,ready
WB=Path(__file__).resolve().parents[1]
ROOT=WB/'temp/fishing_room_audit_20260906T052229Z'
QUERY=r"""
const fs=require('fs'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{
 const qaProcesses=[];
 for(const pid of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){
  try{const args=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0').filter(Boolean);
   if(args.length===3&&/\/?node$/.test(args[0])&&args[1]==='/tmp/qa_fishing_room_20260906.js'&&['1001','1002'].includes(args[2]))qaProcesses.push({pid:Number(pid),args});
  }catch{}
 }
 const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const databases={};
 for(const name of ['lhs_s1001','lhs_s1002']){
  const db=c.db(name),filter={userId:/^qa_room_[0-9a-f]{16}_u[0-4](?:_s100[12])?$/};
  const rows=await db.collection('players').find(filter,{projection:{_id:1,userId:1,playerId:1,name:1,serverId:1,level:1,'fishInfo.level':1,'fishInfo.scene':1,isBot:1,createdAt:1,updatedAt:1}}).toArray();
  const related={};for(const collection of ['mails','sessions','accounts','transactions'])related[collection]=await db.collection(collection).countDocuments(filter);
  databases[name]={rows,related};
 }
 await c.close();console.log(JSON.stringify({qaProcesses,databases,remoteQaFileExists:fs.existsSync('/tmp/qa_fishing_room_20260906.js')}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
"""
def main():
 sys.stdout.reconfigure(encoding='utf-8')
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  report=json.loads(run(s,'node -',QUERY,timeout=30));report['pm2']=pm2(s);report['ready']=ready(s)
  (ROOT/'qa-cleanup-inventory.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(report,ensure_ascii=False))
 finally:s.close()
if __name__=='__main__':main()
