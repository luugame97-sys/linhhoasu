import getpass
import paramiko

HOST='103.116.105.154'; pw=getpass.getpass('VPS password (not logged): ')
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=pw,look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
 _,o,e=s.exec_command(cmd);t=o.read().decode('utf8','replace');c=o.channel.recv_exit_status()
 if c: raise RuntimeError(e.read().decode('utf8','replace')[-3000:])
 return t
try:
 out=run("pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s)){if(p.name==='lhs-s1001'){const e=p.pm2_env||{};console.log(JSON.stringify({status:e.status,pid:p.pid,exec:e.pm_exec_path,cwd:e.pm_cwd,BOT_ENABLED:e.BOT_ENABLED,botEnabled:e.env&&e.env.BOT_ENABLED,envKeys:Object.keys(e.env||{}).filter(k=>/^BOT_/.test(k))}))}}})\"")
 print(out)
 print(run("pm2 show lhs-s1001 | grep -E 'script path|exec cwd|namespace|status' | head -20"))
 run("BOT_ENABLED=0 BOT_CHAT_ENABLED=0 pm2 restart lhs-s1001 --update-env; pm2 save")
 ready=run("for i in $(seq 1 30); do c=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1").strip()
 health=run("curl -fsS http://127.0.0.1:9200/health | head -c 900").strip()
 print('READY='+ready)
 print('HEALTH='+health)
finally:s.close()
