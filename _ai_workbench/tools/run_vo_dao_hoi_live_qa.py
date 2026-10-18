import base64, hashlib, json, sys
import paramiko

HOST='103.116.105.154'; FP='SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ'
p=sys.stdin.readline().strip(); ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
try:
 k=ssh.get_transport().get_remote_server_key(); actual='SHA256:'+base64.b64encode(hashlib.sha256(k.asbytes()).digest()).decode().rstrip('=')
 if actual!=FP: raise RuntimeError('fingerprint mismatch')
 i,o,e=ssh.exec_command('cd /linhhoasu/lhs/newServer; node /tmp/qa_vo_dao_hoi_live_20260913.js',timeout=90)
 out=o.read().decode('utf8','replace'); err=e.read().decode('utf8','replace')
 print(json.dumps({'fingerprint':actual,'stdout':out,'stderr':err},ensure_ascii=True))
finally: ssh.close()
