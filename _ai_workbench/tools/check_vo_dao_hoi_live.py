import base64, hashlib, json, sys
import paramiko

HOST='103.116.105.154'; FP='SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ'
p=sys.stdin.readline().strip(); ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=p,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
try:
 k=ssh.get_transport().get_remote_server_key(); actual='SHA256:'+base64.b64encode(hashlib.sha256(k.asbytes()).digest()).decode().rstrip('=')
 if actual!=FP: raise RuntimeError('fingerprint mismatch')
 cmd="""
date -u '+%FT%TZ'
pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(x=>({name:x.name,pid:x.pid,restarts:x.pm2_env.restart_time,status:x.pm2_env.status,arenaSettlement:x.pm2_env.ARENA_SETTLEMENT_ENABLED||"unset"})))));'
curl -sS -m 5 http://127.0.0.1:8080/ready
curl -sS -m 5 http://127.0.0.1:8083/ready
sha256sum /linhhoasu/lhs/newServer/src/handlers/arena.js /linhhoasu/webgame/game/index.html /linhhoasu/webgame/game/js/lhs-arena-v1.js
tail -n 300 /root/.pm2/logs/lhs-s1001-error.log | grep -Ei 'fatal|uncaught|unhandled|TypeError|Arena|startup|EPIPE' | tail -80 || true
tail -n 300 /root/.pm2/logs/lhs-s1002-error.log | grep -Ei 'fatal|uncaught|unhandled|TypeError|Arena|startup|EPIPE' | tail -80 || true
mongosh --quiet mongodb://localhost:27017/lhs_s1001 --eval 'const p=db.players.findOne({name:"nicky"},{_id:0,playerId:1,name:1,arenaScore:1,arenaDailyCount:1,arenaDayKey:1,"items.10":1});print(JSON.stringify(p));if(p)print(JSON.stringify({recentFights:db.arenafightlogs.find({attackerId:p.playerId},{_id:0,fightId:1,win:1,preScore:1,postScore:1,createdAt:1}).sort({createdAt:-1}).limit(5).toArray()}));print(JSON.stringify({qaAccounts:db.accounts.countDocuments({accountId:/^qa_account_/})}));'
mongosh --quiet mongodb://localhost:27017/lhs_s1002 --eval 'print(JSON.stringify({qaPlayers:db.players.countDocuments({userId:/^qa_arena_/}),qaLogs:db.arenafightlogs.countDocuments({fightId:/^qa_request_/})}));'
"""
 i,o,e=ssh.exec_command(cmd,timeout=30); out=o.read().decode('utf8','replace'); err=e.read().decode('utf8','replace')
 print(json.dumps({'fingerprint':actual,'stderr':err,'output':out},ensure_ascii=True))
finally: ssh.close()
