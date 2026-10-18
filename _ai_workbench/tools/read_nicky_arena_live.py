import base64, hashlib, json, sys
import paramiko

HOST='103.116.105.154'; FP='SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ'
p=sys.stdin.readline().strip()
s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
try:
 k=s.get_transport().get_remote_server_key(); actual='SHA256:'+base64.b64encode(hashlib.sha256(k.asbytes()).digest()).decode().rstrip('=')
 if actual!=FP: raise RuntimeError('fingerprint mismatch')
 cmd="mongosh --quiet mongodb://localhost:27017/lhs_s1001 --eval 'const p=db.players.findOne({name:\"nicky\"},{userId:1,playerId:1,name:1,arenaScore:1,arenaDailyCount:1,arenaDayKey:1,arenaRefreshAt:1,items:1,currencies:1,arenaProtectUntil:1,_id:0}); printjson(p)'"
 i,o,e=s.exec_command(cmd,timeout=30); out=o.read().decode('utf8','replace'); err=e.read().decode('utf8','replace')
 print(json.dumps({'fingerprint':actual,'stderr':err,'player':out},ensure_ascii=False))
finally: s.close()
