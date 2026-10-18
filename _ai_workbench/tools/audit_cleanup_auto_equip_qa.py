"""Audit and remove only agent-created qa_auto_equip_* fixtures."""
import json,os,shlex
from pathlib import Path
import paramiko
c=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 for db in ['lhs_s1001','lhs_s1002']:
  expr="const f={userId:/^qa_auto_equip_/};const before=db.players.find(f,{_id:0,userId:1}).toArray().map(x=>x.userId);const r=db.players.deleteMany(f);JSON.stringify({database:db.getName(),before,deleted:r.deletedCount,after:db.players.countDocuments(f)})"
  _,o,e=s.exec_command('mongosh --quiet mongodb://127.0.0.1:27017/'+db+' --eval '+shlex.quote(expr),timeout=30);out=o.read().decode();err=e.read().decode();code=o.channel.recv_exit_status()
  if code:raise RuntimeError(err)
  print(out.strip())
 _,o,e=s.exec_command("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>p.name.startsWith(\"lhs-\")).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))))'",timeout=30);print(o.read().decode().strip());o.channel.recv_exit_status()
finally:s.close()
