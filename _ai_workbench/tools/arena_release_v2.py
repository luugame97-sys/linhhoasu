"""Pinned-host Arena v2 workspace audit/release helper. Password only stdin."""
from __future__ import annotations
import base64, hashlib, json, sys, shlex
from pathlib import Path
import paramiko

HOST="103.116.105.154"
FP="SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"_ai_workbench"/"temp"/"arena_v2_20260913"
FILES=[
 "lhs/newServer/src/handlers/arena.js","lhs/newServer/src/handlers/account.js",
 "lhs/newServer/src/handlers/raid.js","lhs/newServer/src/handlers/basic.js",
 "lhs/newServer/src/net/WSServer.js","lhs/newServer/src/services/PlayerService.js",
 "lhs/newServer/src/services/PlayerMutationService.js",
 "lhs/newServer/src/services/BattleService.js","lhs/newServer/src/services/RankService.js",
 "lhs/newServer/src/services/RoleAppearanceService.js",
 "lhs/newServer/src/services/FeatureReceiptService.js",
 "lhs/newServer/src/app.js","lhs/newServer/src/db/models/ArenaFightLog.js",
 "lhs/newServer/src/db/models/Player.js",
 "webgame/game/index.html","webgame/game/js/lhs-arena-v1.js",
 "webgame/game/js/egretex.min_37b3ee13.js",
 "webgame/game/js/main.min_a6195824.js"
]
class Pinned(paramiko.MissingHostKeyPolicy):
 def missing_host_key(self,client,hostname,key):
  fingerprint="SHA256:"+base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
  if hostname != HOST or fingerprint != FP: raise RuntimeError("SSH_HOST_KEY_MISMATCH")
def run(ssh,command,timeout=30):
 _,o,e=ssh.exec_command(command,timeout=timeout)
 stdout=o.read().decode("utf8","replace")
 stderr=e.read().decode("utf8","replace")
 code=o.channel.recv_exit_status()
 if code: raise RuntimeError("Remote command exit %s: %s"%(code,stderr[-1500:]))
 return stdout
def main():
 mode=sys.argv[1] if len(sys.argv)>1 else "inventory"
 password=sys.stdin.readline().rstrip("\r\n")
 ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(Pinned())
 ssh.connect(HOST,username="root",password=password,look_for_keys=False,allow_agent=False,timeout=15,banner_timeout=15,auth_timeout=15)
 try:
  OUT.mkdir(parents=True,exist_ok=True)
  if mode=="inventory":
   commands={
    "time": "date -u '+%FT%TZ'",
    "pm2": """pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).filter(x=>x.name.startsWith("lhs")).map(x=>({name:x.name,pid:x.pid,restarts:x.pm2_env.restart_time,status:x.pm2_env.status,cwd:x.pm2_env.pm_cwd,exec:x.pm2_env.pm_exec_path,env:Object.fromEntries(["SERVER_ID","REDIS_PREFIX","IDENTITY_MONGO_DB","WS_PORT","HTTP_PORT","ARENA_SETTLEMENT_ENABLED"].map(k=>[k,x.pm2_env[k]||null]))})))));'""",
    "mongoTopology": """mongosh --quiet mongodb://127.0.0.1:27017/lhs_s1001 --eval 'const h=db.adminCommand({hello:1});print(JSON.stringify({setName:h.setName||null,isWritablePrimary:h.isWritablePrimary,version:db.version()}))'""",
    "ready1": "curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8080/ready",
    "ready2": "curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8083/ready"
   }
   result={k:run(ssh,v) for k,v in commands.items()}
   result["hashes"]=run(ssh,"sha256sum "+" ".join(shlex.quote("/linhhoasu/"+p) for p in FILES))
   (OUT/"inventory.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
   print(json.dumps(result,ensure_ascii=True))
  elif mode=="fetch":
   sftp=ssh.open_sftp();records=[]
   try:
    for rel in FILES:
     remote="/linhhoasu/"+rel;target=OUT/"baseline"/rel
     if target.exists(): raise RuntimeError("Baseline exists: "+rel)
     target.parent.mkdir(parents=True,exist_ok=True);sftp.get(remote,str(target))
     records.append({"path":rel,"sha256":hashlib.sha256(target.read_bytes()).hexdigest()})
   finally:sftp.close()
   (OUT/"baseline.json").write_text(json.dumps(records,indent=2),encoding="utf8")
   print(json.dumps({"fetched":len(records),"out":str(OUT)},ensure_ascii=True))
  else: raise RuntimeError("Unknown mode; no mutation is implemented")
 finally:ssh.close()
if __name__=="__main__":main()
