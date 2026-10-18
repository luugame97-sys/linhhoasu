"""Read-only source and ownership inventory; never consumes code, Xu, or rewards."""
import json,hashlib,re,sys
from pathlib import Path
import paramiko
from recheck_items_readonly_20260905 import execute
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/hungyen96_s2_20260905';OUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest={}
 for rel,remote in {'config.php':'/linhhoasu/webgame/gm/config.php','api/user_api.php':'/linhhoasu/webgame/gm/api/user_api.php','src/net/HTTPServer.js':'/linhhoasu/lhs/newServer/src/net/HTTPServer.js'}.items():
  data=f.file(remote).read();target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);manifest[rel]=hashlib.sha256(data).hexdigest()
 config=(OUT/'config.php').read_text(encoding='utf-8-sig');includes=[]
 for line in config.splitlines():
  if re.search(r'require|include',line) and not re.search(r'password|secret|token|key',line,re.I):includes.append(line[:240])
 f.close()
 source=r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');const c=new MongoClient('mongodb://127.0.0.1:27017');
(async()=>{await c.connect();const a=await c.db('lhs_s1001').collection('accounts').findOne({accountId:'hungyen96'},{projection:{_id:0,accountId:1,status:1,roles:1,lastSelectedServerId:1}});const out={account:a?{accountId:a.accountId,status:a.status,lastSelectedServerId:a.lastSelectedServerId,roles:(a.roles||[]).map(r=>({userId:r.userId,roleId:r.roleId,serverId:r.serverId,status:r.status}))}:null,dbs:{}};
for(const db of ['lhs_s1001','lhs_s1002']){
const roleIds=(a?.roles||[]).map(r=>r.userId);
out.dbs[db]={players:await c.db(db).collection('players').find({$or:[{accountId:'hungyen96'},{userId:{$in:roleIds}}]},{projection:{_id:0,userId:1,playerId:1,accountId:1,serverId:1,name:1,level:1,isBot:1}}).toArray(),mails:await c.db(db).collection('mails').countDocuments({userId:{$in:roleIds}})};
}
await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1;});
"""
 inventory=json.loads(execute(s,source).strip().splitlines()[-1])
 result={'manifest':manifest,'configIncludes':includes,'inventory':inventory};(OUT/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
finally:s.close()
